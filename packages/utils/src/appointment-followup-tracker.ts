/**
 * Appointment follow-up tracker.
 *
 * Clinic notes routinely include free-text follow-up directives —
 * "see in 3 months", "labs in 6 weeks", "RTC for INR check on
 * 2026-08-15", "ophthalmology referral, schedule by Q3". The patient
 * leaves with paper instructions and then loses 30-40% of the
 * follow-ups inside 90 days (the JAMA "missed follow-up" rate).
 *
 * `lab-window-tracker` already handles MEDICATION-driven monitoring
 * (warfarin INR, statin LFT). This module is the broader complement:
 * any recommended follow-up of any kind (visit, lab, imaging,
 * specialty referral, vaccination) gets logged from the clinic note
 * (manual or parsed) and surfaces with a due date, days-until, and
 * a status bucket suitable for the dashboard:
 *
 *   - overdue: dueAt < today minus grace,
 *   - due-soon: today <= dueAt <= today + warnWithinDays,
 *   - upcoming: dueAt > today + warnWithinDays,
 *   - completed: a matching completion was recorded.
 *
 * This module is INTENTIONALLY independent of lab-window-tracker:
 * the cadence concept (recurring every N days) is different from a
 * one-shot scheduled follow-up. Composing them at the dashboard
 * layer is the right level of integration.
 *
 * Pure / deterministic. No I/O.
 */

import { addDays, startOfDay } from './date';

export type FollowupKind =
  | 'visit'
  | 'lab'
  | 'imaging'
  | 'referral'
  | 'vaccination'
  | 'procedure'
  | 'other';

export type FollowupStatus = 'overdue' | 'due-soon' | 'upcoming' | 'completed' | 'cancelled';

export interface FollowupRequirement {
  /** Stable identifier; if absent, one is derived from kind + dueAt + title. */
  id?: string;
  kind: FollowupKind;
  /** Short title for the row: "Cardiology RTC", "Annual mammogram". */
  title: string;
  /** Free-text origin note for context (e.g. "see in 3 months"). */
  fromNote?: string;
  /** Due date in ISO YYYY-MM-DD (date-only — no time-of-day). */
  dueAt: string;
  /**
   * Cited clinic visit date the recommendation came from (ISO date).
   * Used by `deriveFollowupsFromRecommendations` to anchor "see in
   * 3 months" relative directives.
   */
  recommendedAt?: string;
  /** Recommending clinician (free text). */
  recommendedBy?: string;
  /** Anchor medication id when the follow-up is medication-tied. */
  medicationId?: string;
  /** Priority: routine, important, urgent. Drives sort and color. */
  priority?: 'routine' | 'important' | 'urgent';
  /**
   * Days BEFORE dueAt to surface as due-soon. Default 14 (clinic
   * scheduling lead time). Lab follow-ups default to 7.
   */
  warnWithinDays?: number;
  /**
   * Days AFTER dueAt that the entry is still merely "overdue" (vs.
   * "expired" / dropped). Default 60. Items older than this stay
   * overdue but the message escalates.
   */
  graceDays?: number;
}

export interface FollowupCompletion {
  /** Which follow-up was completed. Matches FollowupRequirement.id. */
  id: string;
  /** When it was completed. ISO date. */
  completedAt: string;
  /** Optional note ("done at urgent care", "deferred to next visit"). */
  note?: string;
}

export interface FollowupCancellation {
  id: string;
  /** When cancelled. ISO date. */
  cancelledAt: string;
  /** Reason ("patient declined", "no longer indicated"). */
  reason?: string;
}

export interface FollowupTrackerInput {
  followups: FollowupRequirement[];
  completions?: FollowupCompletion[];
  cancellations?: FollowupCancellation[];
  /** Reference clock for status calculations. Default new Date(). */
  now?: Date;
}

export interface FollowupRow {
  id: string;
  kind: FollowupKind;
  title: string;
  dueAt: string;
  status: FollowupStatus;
  /**
   * Days until dueAt. Negative when overdue. Always relative to
   * `now`. For completed items, this is the days difference at
   * completion (negative if overdue at completion).
   */
  daysUntilDue: number;
  /**
   * Plain-language message:
   *   "Overdue by 12 days"
   *   "Due in 5 days"
   *   "Completed on 2026-05-14"
   *   "Cancelled: patient declined"
   *   "Upcoming on 2026-09-01"
   */
  message: string;
  priority: 'routine' | 'important' | 'urgent';
  recommendedAt?: string;
  recommendedBy?: string;
  medicationId?: string;
  fromNote?: string;
  /** Set on completed rows only. */
  completedAt?: string;
  /** Set on cancelled rows only. */
  cancelledAt?: string;
  cancellationReason?: string;
}

export interface FollowupReport {
  asOf: string;
  rows: FollowupRow[];
  /** Counts by status, suitable for a dashboard badge bar. */
  counts: Record<FollowupStatus, number>;
  /** Just the overdue + due-soon rows, sorted by dueAt ascending. */
  needsAttention: FollowupRow[];
}

