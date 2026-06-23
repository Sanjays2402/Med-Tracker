/**
 * Dose export CSV import round-trip validator — summary-text Slack
 * thread batcher quiet-hours CALENDAR HTML, PRINTABLE variant.
 *
 * `dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar-html`
 * renders the calendar overlay as a dashboard-ready, colour-coded
 * 7-day grid. The current-day cell carries a `--current` outline +
 * star marker so the on-call admin can spot "today is Saturday and
 * the channel is suppressed" at a glance.
 *
 * That render is great for the live admin dashboard. It is the WRONG
 * choice for binder filing:
 *
 *   - colour fills don't reproduce well on monochrome inkjet / laser
 *     printers; cells turn into a uniform mid-grey;
 *   - the current-day outline is irrelevant the moment the page is
 *     printed (the "today" the print captures is not the "today" the
 *     reader sees a week later);
 *   - dashboards live behind login walls; binders live in physical
 *     folders. The two consumers want different aesthetics.
 *
 * This module is the print-friendly variant. It composes the same
 * `renderQuietHoursCalendarHtml` so every per-cell datum stays
 * consistent (same week order, same window resolution), then
 * post-processes the fragment for paper:
 *
 *   - palette overridden to monochrome (white background; only the
 *     `override:none` rule keeps a hairline border so the admin sees
 *     "this day has no quiet hours" without colour);
 *   - the rule label is BOLD when the rule is non-default (so a
 *     quick paper scan still surfaces the exceptions);
 *   - the current-day outline + star are suppressed;
 *   - a "Printed on YYYY-MM-DD" footer is added below the grid so
 *     the auditor can timestamp the binder page;
 *   - `@page` CSS sized to US Letter or A4 (caller picks) so the
 *     browser's "print as PDF" dialog hits the right paper.
 *
 * Pure / deterministic. No I/O. HTML escaped.
 *
 * Composes:
 *   - renderQuietHoursCalendarHtml (every cell datum + week order)
 *   - DoseRoundtripThreadBatcherQuietHoursCalendarHtmlResult shape
 */

import type {
  DoseRoundtripThreadBatcherQuietHoursCalendarHtmlOptions,
  DoseRoundtripThreadBatcherQuietHoursCalendarHtmlResult,
  DoseRoundtripThreadBatcherQuietHoursCalendarHtmlRule,
  DoseRoundtripThreadBatcherQuietHoursCalendarHtmlCell,
} from './dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar-html';
import { renderQuietHoursCalendarHtml } from './dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar-html';

export type DoseRoundtripThreadBatcherQuietHoursCalendarHtmlPrintablePaper =
  | 'us-letter'
  | 'a4';

export interface DoseRoundtripThreadBatcherQuietHoursCalendarHtmlPrintableOptions
  extends Omit<
    DoseRoundtripThreadBatcherQuietHoursCalendarHtmlOptions,
    'palette' | 'wrapHtmlDocument'
  > {
  /**
   * Paper preset. Default 'us-letter'. Drives the @page CSS so the
   * browser print dialog defaults to the right paper.
   */
  paper?: DoseRoundtripThreadBatcherQuietHoursCalendarHtmlPrintablePaper;
  /**
   * "Printed on" timestamp. When set, formatted under the grid as
   * "Printed YYYY-MM-DD" (ISO date in the calendar's timezone).
   * When undefined, no printed-on line is emitted.
   */
  printedAt?: Date;
  /**
   * Timezone for the printedAt timestamp. Defaults to the
   * defaultWindow timezone or 'America/Los_Angeles'.
   */
  printedAtTimezone?: string;
  /**
   * Footer text override. Default
   * "This page is a snapshot of the configured quiet-hours rules
   *  and does not update once printed."
   * Set to '' to suppress the footer.
   */
  footerText?: string;
  /**
   * Wrap fragment in a complete HTML document. Default true because
   * printable pages are typically standalone documents (the consumer
   * opens them in a browser tab and hits Cmd-P).
   */
  wrapHtmlDocument?: boolean;
  /**
   * Suppress the rule label bolding for non-default rules. Default
   * false (keep bolding — it's the only typographic accent left
   * after the colour fills are removed).
   */
  suppressNonDefaultBold?: boolean;
  /**
   * Suppress the printed-on stamp entirely. Default false. Useful for
   * stable hash-equal test snapshots where the timestamp would drift.
   */
  suppressPrintedAt?: boolean;
}

export interface DoseRoundtripThreadBatcherQuietHoursCalendarHtmlPrintableResult {
  /** Print-ready HTML fragment or full document. */
  html: string;
  /** Mirror of the underlying render's cells (week-ordered). */
  cells: DoseRoundtripThreadBatcherQuietHoursCalendarHtmlCell[];
  /** Per-rule cell counts. */
  ruleCounts: Record<
    DoseRoundtripThreadBatcherQuietHoursCalendarHtmlRule,
    number
  >;
  /** Resolved paper preset. */
  paper: DoseRoundtripThreadBatcherQuietHoursCalendarHtmlPrintablePaper;
  /** ISO date stamp emitted in the footer (or null). */
  printedAtIso: string | null;
}

