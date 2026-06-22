/**
 * Refusal reason suggest i18n rollup — HTML print, cover sheet.
 *
 * `refusal-reason-suggest-i18n-rollup-html-print` produces a
 * paginated print roster of refusal-reason suggestions for paper
 * adjudication. Clinical workflows that file the roster into a
 * patient binder need a SINGLE-PAGE COVER SHEET preceding the
 * paginated body, matching the convention of clinical-records
 * paper packets:
 *
 *   - patient name (large)
 *   - panel size + date generated (audit metadata)
 *   - source breakdown (NPO window / prescriber pause / out of
 *     supply / sleeping window / recent pattern row counts)
 *   - locale breakdown (which locales appeared in this roster)
 *   - signature block at the bottom for the reviewer to sign +
 *     date the entire batch before filing
 *
 * The cover sheet is a SEPARATE HTML fragment from the print body
 * so callers can choose whether to include it (it's not always
 * wanted — a 2-row roster doesn't need a cover sheet). When
 * embedded, the cover sheet renders as page 1 with a
 * page-break-after:always so the print body starts on page 2.
 *
 * Companion / cover sheet parallel to (when those land):
 *   - dose-export-csv-import-roundtrip-validator-html-print-cover-sheet
 *   - prescriber-contact-card-emergency-card-pdf-binder-cover (#140 / #155)
 *
 * Pure / deterministic. No I/O. HTML fragment ready to drop inside
 * a print preview window or splice in front of the paginated body
 * fragment.
 */

import type { RefusalReasonI18nKey } from './refusal-reason-suggest-i18n';
import type {
  RefusalReasonI18nRollupResult,
} from './refusal-reason-suggest-i18n-rollup';

export interface RefusalReasonI18nRollupHtmlPrintCoverSheetOptions {
  /** Patient name shown in the hero block. Falls back to a generic title. */
  patientName?: string;
  /** Caregiver / reviewer panel name (e.g. "Cardiology Q3 review"). */
  panelLabel?: string;
  /**
   * Date label appearing alongside the cover-sheet metadata
   * (e.g. "Generated 2026-06-22"). Should match the body's
   * dateLabel so the cover and body share a single audit date.
   */
  dateLabel?: string;
  /** Override the cell font-family. Default: a print-friendly serif. */
  fontFamily?: string;
  /**
   * Total page count the body will produce (for the "Pages: N body
   * pages following this cover sheet" line). Pass this from the
   * body's RefusalReasonI18nRollupHtmlPrint.pageCount.
   */
  bodyPageCount?: number;
  /**
   * Include the signature block at the bottom. Default true. Set
   * false when the cover sheet is consumed by an automated archive
   * pipeline that doesn't need a wet signature.
   */
  includeSignatureBlock?: boolean;
  /**
   * Signature block lines. Default ['Reviewer signature', 'Date',
   * 'Printed name']. Each line gets a long underline.
   */
  signatureLines?: string[];
  /**
   * Page-break after the cover sheet. Default true so the body
   * starts on page 2 when concatenated. Set false when the caller
   * is splicing this into a larger document and wants to control
   * its own pagination.
   */
  pageBreakAfter?: boolean;
}

export interface RefusalReasonI18nRollupHtmlPrintCoverSheet {
  /** Full HTML fragment for the single-page cover sheet. */
  html: string;
  /** Number of distinct source kinds shown in the source breakdown. */
  sourceBreakdownRowCount: number;
  /** Number of distinct locales shown in the locale breakdown. */
  localeBreakdownRowCount: number;
  /** Whether the signature block was emitted. */
  signatureBlockIncluded: boolean;
}

const SOURCE_LABEL: Record<RefusalReasonI18nKey, string> = {
  'npo-window': 'NPO WINDOW',
  'prescriber-pause': 'PRESCRIBER PAUSE',
  'out-of-supply': 'OUT OF SUPPLY',
  'sleeping-window': 'SLEEPING WINDOW',
  'recent-pattern': 'RECENT PATTERN',
};

const SOURCE_PRIORITY: RefusalReasonI18nKey[] = [
  'npo-window',
  'prescriber-pause',
  'out-of-supply',
  'sleeping-window',
  'recent-pattern',
];

const DEFAULT_SIGNATURE_LINES = ['Reviewer signature', 'Date', 'Printed name'];

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderHero(
  patientName: string | undefined,
  panelLabel: string | undefined,
  fontFamily: string,
): string {
  const title = patientName ? escapeHtml(patientName) : 'Refusal-reason adjudication';
  const subtitle = panelLabel ? escapeHtml(panelLabel) : 'Refusal-reason adjudication';
  return (
    `<div style="font-family:${fontFamily};text-align:center;padding:48px 0 32px 0;border-bottom:2px solid #000;">` +
    `<div style="font-size:32px;font-weight:700;color:#000;letter-spacing:0.02em;">${title}</div>` +
    `<div style="font-size:14px;color:#000;margin-top:8px;letter-spacing:0.08em;text-transform:uppercase;">${subtitle}</div>` +
    `</div>`
  );
}