const DEFAULT_WARN_BY_KIND: Record<FollowupKind, number> = {
  visit: 14,
  lab: 7,
  imaging: 14,
  referral: 21,
  vaccination: 14,
  procedure: 14,
  other: 14,
};

const PRIORITY_RANK: Record<NonNullable<FollowupRequirement['priority']>, number> = {
  routine: 0,
  important: 1,
  urgent: 2,
};

const STATUS_SORT: Record<FollowupStatus, number> = {
  overdue: 0,
  'due-soon': 1,
  upcoming: 2,
  completed: 3,
  cancelled: 4,
};

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIsoDate(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return startOfDay(d);
  }
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

function diffWholeDays(later: Date, earlier: Date): number {
  return Math.round((later.getTime() - earlier.getTime()) / 86_400_000);
}

function deriveId(f: FollowupRequirement): string {
  if (f.id) return f.id;
  const slug = f.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `fu_${f.kind}_${f.dueAt}_${slug || 'untitled'}`;
}

function describeOverdue(days: number): string {
  if (days === 0) return 'Due today';
  if (days === 1) return 'Overdue by 1 day';
  return `Overdue by ${days} days`;
}

function describeUpcoming(days: number): string {
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due in 1 day';
  return `Due in ${days} days`;
}

/**
 * Build a tracker report from a flat follow-up list, completion log,
 * and cancellation log. Status is derived against `now`:
 *
 *   - completed when a completion entry matches by id;
 *   - cancelled when a cancellation entry matches and there is no
 *     completion (completion wins over cancellation since "we did
 *     it anyway" is more actionable for the chart);
 *   - overdue when dueAt + graceDays < now;
 *   - due-soon when dueAt is within warnWithinDays of now;
 *   - upcoming otherwise.
 *
 * Rows are sorted by status bucket (overdue first), then by dueAt
 * ascending within each bucket, then by priority descending
 * (urgent first), then by title ascending for stability.
 */
export function buildFollowupReport(input: FollowupTrackerInput): FollowupReport {
  const now = startOfDay(input.now ?? new Date());
  const completions = new Map<string, FollowupCompletion>();
  for (const c of input.completions ?? []) completions.set(c.id, c);
  const cancellations = new Map<string, FollowupCancellation>();
  for (const c of input.cancellations ?? []) cancellations.set(c.id, c);

  const rows: FollowupRow[] = [];
  for (const f of input.followups) {
    const id = deriveId(f);
    const due = parseIsoDate(f.dueAt);
    if (!due) {
      // Skip silently — caller should not produce malformed dueAt,
      // and the tracker is a presentation utility (not a validator).
      continue;
    }
    const dueIso = toIsoDate(due);
    const priority = f.priority ?? 'routine';
    const warnWithin = f.warnWithinDays ?? DEFAULT_WARN_BY_KIND[f.kind];
    const graceDays = f.graceDays ?? 60;

    const completion = completions.get(id);
    const cancellation = cancellations.get(id);

    if (completion) {
      const completedDate = parseIsoDate(completion.completedAt);
      const daysAtCompletion = completedDate ? diffWholeDays(completedDate, due) : 0;
      const row: FollowupRow = {
        id,
        kind: f.kind,
        title: f.title,
        dueAt: dueIso,
        status: 'completed',
        daysUntilDue: -daysAtCompletion, // negative when overdue at completion
        message: `Completed on ${completion.completedAt}`,
        priority,
        completedAt: completion.completedAt,
      };
      if (f.recommendedAt) row.recommendedAt = f.recommendedAt;
      if (f.recommendedBy) row.recommendedBy = f.recommendedBy;
      if (f.medicationId) row.medicationId = f.medicationId;
      if (f.fromNote) row.fromNote = f.fromNote;
      rows.push(row);
      continue;
    }

    if (cancellation) {
      const daysUntilDue = diffWholeDays(due, now);
      const msg = cancellation.reason
        ? `Cancelled: ${cancellation.reason}`
        : 'Cancelled';
      const row: FollowupRow = {
        id,
        kind: f.kind,
        title: f.title,
        dueAt: dueIso,
        status: 'cancelled',
        daysUntilDue,
        message: msg,
        priority,
        cancelledAt: cancellation.cancelledAt,
      };
      if (cancellation.reason) row.cancellationReason = cancellation.reason;
      if (f.recommendedAt) row.recommendedAt = f.recommendedAt;
      if (f.recommendedBy) row.recommendedBy = f.recommendedBy;
      if (f.medicationId) row.medicationId = f.medicationId;
      if (f.fromNote) row.fromNote = f.fromNote;
      rows.push(row);
      continue;
    }

    const daysUntilDue = diffWholeDays(due, now);
    let status: FollowupStatus;
    let message: string;
    if (daysUntilDue < 0) {
      const overdueDays = -daysUntilDue;
      // Beyond graceDays we still call it overdue; the message
      // escalates so the UI can render a different chip color.
      if (overdueDays > graceDays) {
        status = 'overdue';
        message = `Overdue by ${overdueDays} days (past grace window)`;
      } else {
        status = 'overdue';
        message = describeOverdue(overdueDays);
      }
    } else if (daysUntilDue <= warnWithin) {
      status = 'due-soon';
      message = describeUpcoming(daysUntilDue);
    } else {
      status = 'upcoming';
      message = `Upcoming on ${dueIso}`;
    }

    const row: FollowupRow = {
      id,
      kind: f.kind,
      title: f.title,
      dueAt: dueIso,
      status,
      daysUntilDue,
      message,
      priority,
    };
    if (f.recommendedAt) row.recommendedAt = f.recommendedAt;
    if (f.recommendedBy) row.recommendedBy = f.recommendedBy;
    if (f.medicationId) row.medicationId = f.medicationId;
    if (f.fromNote) row.fromNote = f.fromNote;
    rows.push(row);
  }

  rows.sort((a, b) => {
    if (STATUS_SORT[a.status] !== STATUS_SORT[b.status]) {
      return STATUS_SORT[a.status] - STATUS_SORT[b.status];
    }
    if (a.dueAt !== b.dueAt) return a.dueAt < b.dueAt ? -1 : 1;
    if (PRIORITY_RANK[a.priority] !== PRIORITY_RANK[b.priority]) {
      return PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
    }
    return a.title.localeCompare(b.title);
  });

  const counts: Record<FollowupStatus, number> = {
    overdue: 0,
    'due-soon': 0,
    upcoming: 0,
    completed: 0,
    cancelled: 0,
  };
  for (const r of rows) counts[r.status] += 1;

  const needsAttention = rows.filter((r) => r.status === 'overdue' || r.status === 'due-soon');

  return {
    asOf: toIsoDate(now),
    rows,
    counts,
    needsAttention,
  };
}

