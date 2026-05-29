import type { Schedule, Dose } from '@med/types';
import { expandSchedule, addDays } from '@med/utils';

export interface PendingDose {
  medicationId: string;
  scheduleId: string;
  dueAt: Date;
}

/**
 * Pure reminder evaluation. Given a set of schedules and previously generated doses,
 * return the doses that still need to be created for the lookahead window.
 */
export function pendingDoses(
  schedules: Schedule[],
  existing: Dose[],
  now: Date = new Date(),
  lookaheadDays = 1,
): PendingDose[] {
  const have = new Set(existing.map((d) => `${d.medicationId}:${new Date(d.dueAt).getTime()}`));
  const out: PendingDose[] = [];
  const to = addDays(now, lookaheadDays);
  for (const s of schedules) {
    if (!s.enabled) continue;
    const due = expandSchedule(s, now, to);
    for (const d of due) {
      const key = `${s.medicationId}:${d.getTime()}`;
      if (have.has(key)) continue;
      out.push({ medicationId: s.medicationId, scheduleId: s.id, dueAt: d });
    }
  }
  return out;
}

/** Choose which pending doses should fire a reminder right now. */
export function dueNow(pending: PendingDose[], now: Date = new Date(), leadMinutes = 5): PendingDose[] {
  const cutoff = now.getTime() + leadMinutes * 60_000;
  return pending.filter((p) => p.dueAt.getTime() <= cutoff && p.dueAt.getTime() >= now.getTime() - 60 * 60_000);
}
