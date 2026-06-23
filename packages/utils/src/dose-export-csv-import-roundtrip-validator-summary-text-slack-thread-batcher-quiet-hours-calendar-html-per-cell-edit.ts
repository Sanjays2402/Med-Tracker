/**
 * Dose export CSV import round-trip validator — summary-text Slack
 * thread batcher quiet-hours CALENDAR HTML, PER-CELL EDIT overlay.
 *
 * `dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar-html`
 * renders the 7-day grid as a passive overlay: every cell shows the
 * resolved rule + window, but the channel admin can't act on a cell
 * directly. To change Tuesday's window they leave the page, find the
 * override config, edit it, refresh the page, then verify.
 *
 * The real admin workflow needs per-cell EDIT links. Click "Wed" in
 * the grid, jump to the override editor pre-scoped to Wednesday.
 * Every cell becomes a click target that carries the day-of-week in
 * the URL, and the editor reads it on load.
 *
 * This module is the per-cell-edit variant. It wraps each cell in
 * an `<a href="...">` whose target is built from a caller-supplied
 * URL template. The template is interpolated with:
 *
 *   {day}        -- day-of-week key (mon, tue, ..., sun)
 *   {dayLabel}   -- human label (Mon, Tue, ..., Sun)
 *   {rule}       -- resolved rule (default, override:window, ...)
 *
 * Convention placeholders only — the caller can ignore any subset.
 *
 * Accessibility:
 *   - the anchor carries aria-label describing the day + current rule;
 *   - keyboard focus styling exposes a clear focus ring;
 *   - cells without a configured editable URL fall back to plain
 *     non-interactive divs (graceful degradation).
 *
 * Pure / deterministic. No JS. HTML escaped. URL escaping limited to
 * the placeholder interpolation step (so the caller controls the URL
 * shape).
 *
 * Composes:
 *   - renderQuietHoursCalendarHtml (shared cell + rule resolution)
 *   - DoseRoundtripThreadBatcherQuietHoursCalendarHtmlCell shape
 */

import type {
  DoseRoundtripThreadBatcherQuietHoursCalendarHtmlCell,
  DoseRoundtripThreadBatcherQuietHoursCalendarHtmlOptions,
  DoseRoundtripThreadBatcherQuietHoursCalendarHtmlResult,
  DoseRoundtripThreadBatcherQuietHoursCalendarHtmlRule,
} from './dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar-html';
import { renderQuietHoursCalendarHtml } from './dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar-html';
import type { DoseRoundtripThreadBatcherQuietHoursDayOfWeek } from './dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar';

export interface DoseRoundtripQuietHoursCalendarHtmlPerCellEditOptions
  extends DoseRoundtripThreadBatcherQuietHoursCalendarHtmlOptions {
  /**
   * URL template. Supported placeholders: {day}, {dayLabel}, {rule}.
   * Placeholder values are URI-encoded BEFORE substitution so commas /
   * spaces / colons inside the rule label don't break the link.
   *
   * REQUIRED: callers that want a non-editable grid should use the
   * base calendar-html module instead.
   */
  editUrlTemplate: string;
  /**
   * Predicate to selectively suppress the edit link on a cell (e.g.
   * read-only days). When the predicate returns false, the cell
   * renders as a plain non-interactive div like the base module.
   *
   * Default: always editable.
   */
  isCellEditable?: (
    cell: DoseRoundtripThreadBatcherQuietHoursCalendarHtmlCell,
  ) => boolean;
  /**
   * Optional override for the aria-label text generator.
   *
   * Default: `Edit quiet hours for ${dayLabel} (currently ${ruleLabel})`.
   */
  buildAriaLabel?: (
    cell: DoseRoundtripThreadBatcherQuietHoursCalendarHtmlCell,
  ) => string;
  /**
   * Open the edit link in a new tab (target="_blank" rel="noopener").
   * Default false; admin overlays typically replace in-page navigation.
   */
  openInNewTab?: boolean;
}

export interface DoseRoundtripQuietHoursCalendarHtmlPerCellEditLink {
  dayOfWeek: DoseRoundtripThreadBatcherQuietHoursDayOfWeek;
  /** Resolved edit URL (post-interpolation). Null when the cell is non-editable. */
  href: string | null;
  /** Aria-label text for the anchor. */
  ariaLabel: string;
}

export interface DoseRoundtripQuietHoursCalendarHtmlPerCellEditResult
  extends DoseRoundtripThreadBatcherQuietHoursCalendarHtmlResult {
  /** Per-day edit link metadata, in the resolved week order. */
  editLinks: DoseRoundtripQuietHoursCalendarHtmlPerCellEditLink[];
  /** Distinct editable cells (anchors emitted). */
  editableCellCount: number;
  /** Distinct non-editable cells (rendered as plain divs). */
  nonEditableCellCount: number;
}

