/**
 * Follow-up overdue digest.
 *
 * `appointment-followup-tracker` produces a per-visit dashboard view
 * of recommended follow-ups: cardiology RTC in 3 months, INR draw in
 * 2 weeks, mammogram by Q3. The patient sees this in-app when they
 * open the dashboard. But research on missed-follow-up rates (JAMA
 * 30-40% in 90 days) shows the patients who NEED the reminder are
 * the ones who DON'T open the app — and the caregiver / family
 * member is the right audience for the nudge.
 *
 * `caregiver-digest` already handles weekly digests for adherence
 * and refills. This module is the parallel composition for
 * follow-ups: given the FollowupReport from appointment-followup-
 * tracker, produce a structured weekly digest payload that lists
 * the overdue + due-soon items with severity-driven phrasing, and
 * format it as a plain-text email body the caregiver share-token
 * runtime can ship without additional formatting.
 *
 * The digest is built around two principles:
 *   1. NO-FOLLOWUPS = NO EMAIL. If the patient has no overdue or
 *      due-soon items, the digest is `null` and the caregiver gets
 *      a clean inbox. We do NOT send "everything's fine" digests.
 *   2. URGENCY-ORDERED phrasing. The most overdue / urgent item
 *      leads the subject line and the body opener. Caregivers act
 *      on the FIRST line of an email and never read the seventh.
 *
 * Pure / deterministic. No I/O.
 */

import type {
  FollowupReport,
  FollowupRow,
  FollowupKind,
  FollowupStatus,
} from './appointment-followup-tracker';

export interface FollowupDigestPatient {
  name: string;
  /** Short identifier shown in the subject line ("Mom", "Dad", initials). */
  display?: string;
}

export interface FollowupDigestInput {
  patient: FollowupDigestPatient;
  /** The full follow-up report (typically from buildFollowupReport). */
  report: FollowupReport;
  /** ISO date range covered by the digest (inclusive). */
  weekStart: string;
  weekEnd: string;
  /**
   * Caregiver-facing patient portal URL to direct them where to act.
   * Optional — when present, included as the closing call-to-action.
   */
  portalUrl?: string;
}

export interface FollowupDigestOptions {
  /**
   * Cap on overdue items listed in the body. Default 10. Extras get
   * a "...and N more" line.
   */
  overdueLimit?: number;
  /** Cap on due-soon items. Default 10. */
  dueSoonLimit?: number;
  /**
   * Include rows with status "upcoming"? Default false — caregivers
   * don't need a nudge for follow-ups 3 months out.
   */
  includeUpcoming?: boolean;
  /** Cap on upcoming items when includeUpcoming=true. Default 5. */
  upcomingLimit?: number;
}

export interface FollowupDigestStats {
  overdueCount: number;
  dueSoonCount: number;
  upcomingCount: number;
  /** Most overdue row's daysUntilDue (negative). null when no overdue. */
  mostOverdueDays: number | null;
  /**
   * The oldest overdue title for the subject line/headline. Null
   * when none. The "oldest" item is the one with the LOWEST
   * daysUntilDue (most negative).
   */
  mostOverdueTitle: string | null;
  /** True when any overdue item is past the grace window message. */
  hasExpired: boolean;
}

export interface FollowupDigest {
  subject: string;
  text: string;
  stats: FollowupDigestStats;
  /** Rows actually included in the body, in render order. */
  rows: FollowupRow[];
}

const KIND_LABEL: Record<FollowupKind, string> = {
  visit: 'Visit',
  lab: 'Lab',
  imaging: 'Imaging',
  referral: 'Referral',
  vaccination: 'Vaccination',
  procedure: 'Procedure',
  other: 'Other',
};

function pluralDay(n: number): string {
  return `${n} day${n === 1 ? '' : 's'}`;
}

function renderRow(row: FollowupRow): string {
  const kind = KIND_LABEL[row.kind];
  const prio = row.priority === 'routine' ? '' : ` [${row.priority}]`;
  return `  - ${kind}: ${row.title} — ${row.message}${prio}`;
}

