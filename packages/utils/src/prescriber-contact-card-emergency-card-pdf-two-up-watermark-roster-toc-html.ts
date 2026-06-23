/**
 * Prescriber contact card emergency card PDF — two-up watermark
 * roster, table-of-contents HTML companion.
 *
 * `prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc`
 * emits a TOC page as a PDF block stream (document-title + specialty
 * + fallback-line + footer blocks) for the PDF renderer. Some
 * deployments don't have a PDF library wired up — the same TOC
 * page is wanted as a browser-print-preview HTML/CSS document.
 *
 * Real use cases:
 *
 *   - the clinic's browser-only print workflow (no PDF library
 *     installed) wants to scroll the TOC in a print-preview tab
 *     and hit Cmd-P;
 *   - the patient portal renders the same TOC inline for the
 *     household admin to scroll before printing;
 *   - the legal-records workflow archives the TOC as a single
 *     HTML file alongside the per-card vCards.
 *
 * This module is the HTML/CSS companion. It composes
 * buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc and translates
 * its TOC entries into a CSS-grid HTML fragment with @page CSS
 * for browser print preview without requiring a monospace font.
 *
 * Layout:
 *
 *   - one HTML document with embedded <style> for @page sizing
 *     and print rules;
 *   - <section> wraps the TOC body, mirroring the same
 *     specialty-group ordering and within-group sort as the PDF
 *     version;
 *   - each entry is a <div class="row"> with <span class="name">
 *     and <span class="page">;
 *   - watermark text rendered as a fixed-position overlay (matches
 *     the PDF watermark text content);
 *   - footer mirrors "TOC · N entries · Document M pages total".
 *
 * Pure / deterministic. No I/O. No remote URLs.
 *
 * Composes:
 *   - buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc
 */

import type { PrescriberEmergencyCard } from './prescriber-contact-card-emergency-card';
import type {
  EmergencyCardPdfTwoUpRosterTocEntry,
  EmergencyCardPdfTwoUpRosterWithTocOptions,
  EmergencyCardPdfTwoUpRosterWithTocResult,
} from './prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc';
import { buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc } from './prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc';

export interface EmergencyCardPdfTwoUpRosterTocHtmlOptions
  extends EmergencyCardPdfTwoUpRosterWithTocOptions {
  /**
   * Page size for @page CSS. Default 'Letter landscape' matching
   * the PDF version's two-up landscape sheet. 'A4 landscape' /
   * 'Letter portrait' / 'A4 portrait' / 'custom' supported.
   *
   * Distinct from the underlying PDF module's `pageSize`
   * ('letter' | 'a4') because the HTML @page rule needs the
   * orientation explicit.
   */
  htmlPageSize?: 'Letter landscape' | 'Letter portrait' | 'A4 landscape' | 'A4 portrait' | 'custom';
  /**
   * Custom page width in inches. Used when pageSize='custom'.
   */
  customPageWidthIn?: number;
  /**
   * Custom page height in inches. Used when pageSize='custom'.
   */
  customPageHeightIn?: number;
  /**
   * Override the font-family. Default print-friendly sans-serif.
   * NOT a monospace font (one of the key differences from the
   * PDF block output).
   */
  fontFamily?: string;
  /**
   * Include the watermark text as a fixed-position overlay across
   * the page. Default true (mirrors the PDF behaviour).
   */
  includeWatermarkOverlay?: boolean;
  /**
   * Wrap the fragment in a complete HTML document (<html>, <head>,
   * <body>). Default true. When false the fragment is just a
   * <style> + <section> pair suitable for splicing into a host
   * document.
   */
  wrapHtmlDocument?: boolean;
  /**
   * Optional document title (<title> tag). Default
   * "Emergency contact roster — table of contents".
   */
  documentTitle?: string;
}

export interface EmergencyCardPdfTwoUpRosterTocHtmlResult {
  /** Complete HTML fragment (with or without document wrapping). */
  html: string;
  /** Page size string actually applied to @page. */
  pageSizeApplied: string;
  /** TOC entries used to build the body (ordered as rendered). */
  tocEntries: EmergencyCardPdfTwoUpRosterTocEntry[];
  /** Mirror of the underlying batchId / generatedAt / totalPages. */
  batchId: string;
  generatedAt: Date;
  totalPages: number;
  totalCardCount: number;
}

const PAGE_SIZE_TO_CSS: Record<
  Exclude<EmergencyCardPdfTwoUpRosterTocHtmlOptions['htmlPageSize'], undefined | 'custom'>,
  string
