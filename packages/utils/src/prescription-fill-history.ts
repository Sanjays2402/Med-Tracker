/**
 * Normalize pharmacy fill history into a continuous-coverage map.
 *
 * Pharmacy fill records arrive as a flat list:
 *
 *   { medicationId, ndc, fillDate, daysSupply }
 *
 * but the question the dashboard wants to answer is: "for each
 * medication, on every day inside the analysis window, did the
 * patient HAVE supply on hand?" That coverage view drives:
 *
 *   - The Proportion of Days Covered (PDC) metric (see
 *     pdc-by-medication.ts which composes this map).
 *   - Refill-gap detection ("you ran out of metformin for 9 days in
 *     February — likely a missed refill").
 *   - Overlap detection ("two warfarin fills 6 days apart on a 30-day
 *     supply means double-counting or hoarding").
 *
 * The naive approach — adding `daysSupply` to `fillDate` and unioning
 * intervals — over-counts overlapping fills because real patients
 * don't double up. The correct cumulative-coverage rule is:
 *
 *   - Each fill contributes `daysSupply` days of coverage.
 *   - Overlapping fills extend the existing coverage tail; they don't
 *     reset it. So a 30-day fill on day 1 and a 30-day fill on day 20
 *     covers days 1-50 (not 1-30 + 20-50, which would double-count).
 *   - A gap is a day inside the window with NO coverage from any fill.
 *
 * NDCs that change mid-window represent a brand/generic substitution
 * but the SAME prescription — they roll up to the medicationId.
 *
 * Pure / deterministic. No I/O.
 */

import { addDays, startOfDay } from './date';

export interface FillEvent {
  medicationId: string;
  /** National Drug Code. Distinct NDCs collapse to medicationId for coverage. */
  ndc?: string;
  /** Day the fill was dispensed. ISO date (YYYY-MM-DD) or Date. */
  fillDate: string | Date;
  /** Calendar days the fill is intended to cover. Must be > 0. */
  daysSupply: number;
}

export interface CoverageGap {
  /** ISO date (YYYY-MM-DD) of first uncovered day. */
  start: string;
  /** ISO date (YYYY-MM-DD) of last uncovered day. */
  end: string;
  /** Length of the gap in days, inclusive. */
  days: number;
}

export interface MedicationCoverage {
  medicationId: string;
  /** Window start (inclusive). ISO date. */
  windowStart: string;
  /** Window end (inclusive). ISO date. */
  windowEnd: string;
  /** Days covered inside the window (de-duplicated). */
  daysCovered: number;
  /** Total days in the window. */
  windowDays: number;
  /** daysCovered / windowDays, in [0, 1]. */
  coverageRatio: number;
  /** Ordered list of uncovered runs inside the window. */
  gaps: CoverageGap[];
  /** Distinct NDCs observed across the source fills. */
  ndcs: string[];
  /** Distinct fill events that contributed to coverage. */
  fillCount: number;
}

export interface FillHistoryReport {
  windowStart: string;
  windowEnd: string;
  perMedication: MedicationCoverage[];
  /** Sum of all medicationIds; useful for an aggregate banner. */
  totalGapDays: number;
  /** Fills rejected as malformed; reason per rejection. */
  rejected: { fill: FillEvent; reason: string }[];
}

export interface NormalizeOptions {
  /** Window start (inclusive). Defaults to earliest fill date. */
  windowStart?: Date;
  /** Window end (inclusive). Defaults to latest fillDate + max daysSupply. */
  windowEnd?: Date;
  /** Ignore gaps shorter than this many days. Default 1. */
  minGapDays?: number;
}

const MS_DAY = 86_400_000;

function toDate(v: string | Date): Date | null {
  const d = v instanceof Date ? new Date(v.getTime()) : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return startOfDay(d);
}

function toIso(d: Date): string {
  // Local YYYY-MM-DD to avoid timezone shift (matches dose-history-aggregator).
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / MS_DAY);
}

interface ValidatedFill {
  medicationId: string;
  ndc?: string;
  startMs: number;
  daysSupply: number;
}

function validate(
  fill: FillEvent,
): { ok: true; value: ValidatedFill } | { ok: false; reason: string } {
  if (!fill.medicationId) return { ok: false, reason: 'missing-medicationId' };
  if (!fill.daysSupply || fill.daysSupply <= 0 || !Number.isFinite(fill.daysSupply)) {
    return { ok: false, reason: 'invalid-daysSupply' };
  }
  const d = toDate(fill.fillDate);
  if (!d) return { ok: false, reason: 'invalid-fillDate' };
  return {
    ok: true,
    value: {
      medicationId: fill.medicationId,
      ndc: fill.ndc,
      startMs: d.getTime(),
      daysSupply: Math.floor(fill.daysSupply),
    },
  };
}