export interface RelativeRecommendation {
  /** Visit / encounter the recommendation came from (ISO date). */
  recommendedAt: string;
  /** Short title. */
  title: string;
  kind: FollowupKind;
  /** Free-form note, e.g. "see in 3 months". */
  note?: string;
  /** Recommending clinician. */
  recommendedBy?: string;
  priority?: 'routine' | 'important' | 'urgent';
  medicationId?: string;
  /**
   * Relative offset from `recommendedAt`. Exactly ONE of these
   * three is used:
   *   - days: integer days offset (positive).
   *   - weeks: integer weeks (multiplied by 7).
   *   - months: integer months (added to the date, day-of-month
   *     preserved when possible; clipped to last-of-month otherwise).
   * If multiple are supplied, days > weeks > months.
   */
  days?: number;
  weeks?: number;
  months?: number;
  /** Explicit override dueAt (ISO date); wins over relative offsets. */
  dueAt?: string;
}

function addMonths(d: Date, n: number): Date {
  const targetMonth = d.getMonth() + n;
  const next = new Date(d.getFullYear(), targetMonth, 1);
  const lastDayOfTarget = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  const day = Math.min(d.getDate(), lastDayOfTarget);
  return new Date(next.getFullYear(), next.getMonth(), day);
}

/**
 * Translate a recommendation phrased relative to a visit date into a
 * concrete FollowupRequirement with absolute `dueAt`. Common clinic
 * shorthand:
 *
 *   { recommendedAt: '2026-06-01', title: 'Cardiology RTC',
 *     kind: 'visit', months: 3 }
 *   => dueAt = '2026-09-01'
 *
 *   { ..., weeks: 6 } => +42 days
 *   { ..., days: 14 } => +14 days
 *
 * If an explicit dueAt is provided it wins and the offsets are ignored.
 * Returns `null` when neither dueAt nor any offset is provided
 * (caller error).
 */
export function deriveFollowupFromRecommendation(
  rec: RelativeRecommendation,
): FollowupRequirement | null {
  const anchor = parseIsoDate(rec.recommendedAt);
  if (!anchor) return null;
  let due: Date | null = null;
  if (rec.dueAt) {
    due = parseIsoDate(rec.dueAt);
  } else if (typeof rec.days === 'number' && rec.days > 0) {
    due = addDays(anchor, rec.days);
  } else if (typeof rec.weeks === 'number' && rec.weeks > 0) {
    due = addDays(anchor, rec.weeks * 7);
  } else if (typeof rec.months === 'number' && rec.months > 0) {
    due = addMonths(anchor, rec.months);
  }
  if (!due) return null;
  const f: FollowupRequirement = {
    kind: rec.kind,
    title: rec.title,
    dueAt: toIsoDate(due),
    recommendedAt: rec.recommendedAt,
  };
  if (rec.note) f.fromNote = rec.note;
  if (rec.recommendedBy) f.recommendedBy = rec.recommendedBy;
  if (rec.priority) f.priority = rec.priority;
  if (rec.medicationId) f.medicationId = rec.medicationId;
  return f;
}

/**
 * Bulk-derive follow-up requirements from a list of relative
 * recommendations. Items with neither dueAt nor any offset are
 * skipped silently (a no-due-date recommendation is just a note).
 */
export function deriveFollowupsFromRecommendations(
  recs: RelativeRecommendation[],
): FollowupRequirement[] {
  const out: FollowupRequirement[] = [];
  for (const rec of recs) {
    const f = deriveFollowupFromRecommendation(rec);
    if (f) out.push(f);
  }
  return out;
}
