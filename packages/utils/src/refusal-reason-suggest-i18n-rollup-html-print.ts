/**
 * Refusal reason suggest i18n rollup — HTML print variant.
 *
 * `refusal-reason-suggest-i18n-rollup-html` renders the patient
 * adjudication queue for in-portal review (accept / reject controls,
 * coverage strip, per-source colour chips, scrollable layout).
 * Caregivers reviewing PAPER copies before adjudicating in-app need
 * a different shape:
 *
 *   - NO interactive controls (checkboxes / buttons mean nothing on
 *     paper);
 *   - PAGINATED with a repeating header on each page;
 *   - one row per line (no two-up packing — the print review is the
 *     reader, not the dashboard widget);
 *   - explicit @media print CSS rules with page-break-after at end-of-
 *     page boundaries so a non-print-friendly browser still respects
 *     them;
 *   - print-targeted colour palette (no gray-on-white that won't
 *     photocopy).
 *
 * The print variant is the SAME content as the regular HTML variant,
 * just laid out for paper. Sharing the per-source priority order,
 * locale fallback badge, and reason-code annotations keeps the
 * print and portal views identical — a caregiver reading on paper
 * and another reading in-app land on the same accept/reject decision.
 *
 * Pure / deterministic. No I/O. HTML fragment ready to drop inside
 * a print preview window — all styles inline so a Gmail/Outlook
 * client that previews the email can render it too.
 *
 * Companion to (and parallel design with):
 *   - dose-export-csv-import-roundtrip-validator-html-print (#142)
 */

import type { RefusalReasonI18nKey } from './refusal-reason-suggest-i18n';
import type {
  LocalisedRefusalSuggestion,
  RefusalReasonI18nRollupResult,
} from './refusal-reason-suggest-i18n-rollup';

export interface RefusalReasonI18nRollupHtmlPrintOptions {
  /** Rows per print page. Default 20. */
  rowsPerPage?: number;
  /**
   * Patient name shown in the header. Falls back to a generic title.
   */
  patientName?: string;
  /**
   * Optional date label appearing in the header (e.g. "Generated 2026-06-22").
   * Useful when the printed sheet is filed in a binder weeks later.
   */
  dateLabel?: string;
  /** Override the cell font-family. Default: a print-friendly serif. */
  fontFamily?: string;
  /**
   * Include the page-N-of-M footer. Default true. Set false when
   * embedding inside an existing print envelope that already has
   * pagination chrome.
   */
  includePageFooter?: boolean;
  /**
   * Include the coverage strip on page 1. Default true. Set false
   * for caregivers who want a clean roster without summary
   * telemetry on the printed page.
   */
  includeCoverageStrip?: boolean;
}

export interface RefusalReasonI18nRollupHtmlPrint {
  /** Full HTML fragment with @media print styles embedded. */
  html: string;
  /** Number of pages produced. */
  pageCount: number;
  /** Total rows rendered across all pages (post-filter, post-cap). */
  shownSuggestionCount: number;
  /** Rows dropped for being unsuggested (suggester returned null). */
  droppedSuggestionCount: number;
}

const SOURCE_LABEL: Record<RefusalReasonI18nKey, string> = {
  'npo-window': 'NPO WINDOW',
  'prescriber-pause': 'PRESCRIBER PAUSE',
  'out-of-supply': 'OUT OF SUPPLY',
  'sleeping-window': 'SLEEPING WINDOW',
  'recent-pattern': 'RECENT PATTERN',
};

// Print palette uses STRONG borders + black text on white. Source
// chips use bold uppercase rather than colour fills (faint colour
// fills don't survive a black-and-white photocopy).
const SOURCE_PRIORITY: RefusalReasonI18nKey[] = [
  'npo-window',
  'prescriber-pause',
  'out-of-supply',
  'sleeping-window',
  'recent-pattern',
];

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderHeader(
  pageNum: number,
  pageCount: number,
  patientName: string | undefined,
  dateLabel: string | undefined,
  fontFamily: string,
): string {
  const title = patientName
    ? `${escapeHtml(patientName)} — refusal-reason adjudication`
    : 'Refusal-reason adjudication';
  const dateBit = dateLabel ? ` &middot; ${escapeHtml(dateLabel)}` : '';
  return (
    `<div style="font-family:${fontFamily};border-bottom:2px solid #000;padding-bottom:6px;margin-bottom:10px;">` +
    `<div style="font-size:16px;font-weight:700;color:#000;">${title}</div>` +
    `<div style="font-size:11px;color:#000;margin-top:2px;">Page ${pageNum} of ${pageCount}${dateBit}</div>` +
    `</div>`
  );
}