> = {
  'Letter landscape': 'letter landscape',
  'Letter portrait': 'letter portrait',
  'A4 landscape': 'a4 landscape',
  'A4 portrait': 'a4 portrait',
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function titleCase(s: string): string {
  if (s.length === 0) return s;
  return s
    .split(/[\s-]+/)
    .map((w) => (w.length === 0 ? '' : w[0]!.toUpperCase() + w.slice(1)))
    .join(' ');
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function resolvePageSizeCss(
  options: EmergencyCardPdfTwoUpRosterTocHtmlOptions,
): string {
  const preset = options.htmlPageSize ?? 'Letter landscape';
  if (preset === 'custom') {
    const w = options.customPageWidthIn;
    const h = options.customPageHeightIn;
    if (typeof w !== 'number' || typeof h !== 'number' || w <= 0 || h <= 0) {
      throw new Error(
        "htmlPageSize='custom' requires positive customPageWidthIn + customPageHeightIn.",
      );
    }
    return `${w}in ${h}in`;
  }
  return PAGE_SIZE_TO_CSS[preset];
}

function buildTocBodyHtml(
  entries: EmergencyCardPdfTwoUpRosterTocEntry[],
  options: EmergencyCardPdfTwoUpRosterTocHtmlOptions,
  title: string,
  totalPages: number,
): string {
  const groupBySpecialty = options.tocGroupBySpecialty ?? true;
  const fallback = options.tocSpecialtyFallback ?? 'Other';

  const sectionParts: string[] = [];
  sectionParts.push(
    `<h1 class="toc-title">${escapeHtml(title)}</h1>`,
  );

  if (entries.length === 0) {
    sectionParts.push('<p class="toc-empty">No entries.</p>');
  } else {
    let lastGroupLabel: string | null = null;
    sectionParts.push('<div class="toc-body">');
    for (const e of entries) {
      const groupLabel = groupBySpecialty
        ? titleCase(e.specialty ?? fallback)
        : '';
      if (groupBySpecialty && groupLabel !== lastGroupLabel) {
        sectionParts.push(
          `<div class="toc-group-label">${escapeHtml(groupLabel.toUpperCase())}</div>`,
        );
        lastGroupLabel = groupLabel;
      }
      sectionParts.push(
        `<div class="toc-row">` +
          `<span class="toc-name">${escapeHtml(e.displayName)}</span>` +
          `<span class="toc-page">Page ${e.pageNumber}</span>` +
          `</div>`,
      );
    }
    sectionParts.push('</div>');
  }

  const footerText =
    `TOC \u00b7 ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} ` +
    `\u00b7 Document ${totalPages} ${totalPages === 1 ? 'page' : 'pages'} total`;
  sectionParts.push(`<footer class="toc-footer">${escapeHtml(footerText)}</footer>`);

  return sectionParts.join('');
}

function buildCss(
  options: EmergencyCardPdfTwoUpRosterTocHtmlOptions,
  pageSizeCss: string,
): string {
  const fontFamily =
    options.fontFamily ??
    "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  return (
    `@page { size: ${pageSizeCss}; margin: 0.5in; }` +
    `* { box-sizing: border-box; }` +
    `body { margin: 0; padding: 0; font-family: ${fontFamily}; color: #111827; background: #fff; }` +
    `.toc-wrapper { padding: 0.25in; max-width: 100%; }` +
    `.toc-title { font-size: 18pt; font-weight: 700; margin: 0 0 18pt 0; text-align: center; color: #111827; }` +
    `.toc-group-label { font-size: 10pt; font-weight: 700; color: #6b7280; margin-top: 14pt; margin-bottom: 6pt; letter-spacing: 0.08em; text-transform: uppercase; }` +
    `.toc-body { display: grid; grid-template-columns: 1fr; gap: 4pt; }` +
    `.toc-row { display: grid; grid-template-columns: 1fr auto; align-items: baseline; gap: 12pt; font-size: 10pt; }` +
    `.toc-name { font-weight: 500; }` +
    `.toc-page { color: #6b7280; font-variant-numeric: tabular-nums; }` +
    `.toc-empty { color: #6b7280; font-style: italic; }` +
    `.toc-footer { margin-top: 24pt; padding-top: 8pt; border-top: 1px solid #e5e7eb; font-size: 8pt; color: #6b7280; text-align: center; }` +
    `.toc-watermark { position: fixed; top: 0; left: 0; right: 0; bottom: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 1000; }` +
    `.toc-watermark > span { transform: rotate(-30deg); font-size: 96pt; color: rgba(220, 38, 38, 0.18); font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; }`
  );
}

function buildWatermarkOverlay(text: string | null): string {
  if (text === null || text.length === 0) return '';
  return `<div class="toc-watermark" aria-hidden="true"><span>${escapeHtml(text)}</span></div>`;
}

/**
 * Render the TOC page as a print-ready HTML/CSS document.
 *
 * Layouts the TOC entries using a CSS grid (sans-serif, no
 * monospace font requirement). Includes an @page rule sized to the
 * underlying PDF page (default Letter landscape matching the two-up
 * PDF roster). When the underlying TOC has a watermark, renders it
 * as a fixed-position overlay.
 *
 * Pure / deterministic.
 */
export function renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtml(
  emergencyCards: PrescriberEmergencyCard[],
  options: EmergencyCardPdfTwoUpRosterTocHtmlOptions = {},
): EmergencyCardPdfTwoUpRosterTocHtmlResult {
  const tocResult: EmergencyCardPdfTwoUpRosterWithTocResult =
    buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc(emergencyCards, options);

  const pageSizeCss = resolvePageSizeCss(options);
  const wrapDoc = options.wrapHtmlDocument ?? true;
  const includeWm = options.includeWatermarkOverlay ?? true;
  const docTitle =
    options.documentTitle ?? 'Emergency contact roster — table of contents';
  const tocTitle = options.tocTitle ?? docTitle;

  const watermarkText =
    includeWm && tocResult.tocPage.watermark
      ? tocResult.tocPage.watermark.text ?? null
      : null;

  const css = buildCss(options, pageSizeCss);
  const bodyHtml = buildTocBodyHtml(
    tocResult.tocEntries,
    options,
    tocTitle,
    tocResult.totalPages,
  );
  const wmHtml = buildWatermarkOverlay(watermarkText);

  // Optional inline meta strip with batchId + generatedAt for trace.
  const metaLine =
    `<div class="toc-meta" style="font-size:8pt;color:#6b7280;text-align:right;margin-top:-6pt;margin-bottom:8pt;">` +
    `Batch ${escapeHtml(tocResult.batchId)} \u00b7 Generated ${escapeHtml(isoDate(tocResult.generatedAt))}` +
    `</div>`;

  const wrapperOpen = `<section class="toc-wrapper">`;
  const wrapperClose = `</section>`;

  if (!wrapDoc) {
    return {
      html:
        `<style>${css}</style>` +
        wmHtml +
        wrapperOpen +
        metaLine +
        bodyHtml +
        wrapperClose,
      pageSizeApplied: pageSizeCss,
      tocEntries: tocResult.tocEntries,
      batchId: tocResult.batchId,
      generatedAt: tocResult.generatedAt,
      totalPages: tocResult.totalPages,
      totalCardCount: tocResult.totalCardCount,
    };
  }

  const html =
    `<!DOCTYPE html>` +
    `<html lang="en">` +
    `<head>` +
    `<meta charset="utf-8">` +
    `<title>${escapeHtml(docTitle)}</title>` +
    `<style>${css}</style>` +
    `</head>` +
    `<body>` +
    wmHtml +
    wrapperOpen +
    metaLine +
    bodyHtml +
    wrapperClose +
    `</body>` +
    `</html>`;

  return {
    html,
    pageSizeApplied: pageSizeCss,
    tocEntries: tocResult.tocEntries,
    batchId: tocResult.batchId,
    generatedAt: tocResult.generatedAt,
    totalPages: tocResult.totalPages,
    totalCardCount: tocResult.totalCardCount,
  };
}

/**
 * Convenience: render a stripped fragment with no document wrapping
 * for splicing into a host page.
 */
export function renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlFragment(
  emergencyCards: PrescriberEmergencyCard[],
  options: Omit<EmergencyCardPdfTwoUpRosterTocHtmlOptions, 'wrapHtmlDocument'> = {},
): EmergencyCardPdfTwoUpRosterTocHtmlResult {
  return renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtml(emergencyCards, {
    ...options,
    wrapHtmlDocument: false,
  });
}

/**
 * Convenience: one-line cron-log summary for the HTML TOC.
 *
 *   "Roster TOC HTML: 14 entries (Letter landscape; 8 total document pages)."
 */
export function summarizeRosterTocHtmlResult(
  result: EmergencyCardPdfTwoUpRosterTocHtmlResult,
): string {
  const e = result.tocEntries.length;
  return (
    `Roster TOC HTML: ${e} ${e === 1 ? 'entry' : 'entries'} ` +
    `(${result.pageSizeApplied}; ${result.totalPages} total document ${result.totalPages === 1 ? 'page' : 'pages'}).`
  );
}
