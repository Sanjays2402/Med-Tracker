/**
 * Follow-up digest HTML.
 *
 * `followup-overdue-digest` produces a plain-text digest body the
 * caregiver share-token runtime can ship without additional
 * formatting. Plain text works for SMS and for caregivers who only
 * read in their mobile mail client. For EVERY OTHER caregiver
 * audience (web portal preview, formatted email, the "share my
 * patient" iOS share sheet), the digest needs to ship as HTML with
 * status chips and a tabular row layout so the caregiver scans
 * structure instead of paragraphs.
 *
 * This module is the HTML render of FollowupDigest. The structural
 * decisions deliberately MIRROR followup-overdue-digest's text
 * render so the two outputs stay aligned:
 *
 *   - Same null short-circuit: returns null when the underlying
 *     digest is null. Cron callers can use `hasFollowupDigest`
 *     unchanged as the cheap predicate before composing.
 *   - Same subject line.
 *   - Same most-overdue lead-in.
 *   - Same hasExpired "may need re-referral" advisory.
 *
 * Status chips encode urgency at a glance:
 *   overdue   -> red chip ("OVERDUE -Nd")
 *   due-soon  -> yellow chip ("DUE +Nd")
 *   upcoming  -> blue chip ("UPCOMING")
 *
 * Output is a self-contained string of HTML — no <html>/<head>/<body>
 * envelope (the email layer adds those), no external CSS (all styles
 * inline so Outlook + Gmail render correctly). Special characters in
 * patient / row text are HTML-escaped to prevent injection in
 * caregiver mailbox previews.
 *
 * Pure / deterministic. No I/O.
 */

import type {
  FollowupReport,
  FollowupRow,
  FollowupKind,
} from './appointment-followup-tracker';
import type {
  FollowupDigest,
  FollowupDigestInput,
  FollowupDigestOptions,
  FollowupDigestStats,
} from './followup-overdue-digest';
import { buildFollowupDigest } from './followup-overdue-digest';

export interface FollowupDigestHtmlOptions extends FollowupDigestOptions {
  /**
   * Brand color used for the lead-in banner accent. Default
   * '#0f766e' (a calm teal). Pass null to disable the banner accent.
   */
  brandColor?: string | null;
  /**
   * Override the table cell font-family. Default 'system-ui, -apple-
   * system, Segoe UI, Roboto, sans-serif'. Inline because Gmail
   * strips <style>.
   */
  fontFamily?: string;
  /**
   * Include the closing "to stop receiving updates" footer. Default
   * true. Disable for non-caregiver-share channels.
   */
  includeUnsubscribeFooter?: boolean;
}