function renderMetadataRow(label: string, value: string, fontFamily: string): string {
  return (
    `<tr>` +
    `<td style="font-family:${fontFamily};font-size:12px;color:#000;padding:6px 12px 6px 0;font-weight:700;width:200px;vertical-align:top;">${escapeHtml(label)}</td>` +
    `<td style="font-family:${fontFamily};font-size:12px;color:#000;padding:6px 0;vertical-align:top;">${escapeHtml(value)}</td>` +
    `</tr>`
  );
}

function renderMetadataBlock(
  result: RefusalReasonI18nRollupResult,
  options: RefusalReasonI18nRollupHtmlPrintCoverSheetOptions,
  fontFamily: string,
): string {
  const rows: string[] = [];
  if (options.dateLabel) {
    rows.push(renderMetadataRow('Generated', options.dateLabel, fontFamily));
  }
  rows.push(
    renderMetadataRow(
      'Doses reviewed',
      `${result.coverage.doseCount}`,
      fontFamily,
    ),
  );
  rows.push(
    renderMetadataRow(
      'Suggested',
      `${result.coverage.suggestedCount} of ${result.coverage.doseCount}`,
      fontFamily,
    ),
  );
  if (typeof options.bodyPageCount === 'number') {
    rows.push(
      renderMetadataRow(
        'Body pages',
        `${options.bodyPageCount} following this cover sheet`,
        fontFamily,
      ),
    );
  }
  if (result.coverage.fallbackCount > 0) {
    rows.push(
      renderMetadataRow(
        'Locale fallbacks',
        `${result.coverage.fallbackCount} (suggestions rendered in English baseline)`,
        fontFamily,
      ),
    );
  }
  return (
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px auto 0 auto;border-collapse:collapse;width:80%;">` +
    `<tbody>${rows.join('')}</tbody>` +
    `</table>`
  );
}

interface SourceBreakdownEntry {
  source: RefusalReasonI18nKey;
  suggested: number;
  fallback: number;
}

function renderSourceBreakdown(
  result: RefusalReasonI18nRollupResult,
  fontFamily: string,
): { html: string; rowCount: number } {
  // Emit one row per source that has at least one suggestion.
  // Order: declared priority (npo-window first), not by count, so
  // the cover sheet stays the same shape across reviews.
  const entries: SourceBreakdownEntry[] = [];
  for (const src of SOURCE_PRIORITY) {
    const stats = result.coverage.bySource.get(src);
    if (!stats || stats.suggested === 0) continue;
    entries.push({ source: src, suggested: stats.suggested, fallback: stats.fallback });
  }
  if (entries.length === 0) {
    return {
      html:
        `<div style="font-family:${fontFamily};font-size:12px;color:#000;text-align:center;padding:24px 0;font-style:italic;">No suggestions in any source.</div>`,
      rowCount: 0,
    };
  }
  const rows = entries
    .map((e) => {
      const fallbackHint =
        e.fallback > 0 ? ` (${e.fallback} via English fallback)` : '';
      return (
        `<tr>` +
        `<td style="font-family:${fontFamily};font-size:12px;color:#000;padding:6px 12px 6px 0;font-weight:700;letter-spacing:0.04em;width:200px;">[${SOURCE_LABEL[e.source]}]</td>` +
        `<td style="font-family:${fontFamily};font-size:12px;color:#000;padding:6px 0;">${e.suggested} suggestion${e.suggested === 1 ? '' : 's'}${fallbackHint}</td>` +
        `</tr>`
      );
    })
    .join('');
  const html =
    `<div style="font-family:${fontFamily};text-align:center;margin-top:32px;">` +
    `<div style="font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#000;border-bottom:1px solid #000;padding-bottom:4px;display:inline-block;">Source breakdown</div>` +
    `</div>` +
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:12px auto 0 auto;border-collapse:collapse;width:80%;">` +
    `<tbody>${rows}</tbody>` +
    `</table>`;
  return { html, rowCount: entries.length };
}

