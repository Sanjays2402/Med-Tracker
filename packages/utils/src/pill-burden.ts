/**
 * Daily pill burden — count plus total mg and mL of liquids per day.
 *
 * Polypharmacy is a real clinical problem: a 75-year-old taking 14
 * tablets across 6 medications is a textbook de-prescribing review
 * candidate. Med-Tracker can surface this without any prescriber
 * intervention by computing, for each day's scheduled regimen:
 *
 *   - pillCount: total tablets/capsules taken across all medications,
 *   - liquidMl: total mL of liquid medications,
 *   - injectionCount: total injections (insulin, biologics),
 *   - totalMg: aggregate mass across mg-quantified forms (useful for
 *     comparing burden across regimens),
 *   - byTime: counts grouped into morning / midday / evening / bedtime
 *     buckets (so the UI can show "8 pills at breakfast, 2 at dinner"),
 *   - byMedication: per-medication breakdown for de-prescribing review.
 *
 * Burden is computed per-day from the expanded schedule, so a daily
 * BID regimen contributes 2 pills/day. PRN ("asNeeded") schedules are
 * intentionally excluded — they aren't a fixed burden.
 *
 * Pure / deterministic. No medical guidance generated.
 */

import type { Medication, Schedule } from '@med/types';

export type TimeBucket = 'morning' | 'midday' | 'evening' | 'bedtime';

export interface PillBurdenInput {
  medication: Pick<Medication, 'id' | 'name' | 'form' | 'strength'>;
  schedules: Schedule[];
  /**
   * Quantity per scheduled administration (e.g. 2 tablets BID = 2).
   * Defaults to 1.
   */
  amountPerDose?: number;
  /**
   * Optional override for parsed strength when the strength field
   * doesn't follow the "{number} {unit}" convention (e.g. "Combination").
   */
  parsedStrengthMg?: number;
  parsedVolumeMl?: number;
}

export interface PillBurdenSummary {
  pillCount: number;
  liquidMl: number;
  injectionCount: number;
  /** Sum of mg across all mg-quantified forms (tablets, capsules, injections). */
  totalMg: number;
  byTime: Record<TimeBucket, number>;
  byMedication: Array<{
    medicationId: string;
    name: string;
    form: Medication['form'];
    administrationsPerDay: number;
    pieces: number;
    mg?: number;
    ml?: number;
  }>;
  /** Total distinct medications contributing to the burden. */
  medicationCount: number;
  /** Total scheduled administrations per day across the whole regimen. */
  administrationsPerDay: number;
  /** Plain-text description (counts only, no clinical guidance). */
  message: string;
}

const PILL_FORMS: Medication['form'][] = ['tablet', 'capsule'];
const LIQUID_FORMS: Medication['form'][] = ['liquid', 'drops'];
const INJECTION_FORMS: Medication['form'][] = ['injection'];

/**
 * Parse a "500 mg", "10mg", "5 mL", "0.5%" style strength into a number
 * + canonical unit. Returns { value, unit } or null if it cannot parse.
 */
export function parseStrength(strength: string): { value: number; unit: string } | null {
  if (!strength) return null;
  const m = strength.trim().match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z%μ]+)/);
  if (!m) return null;
  const value = Number(m[1]);
  if (!Number.isFinite(value)) return null;
  const rawUnit = m[2]!.toLowerCase();
  // Normalize common variants.
  const unit = (() => {
    if (rawUnit === 'ml' || rawUnit === 'milliliters') return 'ml';
    if (rawUnit === 'mg' || rawUnit === 'milligrams') return 'mg';
    if (rawUnit === 'g' || rawUnit === 'grams') return 'g';
    if (rawUnit === 'mcg' || rawUnit === 'μg' || rawUnit === 'ug') return 'mcg';
    if (rawUnit === 'iu' || rawUnit === 'units') return 'units';
    return rawUnit;
  })();
  return { value, unit };
}

function adminsPerDayFromSchedule(s: Schedule): number {
  if (!s.enabled) return 0;
  if (s.kind === 'asNeeded') return 0;
  if (s.kind === 'interval' && s.intervalHours) {
    // Approximation: 24h / interval, capped at 24 to avoid infinite-loop math.
    return Math.min(24, Math.floor(24 / s.intervalHours));
  }
  if (s.kind === 'daily') return s.times.length;
  if (s.kind === 'weekly') {
    if (!s.daysOfWeek?.length) return 0;
    return (s.times.length * s.daysOfWeek.length) / 7;
  }
  // 'cron' kind isn't expanded here; return 0 and rely on caller for those.
  return 0;
}

export function timeBucketFor(hhmm: string): TimeBucket {
  const [hStr] = hhmm.split(':');
  const h = Number(hStr);
  if (!Number.isFinite(h)) return 'midday';
  if (h < 11) return 'morning';
  if (h < 16) return 'midday';
  if (h < 21) return 'evening';
  return 'bedtime';
}

