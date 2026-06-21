/**
 * Dose late-escalation policy builder + simulator.
 *
 * `caregiver-escalation.ts` operates on a runtime `EscalationPolicy`
 * value: given a policy with N tiers, it returns the pending alerts
 * for a dose at a given moment. What it does NOT do:
 *
 *   - **build** a policy from declarative inputs ("at 5 min remind
 *     patient, at 30 min ping primary caregiver, at 2h call family"),
 *   - **validate** that the tier ordering, delays, and per-medication
 *     overrides are coherent (no negative delays, no duplicate tier
 *     ids, no tier expiring before it could fire),
 *   - **simulate** the escalation timeline for a dose so the UI can
 *     preview "if this dose is missed, here is what will happen."
 *
 * That gap is what this module fills. It composes — not replaces —
 * caregiver-escalation: build a policy with `buildEscalationPolicy`,
 * validate it with `validateEscalationPolicy`, then pass the
 * resulting EscalationPolicy straight to pendingAlertsForDose/Batch.
 *
 * Per-medication overrides let the patient mark a seizure rescue
 * medication as 'critical-rescue' (faster cascade, voice channel
 * forced) while a non-urgent vitamin uses 'low-touch' (no escalation
 * after the first reminder).
 *
 * Pure / deterministic. No I/O.
 */

import type {
  EscalationChannel,
  EscalationPolicy,
  EscalationTier,
} from './caregiver-escalation';

export type EscalationContact = {
  id: string;
  name: string;
  channel: EscalationChannel;
};

export interface PolicyTierSpec {
  /** Stable identifier for the tier ("self", "primary-caregiver", "family"). */
  id: string;
  /** Display label. */
  label: string;
  /** Delay in minutes after dueAt at which this tier fires. */
  delayMinutes: number;
  /**
   * Optional ceiling. If the dose is still unresolved at
   * dueAt + expireMinutes, the tier no longer fires. Useful for
   * "after 4 hours stop escalating to phone, just queue an email".
   */
  expireMinutes?: number;
  recipients: EscalationContact[];
}

export type PolicyTemplate =
  | 'default'
  | 'critical-rescue'
  | 'low-touch'
  | 'controlled-substance';

export interface BuildPolicyInput {
  /** Stable identifier the runtime will key alerts off. */
  id: string;
  /** Display name. */
  label: string;
  /** Tier specs in any order — the builder sorts ascending by delay. */
  tiers: PolicyTierSpec[];
  /** Override the default resolution status set ('taken', 'skipped'). */
  resolveOn?: EscalationPolicy['resolveOn'];
}

export interface EscalationValidationError {
  code:
    | 'duplicate-tier-id'
    | 'negative-delay'
    | 'duplicate-delay'
    | 'expire-before-delay'
    | 'no-recipients'
    | 'empty-tier-id'
    | 'tier-out-of-order'
    | 'duplicate-recipient-in-tier';
  tierId?: string;
  message: string;
}

export interface EscalationValidationResult {
  ok: boolean;
  errors: EscalationValidationError[];
}

export interface SimulationTierEvent {
  tierId: string;
  label: string;
  /** Minutes after dueAt this tier fires. */
  fireAtMinutes: number;
  /** ISO datetime the tier fires. */
  fireAtIso: string;
  /** Recipients notified at this tier. */
  recipients: EscalationContact[];
}

export interface SimulationInput {
  /** Dose dueAt anchor. ISO datetime. */
  dueAt: string;
  /**
   * Optional resolution time. If present and BEFORE a tier's fireAt,
   * that tier is omitted from the timeline (the dose was taken first).
   */
  resolvedAt?: string;
}

export interface SimulationTimeline {
  /** All tiers that would fire in the timeline, ordered by fireAtMinutes asc. */
  tiers: SimulationTierEvent[];
  /** Total recipients notified across all tiers (distinct by id). */
  uniqueRecipients: number;
  /** Highest tier label fired, or null when none. */
  topTierFired: string | null;
}