function renderSection(title: string, rows: FollowupRow[], limit: number): string[] {
  if (rows.length === 0) return [];
  const lines: string[] = [];
  lines.push(`${title} (${rows.length}):`);
  const shown = rows.slice(0, limit);
  for (const r of shown) lines.push(renderRow(r));
  if (rows.length > shown.length) {
    lines.push(`  ...and ${rows.length - shown.length} more`);
  }
  lines.push('');
  return lines;
}

function buildSubject(
  patient: FollowupDigestPatient,
  stats: FollowupDigestStats,
): string {
  const who = patient.display ?? patient.name;
  if (stats.overdueCount > 0) {
    if (stats.overdueCount === 1) {
      return `${who}: 1 overdue follow-up (${stats.mostOverdueTitle ?? 'check details'})`;
    }
    return `${who}: ${stats.overdueCount} overdue follow-ups, oldest is ${stats.mostOverdueTitle ?? 'unknown'}`;
  }
  if (stats.dueSoonCount > 0) {
    return `${who}: ${stats.dueSoonCount} follow-up${stats.dueSoonCount === 1 ? '' : 's'} due soon`;
  }
  return `${who}: ${stats.upcomingCount} follow-up${stats.upcomingCount === 1 ? '' : 's'} upcoming`;
}

/**
 * Build a follow-up digest from a FollowupReport. Returns `null` when
 * the patient has NO overdue, due-soon, or (optionally) upcoming
 * items — a silent week is a clean inbox.
 */
export function buildFollowupDigest(
  input: FollowupDigestInput,
  options: FollowupDigestOptions = {},
): FollowupDigest | null {
  const overdueLimit = options.overdueLimit ?? 10;
  const dueSoonLimit = options.dueSoonLimit ?? 10;
  const includeUpcoming = options.includeUpcoming ?? false;
  const upcomingLimit = options.upcomingLimit ?? 5;

  const overdue = input.report.rows.filter((r) => r.status === 'overdue');
  const dueSoon = input.report.rows.filter((r) => r.status === 'due-soon');
  const upcoming = includeUpcoming
    ? input.report.rows.filter((r) => r.status === 'upcoming')
    : [];

  if (overdue.length === 0 && dueSoon.length === 0 && upcoming.length === 0) {
    return null;
  }

  // most-overdue = lowest daysUntilDue (most negative).
  let mostOverdueDays: number | null = null;
  let mostOverdueTitle: string | null = null;
  for (const r of overdue) {
    if (mostOverdueDays === null || r.daysUntilDue < mostOverdueDays) {
      mostOverdueDays = r.daysUntilDue;
      mostOverdueTitle = r.title;
    }
  }
  const hasExpired = overdue.some((r) => r.message.includes('past grace window'));

  const stats: FollowupDigestStats = {
    overdueCount: overdue.length,
    dueSoonCount: dueSoon.length,
    upcomingCount: upcoming.length,
    mostOverdueDays,
    mostOverdueTitle,
    hasExpired,
  };

  const subject = buildSubject(input.patient, stats);

  const lines: string[] = [];
  lines.push('Hello,');
  lines.push('');
  // Opener: lead with the worst headline first so the caregiver acts on line 1.
  if (overdue.length > 0) {
    const oldest = mostOverdueDays === null ? '' : ` The oldest is "${mostOverdueTitle}" overdue by ${pluralDay(-mostOverdueDays)}.`;
    lines.push(
      `${input.patient.name} has ${overdue.length} overdue follow-up${overdue.length === 1 ? '' : 's'} that need${overdue.length === 1 ? 's' : ''} attention.${oldest}`,
    );
  } else if (dueSoon.length > 0) {
    lines.push(
      `${input.patient.name} has ${dueSoon.length} follow-up${dueSoon.length === 1 ? '' : 's'} due soon — please help them get these on the calendar.`,
    );
  } else {
    lines.push(
      `${input.patient.name} has ${upcoming.length} upcoming follow-up${upcoming.length === 1 ? '' : 's'} on the horizon.`,
    );
  }
  lines.push(`Coverage period: ${input.weekStart} through ${input.weekEnd}.`);
  if (hasExpired) {
    lines.push('');
    lines.push(
      'Heads up: one or more items are past their grace window — these were missed long enough that the clinical team may need a re-referral.',
    );
  }
  lines.push('');

  const includedRows: FollowupRow[] = [];
  for (const block of renderSection('Overdue', overdue, overdueLimit)) lines.push(block);
  includedRows.push(...overdue.slice(0, overdueLimit));
  for (const block of renderSection('Due soon', dueSoon, dueSoonLimit)) lines.push(block);
  includedRows.push(...dueSoon.slice(0, dueSoonLimit));
  if (includeUpcoming) {
    for (const block of renderSection('Upcoming', upcoming, upcomingLimit)) lines.push(block);
    includedRows.push(...upcoming.slice(0, upcomingLimit));
  }

  if (input.portalUrl && input.portalUrl.trim()) {
    lines.push(`To mark items complete or cancel them: ${input.portalUrl.trim()}`);
    lines.push('');
  }
  lines.push(
    'This message was sent because you have an active Med-Tracker caregiver share. To stop receiving updates, ask the patient to revoke your share.',
  );

  return {
    subject,
    text: lines.join('\n').trimEnd() + '\n',
    stats,
    rows: includedRows,
  };
}

