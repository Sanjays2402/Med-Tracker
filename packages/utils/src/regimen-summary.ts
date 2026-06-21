/**
 * Plain-language regimen summary.
 *
 * A patient's regimen list grows over time and the dashboard's first
 * job is to give the user (or a covering pharmacist, or a new
 * caregiver) a fast, human-readable picture of what the patient is
 * actually taking and when. The numeric `pill-burden` utility answers
 * "how heavy is the regimen"; this one answers "what does the regimen
 * look like."
 *
 * Output covers:
 *
 *   - counts: total active meds, total scheduled doses per day,
 *     PRN (as-needed) count, distinct classes,
 *   - timeBuckets: how many doses fall in morning / midday /
 *     afternoon / evening / overnight buckets so the UI can render
 *     a tiny histogram,
 *   - topClasses: top N drug classes by med count with the leading
 *     drug name in each class (so the summary reads "Hypertension:
 *     lisinopril plus 2 others"),
 *   - sentences: short, grammar-correct lines suitable for a
 *     spoken summary, a printable handoff, or a TTS reminder.
 *
 * Pure / deterministic. Uses Schedule + Medication + Drug.
 */

import type { Drug, Medication, Schedule } from '@med/types';

export type RegimenTimeBucket = 'morning' | 'midday' | 'afternoon' | 'evening' | 'overnight';

export interface RegimenInput {
  medications: Medication[];
  schedules: Schedule[];
  /** Optional drug catalog keyed by drugId. Used to look up class/generic. */
  drugs?: Drug[];
}

export interface RegimenSummaryOptions {
  /** Cap on topClasses entries. Default 3. */
  topClassesLimit?: number;
  /** Only consider active medications. Default true. */
  activeOnly?: boolean;
}

export interface ClassRollup {
  classId: string;
  medCount: number;
  /** Lead medication's display name (alphabetical first by name). */
  leadMedication: string;
  /** Other medication names in this class. */
  otherMedications: string[];
}

export interface RegimenSummary {
  totalMedications: number;
  activeMedications: number;
  scheduledMedications: number;
  prnMedications: number;
  scheduledDosesPerDay: number;
  distinctClasses: number;
  timeBuckets: Record<RegimenTimeBucket, number>;
  topClasses: ClassRollup[];
  /** Human-readable lines: one per claim. UI joins or renders as bullets. */
  sentences: string[];
}

const BUCKET_BOUNDS: Array<{ bucket: RegimenTimeBucket; from: number; to: number }> = [
  { bucket: 'morning', from: 5 * 60, to: 11 * 60 },     // 05:00-11:00
  { bucket: 'midday', from: 11 * 60, to: 14 * 60 },     // 11:00-14:00
  { bucket: 'afternoon', from: 14 * 60, to: 17 * 60 },  // 14:00-17:00
  { bucket: 'evening', from: 17 * 60, to: 22 * 60 },    // 17:00-22:00
];
// Overnight = 22:00-05:00 (wraps).

function timeToBucket(hhmm: string): RegimenTimeBucket {
  const parts = hhmm.split(':').map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  const mins = h * 60 + m;
  for (const b of BUCKET_BOUNDS) {
    if (mins >= b.from && mins < b.to) return b.bucket;
  }
  return 'overnight';
}

function dosesPerDay(s: Schedule): number {
  if (s.kind === 'asNeeded') return 0;
  if (s.kind === 'daily') return s.times.length;
  if (s.kind === 'weekly') {
    const days = s.daysOfWeek?.length ?? 0;
    return (days * s.times.length) / 7;
  }
  if (s.kind === 'interval' && s.intervalHours && s.intervalHours > 0) {
    return 24 / s.intervalHours;
  }
  return 0;
}

function joinList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function pluralize(n: number, singular: string, plural?: string): string {
  return n === 1 ? `${n} ${singular}` : `${n} ${plural ?? `${singular}s`}`;
}