function renderCoverageStrip(result: RefusalReasonI18nRollupResult, fontFamily: string): string {
  const c = result.coverage;
  const sources = [...c.bySource.entries()].sort((a, b) => b[1].suggested - a[1].suggested);
  const topSource =
    sources.length === 0
      ? 'none'
      : `${SOURCE_LABEL[sources[0]![0]]} (${sources[0]![1].suggested})`;
  const fallbackPart =
    c.fallbackCount > 0 ? ` &middot; ${c.fallbackCount} fallback` : '';
  return (
    `<div style="font-family:${fontFamily};font-size:11px;color:#000;border:1px solid #000;padding:6px 8px;margin-bottom:10px;">` +
    `${c.suggestedCount}/${c.doseCount} suggested ` +
    `&middot; Top source: ${escapeHtml(topSource)}` +
    fallbackPart +
    `</div>`
  );
}

function renderRow(s: LocalisedRefusalSuggestion, fontFamily: string): string {
  if (!s.suggestion || !s.source) return '';
  const fallbackTag = s.suggestion.fallback ? ' [FALLBACK]' : '';
  const reasonLabel = typeof s.reason === 'string' ? `Reason: ${escapeHtml(s.reason)}` : '';
  const sourceLabel = SOURCE_LABEL[s.source];
  return (
    `<tr style="page-break-inside:avoid;">` +
    // Dose id + source chip (left)
    `<td style="padding:6px 8px 6px 0;font-family:${fontFamily};font-size:11px;color:#000;border-top:1px solid #000;vertical-align:top;width:200px;">` +
    `<div style="font-weight:700;">${escapeHtml(s.doseId)}</div>` +
    `<div style="font-size:10px;font-weight:700;margin-top:2px;letter-spacing:0.04em;">[${escapeHtml(sourceLabel)}]</div>` +
    (reasonLabel ? `<div style="font-size:10px;margin-top:2px;">${reasonLabel}</div>` : '') +
    `</td>` +
    // Explanation (right)
    `<td style="padding:6px 8px 6px 0;font-family:${fontFamily};font-size:11px;color:#000;border-top:1px solid #000;vertical-align:top;">` +
    `<div>${escapeHtml(s.suggestion.text)}${fallbackTag}</div>` +
    `<div style="font-size:10px;color:#333;margin-top:4px;">Locale: ${escapeHtml(s.suggestion.locale)}</div>` +
    // Accept / Reject signature line - paper signoff bubble
    `<div style="font-size:10px;color:#000;margin-top:6px;">[ ] Accept &nbsp;&nbsp; [ ] Reject &nbsp;&nbsp; Signed: __________</div>` +
    `</td>` +
    `</tr>`
  );
}

function renderPage(
  rows: LocalisedRefusalSuggestion[],
  pageNum: number,
  pageCount: number,
  options: Required<Pick<RefusalReasonI18nRollupHtmlPrintOptions, 'fontFamily'>> & {
    patientName: string | undefined;
    dateLabel: string | undefined;
    isLastPage: boolean;
    includeCoverageStrip: boolean;
    result: RefusalReasonI18nRollupResult;
    includePageFooter: boolean;
  },
): string {
  const header = renderHeader(
    pageNum,
    pageCount,
    options.patientName,
    options.dateLabel,
    options.fontFamily,
  );
  const coverage =
    pageNum === 1 && options.includeCoverageStrip
      ? renderCoverageStrip(options.result, options.fontFamily)
      : '';
  const bodyRows = rows.map((r) => renderRow(r, options.fontFamily)).join('');
  const footer = options.includePageFooter
    ? `<div style="font-family:${options.fontFamily};font-size:9px;color:#000;border-top:1px solid #000;padding-top:4px;margin-top:8px;">Med-Tracker print preview &middot; page ${pageNum} of ${pageCount}</div>`
    : '';
  // page-break-after on every page except the last so the printer
  // forces a break between pages even when the previewer doesn't
  // honour @media print rules.
  const breakStyle = options.isLastPage ? '' : 'page-break-after:always;';
  return (
    `<section style="${breakStyle}padding:8px 0;">` +
    header +
    coverage +
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;">` +
    `<tbody>${bodyRows}</tbody>` +
    `</table>` +
    footer +
    `</section>`
  );
}

