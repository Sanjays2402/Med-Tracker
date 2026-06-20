/**
 * Dose history aggregator.
 *
 * The dose log fed to charts and reports is a flat list of events. The
 * UI almost always wants it bucketed: "this week's adherence by day", "30
 * days by week", "12 weeks by month". Each bucket needs counts of every
 * meaningful status so the renderer can color-code a bar or sparkline:
 *
 *   - taken: takenAt set and within the "on-time" window of dueAt.
 *   - late: taken but outside the on-time window (default ±60 min).
 *   - missed: scheduled (dueAt in the past) and never taken.
 *   - skipped: explicitly skipped (a takenAt of `null` with a `skipped`
 *     flag or with an explicit `skippedAt` timestamp).
 *   - upcoming: scheduled in the future.
 *
 * The aggregator also returns total counts and percentages so a header
 * banner can read "12 / 14 doses (86%) this week".
 *
 * Pure / deterministic. Time-zone-naive on caller-supplied instants.
 */

import { addDays, startOfDay } from './date';

export interface DoseHistoryEntry {
  /** When the dose was scheduled. */
  dueAt: string;
  /** When the patient actually took it. Null if missed/skipped/upcoming. */
  takenAt?: string | null;
  /** Explicit skip marker. Skipped doses are NOT counted as missed. */
  skipped?: boolean;
  /** Optional medication identifier for grouping. */
  medicationId?: string;
}

export type Bucket = 'day' | 'week' | 'month';

export interface AggregateOptions {
  /** Bucket size. Default 'day'. */
  bucket?: Bucket;
  /** Window start (inclusive). */
  from: Date;
  /** Window end (inclusive). */
  to: Date;
  /** Tolerance window for "on-time" in minutes. Default 60. */
  onTimeMinutes?: number;
  /** Reference "now" for distinguishing missed vs upcoming. Default new Date(). */
  now?: Date;
  /** Week starts on (0=Sunday, 1=Monday). Default 1 (Mon, ISO-like). */
  weekStartsOn?: 0 | 1;
}

export interface DoseStatusCounts {
  taken: number;
  late: number;
  missed: number;
  skipped: number;
  upcoming: number;
  total: number;
}

export interface DoseBucket extends DoseStatusCounts {
  /** ISO date of bucket start (YYYY-MM-DD for day, YYYY-Www, or YYYY-MM). */
  key: string;
  /** Start of bucket (inclusive). */
  start: string;
  /** End of bucket (exclusive). */
  end: string;
  /** Adherence ratio = (taken+late) / (taken+late+missed). 0..1. */
  adherence: number;
}

export interface DoseAggregation {
  bucket: Bucket;
  buckets: DoseBucket[];
  total: DoseStatusCounts;
  /** Overall adherence across all buckets (taken+late vs taken+late+missed). */
  overallAdherence: number;
}

function classifyEntry(
  e: DoseHistoryEntry,
  onTimeMs: number,
  nowMs: number,
): 'taken' | 'late' | 'missed' | 'skipped' | 'upcoming' {
  if (e.skipped) return 'skipped';
  if (e.takenAt) {
    const drift = Math.abs(new Date(e.takenAt).getTime() - new Date(e.dueAt).getTime());
    return drift <= onTimeMs ? 'taken' : 'late';
  }
  return new Date(e.dueAt).getTime() <= nowMs ? 'missed' : 'upcoming';
}

function startOfWeek(d: Date, weekStartsOn: 0 | 1): Date {
  const base = startOfDay(d);
  const day = base.getDay();
  const offset = (day - weekStartsOn + 7) % 7;
  return addDays(base, -offset);
}

function startOfMonth(d: Date): Date {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function bucketStart(d: Date, bucket: Bucket, weekStartsOn: 0 | 1): Date {
  if (bucket === 'day') return startOfDay(d);
  if (bucket === 'week') return startOfWeek(d, weekStartsOn);
  return startOfMonth(d);
}

function bucketEnd(start: Date, bucket: Bucket): Date {
  if (bucket === 'day') return addDays(start, 1);
  if (bucket === 'week') return addDays(start, 7);
  const x = new Date(start);
  x.setMonth(x.getMonth() + 1);
  return x;
}

function bucketKey(start: Date, bucket: Bucket): string {
  const iso = start.toISOString().slice(0, 10);
  if (bucket === 'day') return iso;
  if (bucket === 'month') return iso.slice(0, 7);
  // ISO week-of-year (approximate; uses Mon-start always for ISO weeks).
  const tmp = new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function empty(): DoseStatusCounts {
  return { taken: 0, late: 0, missed: 0, skipped: 0, upcoming: 0, total: 0 };
}

function add(a: DoseStatusCounts, b: DoseStatusCounts): DoseStatusCounts {
  return {
    taken: a.taken + b.taken,
    late: a.late + b.late,
    missed: a.missed + b.missed,
    skipped: a.skipped + b.skipped,
    upcoming: a.upcoming + b.upcoming,
    total: a.total + b.total,
  };
}

function adherenceOf(c: DoseStatusCounts): number {
  const denom = c.taken + c.late + c.missed;
  if (denom === 0) return 0;
  return Math.round(((c.taken + c.late) / denom) * 1000) / 1000;
}

export function aggregateDoseHistory(
  entries: DoseHistoryEntry[],
  options: AggregateOptions,
): DoseAggregation {
  const bucket = options.bucket ?? 'day';
  const onTimeMs = (options.onTimeMinutes ?? 60) * 60_000;
  const nowMs = (options.now ?? new Date()).getTime();
  const weekStartsOn = options.weekStartsOn ?? 1;

  const fromMs = startOfDay(options.from).getTime();
  const toMs = addDays(startOfDay(options.to), 1).getTime() - 1;

  // Generate all buckets in range so empty days still appear.
  const buckets = new Map<string, DoseBucket>();
  let cursor = bucketStart(options.from, bucket, weekStartsOn);
  while (cursor.getTime() <= toMs) {
    const end = bucketEnd(cursor, bucket);
    const key = bucketKey(cursor, bucket);
    buckets.set(key, {
      key,
      start: cursor.toISOString(),
      end: end.toISOString(),
      ...empty(),
      adherence: 0,
    });
    cursor = end;
  }

  for (const e of entries) {
    const dueMs = new Date(e.dueAt).getTime();
    if (dueMs < fromMs || dueMs > toMs) continue;
    const bStart = bucketStart(new Date(e.dueAt), bucket, weekStartsOn);
    const key = bucketKey(bStart, bucket);
    const b = buckets.get(key);
    if (!b) continue;
    const status = classifyEntry(e, onTimeMs, nowMs);
    b[status] += 1;
    b.total += 1;
  }

  // Compute adherence per bucket.
  for (const b of buckets.values()) {
    b.adherence = adherenceOf(b);
  }

  const sortedBuckets = [...buckets.values()].sort((a, b) => a.start.localeCompare(b.start));
  const total = sortedBuckets.reduce<DoseStatusCounts>((acc, b) => add(acc, b), empty());
  return {
    bucket,
    buckets: sortedBuckets,
    total,
    overallAdherence: adherenceOf(total),
  };
}
