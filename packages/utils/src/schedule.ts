import type { Schedule } from '@med/types';
import { addDays, addHours, parseHHMM, startOfDay } from './date';

/** Expand a schedule into concrete due timestamps between two dates. */
export function expandSchedule(s: Schedule, from: Date, to: Date): Date[] {
  const out: Date[] = [];
  let cursor = startOfDay(from);
  const end = startOfDay(to);
  if (s.kind === 'asNeeded') return out;
  while (cursor.getTime() <= end.getTime()) {
    if (s.kind === 'daily') {
      for (const t of s.times) out.push(parseHHMM(t, cursor));
    } else if (s.kind === 'weekly') {
      if (s.daysOfWeek?.includes(cursor.getDay())) {
        for (const t of s.times) out.push(parseHHMM(t, cursor));
      }
    } else if (s.kind === 'interval' && s.intervalHours) {
      let t = new Date(cursor);
      const dayEnd = addDays(cursor, 1);
      while (t.getTime() < dayEnd.getTime()) {
        out.push(new Date(t));
        t = addHours(t, s.intervalHours);
      }
    }
    cursor = addDays(cursor, 1);
  }
  return out.filter((d) => d.getTime() >= from.getTime() && d.getTime() <= to.getTime());
}
