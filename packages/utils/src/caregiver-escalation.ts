import type { Dose } from '@med/types';

/**
 * Caregiver escalation policy.
 *
 * When a dose is missed or running late, the user is notified first; if the
 * dose still isn't taken, escalating tiers of caregivers receive a heads-up
 * after increasing delays. This module computes, at a given evaluation
 * instant, the set of alerts that should be in-flight right now for a given
 * dose. It is pure and stateless: callers pass the policy and dose,
 * receive the alerts that *should* exist, and reconcile against what has
 * already been sent.
 *
 * Designed so the same logic can run in a server cron job, in a phone push
 * scheduler, and in unit tests with frozen clocks.
 */

export type EscalationChannel = 'push' | 'sms' | 'email' | 'voice';

export interface EscalationTier {
  /** Stable id used to deduplicate dispatched alerts. */
  id: string;
  /** Display label. */
  label: string;
  /**
   * Minutes after the dose's dueAt at which this tier fires. The patient
   * tier typically fires at 0 (the original reminder); caregivers escalate
   * at, for example, 15, 30, and 60 minutes.
   */
  delayMinutes: number;
  recipients: { id: string; name: string; channel: EscalationChannel }[];
  /**
   * Optional ceiling. If the dose was logged before this minute mark the
   * tier does not fire. Defaults to "fires whenever the delay has elapsed
   * and the dose is still open".
   */
  expireMinutes?: number;
}

export interface EscalationPolicy {
  id: string;
  /** Human label. */
  label: string;
  tiers: EscalationTier[];
  /**
   * Statuses that are considered "resolved" and stop escalation. By default
   * any of `taken`, `skipped`, or `late` close the dose. Callers can narrow
   * this when "late" should still escalate (for example, controlled meds).
   */
  resolveOn?: Dose['status'][];
}

export interface PendingAlert {
  doseId: string;
  tierId: string;
  recipientId: string;
  channel: EscalationChannel;
  /** ISO timestamp at which the alert was due to fire. */
  fireAt: string;
}

const DEFAULT_RESOLVE: Dose['status'][] = ['taken', 'skipped'];

function isResolved(dose: Dose, policy: EscalationPolicy): boolean {
  const resolveOn = policy.resolveOn ?? DEFAULT_RESOLVE;
  return resolveOn.includes(dose.status);
}

/**
 * Compute the alerts that should currently be in-flight for one dose given a
 * policy and the present moment.
 *
 * A tier fires when:
 *   1. The dose is not resolved.
 *   2. `now >= dueAt + delayMinutes`.
 *   3. The tier has not expired (`now < dueAt + expireMinutes`).
 */
export function pendingAlertsForDose(
  dose: Dose,
  policy: EscalationPolicy,
  now: Date = new Date(),
): PendingAlert[] {
  if (isResolved(dose, policy)) return [];
  const due = new Date(dose.dueAt).getTime();
  const out: PendingAlert[] = [];
  for (const tier of policy.tiers) {
    const fireAt = due + tier.delayMinutes * 60_000;
    if (now.getTime() < fireAt) continue;
    if (tier.expireMinutes !== undefined && now.getTime() >= due + tier.expireMinutes * 60_000) continue;
    for (const r of tier.recipients) {
      out.push({
        doseId: dose.id,
        tierId: tier.id,
        recipientId: r.id,
        channel: r.channel,
        fireAt: new Date(fireAt).toISOString(),
      });
    }
  }
  return out;
}

/** Pending alerts for a batch of doses. */
export function pendingAlertsForBatch(
  doses: Dose[],
  policy: EscalationPolicy,
  now: Date = new Date(),
): PendingAlert[] {
  const out: PendingAlert[] = [];
  for (const d of doses) {
    for (const a of pendingAlertsForDose(d, policy, now)) out.push(a);
  }
  return out;
}

/**
 * Reconcile expected pending alerts against ones already dispatched. Returns
 * the alerts the caller still needs to send. Dispatch is identified by the
 * tuple (doseId, tierId, recipientId) so the same channel re-dispatch is
 * automatically suppressed.
 */
export function alertsToDispatch(
  expected: PendingAlert[],
  alreadySent: { doseId: string; tierId: string; recipientId: string }[],
): PendingAlert[] {
  const seen = new Set(alreadySent.map((a) => `${a.doseId}|${a.tierId}|${a.recipientId}`));
  return expected.filter((a) => !seen.has(`${a.doseId}|${a.tierId}|${a.recipientId}`));
}

/** Convenience: the next tier that will fire for a dose, or null when none remains. */
export function nextAlert(
  dose: Dose,
  policy: EscalationPolicy,
  now: Date = new Date(),
): { tier: EscalationTier; fireAt: Date } | null {
  if (isResolved(dose, policy)) return null;
  const due = new Date(dose.dueAt).getTime();
  const upcoming = policy.tiers
    .map((t) => ({ tier: t, fireAt: new Date(due + t.delayMinutes * 60_000) }))
    .filter((t) => t.fireAt.getTime() > now.getTime())
    .sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
  return upcoming[0] ?? null;
}
