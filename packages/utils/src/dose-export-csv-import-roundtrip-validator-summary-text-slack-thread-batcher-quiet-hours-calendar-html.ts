/**
 * Dose export CSV import round-trip validator — summary-text Slack
 * thread batcher quiet-hours CALENDAR overlay, HTML render.
 *
 * `dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar`
 * resolves per-day quiet-hours overrides for the Slack thread
 * batcher. The result is a structured decision object — fine for
 * code consumers, useless for the on-call channel ADMIN who wants
 * to look at "what is the quiet-hours config?" without parsing JSON.
 *
 * Channel admins want a HTML 7-day grid where every column is a
 * day-of-week and every cell shows the resolved rule + window. The
 * admin scans the grid in one glance: weekends red (quiet all day),
 * weekdays grey (deferred to morning), Wednesday yellow (custom
 * window), and so on.
 *
 * This module renders that grid. It composes
 * resolveQuietHoursRuleForDay (the documented helper exported by
 * the calendar module) and walks all 7 days, emitting one column
 * per day. Each cell carries:
 *
 *   - the day-of-week label (Mon, Tue, Wed, Thu, Fri, Sat, Sun);
 *   - the resolved rule (default / override:window / override:all-day /
 *     override:none);
 *   - the resolved window if any (startHour-endHour in the channel
 *     timezone);
 *   - a colour class keyed on the rule (default=grey, window-override=
 *     yellow, all-day=red, none=green).
 *
 * Optional second row highlights the CURRENT day (when a runAt
 * timestamp is supplied), so the admin can see "today is Saturday
 * and the channel is suppressed".
 *
 * Pure / deterministic. No I/O. No JS. HTML escaped.
 *
 * Composes:
 *   - resolveQuietHoursRuleForDay (per-day rule lookup)
 *   - DoseRoundtripThreadBatcherQuietHoursWindow shape
 */

import type {
  DoseRoundtripThreadBatcherQuietHoursCalendarOptions,
  DoseRoundtripThreadBatcherQuietHoursDayOfWeek,
} from './dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar';
import { resolveQuietHoursRuleForDay } from './dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar';
import type { DoseRoundtripThreadBatcherQuietHoursWindow } from './dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours';

export type DoseRoundtripThreadBatcherQuietHoursCalendarHtmlRule =
  | 'default'
  | 'override:window'
  | 'override:all-day'
  | 'override:none';

export interface DoseRoundtripThreadBatcherQuietHoursCalendarHtmlCell {
  /** Day-of-week key. */
  dayOfWeek: DoseRoundtripThreadBatcherQuietHoursDayOfWeek;
  /** Human label (Mon / Tue / ...). */
  label: string;
  /** Resolved rule for this day. */
  rule: DoseRoundtripThreadBatcherQuietHoursCalendarHtmlRule;
  /** Resolved window (null when the rule is override:none). */
  window: DoseRoundtripThreadBatcherQuietHoursWindow | null;
  /** True when runAt was supplied AND this is the resolved current day. */
  isCurrentDay: boolean;
}

export interface DoseRoundtripThreadBatcherQuietHoursCalendarHtmlOptions
  extends DoseRoundtripThreadBatcherQuietHoursCalendarOptions {
  /**
   * Wrap the fragment in a full HTML document. Default false. The
   * fragment is a <section> suitable for splicing into a host page.
   */
  wrapHtmlDocument?: boolean;
  /**
   * Document title — used inside <title> and as the section heading.
   * Default 'Slack channel quiet-hours calendar'.
   */
  documentTitle?: string;
  /**
   * Optional caption shown under the title (e.g. "QA on-call
   * channel"). HTML escaped.
   */
  caption?: string;
  /**
   * Optional override for the font-family. Default print + screen
   * friendly sans-serif.
   */
  fontFamily?: string;
  /**
   * Day-of-week order. Default starts on Monday (matches typical
   * clinical-records on-call weekly rhythm). 'sun-first' starts
   * on Sunday (matches US consumer calendars).
   */
  weekStart?: 'mon-first' | 'sun-first';
  /**
   * Custom palette overrides. Any unset key falls back to the
   * default palette.
   */
  palette?: Partial<
    Record<DoseRoundtripThreadBatcherQuietHoursCalendarHtmlRule, string>
  >;
}