function flattenForPrint(result: RefusalReasonI18nRollupResult): LocalisedRefusalSuggestion[] {
  const bySource: Record<RefusalReasonI18nKey, LocalisedRefusalSuggestion[]> = {
    'npo-window': [],
    'prescriber-pause': [],
    'out-of-supply': [],
    'sleeping-window': [],
    'recent-pattern': [],
  };
  for (const s of result.suggestions) {
    if (!s.source) continue;
    if (!s.suggestion) continue;
    bySource[s.source].push(s);
  }
  const flat: LocalisedRefusalSuggestion[] = [];
  for (const src of SOURCE_PRIORITY) {
    for (const row of bySource[src]) flat.push(row);
  }
  return flat;
}

/**
 * Render a RefusalReasonI18nRollupResult as a print-friendly HTML
 * fragment with explicit pagination, repeating headers, and no
 * interactive controls. Drop into a print preview window or
 * include as an attachment to the adjudication-by-email pipeline.
 *
 * Output is deterministic.
 */
export function renderRefusalReasonI18nRollupHtmlPrint(
  result: RefusalReasonI18nRollupResult,
  options: RefusalReasonI18nRollupHtmlPrintOptions = {},
): RefusalReasonI18nRollupHtmlPrint {
  const rowsPerPage = Math.max(1, options.rowsPerPage ?? 20);
  const fontFamily =
    options.fontFamily ?? 'Georgia, "Times New Roman", Times, serif';
  const includePageFooter = options.includePageFooter ?? true;
  const includeCoverageStrip = options.includeCoverageStrip ?? true;

  const flatRows = flattenForPrint(result);
  const totalRows = flatRows.length;
  const droppedSuggestionCount = result.suggestions.length - totalRows;

  // Even an empty result gets a single page (empty state).
  const pageCount = totalRows === 0 ? 1 : Math.ceil(totalRows / rowsPerPage);

  const pages: string[] = [];
  if (totalRows === 0) {
    const header = renderHeader(1, 1, options.patientName, options.dateLabel, fontFamily);
    const coverage = includeCoverageStrip ? renderCoverageStrip(result, fontFamily) : '';
    const body = `<div style="font-family:${fontFamily};font-size:11px;color:#000;font-style:italic;">No suggestions to review.</div>`;
    const footer = includePageFooter
      ? `<div style="font-family:${fontFamily};font-size:9px;color:#000;border-top:1px solid #000;padding-top:4px;margin-top:8px;">Med-Tracker print preview &middot; page 1 of 1</div>`
      : '';
    pages.push(`<section style="padding:8px 0;">${header}${coverage}${body}${footer}</section>`);
  } else {
    for (let i = 0; i < totalRows; i += rowsPerPage) {
      const pageNum = Math.floor(i / rowsPerPage) + 1;
      const pageRows = flatRows.slice(i, i + rowsPerPage);
      pages.push(
        renderPage(pageRows, pageNum, pageCount, {
          fontFamily,
          patientName: options.patientName,
          dateLabel: options.dateLabel,
          isLastPage: pageNum === pageCount,
          includeCoverageStrip,
          result,
          includePageFooter,
        }),
      );
    }
  }

  const html =
    `<div style="font-family:${fontFamily};max-width:7.5in;margin:0 auto;">` +
    `<style>@media print { section { page-break-inside: avoid; } }</style>` +
    pages.join('') +
    `</div>`;

  return {
    html,
    pageCount,
    shownSuggestionCount: totalRows,
    droppedSuggestionCount,
  };
}

/**
 * Convenience: compute the page count without rendering the HTML.
 * For callers that need to pre-allocate a fixed paper budget before
 * deciding whether to print.
 */
export function refusalReasonI18nRollupPrintPageCount(
  result: RefusalReasonI18nRollupResult,
  options: Pick<RefusalReasonI18nRollupHtmlPrintOptions, 'rowsPerPage'> = {},
): number {
  const rowsPerPage = Math.max(1, options.rowsPerPage ?? 20);
  const totalRows = flattenForPrint(result).length;
  if (totalRows === 0) return 1;
  return Math.ceil(totalRows / rowsPerPage);
}