function distributeTimes(s: Schedule): TimeBucket[] {
  const out: TimeBucket[] = [];
  if (!s.enabled) return out;
  if (s.kind === 'daily') return s.times.map(timeBucketFor);
  if (s.kind === 'weekly') {
    // Apply the time list but scale counts by daysOfWeek/7 - rounded later.
    const days = s.daysOfWeek?.length ?? 0;
    if (!days) return out;
    return s.times.map(timeBucketFor);
  }
  if (s.kind === 'interval' && s.intervalHours) {
    const buckets: TimeBucket[] = [];
    let h = 8; // default anchor at 08:00
    let count = 0;
    while (count < 24 / s.intervalHours && count < 24) {
      buckets.push(timeBucketFor(`${String(Math.floor(h) % 24).padStart(2, '0')}:00`));
      h += s.intervalHours;
      count += 1;
    }
    return buckets;
  }
  return out;
}

export function summarizePillBurden(inputs: PillBurdenInput[]): PillBurdenSummary {
  const byTime: Record<TimeBucket, number> = {
    morning: 0, midday: 0, evening: 0, bedtime: 0,
  };
  let pillCount = 0;
  let liquidMl = 0;
  let injectionCount = 0;
  let totalMg = 0;
  let totalAdmins = 0;
  let medicationCount = 0;

  const byMedication: PillBurdenSummary['byMedication'] = [];

  for (const inp of inputs) {
    const amount = inp.amountPerDose ?? 1;
    let adminsPerDay = 0;
    let bucketsContrib: TimeBucket[] = [];
    for (const s of inp.schedules) {
      const a = adminsPerDayFromSchedule(s);
      adminsPerDay += a;
      // For weekly we need to fractionalize the bucket contribution by days/7.
      if (s.kind === 'weekly') {
        const factor = (s.daysOfWeek?.length ?? 0) / 7;
        for (const bucket of distributeTimes(s)) {
          // weighted contribution
          byTime[bucket] += amount * factor;
        }
      } else {
        bucketsContrib = bucketsContrib.concat(distributeTimes(s));
      }
    }
    for (const bucket of bucketsContrib) {
      byTime[bucket] += amount;
    }

    if (adminsPerDay === 0) continue;
    medicationCount += 1;
    totalAdmins += adminsPerDay;

    const pieces = adminsPerDay * amount;
    const parsed = parseStrength(inp.medication.strength);
    let mg: number | undefined;
    let ml: number | undefined;
    if (inp.parsedStrengthMg != null) mg = inp.parsedStrengthMg * pieces;
    else if (parsed && parsed.unit === 'mg') mg = parsed.value * pieces;
    else if (parsed && parsed.unit === 'g') mg = parsed.value * 1000 * pieces;
    else if (parsed && parsed.unit === 'mcg') mg = (parsed.value / 1000) * pieces;
    if (inp.parsedVolumeMl != null) ml = inp.parsedVolumeMl * pieces;
    else if (parsed && parsed.unit === 'ml') ml = parsed.value * pieces;

    const form = inp.medication.form;
    if (PILL_FORMS.includes(form)) pillCount += pieces;
    if (LIQUID_FORMS.includes(form)) liquidMl += ml ?? 0;
    if (INJECTION_FORMS.includes(form)) injectionCount += pieces;
    if (mg != null) totalMg += mg;

    const entry: PillBurdenSummary['byMedication'][number] = {
      medicationId: inp.medication.id,
      name: inp.medication.name,
      form,
      administrationsPerDay: round2(adminsPerDay),
      pieces: round2(pieces),
    };
    if (mg != null) entry.mg = round2(mg);
    if (ml != null) entry.ml = round2(ml);
    byMedication.push(entry);
  }

  byMedication.sort((a, b) => b.pieces - a.pieces || a.name.localeCompare(b.name));
  for (const k of Object.keys(byTime) as TimeBucket[]) byTime[k] = round2(byTime[k]);

  const message = buildMessage(pillCount, medicationCount, liquidMl, injectionCount);

  return {
    pillCount: round2(pillCount),
    liquidMl: round2(liquidMl),
    injectionCount: round2(injectionCount),
    totalMg: round2(totalMg),
    byTime,
    byMedication,
    medicationCount,
    administrationsPerDay: round2(totalAdmins),
    message,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function buildMessage(
  pills: number,
  meds: number,
  liquidMl: number,
  injections: number,
): string {
  const parts: string[] = [];
  parts.push(`${round2(pills)} pill${pills === 1 ? '' : 's'} per day`);
  parts.push(`${meds} medication${meds === 1 ? '' : 's'}`);
  if (liquidMl > 0) parts.push(`${round2(liquidMl)} mL liquids`);
  if (injections > 0) parts.push(`${round2(injections)} injection${injections === 1 ? '' : 's'}`);
  return parts.join(', ') + '.';
}

/**
 * Polypharmacy classification. Conventional thresholds:
 *
 *   - 0-4 daily medications: normal
 *   - 5-9: polypharmacy
 *   - 10+: hyperpolypharmacy
 *
 * Useful as a single tag the UI can color the burden card with.
 */
export type BurdenLevel = 'normal' | 'polypharmacy' | 'hyperpolypharmacy';

export function classifyBurden(summary: PillBurdenSummary): BurdenLevel {
  if (summary.medicationCount >= 10) return 'hyperpolypharmacy';
  if (summary.medicationCount >= 5) return 'polypharmacy';
  return 'normal';
}