const PAPER_PAGE: Record<
  DoseRoundtripThreadBatcherQuietHoursCalendarHtmlPrintablePaper,
  string
> = {
  'us-letter': '@page { size: 8.5in 11in; margin: 0.5in; }',
  'a4': '@page { size: 210mm 297mm; margin: 15mm; }',
};

const MONOCHROME_PALETTE: Record<
  DoseRoundtripThreadBatcherQuietHoursCalendarHtmlRule,
  string
> = {
  'default': '#ffffff',
  'override:window': '#ffffff',
  'override:all-day': '#ffffff',
  'override:none': '#ffffff',
};

const PRINTABLE_OVERLAY_CSS =
  // Strip the colour fills from inline cell styles by overriding them.
  `.qh-cal-cell { background: #ffffff !important; border: 1px solid #d1d5db; }` +
  // Remove the current-day outline + star (visual noise on paper).
  `.qh-cal-cell--current { outline: none !important; }` +
  // Hide the star character that the underlying render appends to the
  // label of the current day.
  `.qh-cal-day { color: #111827; }` +
  // Tighter print-friendly typography.
  `.qh-cal-title { font-size: 13pt; font-weight: 700; }` +
  `.qh-cal-caption { font-size: 9pt; color: #4b5563; }` +
  `.qh-cal-window { font-variant-numeric: tabular-nums; color: #1f2937; }` +
  `.qh-cal-printed-on { font-size: 8pt; color: #6b7280; margin-top: 12pt; text-align: right; font-variant-numeric: tabular-nums; }` +
  `.qh-cal-print-footer { font-size: 8pt; color: #6b7280; margin-top: 4pt; text-align: center; font-style: italic; }`;

const DEFAULT_FOOTER_TEXT =
  'This page is a snapshot of the configured quiet-hours rules and does not update once printed.';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPrintedAt(at: Date, timezone: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(at);
}

/**
 * Strip the leading star character that the underlying render
 * appends to the current-day label ("Sat \u2605" -> "Sat").
 *
 * The base render's cellHtml is opaque — we don't get an option to
 * suppress the star upstream — so we strip it from the fragment as a
 * single deterministic transform.
 */
function stripCurrentDayStar(fragment: string): string {
  return fragment.replace(/(<div class="qh-cal-day">[^<]+?) \u2605</g, '$1<');
}

/**
 * Bold non-default rule labels. The default fragment uses
 * `<div class="qh-cal-rule">Label</div>`; we wrap the label in `<strong>`
 * when the resolved label is anything other than 'Default'.
 */
function boldNonDefaultRuleLabels(fragment: string): string {
  // Replace each non-default rule label cell with a <strong>-wrapped
  // version. The base render emits the four canonical strings; we
  // surface that hard-coded list explicitly.
  return fragment
    .replace(
      /<div class="qh-cal-rule">Custom window<\/div>/g,
      '<div class="qh-cal-rule"><strong>Custom window</strong></div>',
    )
    .replace(
      /<div class="qh-cal-rule">Quiet all day<\/div>/g,
      '<div class="qh-cal-rule"><strong>Quiet all day</strong></div>',
    )
    .replace(
      /<div class="qh-cal-rule">No quiet hours<\/div>/g,
      '<div class="qh-cal-rule"><strong>No quiet hours</strong></div>',
    );
}

/**
 * Render the print-friendly calendar overlay.
 *
 * Composes renderQuietHoursCalendarHtml so the cell datum stays
 * consistent with the dashboard variant, then layers monochrome CSS,
 * suppresses the current-day outline + star, optionally bolds
 * non-default rule labels, and appends a printed-on + footer line
 * below the grid.
 *
 * Pure / deterministic.
 */
