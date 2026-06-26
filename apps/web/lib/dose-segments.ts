/**
 * dose-segments — pure model for the Today page's segmented progress row.
 *
 * The flat Today progress bar reads as a single percentage and hides WHICH
 * doses are done. This module turns the day's DoseEvent list into one segment
 * per scheduled dose (time-sorted), each carrying a status + tone so the UI can
 * render a pill row: filled sage for taken, hollow for pending, amber for
 * skipped, coral for missed. It also rolls the counts into a short caption
 * ("3 of 7 taken - 4 to go") so the header stays scannable.
 *
 * No React, no Date.now() — the only time handling is reading the local clock
 * hour/minute off each dose's scheduledAt for the label, which the tests pin by
 * constructing local Date values exactly like the rest of the suite.
 */

export type SegmentStatus = 'taken' | 'pending' | 'skipped' | 'missed';
export type SegmentTone = 'ok' | 'warn' | 'danger' | 'neutral';

export interface DoseLike {
  id: string;
  medicationName: string;
  strength?: string;
  /** ISO timestamp. */
  scheduledAt: string;
  status: SegmentStatus;
}

export interface DoseSegment {
  id: string;
  status: SegmentStatus;
  tone: SegmentTone;
  /** True when the segment should render as a solid fill (taken). */
  filled: boolean;
  /** "8:00 AM - Lisinopril 10 mg" — for the title/aria of the segment. */
  label: string;
  /** Minutes since local midnight, for stable ordering. */
  minutes: number;
}

export interface SegmentSummary {
  segments: DoseSegment[];
  total: number;
  taken: number;
  pending: number;
  skipped: number;
  missed: number;
  /** Resolved = taken + skipped + missed (anything no longer pending). */
  resolved: number;
  /** Integer percent of total that were taken (0 when none scheduled). */
  pct: number;
  /** True when nothing is left pending (the day is fully logged). */
  complete: boolean;
  /** Short human caption for the header. */
  caption: string;
}

const STATUS_TONE: Record<SegmentStatus, SegmentTone> = {
  taken: 'ok',
  skipped: 'warn',
  missed: 'danger',
  pending: 'neutral',
};

/** Minutes since local midnight for an ISO timestamp (NaN-safe → large). */
export function minutesOfDay(iso: string): number {
  const d = new Date(iso);
  const ms = d.getTime();
  if (!Number.isFinite(ms)) return Number.MAX_SAFE_INTEGER;
  return d.getHours() * 60 + d.getMinutes();
}

/** 12-hour clock label ("8:00 AM") from minutes since midnight. */
export function clockLabel(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes >= 24 * 60) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function doseLabel(d: DoseLike, minutes: number): string {
  const time = clockLabel(minutes);
  const name = d.strength ? `${d.medicationName} ${d.strength}` : d.medicationName;
  return time ? `${time} - ${name}` : name;
}

/**
 * Build the time-sorted segment row + rolled-up counts. Doses sort earliest
 * first; ties keep their incoming order (stable). An empty list yields an empty
 * row with a 0% / "Nothing scheduled" caption rather than throwing.
 */
export function buildDoseSegments(doses: readonly DoseLike[]): SegmentSummary {
  const decorated = doses.map((d, i) => {
    const minutes = minutesOfDay(d.scheduledAt);
    return { d, i, minutes };
  });
  decorated.sort((a, b) => a.minutes - b.minutes || a.i - b.i);

  const segments: DoseSegment[] = decorated.map(({ d, minutes }) => ({
    id: d.id,
    status: d.status,
    tone: STATUS_TONE[d.status],
    filled: d.status === 'taken',
    label: doseLabel(d, minutes),
    minutes,
  }));

  const total = segments.length;
  const taken = segments.filter((s) => s.status === 'taken').length;
  const pending = segments.filter((s) => s.status === 'pending').length;
  const skipped = segments.filter((s) => s.status === 'skipped').length;
  const missed = segments.filter((s) => s.status === 'missed').length;
  const resolved = total - pending;
  const pct = total > 0 ? Math.round((taken / total) * 100) : 0;
  const complete = total > 0 && pending === 0;

  return {
    segments,
    total,
    taken,
    pending,
    skipped,
    missed,
    resolved,
    pct,
    complete,
    caption: buildCaption({ total, taken, pending, skipped, missed }),
  };
}

function buildCaption(c: {
  total: number;
  taken: number;
  pending: number;
  skipped: number;
  missed: number;
}): string {
  if (c.total === 0) return 'Nothing scheduled today';
  if (c.pending === 0 && c.taken === c.total) {
    return c.total === 1 ? 'The only dose is taken' : `All ${c.total} doses taken`;
  }

  const head = `${c.taken} of ${c.total} taken`;
  const tail: string[] = [];
  if (c.pending > 0) tail.push(`${c.pending} to go`);
  if (c.missed > 0) tail.push(`${c.missed} missed`);
  if (c.skipped > 0) tail.push(`${c.skipped} skipped`);

  return tail.length > 0 ? `${head} - ${tail.join(', ')}` : head;
}
