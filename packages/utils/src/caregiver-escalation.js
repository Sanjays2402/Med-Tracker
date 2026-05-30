"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pendingAlertsForDose = pendingAlertsForDose;
exports.pendingAlertsForBatch = pendingAlertsForBatch;
exports.alertsToDispatch = alertsToDispatch;
exports.nextAlert = nextAlert;
const DEFAULT_RESOLVE = ['taken', 'skipped'];
function isResolved(dose, policy) {
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
function pendingAlertsForDose(dose, policy, now = new Date()) {
    if (isResolved(dose, policy))
        return [];
    const due = new Date(dose.dueAt).getTime();
    const out = [];
    for (const tier of policy.tiers) {
        const fireAt = due + tier.delayMinutes * 60_000;
        if (now.getTime() < fireAt)
            continue;
        if (tier.expireMinutes !== undefined && now.getTime() >= due + tier.expireMinutes * 60_000)
            continue;
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
function pendingAlertsForBatch(doses, policy, now = new Date()) {
    const out = [];
    for (const d of doses) {
        for (const a of pendingAlertsForDose(d, policy, now))
            out.push(a);
    }
    return out;
}
/**
 * Reconcile expected pending alerts against ones already dispatched. Returns
 * the alerts the caller still needs to send. Dispatch is identified by the
 * tuple (doseId, tierId, recipientId) so the same channel re-dispatch is
 * automatically suppressed.
 */
function alertsToDispatch(expected, alreadySent) {
    const seen = new Set(alreadySent.map((a) => `${a.doseId}|${a.tierId}|${a.recipientId}`));
    return expected.filter((a) => !seen.has(`${a.doseId}|${a.tierId}|${a.recipientId}`));
}
/** Convenience: the next tier that will fire for a dose, or null when none remains. */
function nextAlert(dose, policy, now = new Date()) {
    if (isResolved(dose, policy))
        return null;
    const due = new Date(dose.dueAt).getTime();
    const upcoming = policy.tiers
        .map((t) => ({ tier: t, fireAt: new Date(due + t.delayMinutes * 60_000) }))
        .filter((t) => t.fireAt.getTime() > now.getTime())
        .sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
    return upcoming[0] ?? null;
}