const RULE_LABELS: Record<DoseRoundtripThreadBatcherQuietHoursCalendarHtmlRule, string> = {
  default: 'Default',
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

function interpolateUrl(
  template: string,
  cell: DoseRoundtripThreadBatcherQuietHoursCalendarHtmlCell,
): string {
  return template
    .replace(/\{day\}/g, encodeURIComponent(cell.dayOfWeek))
    .replace(/\{dayLabel\}/g, encodeURIComponent(cell.label))
    .replace(/\{rule\}/g, encodeURIComponent(cell.rule));
}

function defaultAriaLabel(
  cell: DoseRoundtripThreadBatcherQuietHoursCalendarHtmlCell,
): string {
  return `Edit quiet hours for ${cell.label} (currently ${RULE_LABELS[cell.rule]})`;
}

/**
 * Render the calendar HTML grid with a clickable edit anchor on each
 * cell, plus a parallel editLinks array exposing the resolved hrefs
 * for the host page's logic (e.g. testing the URL shape, building a
 * sitemap entry, etc).
 *
 * Falls back to the base renderQuietHoursCalendarHtml for the
 * underlying cells + colour palette + week ordering — this module
 * only WRAPS each cell in an anchor (and adds the aria-label /
 * focus-ring CSS).
 *
 * Pure / deterministic. No JS.
 */
export function renderQuietHoursCalendarHtmlPerCellEdit(
  options: DoseRoundtripQuietHoursCalendarHtmlPerCellEditOptions,
): DoseRoundtripQuietHoursCalendarHtmlPerCellEditResult {
  if (typeof options.editUrlTemplate !== 'string' || options.editUrlTemplate.length === 0) {
    throw new Error(
      'editUrlTemplate must be a non-empty string; for a non-editable grid use renderQuietHoursCalendarHtml instead.',
    );
  }
  const base = renderQuietHoursCalendarHtml(options);
  const isEditable = options.isCellEditable ?? (() => true);
  const buildLabel = options.buildAriaLabel ?? defaultAriaLabel;
  const openInNewTab = options.openInNewTab ?? false;

  const editLinks: DoseRoundtripQuietHoursCalendarHtmlPerCellEditLink[] =
    base.cells.map((cell) => {
      const editable = isEditable(cell);
      const href = editable ? interpolateUrl(options.editUrlTemplate, cell) : null;
      const ariaLabel = buildLabel(cell);
      return {
        dayOfWeek: cell.dayOfWeek,
        href,
        ariaLabel,
      };
    });

  let editableCellCount = 0;
  for (const link of editLinks) if (link.href !== null) editableCellCount += 1;
  const nonEditableCellCount = editLinks.length - editableCellCount;

  // Rewrite the base.html cell divs into <a href> wrappers OR keep
  // them as <div> (non-editable). We do this by re-deriving the cell
  // markup from base.cells + editLinks rather than mutating the
  // base.html string — keeps the HTML deterministic and avoids regex
  // edits.
  const palette = resolvePalette(options.palette);
  const cellsHtml = base.cells
    .map((cell, idx) => {
      const link = editLinks[idx]!;
      const bg = palette[cell.rule];
      const currentClass = cell.isCurrentDay ? ' qh-cal-cell--current' : '';
      const editableClass = link.href !== null ? ' qh-cal-cell--editable' : '';
      const inner =
        `<div class="qh-cal-day">${escapeHtml(cell.label)}${cell.isCurrentDay ? ' \u2605' : ''}</div>` +
        `<div class="qh-cal-rule">${escapeHtml(RULE_LABELS[cell.rule])}</div>` +
        `<div class="qh-cal-window">${escapeHtml(formatWindow(cell.window))}</div>`;
      if (link.href !== null) {
        const target = openInNewTab
          ? ' target="_blank" rel="noopener"'
          : '';
        return (
          `<a class="qh-cal-cell qh-cal-cell-link${editableClass}${currentClass}" ` +
          `style="background:${bg};" ` +
          `href="${escapeHtml(link.href)}"${target} ` +
          `aria-label="${escapeHtml(link.ariaLabel)}">${inner}</a>`
        );
      }
      return (
        `<div class="qh-cal-cell${currentClass}" ` +
        `style="background:${bg};" ` +
        `aria-label="${escapeHtml(link.ariaLabel)}">${inner}</div>`
      );
    })
    .join('');

  // Reassemble the wrapper using the same structure as the base
  // renderer (style/title/caption/grid/section). We could call into
  // the base for the chrome, but the cell markup is the only thing
  // that changes so we re-emit the whole fragment for self-contained
  // output.
  const wrapDoc = options.wrapHtmlDocument ?? false;
  const docTitle =
    options.documentTitle ?? 'Slack channel quiet-hours calendar';
  const captionText = options.caption;
  const fontFamily =
    options.fontFamily ??
    "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  const captionHtml = captionText
    ? `<div class="qh-cal-caption">${escapeHtml(captionText)}</div>`
    : '';
  const extraCss =
    `.qh-cal-cell-link { text-decoration: none; color: inherit; cursor: pointer; }` +
    `.qh-cal-cell-link:hover { filter: brightness(0.95); }` +
    `.qh-cal-cell-link:focus { outline: 2px solid #1d4ed8; outline-offset: 2px; }`;
  const css =
    `.qh-cal-wrapper { font-family: ${fontFamily}; color: #111827; }` +
    `.qh-cal-title { font-size: 14pt; font-weight: 700; margin: 0 0 6pt 0; }` +
    `.qh-cal-caption { font-size: 10pt; color: #6b7280; margin: 0 0 10pt 0; }` +
    `.qh-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6pt; }` +
    `.qh-cal-cell { padding: 8pt 6pt; border-radius: 6pt; min-height: 60pt; display: flex; flex-direction: column; justify-content: space-between; box-sizing: border-box; }` +
    `.qh-cal-cell--current { outline: 2px solid #111827; outline-offset: 1px; }` +
    `.qh-cal-day { font-size: 11pt; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }` +
    `.qh-cal-rule { font-size: 9pt; font-weight: 600; margin-top: 4pt; }` +
    `.qh-cal-window { font-size: 8pt; color: #374151; margin-top: 2pt; font-variant-numeric: tabular-nums; }` +
    extraCss;
  const fragment =
    `<style>${css}</style>` +
    `<section class="qh-cal-wrapper">` +
    `<h2 class="qh-cal-title">${escapeHtml(docTitle)}</h2>` +
    captionHtml +
    `<div class="qh-cal-grid">${cellsHtml}</div>` +
    `</section>`;
  const html = wrapDoc
    ? `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(docTitle)}</title></head><body>${fragment}</body></html>`
    : fragment;

  return {
    ...base,
    html,
    editLinks,
    editableCellCount,
    nonEditableCellCount,
  };
}

function resolvePalette(
  partial: DoseRoundtripQuietHoursCalendarHtmlPerCellEditOptions['palette'],
): Record<DoseRoundtripThreadBatcherQuietHoursCalendarHtmlRule, string> {
  return {
    default: partial?.default ?? '#e5e7eb',
    'override:window': partial?.['override:window'] ?? '#fde68a',
    'override:all-day': partial?.['override:all-day'] ?? '#fecaca',
    'override:none': partial?.['override:none'] ?? '#bbf7d0',
  };
}

function formatWindow(
  window: DoseRoundtripThreadBatcherQuietHoursCalendarHtmlCell['window'],
): string {
  if (window === null) return '\u2014';
  const start = String(window.startHour).padStart(2, '0');
  const end = String(window.endHour).padStart(2, '0');
  const tz = window.timezone ?? 'America/Los_Angeles';
  return `${start}:00\u2013${end}:00 ${tz}`;
}

/**
 * Convenience: produce just the per-cell edit links without
 * rendering the HTML grid. For host pages that have their own grid
 * markup and only need the URLs.
 *
 * Pure / deterministic.
 */
export function buildQuietHoursCalendarHtmlPerCellEditLinks(
  options: DoseRoundtripQuietHoursCalendarHtmlPerCellEditOptions,
): DoseRoundtripQuietHoursCalendarHtmlPerCellEditLink[] {
  // Delegate to the full render and pick off the links. This keeps
  // the URL-template + isCellEditable + buildAriaLabel semantics
  // identical to the rendered grid.
  return renderQuietHoursCalendarHtmlPerCellEdit(options).editLinks;
}

/**
 * Convenience: a one-line cron-log summary.
 *
 *   "Quiet-hours calendar (edit overlay): 7 cells (5 editable,
 *    2 read-only); today = Wed."
 *   "Quiet-hours calendar (edit overlay): 7 cells (all editable)."
 */
export function summarizeQuietHoursCalendarHtmlPerCellEdit(
  result: DoseRoundtripQuietHoursCalendarHtmlPerCellEditResult,
): string {
  const total = result.editLinks.length;
  const ed = result.editableCellCount;
  const ne = result.nonEditableCellCount;
  let body: string;
  if (ne === 0) {
    body = `${total} ${total === 1 ? 'cell' : 'cells'} (all editable)`;
  } else if (ed === 0) {
    body = `${total} ${total === 1 ? 'cell' : 'cells'} (all read-only)`;
  } else {
    body = `${total} ${total === 1 ? 'cell' : 'cells'} (${ed} editable, ${ne} read-only)`;
  }
  const todayPart = result.currentDay
    ? `; today = ${cap(result.currentDay)}`
    : '';
  return `Quiet-hours calendar (edit overlay): ${body}${todayPart}.`;
}

function cap(d: DoseRoundtripThreadBatcherQuietHoursDayOfWeek): string {
  switch (d) {
    case 'mon':
      return 'Mon';
    case 'tue':
      return 'Tue';
    case 'wed':
      return 'Wed';
    case 'thu':
      return 'Thu';
    case 'fri':
      return 'Fri';
    case 'sat':
      return 'Sat';
    case 'sun':
      return 'Sun';
  }
}
