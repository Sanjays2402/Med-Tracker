/**
 * Reminder snooze policy with escalation and auto-skip.
 *
 * A reminder UI without a snooze policy quickly becomes a snooze
 * button that the patient mashes forever. This module decides, given
 * the policy and the history of snoozes/dismissals for one dose, what
 * the reminder engine should do next:
 *
 *   - allow another snooze (and for how long, possibly escalated),
 *   - escalate (notify caregiver / louder channel),
 *   - auto-skip the dose (mark missed and stop nagging).
 *
 * The policy is small and human-readable:
 *
 *   - maxSnoozes: hard cap before auto-skip,
 *   - baseSnoozeMinutes: first snooze duration,
 *   - escalationFactor: each subsequent snooze multiplies by this
 *     factor (default 1, i.e. fixed-length), so a policy can be
 *     "5, 10, 20" or "10, 10, 10",
 *   - maxSnoozeMinutes: clamp on the escalated duration,
 *   - escalateAfterSnoozes: after N snoozes, the policy flips to
 *     "escalate" instead of "allow",
 *   - autoSkipAfterMinutes: even before maxSnoozes, if total elapsed
 *     since dueAt exceeds this, auto-skip.
 *
 * Pure / deterministic. Caller passes the current clock.
 */

export type SnoozeAction = 'allow' | 'escalate' | 'auto-skip';

export interface SnoozeEvent {
  /** When the snooze was requested (ISO). */
  at: string;
  /** Duration the snooze deferred to (minutes). */
  durationMinutes: number;
}

export interface SnoozePolicy {
  /** Hard cap on total snoozes before auto-skip. Default 3. */
  maxSnoozes?: number;
  /** Snooze duration for the first snooze. Default 10. */
  baseSnoozeMinutes?: number;
  /** Multiplicative factor applied to each subsequent snooze. Default 1. */
  escalationFactor?: number;
  /** Cap on individual snooze duration. Default 60. */
  maxSnoozeMinutes?: number;
  /**
   * After this many snoozes the policy escalates (notify caregiver,
   * louder channel) instead of allowing yet another snooze. Default
   * `maxSnoozes - 1` so the user gets one warning snooze before the
   * hard skip.
   */
  escalateAfterSnoozes?: number;
  /**
   * If total minutes since dueAt exceeds this, auto-skip regardless
   * of snooze count. Default 240 (4 hours).
   */
  autoSkipAfterMinutes?: number;
}

export interface SnoozeDecisionInput {
  dueAt: string;
  /** Ordered snooze events (oldest first). */
  history: SnoozeEvent[];
  /** Current clock. */
  now: Date;
  policy?: SnoozePolicy;
}

export interface SnoozeDecision {
  action: SnoozeAction;
  /** When the next reminder should fire. Equal to `now` for escalate, null for auto-skip. */
  nextFireAt: string | null;
  /** Minutes between `now` and `nextFireAt`. 0 for escalate, null for auto-skip. */
  nextSnoozeMinutes: number | null;
  /** Total snoozes used (incl. the one this decision would record). */
  snoozesUsed: number;
  /** Human-readable rationale. */
  reason: string;
}

const DEFAULT_POLICY: Required<SnoozePolicy> = {
  maxSnoozes: 3,
  baseSnoozeMinutes: 10,
  escalationFactor: 1,
  maxSnoozeMinutes: 60,
  // escalateAfterSnoozes defaulted dynamically below.
  escalateAfterSnoozes: -1,
  autoSkipAfterMinutes: 240,
};

function resolvePolicy(p?: SnoozePolicy): Required<SnoozePolicy> {
  const merged: Required<SnoozePolicy> = { ...DEFAULT_POLICY, ...p };
  if (merged.escalateAfterSnoozes < 0) {
    merged.escalateAfterSnoozes = Math.max(0, merged.maxSnoozes - 1);
  }
  return merged;
}

function snoozeDurationMinutes(
  policy: Required<SnoozePolicy>,
  prevCount: number,
): number {
  const dur = policy.baseSnoozeMinutes * Math.pow(policy.escalationFactor, prevCount);
  return Math.max(1, Math.min(policy.maxSnoozeMinutes, Math.round(dur)));
}

/**
 * Decide what the reminder engine should do next when the patient
 * taps "snooze" (or when the engine re-checks an outstanding reminder).
 */
export function decideSnoozeAction(input: SnoozeDecisionInput): SnoozeDecision {
  const policy = resolvePolicy(input.policy);
  const prevSnoozes = input.history.length;
  const dueMs = new Date(input.dueAt).getTime();
  const nowMs = input.now.getTime();
  const elapsedMin = Math.max(0, Math.floor((nowMs - dueMs) / 60_000));
  const projected = prevSnoozes + 1;

  // Auto-skip on total elapsed exceeding policy cap.
  if (elapsedMin >= policy.autoSkipAfterMinutes) {
    return {
      action: 'auto-skip',
      nextFireAt: null,
      nextSnoozeMinutes: null,
      snoozesUsed: prevSnoozes,
      reason: `Auto-skipped: ${elapsedMin} minutes since due exceeds ${policy.autoSkipAfterMinutes}-minute cap.`,
    };
  }

  // Auto-skip when snooze budget exhausted.
  if (prevSnoozes >= policy.maxSnoozes) {
    return {
      action: 'auto-skip',
      nextFireAt: null,
      nextSnoozeMinutes: null,
      snoozesUsed: prevSnoozes,
      reason: `Auto-skipped: maximum ${policy.maxSnoozes} snoozes reached.`,
    };
  }

  // Escalate when past the escalate-after threshold (but still under maxSnoozes).
  if (prevSnoozes >= policy.escalateAfterSnoozes) {
    return {
      action: 'escalate',
      nextFireAt: input.now.toISOString(),
      nextSnoozeMinutes: 0,
      snoozesUsed: projected,
      reason: `Escalating after ${prevSnoozes} snoozes; next reminder fires now on louder channel.`,
    };
  }

  // Allow another snooze.
  const dur = snoozeDurationMinutes(policy, prevSnoozes);
  const next = new Date(nowMs + dur * 60_000);
  return {
    action: 'allow',
    nextFireAt: next.toISOString(),
    nextSnoozeMinutes: dur,
    snoozesUsed: projected,
    reason: `Snoozed ${dur} minutes (snooze ${projected} of ${policy.maxSnoozes}).`,
  };
}

/**
 * Convenience: append a snooze event built from a decision so the
 * caller can persist it without re-deriving the duration.
 */
export function recordSnooze(
  history: SnoozeEvent[],
  decision: SnoozeDecision,
  at: Date,
): SnoozeEvent[] {
  if (decision.action !== 'allow' && decision.action !== 'escalate') return history;
  return [
    ...history,
    { at: at.toISOString(), durationMinutes: decision.nextSnoozeMinutes ?? 0 },
  ];
}

/**
 * Convenience: given a policy, return the full snooze ladder so a
 * settings UI can preview what the user is signing up for. e.g. a
 * 10 / factor 2 / max 60 policy returns [10, 20, 40, 60].
 */
export function snoozeLadder(policy?: SnoozePolicy): number[] {
  const p = resolvePolicy(policy);
  const out: number[] = [];
  for (let i = 0; i < p.maxSnoozes; i++) {
    out.push(snoozeDurationMinutes(p, i));
  }
  return out;
}