/**
 * Compute one medication's natural coverage intervals (un-clipped) using
 * the "extend, don't reset" rule. Returns intervals sorted ascending.
 */
function naturalIntervals(fills: ValidatedFill[]): { start: number; end: number }[] {
  if (fills.length === 0) return [];
  const sorted = [...fills].sort((a, b) => a.startMs - b.startMs);
  const intervals: { start: number; end: number }[] = [];
  let tailEnd = -Infinity;
  let runStart = -Infinity;
  let initialized = false;
  for (const f of sorted) {
    const fillEnd = f.startMs + (f.daysSupply - 1) * MS_DAY;
    if (!initialized) {
      runStart = f.startMs;
      tailEnd = fillEnd;
      initialized = true;
      continue;
    }
    if (f.startMs <= tailEnd + MS_DAY) {
      // Stockpiling: extend tail by daysSupply.
      tailEnd += f.daysSupply * MS_DAY;
    } else {
      intervals.push({ start: runStart, end: tailEnd });
      runStart = f.startMs;
      tailEnd = fillEnd;
    }
  }
  if (initialized) intervals.push({ start: runStart, end: tailEnd });
  return intervals;
}

function clipIntervals(
  intervals: { start: number; end: number }[],
  windowStartMs: number,
  windowEndMs: number,
): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  for (const iv of intervals) {
    const s = Math.max(iv.start, windowStartMs);
    const e = Math.min(iv.end, windowEndMs);
    if (s <= e) out.push({ start: s, end: e });
  }
  return out;
}

function intervalsToGaps(
  intervals: { start: number; end: number }[],
  windowStartMs: number,
  windowEndMs: number,
  minGapDays: number,
): CoverageGap[] {
  const gaps: CoverageGap[] = [];
  let cursor = windowStartMs;
  for (const iv of intervals) {
    if (iv.start > cursor) {
      const gapEnd = iv.start - MS_DAY;
      const days = Math.round((gapEnd - cursor) / MS_DAY) + 1;
      if (days >= minGapDays) {
        gaps.push({
          start: toIso(new Date(cursor)),
          end: toIso(new Date(gapEnd)),
          days,
        });
      }
    }
    cursor = Math.max(cursor, iv.end + MS_DAY);
  }
  if (cursor <= windowEndMs) {
    const days = Math.round((windowEndMs - cursor) / MS_DAY) + 1;
    if (days >= minGapDays) {
      gaps.push({
        start: toIso(new Date(cursor)),
        end: toIso(new Date(windowEndMs)),
        days,
      });
    }
  }
  return gaps;
}

/**
 * Normalize a fill history into per-medication continuous-coverage
 * maps with gaps. Window defaults: start = earliest fillDate,
 * end = max(fillEnd) across all fills.
 */