export function renderQuietHoursCalendarHtmlPrintable(
  options: DoseRoundtripThreadBatcherQuietHoursCalendarHtmlPrintableOptions = {},
): DoseRoundtripThreadBatcherQuietHoursCalendarHtmlPrintableResult {
  const paper = options.paper ?? 'us-letter';
  const wrapDoc = options.wrapHtmlDocument ?? true;
  const suppressBold = options.suppressNonDefaultBold ?? false;
  const suppressPrintedAt = options.suppressPrintedAt ?? false;

  // Compose the dashboard render with the monochrome palette so the
  // inline style fall-back is also monochrome (defence in depth: even
  // if the overlay CSS is stripped, the underlying inline style won't
  // surface colour).
  const baseOptions: DoseRoundtripThreadBatcherQuietHoursCalendarHtmlOptions = {
    ...options,
    palette: MONOCHROME_PALETTE,
    wrapHtmlDocument: false,
  };
  const base = renderQuietHoursCalendarHtml(baseOptions);

  // Strip the current-day star from the cell HTML (defence against
  // the underlying render appending the star regardless of the palette).
  let fragment = stripCurrentDayStar(base.html);

  if (!suppressBold) {
    fragment = boldNonDefaultRuleLabels(fragment);
  }

  // Append the printable footer block (printed-on stamp + footer line)
  // INSIDE the wrapper section so the layout stays contained.
  const printedAtIso =
    suppressPrintedAt || options.printedAt === undefined
      ? null
      : formatPrintedAt(
          options.printedAt,
          options.printedAtTimezone ??
            options.defaultWindow?.timezone ??
            'America/Los_Angeles',
        );
  const footerText = options.footerText ?? DEFAULT_FOOTER_TEXT;
  const footerHtml =
    (printedAtIso !== null
      ? `<div class="qh-cal-printed-on">Printed ${escapeHtml(printedAtIso)}</div>`
      : '') +
    (footerText.length > 0
      ? `<div class="qh-cal-print-footer">${escapeHtml(footerText)}</div>`
      : '');
  fragment = fragment.replace(
    /<\/section>$/,
    `${footerHtml}</section>`,
  );

  // Layer the printable overlay CSS BEFORE the existing <style> block
  // so the !important rules win.
  const overlayStyle = `<style>${PAPER_PAGE[paper]}${PRINTABLE_OVERLAY_CSS}</style>`;
  fragment = overlayStyle + fragment;

  const docTitle = options.documentTitle ?? 'Slack channel quiet-hours calendar';
  const html = wrapDoc
    ? `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(
        docTitle,
      )}</title></head><body>${fragment}</body></html>`
    : fragment;

  return {
    html,
    cells: base.cells,
    ruleCounts: base.ruleCounts,
    paper,
    printedAtIso,
  };
}

/**
 * Convenience: a one-line cron-log summary of the printable render.
 *
 *   "Quiet-hours calendar (printable, us-letter): 5 default, 2
 *    quiet-all-day; printed 2026-06-23."
 *   "Quiet-hours calendar (printable, a4): 7 default."
 */
export function summarizeQuietHoursCalendarHtmlPrintable(
  result: DoseRoundtripThreadBatcherQuietHoursCalendarHtmlPrintableResult,
): string {
  const r = result.ruleCounts;
  const parts: string[] = [];
  if (r.default > 0) parts.push(`${r.default} default`);
  if (r['override:window'] > 0)
    parts.push(`${r['override:window']} custom-window`);
  if (r['override:all-day'] > 0)
    parts.push(`${r['override:all-day']} quiet-all-day`);
  if (r['override:none'] > 0) parts.push(`${r['override:none']} no-quiet`);
  const body = parts.length === 0 ? '7 default' : parts.join(', ');
  const printedPart =
    result.printedAtIso === null ? '' : `; printed ${result.printedAtIso}`;
  return `Quiet-hours calendar (printable, ${result.paper}): ${body}${printedPart}.`;
}

/**
 * Convenience: extract the per-cell summary as plain text suitable
 * for log review without rendering HTML. One line per day.
 *
 *   "Mon: Default — 22:00\u201307:00 America/Los_Angeles"
 *   "Sat: Quiet all day — 00:00\u201324:00 America/Los_Angeles"
 */
export function extractQuietHoursCalendarHtmlPrintableLines(
  result: DoseRoundtripThreadBatcherQuietHoursCalendarHtmlPrintableResult,
): string[] {
  const RULE_LABELS: Record<
    DoseRoundtripThreadBatcherQuietHoursCalendarHtmlRule,
    string
  > = {
    'default': 'Default',
    'override:window': 'Custom window',
    'override:all-day': 'Quiet all day',
    'override:none': 'No quiet hours',
  };
  const DAY_LABELS: Record<string, string> = {
    mon: 'Mon',
    tue: 'Tue',
    wed: 'Wed',
    thu: 'Thu',
    fri: 'Fri',
    sat: 'Sat',
    sun: 'Sun',
  };
  return result.cells.map((c) => {
    const dayLabel = DAY_LABELS[c.dayOfWeek] ?? c.dayOfWeek;
    const ruleLabel = RULE_LABELS[c.rule];
    let windowLabel: string;
    if (c.window === null) {
      windowLabel = '\u2014';
    } else {
      const sh = String(c.window.startHour).padStart(2, '0');
      const eh = String(c.window.endHour).padStart(2, '0');
      const tz = c.window.timezone ?? 'America/Los_Angeles';
      windowLabel = `${sh}:00\u2013${eh}:00 ${tz}`;
    }
    return `${dayLabel}: ${ruleLabel} \u2014 ${windowLabel}`;
  });
}