export interface DoseRoundtripThreadBatcherQuietHoursCalendarHtmlResult {
  /** HTML fragment (or full document when wrapHtmlDocument=true). */
  html: string;
  /** One cell per day-of-week, in the resolved week order. */
  cells: DoseRoundtripThreadBatcherQuietHoursCalendarHtmlCell[];
  /**
   * The current day-of-week (when runAt was supplied) or null.
   */
  currentDay: DoseRoundtripThreadBatcherQuietHoursDayOfWeek | null;
  /** Count of cells per rule. */
  ruleCounts: Record<DoseRoundtripThreadBatcherQuietHoursCalendarHtmlRule, number>;
}

const MON_FIRST: DoseRoundtripThreadBatcherQuietHoursDayOfWeek[] = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
];
const SUN_FIRST: DoseRoundtripThreadBatcherQuietHoursDayOfWeek[] = [
  'sun',
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
];

const LABELS: Record<DoseRoundtripThreadBatcherQuietHoursDayOfWeek, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

const DEFAULT_PALETTE: Record<DoseRoundtripThreadBatcherQuietHoursCalendarHtmlRule, string> = {
  'default': '#e5e7eb', // gray-200 — default window applied
  'override:window': '#fde68a', // amber-200 — custom window
  'override:all-day': '#fecaca', // red-200 — all-day quiet
  'override:none': '#bbf7d0', // green-200 — quiet hours off
};

const RULE_LABELS: Record<DoseRoundtripThreadBatcherQuietHoursCalendarHtmlRule, string> = {
  'default': 'Default',
  'override:window': 'Custom window',
  'override:all-day': 'Quiet all day',
  'override:none': 'No quiet hours',
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatWindow(window: DoseRoundtripThreadBatcherQuietHoursWindow | null): string {
  if (window === null) return '\u2014'; // em-dash for "none"
  const start = String(window.startHour).padStart(2, '0');
  const end = String(window.endHour).padStart(2, '0');
  const tz = window.timezone ?? 'America/Los_Angeles';
  return `${start}:00\u2013${end}:00 ${tz}`;
}

function resolveCurrentDay(
  runAt: Date | undefined,
  timezone: string,
): DoseRoundtripThreadBatcherQuietHoursDayOfWeek | null {
  if (runAt === undefined) return null;
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  });
  const part = fmt.formatToParts(runAt).find((p) => p.type === 'weekday');
  const raw = (part?.value ?? '').toLowerCase();
  if (
    raw === 'mon' ||
    raw === 'tue' ||
    raw === 'wed' ||
    raw === 'thu' ||
    raw === 'fri' ||
    raw === 'sat' ||
    raw === 'sun'
  ) {
    return raw as DoseRoundtripThreadBatcherQuietHoursDayOfWeek;
  }
  return null;
}

/**
 * Render the calendar overlay as a 7-column HTML grid.
 *
 * One column per day-of-week, ordered by the configured weekStart.
 * Each cell carries the day label, the rule label, the resolved
 * window, and a colour swatch keyed on the rule. When runAt is
 * supplied, the matching day's cell gets a `current-day` class for
 * visual highlighting.
 *
 * Pure / deterministic.
 */