export function normalizeFillHistory(
  fills: FillEvent[],
  options: NormalizeOptions = {},
): FillHistoryReport {
  const minGapDays = Math.max(1, options.minGapDays ?? 1);
  const valid: ValidatedFill[] = [];
  const rejected: { fill: FillEvent; reason: string }[] = [];
  for (const f of fills) {
    const r = validate(f);
    if (r.ok) valid.push(r.value);
    else rejected.push({ fill: f, reason: r.reason });
  }

  if (valid.length === 0) {
    const start = options.windowStart ?? new Date();
    const end = options.windowEnd ?? start;
    return {
      windowStart: toIso(startOfDay(start)),
      windowEnd: toIso(startOfDay(end)),
      perMedication: [],
      totalGapDays: 0,
      rejected,
    };
  }

  // Group fills by medication and compute natural intervals so the
  // default window per medication can include stockpiled tails (a Jan 1
  // + Jan 20 pair of 30-day fills covers through ~Mar 1, not Feb 18).
  const byMed = new Map<string, ValidatedFill[]>();
  for (const v of valid) {
    const arr = byMed.get(v.medicationId);
    if (arr) arr.push(v);
    else byMed.set(v.medicationId, [v]);
  }
  const naturalByMed = new Map<string, { start: number; end: number }[]>();
  for (const [medId, medFills] of byMed) {
    naturalByMed.set(medId, naturalIntervals(medFills));
  }

  const allStart = Math.min(...valid.map((v) => v.startMs));
  const allNaturalEnd = Math.max(
    ...Array.from(naturalByMed.values()).flatMap((ivs) => ivs.map((iv) => iv.end)),
  );
  const sharedWindowStart = options.windowStart !== undefined;
  const sharedWindowEnd = options.windowEnd !== undefined;
  const sharedStartMs = sharedWindowStart ? startOfDay(options.windowStart!).getTime() : allStart;
  const sharedEndMs = sharedWindowEnd ? startOfDay(options.windowEnd!).getTime() : allNaturalEnd;
  if (sharedEndMs < sharedStartMs) {
    throw new Error('normalizeFillHistory: windowEnd must be on or after windowStart');
  }

  const perMedication: MedicationCoverage[] = [];
  let totalGapDays = 0;
  for (const [medicationId, medFills] of byMed) {
    const natural = naturalByMed.get(medicationId) ?? [];
    // Per-medication window: when no explicit bound is given, use this
    // medication's own natural span instead of the global max — a
    // medication whose history ends early shouldn't get a phantom
    // trailing gap caused by an unrelated medication's longer tail.
    const medFirstStart = Math.min(...medFills.map((f) => f.startMs));
    const medNaturalEnd = natural.length > 0 ? natural[natural.length - 1]!.end : medFirstStart;
    const windowStartMs = sharedWindowStart ? sharedStartMs : medFirstStart;
    const windowEndMs = sharedWindowEnd ? sharedEndMs : medNaturalEnd;
    const intervals = clipIntervals(natural, windowStartMs, windowEndMs);
    const daysCovered = intervals.reduce(
      (s, iv) => s + (Math.round((iv.end - iv.start) / MS_DAY) + 1),
      0,
    );
    const windowDays = Math.round((windowEndMs - windowStartMs) / MS_DAY) + 1;
    const gaps = intervalsToGaps(intervals, windowStartMs, windowEndMs, minGapDays);
    const gapDays = gaps.reduce((s, g) => s + g.days, 0);
    totalGapDays += gapDays;
    const ndcs = Array.from(
      new Set(medFills.map((f) => f.ndc).filter((n): n is string => Boolean(n))),
    ).sort();
    perMedication.push({
      medicationId,
      windowStart: toIso(new Date(windowStartMs)),
      windowEnd: toIso(new Date(windowEndMs)),
      daysCovered,
      windowDays,
      coverageRatio: windowDays > 0 ? daysCovered / windowDays : 0,
      gaps,
      ndcs,
      fillCount: medFills.length,
    });
  }

  perMedication.sort((a, b) => a.medicationId.localeCompare(b.medicationId));

  return {
    windowStart: toIso(new Date(sharedStartMs)),
    windowEnd: toIso(new Date(sharedEndMs)),
    perMedication,
    totalGapDays,
    rejected,
  };
}

/**
 * Lookup helper: does the patient have coverage for medicationId on
 * the given date? Useful for the dashboard's "as of today" pill.
 */
export function isCoveredOn(
  coverage: MedicationCoverage,
  date: Date,
): boolean {
  const target = startOfDay(date);
  const targetIso = toIso(target);
  // We don't store intervals on the public type to keep it small;
  // walk gaps instead — if the date is inside a gap, not covered.
  for (const g of coverage.gaps) {
    if (g.start <= targetIso && targetIso <= g.end) return false;
  }
  // Must also be inside the window.
  if (targetIso < coverage.windowStart || targetIso > coverage.windowEnd) return false;
  return true;
}

/**
 * Find the gap (if any) that the patient is currently in, given a
 * "now" date. Returns undefined if currently covered.
 */
export function activeGap(
  coverage: MedicationCoverage,
  now: Date,
): CoverageGap | undefined {
  const nowIso = toIso(startOfDay(now));
  return coverage.gaps.find((g) => g.start <= nowIso && nowIso <= g.end);
}

/**
 * Summarize total coverage across the regimen as a one-liner:
 *   "Refill coverage: 4 of 5 medications fully covered; metformin has
 *    a 9-day gap (Feb 12 – Feb 20)."
 */
export function summarizeFillHistory(report: FillHistoryReport): string {
  const total = report.perMedication.length;
  if (total === 0) return 'No fill history available.';
  const covered = report.perMedication.filter((m) => m.gaps.length === 0).length;
  const head = `Refill coverage: ${covered} of ${total} medication${total === 1 ? '' : 's'} fully covered`;
  const worst = [...report.perMedication]
    .filter((m) => m.gaps.length > 0)
    .sort((a, b) => {
      const aMax = Math.max(...a.gaps.map((g) => g.days));
      const bMax = Math.max(...b.gaps.map((g) => g.days));
      return bMax - aMax;
    })[0];
  if (!worst) return `${head}.`;
  const worstGap = [...worst.gaps].sort((a, b) => b.days - a.days)[0]!;
  return `${head}; ${worst.medicationId} has a ${worstGap.days}-day gap (${worstGap.start} to ${worstGap.end}).`;
}
