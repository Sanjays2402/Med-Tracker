import { startOfDay, isSameDay, addDays } from './date';

export interface DoseLike {
  takenAt: string | null;
  dueAt: string;
}

/**
 * Compute current and longest streaks given chronologically sorted doses.
 * A day counts if at least one due dose was taken that day.
 */
export function computeStreak(doses: DoseLike[]): { current: number; longest: number } {
  if (!doses.length) return { current: 0, longest: 0 };
  const days = new Set<number>();
  for (const d of doses) {
    if (!d.takenAt) continue;
    days.add(startOfDay(new Date(d.takenAt)).getTime());
  }
  let longest = 0;
  let run = 0;
  let cursor = startOfDay(new Date(doses[0]!.dueAt));
  const last = startOfDay(new Date(doses[doses.length - 1]!.dueAt));
  while (cursor.getTime() <= last.getTime()) {
    if (days.has(cursor.getTime())) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
    cursor = addDays(cursor, 1);
  }
  let current = 0;
  let walk = startOfDay(new Date());
  while (days.has(walk.getTime())) {
    current += 1;
    walk = addDays(walk, -1);
  }
  // allow a 1 day grace if yesterday was taken but today not yet logged
  if (!days.has(startOfDay(new Date()).getTime()) && days.has(addDays(startOfDay(new Date()), -1).getTime())) {
    // current already counted from yesterday
  } else if (current === 0 && days.has(addDays(startOfDay(new Date()), -1).getTime())) {
    current = 1;
  }
  return { current, longest };
}