/**
 * Decide whether a digest WOULD be produced for this report — useful
 * for cron jobs that need to skip the SMTP call entirely when there's
 * nothing to send.
 */
export function hasFollowupDigest(
  report: FollowupReport,
  options: { includeUpcoming?: boolean } = {},
): boolean {
  const includeUpcoming = options.includeUpcoming ?? false;
  const counts = report.counts;
  if (counts.overdue > 0) return true;
  if (counts['due-soon'] > 0) return true;
  if (includeUpcoming && counts.upcoming > 0) return true;
  return false;
}

/**
 * Per-status one-liner ideal for a caregiver SMS (160-char target).
 * Returns null when nothing actionable. Doesn't add a portal URL —
 * caller can append. The line opens with the most-overdue summary
 * when overdue items exist; otherwise leads with due-soon.
 */
export function renderFollowupSms(
  patient: FollowupDigestPatient,
  report: FollowupReport,
): string | null {
  const who = patient.display ?? patient.name;
  const counts = report.counts;
  if (counts.overdue === 0 && counts['due-soon'] === 0) return null;
  const overdueRows = report.rows.filter((r) => r.status === 'overdue');
  const dueSoonRows = report.rows.filter((r) => r.status === 'due-soon');
  if (counts.overdue > 0) {
    let oldest: FollowupRow | undefined;
    for (const r of overdueRows) {
      if (!oldest || r.daysUntilDue < oldest.daysUntilDue) oldest = r;
    }
    const tail = counts['due-soon'] > 0
      ? ` and ${counts['due-soon']} due soon`
      : '';
    const head = oldest
      ? `oldest "${oldest.title}" ${pluralDay(-oldest.daysUntilDue)} late`
      : '';
    return `${who}: ${counts.overdue} overdue follow-up${counts.overdue === 1 ? '' : 's'}${tail}${head ? `; ${head}` : ''}.`;
  }
  // Only due-soon.
  let soonest: FollowupRow | undefined;
  for (const r of dueSoonRows) {
    if (!soonest || r.daysUntilDue < soonest.daysUntilDue) soonest = r;
  }
  const head = soonest
    ? ` next: "${soonest.title}" in ${pluralDay(soonest.daysUntilDue)}`
    : '';
  return `${who}: ${counts['due-soon']} follow-up${counts['due-soon'] === 1 ? '' : 's'} due soon.${head}.`;
}

/**
 * Convenience: per-status row counts the cron can log without parsing
 * the digest text.
 */
export function summarizeFollowupReport(report: FollowupReport): Record<FollowupStatus, number> {
  return { ...report.counts };
}
