/**
 * next-dose — compute the "next dose" countdown shown on the medication detail
 * hero. Pure date math, no React, so it can be unit tested deterministically by
 * passing an explicit `now`.
 *
 * Given a medication's dose events (already filtered to that medication), find
 * the most relevant pending dose and describe how far away it is. "Most
 * relevant" = the earliest pending dose that is not yet more than the grace
 * window overdue; if every pending dose is overdue, the latest overdue one is
 * surfaced so the user sees "X late" rather than a stale far-future time.
 */

export interface NextDoseInput {
  id: string;
  scheduledAt: string; // ISO
  status: 'pending' | 'taken' | 'skipped' | 'missed';
}

export type NextDoseTone = 'upcoming' | 'due' | 'overdue' | 'none';

export interface NextDoseResult {
  /** The dose id this countdown refers to, or null when nothing is pending. */
  doseId: string | null;
  /** Short human label: "in 2h 10m", "in 5m", "now", "20m late", "All done". */
  label: string;
  tone: NextDoseTone;
  /** Signed ms until the dose (negative = past). null when nothing pending. */
  deltaMs: number | null;
}

const GRACE_MS = 15 * 60_000;

export function computeNextDose(
  doses: readonly NextDoseInput[],
  now: number = Date.now(),
): NextDoseResult {
  const pending = doses
    .filter((d) => d.status === 'pending')
    .map((d) => ({ id: d.id, at: +new Date(d.scheduledAt) }))
    .filter((d) => Number.isFinite(d.at))
    .sort((a, b) => a.at - b.at);

  if (pending.length === 0) {
    return { doseId: null, label: 'All done', tone: 'none', deltaMs: null };
  }

  // Prefer the earliest dose that is still within (or ahead of) the grace
  // window. If all are well past, fall back to the latest overdue one.
  const upcoming = pending.find((d) => d.at >= now - GRACE_MS);
  const chosen = upcoming ?? pending[pending.length - 1]!;
  const delta = chosen.at - now;

  return {
    doseId: chosen.id,
    label: formatDelta(delta),
    tone: toneFor(delta),
    deltaMs: delta,
  };
}

export function toneFor(deltaMs: number): NextDoseTone {
  if (deltaMs < -GRACE_MS) return 'overdue';
  if (deltaMs <= GRACE_MS) return 'due';
  return 'upcoming';
}

export function formatDelta(deltaMs: number): string {
  const overdue = deltaMs < -GRACE_MS;
  const absMin = Math.round(Math.abs(deltaMs) / 60_000);
  const hrs = Math.floor(absMin / 60);
  const rem = absMin % 60;

  if (overdue) {
    return absMin < 60 ? `${absMin}m late` : `${hrs}h ${rem}m late`;
  }
  if (absMin < 1) return 'now';
  if (absMin < 60) return `in ${absMin}m`;
  return `in ${hrs}h ${rem}m`;
}