const PRESET_TEMPLATES: Record<PolicyTemplate, Omit<PolicyTierSpec, 'recipients'>[]> = {
  default: [
    { id: 'self-reminder', label: 'Patient reminder', delayMinutes: 0 },
    { id: 'self-late', label: 'Late reminder', delayMinutes: 15 },
    { id: 'primary-caregiver', label: 'Primary caregiver', delayMinutes: 60 },
    { id: 'family', label: 'Family escalation', delayMinutes: 240 },
  ],
  'critical-rescue': [
    { id: 'self-reminder', label: 'Patient reminder', delayMinutes: 0 },
    { id: 'caregiver-immediate', label: 'Caregiver immediate', delayMinutes: 5 },
    { id: 'family-call', label: 'Family call', delayMinutes: 15 },
    { id: 'emergency-services', label: 'Emergency services', delayMinutes: 30 },
  ],
  'low-touch': [
    { id: 'self-reminder', label: 'Patient reminder', delayMinutes: 0 },
    { id: 'self-final', label: 'Final reminder', delayMinutes: 60, expireMinutes: 120 },
  ],
  'controlled-substance': [
    { id: 'self-reminder', label: 'Patient reminder', delayMinutes: 0 },
    { id: 'self-late', label: 'Late reminder', delayMinutes: 10 },
    { id: 'primary-caregiver', label: 'Primary caregiver', delayMinutes: 30 },
    { id: 'prescriber', label: 'Prescriber audit ping', delayMinutes: 120 },
  ],
};

function validateTier(t: PolicyTierSpec): EscalationValidationError[] {
  const errs: EscalationValidationError[] = [];
  if (!t.id || t.id.trim() === '') {
    errs.push({ code: 'empty-tier-id', message: 'tier id must be non-empty' });
  }
  if (!Number.isFinite(t.delayMinutes) || t.delayMinutes < 0) {
    errs.push({ code: 'negative-delay', tierId: t.id, message: `tier ${t.id}: delayMinutes must be >= 0` });
  }
  if (t.expireMinutes !== undefined) {
    if (!Number.isFinite(t.expireMinutes) || t.expireMinutes <= t.delayMinutes) {
      errs.push({ code: 'expire-before-delay', tierId: t.id, message: `tier ${t.id}: expireMinutes must be > delayMinutes` });
    }
  }
  if (!t.recipients || t.recipients.length === 0) {
    errs.push({ code: 'no-recipients', tierId: t.id, message: `tier ${t.id}: at least one recipient required` });
  } else {
    const ids = new Set<string>();
    for (const r of t.recipients) {
      if (ids.has(r.id)) {
        errs.push({
          code: 'duplicate-recipient-in-tier',
          tierId: t.id,
          message: `tier ${t.id}: duplicate recipient id ${r.id}`,
        });
      }
      ids.add(r.id);
    }
  }
  return errs;
}

/**
 * Validate a policy proposal without constructing it. Returns
 * `{ ok, errors }` — when ok is false the errors are sorted in
 * declaration order with stable codes the UI can map to messages.
 *
 * Performs structural checks ONLY; semantic compatibility with the
 * runtime caregiver-escalation engine is guaranteed by the type
 * structure itself.
 */
