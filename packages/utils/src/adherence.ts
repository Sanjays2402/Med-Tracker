import type { DoseLike } from './streak';
import { addDays, startOfDay } from './date';

export function adherencePct(doses: DoseLike[]): number {
  if (!doses.length) return 0;
  const taken = doses.filter((d) => d.takenAt).length;
  return Math.round((taken / doses.length) * 100);
}

export function weeklyAdherence(doses: DoseLike[], days = 7) {
  const today = startOfDay(new Date());
  const out: { date: string; takenPct: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = addDays(today, -i);
    const next = addDays(day, 1);
    const slice = doses.filter((d) => {
      const t = new Date(d.dueAt).getTime();
      return t >= day.getTime() && t < next.getTime();
    });
    out.push({ date: day.toISOString().slice(0, 10), takenPct: adherencePct(slice) });
  }
  return out;
}