function renderLocaleBreakdown(
  result: RefusalReasonI18nRollupResult,
  fontFamily: string,
): { html: string; rowCount: number } {
  const localeMap = new Map<string, number>();
  for (const s of result.suggestions) {
    if (!s.suggestion) continue;
    const locale = s.suggestion.locale;
    localeMap.set(locale, (localeMap.get(locale) ?? 0) + 1);
  }
  const entries = [...localeMap.entries()].sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    return { html: '', rowCount: 0 };
  }
  const rows = entries
    .map(
      ([locale, count]) =>
        `<tr>` +
        `<td style="font-family:${fontFamily};font-size:12px;color:#000;padding:4px 12px 4px 0;font-weight:700;width:200px;">${escapeHtml(locale)}</td>` +
        `<td style="font-family:${fontFamily};font-size:12px;color:#000;padding:4px 0;">${count} suggestion${count === 1 ? '' : 's'}</td>` +
        `</tr>`,
    )
    .join('');
  const html =
    `<div style="font-family:${fontFamily};text-align:center;margin-top:32px;">` +
    `<div style="font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#000;border-bottom:1px solid #000;padding-bottom:4px;display:inline-block;">Locale breakdown</div>` +
    `</div>` +
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:12px auto 0 auto;border-collapse:collapse;width:80%;">` +
    `<tbody>${rows}</tbody>` +
    `</table>`;
  return { html, rowCount: entries.length };
}

function renderSignatureBlock(
  lines: string[],
  fontFamily: string,
): string {
  const rows = lines
    .map(
      (label) =>
        `<tr>` +
        `<td style="font-family:${fontFamily};font-size:11px;color:#000;padding:24px 12px 4px 0;font-weight:700;width:160px;">${escapeHtml(label)}:</td>` +
        `<td style="font-family:${fontFamily};font-size:11px;color:#000;padding:24px 0 4px 0;border-bottom:1px solid #000;">&nbsp;</td>` +
        `</tr>`,
    )
    .join('');
  return (
    `<div style="font-family:${fontFamily};margin-top:64px;">` +
    `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#000;text-align:center;border-bottom:1px solid #000;padding-bottom:4px;margin-bottom:8px;">Reviewer attestation</div>` +
    `</div>` +
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;border-collapse:collapse;width:80%;">` +
    `<tbody>${rows}</tbody>` +
    `</table>`
  );
}

/**
 * Render a single-page HTML cover sheet for the print roster.
 *
 * The cover sheet is a standalone HTML fragment (no <html> or
 * <head>) suitable for splicing in front of the body's HTML
 * fragment when both go into a print preview window. Default
 * page-break-after:always makes the body start on page 2.
 *
 * Output is deterministic given the same result + options.
 */
export function renderRefusalReasonI18nRollupHtmlPrintCoverSheet(
  result: RefusalReasonI18nRollupResult,
  options: RefusalReasonI18nRollupHtmlPrintCoverSheetOptions = {},
): RefusalReasonI18nRollupHtmlPrintCoverSheet {
  const fontFamily =
    options.fontFamily ?? 'Georgia, "Times New Roman", Times, serif';
  const includeSignatureBlock = options.includeSignatureBlock ?? true;
  const signatureLines = options.signatureLines ?? DEFAULT_SIGNATURE_LINES;
  const pageBreakAfter = options.pageBreakAfter ?? true;

  const hero = renderHero(options.patientName, options.panelLabel, fontFamily);
  const metadata = renderMetadataBlock(result, options, fontFamily);
  const sourceBreakdown = renderSourceBreakdown(result, fontFamily);
  const localeBreakdown = renderLocaleBreakdown(result, fontFamily);
  const signature = includeSignatureBlock
    ? renderSignatureBlock(signatureLines, fontFamily)
    : '';

  const breakStyle = pageBreakAfter ? 'page-break-after:always;' : '';
  const html =
    `<section style="${breakStyle}font-family:${fontFamily};max-width:7.5in;margin:0 auto;padding:0;color:#000;">` +
    hero +
    metadata +
    sourceBreakdown.html +
    localeBreakdown.html +
    signature +
    `</section>`;

  return {
    html,
    sourceBreakdownRowCount: sourceBreakdown.rowCount,
    localeBreakdownRowCount: localeBreakdown.rowCount,
    signatureBlockIncluded: includeSignatureBlock,
  };
}

/**
 * Convenience: render the cover sheet AND splice it in front of an
 * existing print-body HTML fragment. The combined HTML is a single
 * standalone print packet: cover sheet page 1, body pages 2..N+1.
 */
export function renderRefusalReasonI18nRollupHtmlPrintWithCoverSheet(
  result: RefusalReasonI18nRollupResult,
  bodyHtml: string,
  options: RefusalReasonI18nRollupHtmlPrintCoverSheetOptions = {},
): string {
  const cover = renderRefusalReasonI18nRollupHtmlPrintCoverSheet(result, options);
  return cover.html + bodyHtml;
}