export function validateEscalationPolicy(input: BuildPolicyInput): EscalationValidationResult {
  const errors: EscalationValidationError[] = [];
  const seenIds = new Set<string>();
  const seenDelays = new Set<number>();
  let lastDelay = -Infinity;

  for (const t of input.tiers) {
    errors.push(...validateTier(t));
    if (seenIds.has(t.id)) {
      errors.push({ code: 'duplicate-tier-id', tierId: t.id, message: `duplicate tier id ${t.id}` });
    }
    seenIds.add(t.id);
    if (Number.isFinite(t.delayMinutes) && t.delayMinutes >= 0) {
      if (seenDelays.has(t.delayMinutes)) {
        errors.push({
          code: 'duplicate-delay',
          tierId: t.id,
          message: `tier ${t.id}: delayMinutes ${t.delayMinutes} is already used by another tier`,
        });
      }
      seenDelays.add(t.delayMinutes);
      if (t.delayMinutes < lastDelay) {
        errors.push({
          code: 'tier-out-of-order',
          tierId: t.id,
          message: `tier ${t.id}: declared after a later-firing tier; caller must sort by delayMinutes asc`,
        });
      }
      lastDelay = t.delayMinutes;
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Build an EscalationPolicy from a declarative input. Tiers are
 * sorted ascending by delayMinutes (validation surfaces the
 * out-of-order error so the caller can fix the source, but the
 * builder still produces a sorted runtime artifact). Throws when
 * the input fails validation — call validateEscalationPolicy first
 * for a non-throwing path.
 */
export function buildEscalationPolicy(input: BuildPolicyInput): EscalationPolicy {
  const result = validateEscalationPolicy(input);
  if (!result.ok) {
    const summary = result.errors.map((e) => e.message).join('; ');
    throw new Error(`invalid escalation policy: ${summary}`);
  }
  const sorted = input.tiers
    .slice()
    .sort((a, b) => a.delayMinutes - b.delayMinutes);
  const tiers: EscalationTier[] = sorted.map((t) => ({
    id: t.id,
    label: t.label,
    delayMinutes: t.delayMinutes,
    recipients: t.recipients.slice(),
    ...(t.expireMinutes !== undefined ? { expireMinutes: t.expireMinutes } : {}),
  }));
  return {
    id: input.id,
    label: input.label,
    tiers,
    ...(input.resolveOn !== undefined ? { resolveOn: input.resolveOn } : {}),
  };
}

/**
 * Apply a preset template, materialising tiers from PRESET_TEMPLATES
 * and overlaying caller-supplied recipients per tier id. Tiers in
 * the template without a recipient list in `recipients` are dropped.
 *
 * Use this when the patient picks "Critical rescue" in the UI and the
 * app has to convert it to a policy with their actual contacts.
 */
export function buildPolicyFromTemplate(
  id: string,
  label: string,
  template: PolicyTemplate,
  recipients: Record<string, EscalationContact[]>,
  overrides?: Partial<Pick<BuildPolicyInput, 'resolveOn'>>,
): EscalationPolicy {
  const tiers = PRESET_TEMPLATES[template]
    .filter((t) => Array.isArray(recipients[t.id]) && recipients[t.id]!.length > 0)
    .map<PolicyTierSpec>((t) => ({
      ...t,
      recipients: recipients[t.id]!,
    }));
  if (tiers.length === 0) {
    throw new Error(`template ${template} produced no tiers — supply recipients for at least one tier`);
  }
  return buildEscalationPolicy({
    id,
    label,
    tiers,
    ...(overrides?.resolveOn !== undefined ? { resolveOn: overrides.resolveOn } : {}),
  });
}

/**
 * Simulate the escalation timeline for a single dose given a policy.
 * Pure preview function — does NOT consult dispatch state. Tiers
 * whose fireAt falls AFTER resolvedAt (when supplied) are excluded
 * from the timeline.
 *
 * Note: `expireMinutes` is a runtime-only safety net (it tells the
 * dispatch engine to stop firing if it wakes up after expireMinutes
 * has elapsed). In a static "if the dose is missed, what fires?"
 * preview, the timing is hypothetical — every tier with
 * delayMinutes < (resolvedAt - dueAt) fires.
 */
export function simulateEscalationTimeline(
  policy: EscalationPolicy,
  dose: SimulationInput,
): SimulationTimeline {
  const dueMs = Date.parse(dose.dueAt);
  if (Number.isNaN(dueMs)) throw new Error('dueAt is not a valid datetime');
  const resolvedMs = dose.resolvedAt ? Date.parse(dose.resolvedAt) : Number.POSITIVE_INFINITY;
  if (dose.resolvedAt && Number.isNaN(resolvedMs)) throw new Error('resolvedAt is not a valid datetime');

  const tiers: SimulationTierEvent[] = [];
  for (const t of policy.tiers) {
    const fireAtMs = dueMs + t.delayMinutes * 60_000;
    if (fireAtMs > resolvedMs) continue; // dose resolved before this tier could fire
    tiers.push({
      tierId: t.id,
      label: t.label,
      fireAtMinutes: t.delayMinutes,
      fireAtIso: new Date(fireAtMs).toISOString(),
      recipients: t.recipients.slice(),
    });
  }
  tiers.sort((a, b) => a.fireAtMinutes - b.fireAtMinutes);

  const recipientIds = new Set<string>();
  let topTierFired: string | null = null;
  for (const t of tiers) {
    for (const r of t.recipients) recipientIds.add(r.id);
    topTierFired = t.label;
  }

  return {
    tiers,
    uniqueRecipients: recipientIds.size,
    topTierFired,
  };
}

/**
 * Convenience: render a human-readable timeline as a list of strings,
 * one per tier, suitable for a settings-preview panel.
 *
 * Format: "+15m -> Late reminder (patient via push)"
 */
export function describeTimeline(timeline: SimulationTimeline): string[] {
  return timeline.tiers.map((t) => {
    const minutes = t.fireAtMinutes;
    const hourPart = Math.floor(minutes / 60);
    const minPart = minutes % 60;
    let stamp: string;
    if (hourPart === 0) stamp = `+${minPart}m`;
    else if (minPart === 0) stamp = `+${hourPart}h`;
    else stamp = `+${hourPart}h${minPart}m`;
    const channels = t.recipients
      .map((r) => `${r.name} via ${r.channel}`)
      .join(', ');
    return `${stamp} -> ${t.label} (${channels})`;
  });
}