export function summarizeRegimen(
  input: RegimenInput,
  options: RegimenSummaryOptions = {},
): RegimenSummary {
  const topLimit = options.topClassesLimit ?? 3;
  const activeOnly = options.activeOnly ?? true;

  const drugById = new Map<string, Drug>();
  for (const d of input.drugs ?? []) drugById.set(d.id, d);

  const meds = activeOnly
    ? input.medications.filter((m) => m.active)
    : input.medications;

  const schedulesByMed = new Map<string, Schedule[]>();
  for (const s of input.schedules) {
    if (!s.enabled) continue;
    const arr = schedulesByMed.get(s.medicationId) ?? [];
    arr.push(s);
    schedulesByMed.set(s.medicationId, arr);
  }

  const timeBuckets: Record<RegimenTimeBucket, number> = {
    morning: 0,
    midday: 0,
    afternoon: 0,
    evening: 0,
    overnight: 0,
  };

  let totalScheduledMeds = 0;
  let totalPrnMeds = 0;
  let totalDosesPerDay = 0;

  const classes = new Map<string, ClassRollup>();

  for (const m of meds) {
    const schedules = schedulesByMed.get(m.id) ?? [];
    const hasScheduled = schedules.some((s) => s.kind !== 'asNeeded');
    const hasPrn = schedules.some((s) => s.kind === 'asNeeded');
    if (hasScheduled) totalScheduledMeds += 1;
    // A med can be both scheduled and PRN-eligible (taper plans, breakthrough
    // pain). We count PRN if any schedule is asNeeded.
    if (hasPrn) totalPrnMeds += 1;

    for (const s of schedules) {
      totalDosesPerDay += dosesPerDay(s);
      if (s.kind !== 'asNeeded') {
        for (const t of s.times) timeBuckets[timeToBucket(t)] += 1;
        // For interval schedules without explicit times, distribute across
        // morning + evening as a coarse approximation.
        if (s.kind === 'interval' && s.intervalHours && s.times.length === 0) {
          const slots = Math.max(1, Math.floor(24 / s.intervalHours));
          for (let i = 0; i < slots; i++) {
            const hour = (i * s.intervalHours) % 24;
            const hhmm = `${String(hour).padStart(2, '0')}:00`;
            timeBuckets[timeToBucket(hhmm)] += 1;
          }
        }
      }
    }

    const drug = drugById.get(m.drugId);
    const classId = drug?.class ?? m.drugId; // fallback to drugId
    const rollup = classes.get(classId);
    if (!rollup) {
      classes.set(classId, {
        classId,
        medCount: 1,
        leadMedication: m.name,
        otherMedications: [],
      });
    } else {
      rollup.medCount += 1;
      // Maintain alphabetical lead so output is stable.
      if (m.name.localeCompare(rollup.leadMedication) < 0) {
        rollup.otherMedications.push(rollup.leadMedication);
        rollup.leadMedication = m.name;
      } else {
        rollup.otherMedications.push(m.name);
      }
      rollup.otherMedications.sort((a, b) => a.localeCompare(b));
    }
  }

  // Round doses/day to 2 decimals (weekly schedules can produce small
  // fractions like 1/7 ≈ 0.14; 1-decimal rounding would erase them).
  const dosesPerDayRounded = Math.round(totalDosesPerDay * 100) / 100;

  const sortedClasses = [...classes.values()].sort((a, b) => {
    if (b.medCount !== a.medCount) return b.medCount - a.medCount;
    return a.classId.localeCompare(b.classId);
  });

  const topClasses = sortedClasses.slice(0, topLimit);

  // Build human sentences.
  const sentences: string[] = [];
  sentences.push(
    `${pluralize(meds.length, 'active medication')}: ${
      totalScheduledMeds
    } scheduled, ${totalPrnMeds} as-needed.`,
  );
  sentences.push(
    `About ${dosesPerDayRounded} ${
      dosesPerDayRounded === 1 ? 'scheduled dose' : 'scheduled doses'
    } per day across ${pluralize(classes.size, 'class', 'classes')}.`,
  );

  // Top-bucket sentence: where is the heaviest dose load?
  const bucketOrder: RegimenTimeBucket[] = [
    'morning',
    'midday',
    'afternoon',
    'evening',
    'overnight',
  ];
  const peakBucket = bucketOrder.reduce((best, b) =>
    timeBuckets[b] > timeBuckets[best] ? b : best,
  );
  if (timeBuckets[peakBucket] > 0) {
    sentences.push(
      `Heaviest dosing window: ${peakBucket} (${pluralize(timeBuckets[peakBucket], 'dose')}).`,
    );
  }

  for (const c of topClasses) {
    if (c.medCount === 1) {
      sentences.push(`${c.classId}: ${c.leadMedication}.`);
    } else {
      const otherCount = c.medCount - 1;
      sentences.push(
        `${c.classId}: ${c.leadMedication} plus ${pluralize(otherCount, 'other')} (${joinList(c.otherMedications)}).`,
      );
    }
  }

  return {
    totalMedications: input.medications.length,
    activeMedications: meds.length,
    scheduledMedications: totalScheduledMeds,
    prnMedications: totalPrnMeds,
    scheduledDosesPerDay: dosesPerDayRounded,
    distinctClasses: classes.size,
    timeBuckets,
    topClasses,
    sentences,
  };
}

/**
 * Convenience: collapse the summary into a single paragraph suitable
 * for SMS / TTS / printable handoff.
 */
export function summaryToParagraph(summary: RegimenSummary): string {
  return summary.sentences.join(' ');
}