export interface FollowupDigestHtml {
  /** Subject (identical to the text digest's subject). */
  subject: string;
  /** Body HTML fragment (NO outer <html>/<body>; email layer wraps). */
  html: string;
  /** Snapshot of the underlying digest stats. */
  stats: FollowupDigestStats;
  /** Rows actually included in the HTML, in render order. */
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

const CHIP_OVERDUE_BG = '#fee2e2';
const CHIP_OVERDUE_FG = '#991b1b';
const CHIP_DUESOON_BG = '#fef3c7';
const CHIP_DUESOON_FG = '#854d0e';
const CHIP_UPCOMING_BG = '#dbeafe';
const CHIP_UPCOMING_FG = '#1e3a8a';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function chipFor(row: FollowupRow): string {
  let bg = CHIP_UPCOMING_BG;
  let fg = CHIP_UPCOMING_FG;
  let label = 'UPCOMING';
  if (row.status === 'overdue') {
    bg = CHIP_OVERDUE_BG;
    fg = CHIP_OVERDUE_FG;
    label = `OVERDUE ${row.daysUntilDue}d`;
  } else if (row.status === 'due-soon') {
    bg = CHIP_DUESOON_BG;
    fg = CHIP_DUESOON_FG;
    label = `DUE +${row.daysUntilDue}d`;
  } else if (row.status === 'completed') {
    bg = '#dcfce7';
    fg = '#166534';
    label = 'DONE';
  } else if (row.status === 'cancelled') {
    bg = '#f3f4f6';
    fg = '#374151';
    label = 'CANC';
  }
  return (
    `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;background:${bg};color:${fg};` +
    `font-size:11px;font-weight:600;letter-spacing:0.04em;">` +
    escapeHtml(label) +
    `</span>`
  );
}

function renderSection(
  title: string,
  rows: FollowupRow[],
  limit: number,
  fontFamily: string,
): { html: string; included: FollowupRow[]; truncatedBy: number } {
  if (rows.length === 0) return { html: '', included: [], truncatedBy: 0 };
  const shown = rows.slice(0, limit);
  const overflow = rows.length - shown.length;
  const headerRow =
    `<thead><tr>` +
    `<th align="left" style="padding:6px 10px 6px 0;font-family:${fontFamily};font-size:13px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;">${escapeHtml(title)} (${rows.length})</th>` +
    `<th></th><th></th>` +
    `</tr></thead>`;
  const bodyRows = shown
    .map((row) => {
      const kind = escapeHtml(KIND_LABEL[row.kind]);
      const titleCell = escapeHtml(row.title);
      const message = escapeHtml(row.message);
      const prio =
        row.priority === 'routine'
          ? ''
          : ` &nbsp;<span style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">${escapeHtml(row.priority)}</span>`;
      return (
        `<tr>` +
        `<td style="padding:8px 10px 8px 0;font-family:${fontFamily};font-size:14px;color:#111827;border-top:1px solid #e5e7eb;vertical-align:top;">` +
        `<div style="font-weight:600;">${titleCell}${prio}</div>` +
        `<div style="font-size:12px;color:#6b7280;margin-top:2px;">${kind} &middot; ${message}</div>` +
        `</td>` +
        `<td style="padding:8px 10px 8px 0;font-family:${fontFamily};border-top:1px solid #e5e7eb;vertical-align:top;text-align:right;white-space:nowrap;">` +
        chipFor(row) +
        `</td>` +
        `</tr>`
      );
    })
    .join('');
  const overflowRow =
    overflow > 0
      ? `<tr><td colspan="2" style="padding:8px 10px;font-family:${fontFamily};font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb;font-style:italic;">…and ${overflow} more not shown</td></tr>`
      : '';
  const table =
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;margin-bottom:16px;">` +
    headerRow +
    `<tbody>${bodyRows}${overflowRow}</tbody>` +
    `</table>`;
  return { html: table, included: shown, truncatedBy: overflow };
}

/**
 * Build the HTML render of a follow-up digest. Returns null when the
 * underlying digest is null (silent week) so cron callers can skip
 * the SMTP call entirely.
 */
export function buildFollowupDigestHtml(
  input: FollowupDigestInput,
  options: FollowupDigestHtmlOptions = {},
): FollowupDigestHtml | null {
  const digest = buildFollowupDigest(input, {
    overdueLimit: options.overdueLimit,
    dueSoonLimit: options.dueSoonLimit,
    includeUpcoming: options.includeUpcoming,
    upcomingLimit: options.upcomingLimit,
  });
  if (!digest) return null;
  // Pass the full report through so renderHtml applies HTML-side
  // limits against the unbounded row set.
  return renderHtml(digest, { ...input, report: input.report }, options);
}

/**
 * Format an existing FollowupDigest as HTML. Useful when the caller
 * already has the text digest from `buildFollowupDigest` and wants
 * the HTML variant alongside it without re-walking the report.
 */
export function renderFollowupDigestHtml(
  digest: FollowupDigest,
  input: Pick<FollowupDigestInput, 'patient' | 'weekStart' | 'weekEnd' | 'portalUrl'>,
  options: FollowupDigestHtmlOptions = {},
): FollowupDigestHtml {
  return renderHtml(digest, input, options);
}

function renderHtml(
  digest: FollowupDigest,
  input: Pick<FollowupDigestInput, 'patient' | 'weekStart' | 'weekEnd' | 'portalUrl'> & {
    report?: FollowupReport;
  },
  options: FollowupDigestHtmlOptions,
): FollowupDigestHtml {
  const brand = options.brandColor === null ? null : options.brandColor ?? '#0f766e';
  const fontFamily =
    options.fontFamily ?? `system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  const includeUnsub = options.includeUnsubscribeFooter ?? true;
  const overdueLimit = options.overdueLimit ?? 10;
  const dueSoonLimit = options.dueSoonLimit ?? 10;
  const includeUpcoming = options.includeUpcoming ?? false;
  const upcomingLimit = options.upcomingLimit ?? 5;

  // Source of rows: if the caller passes the full report we re-walk
  // it so the section limits apply correctly to the FULL set. If
  // they don't, fall back to digest.rows (which already had limits
  // applied in buildFollowupDigest).
  const sourceRows: FollowupRow[] = input.report ? input.report.rows : digest.rows;
  const allOverdue = sourceRows.filter((r) => r.status === 'overdue');
  const allDueSoon = sourceRows.filter((r) => r.status === 'due-soon');
  const allUpcoming = includeUpcoming
    ? sourceRows.filter((r) => r.status === 'upcoming')
    : [];

  const opener = openerLine(input.patient.name, digest.stats);
  const accent = brand
    ? `border-left:4px solid ${brand};padding-left:12px;`
    : `padding-left:0;`;
  const headerHtml =
    `<div style="font-family:${fontFamily};font-size:15px;color:#111827;${accent}margin-bottom:14px;">` +
    `<div>${escapeHtml(opener)}</div>` +
    `<div style="font-size:12px;color:#6b7280;margin-top:4px;">Coverage: ${escapeHtml(input.weekStart)} through ${escapeHtml(input.weekEnd)}</div>` +
    `</div>`;

  const expiredHtml = digest.stats.hasExpired
    ? `<div style="font-family:${fontFamily};font-size:13px;color:#991b1b;background:#fef2f2;border:1px solid #fecaca;padding:8px 12px;border-radius:6px;margin-bottom:14px;">` +
      `Heads up: one or more items are past their grace window. These were missed long enough that the clinical team may need a re-referral.` +
      `</div>`
    : '';

  const overdueSection = renderSection('Overdue', allOverdue, overdueLimit, fontFamily);
  const dueSoonSection = renderSection('Due soon', allDueSoon, dueSoonLimit, fontFamily);
  const upcomingSection = includeUpcoming
    ? renderSection('Upcoming', allUpcoming, upcomingLimit, fontFamily)
    : { html: '', included: [], truncatedBy: 0 };

  const portalHtml =
    input.portalUrl && input.portalUrl.trim()
      ? `<div style="font-family:${fontFamily};font-size:13px;margin-bottom:14px;">` +
        `<a href="${escapeHtml(input.portalUrl.trim())}" style="color:#0f766e;text-decoration:underline;">Mark items complete or cancel them →</a>` +
        `</div>`
      : '';

  const unsubHtml = includeUnsub
    ? `<div style="font-family:${fontFamily};font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:8px;margin-top:8px;">` +
      `This message was sent because you have an active Med-Tracker caregiver share. To stop receiving updates, ask the patient to revoke your share.` +
      `</div>`
    : '';

  const html =
    headerHtml +
    expiredHtml +
    overdueSection.html +
    dueSoonSection.html +
    upcomingSection.html +
    portalHtml +
    unsubHtml;

  const rows = [
    ...overdueSection.included,
    ...dueSoonSection.included,
    ...upcomingSection.included,
  ];

  return {
    subject: digest.subject,
    html,
    stats: digest.stats,
    rows,
  };
}

function openerLine(name: string, stats: FollowupDigestStats): string {
  if (stats.overdueCount > 0) {
    const oldest =
      stats.mostOverdueDays === null
        ? ''
        : ` The oldest is "${stats.mostOverdueTitle ?? 'unknown'}" overdue by ${pluralDay(-stats.mostOverdueDays)}.`;
    return `${name} has ${stats.overdueCount} overdue follow-up${stats.overdueCount === 1 ? '' : 's'} that need${stats.overdueCount === 1 ? 's' : ''} attention.${oldest}`;
  }
  if (stats.dueSoonCount > 0) {
    return `${name} has ${stats.dueSoonCount} follow-up${stats.dueSoonCount === 1 ? '' : 's'} due soon — please help them get these on the calendar.`;
  }
  return `${name} has ${stats.upcomingCount} upcoming follow-up${stats.upcomingCount === 1 ? '' : 's'} on the horizon.`;
}

function pluralDay(n: number): string {
  return `${n} day${n === 1 ? '' : 's'}`;
}

/**
 * Cheap predicate matching `hasFollowupDigest` shape — true when an
 * HTML digest would be produced for this report. Useful for cron
 * jobs that need to skip the rendering step entirely.
 */
export function hasFollowupDigestHtml(
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