export function renderQuietHoursCalendarHtml(
  options: DoseRoundtripThreadBatcherQuietHoursCalendarHtmlOptions = {},
): DoseRoundtripThreadBatcherQuietHoursCalendarHtmlResult {
  const palette = { ...DEFAULT_PALETTE, ...(options.palette ?? {}) };
  const weekStart = options.weekStart ?? 'mon-first';
  const order = weekStart === 'sun-first' ? SUN_FIRST : MON_FIRST;
  const wrapDoc = options.wrapHtmlDocument ?? false;
  const docTitle = options.documentTitle ?? 'Slack channel quiet-hours calendar';
  const captionText = options.caption;
  const fontFamily =
    options.fontFamily ??
    "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

  const probeTz = options.defaultWindow?.timezone ?? 'America/Los_Angeles';
  const currentDay = resolveCurrentDay(options.runAt, probeTz);

  const cells: DoseRoundtripThreadBatcherQuietHoursCalendarHtmlCell[] = order.map(
    (day) => {
      const resolved = resolveQuietHoursRuleForDay(day, options);
      return {
        dayOfWeek: day,
        label: LABELS[day],
        rule: resolved.rule,
        window: resolved.window,
        isCurrentDay: currentDay === day,
      };
    },
  );

  const ruleCounts: Record<DoseRoundtripThreadBatcherQuietHoursCalendarHtmlRule, number> = {
    'default': 0,
    'override:window': 0,
    'override:all-day': 0,
    'override:none': 0,
  };
  for (const c of cells) ruleCounts[c.rule] += 1;

  const cellHtmls = cells.map((c) => {
    const bg = palette[c.rule];
    const currentClass = c.isCurrentDay ? ' qh-cal-cell--current' : '';
    return (
      `<div class="qh-cal-cell${currentClass}" style="background:${bg};">` +
      `<div class="qh-cal-day">${escapeHtml(c.label)}${c.isCurrentDay ? ' \u2605' : ''}</div>` +
      `<div class="qh-cal-rule">${escapeHtml(RULE_LABELS[c.rule])}</div>` +
      `<div class="qh-cal-window">${escapeHtml(formatWindow(c.window))}</div>` +
      `</div>`
    );
  });

  const captionHtml = captionText
    ? `<div class="qh-cal-caption">${escapeHtml(captionText)}</div>`
    : '';

  const css =
    `.qh-cal-wrapper { font-family: ${fontFamily}; color: #111827; }` +
    `.qh-cal-title { font-size: 14pt; font-weight: 700; margin: 0 0 6pt 0; }` +
    `.qh-cal-caption { font-size: 10pt; color: #6b7280; margin: 0 0 10pt 0; }` +
    `.qh-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6pt; }` +
    `.qh-cal-cell { padding: 8pt 6pt; border-radius: 6pt; min-height: 60pt; display: flex; flex-direction: column; justify-content: space-between; box-sizing: border-box; }` +
    `.qh-cal-cell--current { outline: 2px solid #111827; outline-offset: 1px; }` +
    `.qh-cal-day { font-size: 11pt; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }` +
    `.qh-cal-rule { font-size: 9pt; font-weight: 600; margin-top: 4pt; }` +
    `.qh-cal-window { font-size: 8pt; color: #374151; margin-top: 2pt; font-variant-numeric: tabular-nums; }`;

  const fragment =
    `<style>${css}</style>` +
    `<section class="qh-cal-wrapper">` +
    `<h2 class="qh-cal-title">${escapeHtml(docTitle)}</h2>` +
    captionHtml +
    `<div class="qh-cal-grid">${cellHtmls.join('')}</div>` +
    `</section>`;

  const html = wrapDoc
    ? `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(docTitle)}</title></head><body>${fragment}</body></html>`
    : fragment;

  return {
    html,
    cells,
    currentDay,
    ruleCounts,
  };
}

/**
 * Convenience: a one-line cron-log summary of the calendar.
 *
 *   "Quiet-hours calendar: 5 default, 2 quiet-all-day (today = Sat)."
 *   "Quiet-hours calendar: 7 default."
 */
export function summarizeQuietHoursCalendarHtml(
  result: DoseRoundtripThreadBatcherQuietHoursCalendarHtmlResult,
): string {
  const r = result.ruleCounts;
  const parts: string[] = [];
  if (r.default > 0) parts.push(`${r.default} default`);
  if (r['override:window'] > 0) parts.push(`${r['override:window']} custom-window`);
  if (r['override:all-day'] > 0) parts.push(`${r['override:all-day']} quiet-all-day`);
  if (r['override:none'] > 0) parts.push(`${r['override:none']} no-quiet`);
  const body = parts.length === 0 ? '7 default' : parts.join(', ');
  const todayPart = result.currentDay
    ? ` (today = ${LABELS[result.currentDay]})`
    : '';
  return `Quiet-hours calendar: ${body}${todayPart}.`;
}
