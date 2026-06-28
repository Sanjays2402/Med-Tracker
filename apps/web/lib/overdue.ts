/**
 * overdue — pure partition model for the Today page overdue banner.
 *
 * A dose is "overdue" when it is still pending and its scheduled time slipped
 * past `now` by more than a small grace window (so a dose that's only a couple
 * minutes late doesn't immediately scream). The Today page shows a sticky top
 * banner whenever one or more doses are overdue, with a jump-to-first action.
 *
 * All the time math + partitioning lives here so the page stays a thin render
 * and the rules are unit-tested with an injected `now`. Mirrors the grace
 * window used by the per-row "overdue" pill in today/page.tsx (15 minutes).
 */

export interface OverduePartitionInput {
  id: string;
  scheduledAt: string; // ISO
  status: 'pending' | 'taken' | 'skipped' | 'missed';
}

export interface OverdueDose {
  id: string;
  scheduledAt: string;
  /** Whole minutes the dose is past due (>= 0). */
  minutesLate: number;
}

export interface OverdueModel {
  /** Overdue doses, earliest scheduled first. */
  overdue: OverdueDose[];
  /** Count of overdue doses (convenience for the badge). */
  count: number;
  /** The id of the earliest overdue dose, or null when none. */
  firstOverdueId: string | null;
  /** The largest minutesLate across the overdue set (0 when none). */
  worstMinutesLate: number;
}

/** Grace window before a late pending dose is treated as overdue. */
export const OVERDUE_GRACE_MS = 15 * 60_000;

/** True when a single dose is pending and past the grace window. */
export function isOverdue(
  dose: OverduePartitionInput,
  now: number = Date.now(),
): boolean {
  if (dose.status !== 'pending') return false;
  const at = +new Date(dose.scheduledAt);
  if (!Number.isFinite(at)) return false;
  return at < now - OVERDUE_GRACE_MS;
}

/**
 * Partition a day's doses into the overdue set + supporting summary. Overdue
 * doses are sorted earliest-scheduled-first so "jump to first overdue" lands on
 * the dose that's been waiting longest.
 */
export function partitionOverdue(
  doses: readonly OverduePartitionInput[],
  now: number = Date.now(),
): OverdueModel {
  const overdue: OverdueDose[] = [];
  for (const d of doses) {
    if (!isOverdue(d, now)) continue;
    const at = +new Date(d.scheduledAt);
    const minutesLate = Math.max(0, Math.floor((now - at) / 60_000));
    overdue.push({ id: d.id, scheduledAt: d.scheduledAt, minutesLate });
  }
  overdue.sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));
  return {
    overdue,
    count: overdue.length,
    firstOverdueId: overdue.length > 0 ? overdue[0]!.id : null,
    worstMinutesLate: overdue.reduce((m, d) => Math.max(m, d.minutesLate), 0),
  };
}

/**
 * Human label for the banner headline, e.g. "1 dose overdue" /
 * "3 doses overdue". Returns an empty string when nothing is overdue so the
 * caller can use it as a render guard.
 */
export function overdueHeadline(count: number): string {
  if (count <= 0) return '';
  return `${count} dose${count === 1 ? '' : 's'} overdue`;
}

/**
 * Humanise how late the worst dose is, for the banner subline.
 * "just now" under a minute, "Xm" under an hour, "Xh Ym" beyond.
 */
export function formatLateness(minutesLate: number): string {
  if (minutesLate < 1) return 'just now';
  if (minutesLate < 60) return `${minutesLate}m`;
  const h = Math.floor(minutesLate / 60);
  const m = minutesLate % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export interface OverdueTier {
  /** Banner tone: warn while recently late, danger once badly overdue. */
  tone: 'warn' | 'danger';
  /** True once the worst dose crosses the escalation threshold. */
  escalated: boolean;
}

/** Hours past due before the overdue banner escalates from warn to danger. */
export const OVERDUE_ESCALATE_HOURS = 2;

/**
 * Tier the overdue banner's urgency by how late the WORST dose is. A dose that
 * just slipped past its window is a soft "warn" nudge; once the oldest overdue
 * dose is more than `escalateAfterHours` (default 2h) late the banner escalates
 * to "danger" so a chronically-missed dose reads louder than a just-missed one.
 *
 * `worstMinutesLate` is the OverdueModel's worst lateness. The threshold is
 * inclusive of the boundary reading as still-warn (exactly 2h is warn; 2h+1m is
 * danger) so the escalation is a strict crossing. Pure; deterministic.
 */
export function overdueTier(
  worstMinutesLate: number,
  escalateAfterHours: number = OVERDUE_ESCALATE_HOURS,
): OverdueTier {
  const escalated = worstMinutesLate > escalateAfterHours * 60;
  return { tone: escalated ? 'danger' : 'warn', escalated };
}
