/**
 * Prescriber contact card emergency card PDF — two-up watermark
 * roster, table-of-contents PRINT-ONLY variant.
 *
 * `prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc`
 * builds a TOC page + N roster pages as a combined document. When
 * a clinician is auditing the binder index (or photocopying a TOC
 * for a colleague), they don't want to re-print every card — just
 * the TOC. Printing 47 cards as a sanity check when all you wanted
 * was the index wastes a stack of paper AND a stack of toner.
 *
 * This module is the print-only TOC variant. It composes
 * buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc but returns
 * ONLY the TOC page (page 0 in the combined document). The TOC's
 * page header / watermark / footer are re-derived so the page
 * stands alone as a single-page document:
 *
 *   - the header strip says "Page 1 of 1" instead of
 *     "Page 1 of N+1" so the standalone print is internally
 *     consistent;
 *   - the footer says "TOC · N entries · Index only" instead of
 *     "Document M pages total" so a clinician scanning the
 *     printout knows they're holding the index, not a partial
 *     copy of the binder;
 *   - the per-entry page numbers stay pointing at where the cards
 *     LIVE in the underlying binder (Page 3, Page 5...) so the
 *     index is still useful as a binder-lookup reference.
 *
 * The TOC content + watermark + specialty grouping all mirror the
 * combined-document TOC exactly — we just strip the rest of the
 * document.
 *
 * Pure / deterministic. No I/O.
 *
 * Composes:
 *   - buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc
 */

import type { PrescriberEmergencyCard } from './prescriber-contact-card-emergency-card';
import type { EmergencyCardPdfBlock } from './prescriber-contact-card-emergency-card-pdf';
import type {
  EmergencyCardPdfTwoUpRosterTocEntry,
  EmergencyCardPdfTwoUpRosterTocPage,
  EmergencyCardPdfTwoUpRosterWithTocOptions,
} from './prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc';
import { buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc } from './prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc';

export type EmergencyCardPdfTwoUpRosterTocPrintOnlyOptions =
  EmergencyCardPdfTwoUpRosterWithTocOptions;

export interface EmergencyCardPdfTwoUpRosterTocPrintOnlyResult {
  /** The single TOC page (page 1 of 1 in this standalone document). */
  tocPage: EmergencyCardPdfTwoUpRosterTocPage;
  /** TOC entries (mirrors the combined-doc shape). */
  tocEntries: EmergencyCardPdfTwoUpRosterTocEntry[];
  /** Mirror of the underlying batchId. */
  batchId: string;
  /** Mirror of the underlying generatedAt. */
  generatedAt: Date;
  /**
   * Total card count in the source roster (cards still live in the
   * binder; this number is for the standalone-print footer and the
   * TOC summary).
   */
  totalCardCount: number;
  /**
   * The COMBINED document's total page count (TOC + roster pages).
   * Preserved here for callers who want to compose the print-only
   * variant with a "you are looking at the index for an N-page
   * binder" hint.
   */
  combinedDocumentPageCount: number;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Build the print-only TOC.
 *
 * Steps:
 *   1. Build the combined document via
 *      buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc.
 *   2. Re-derive the TOC page's header strip text to say
 *      "Page 1 of 1" (not "Page 1 of N+1") so the standalone
 *      printout is internally consistent.
 *   3. Re-derive the footer block in the TOC page's blocks to say
 *      "TOC · N entries · Index only (binder spans N+1 pages)"
 *      so the clinician knows they're holding only the index.
 *
 * Pure / deterministic.
 */
export function buildEmergencyCardPdfTwoUpWatermarkedRosterTocPrintOnly(
  emergencyCards: PrescriberEmergencyCard[],
  options: EmergencyCardPdfTwoUpRosterTocPrintOnlyOptions = {},
): EmergencyCardPdfTwoUpRosterTocPrintOnlyResult {
  const combined = buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc(
    emergencyCards,
    options,
  );

  const originalTocPage = combined.tocPage;
  const combinedPageCount = combined.totalPages;
  const entries = combined.tocEntries;

  // 1. Re-derive the header strip to "Page 1 of 1".
  const headerStrip = originalTocPage.rosterHeaderStrip;
  let rebuiltHeaderStrip = headerStrip;
  if (headerStrip !== null) {
    rebuiltHeaderStrip = {
      ...headerStrip,
      pageNumber: 1,
      totalPages: 1,
      text: headerStrip.text.replace(/Page \d+ of \d+/, 'Page 1 of 1'),
    };
  }

  // 2. Re-derive the footer block. The combined-doc TOC has a
  //    footer with kind='footer' as the LAST block; replace it.
  const rebuiltBlocks: EmergencyCardPdfBlock[] = originalTocPage.blocks.map(
    (block) => {
      if (block.kind !== 'footer') return block;
      const entryCount = entries.length;
      const binderSpan = combinedPageCount;
      const indexOnlyText =
        `TOC \u00b7 ${entryCount} ${entryCount === 1 ? 'entry' : 'entries'} \u00b7 ` +
        `Index only (binder spans ${binderSpan} ${binderSpan === 1 ? 'page' : 'pages'})`;
      return { ...block, text: indexOnlyText };
    },
  );

  // 3. Defensive: if there was no footer block in the source TOC
  //    (very unusual but possible if a future caller passes a
  //    custom block stream), synthesise one so the print-only
  //    output always has the "Index only" hint.
  const hasFooter = rebuiltBlocks.some((b) => b.kind === 'footer');
  if (!hasFooter) {
    const entryCount = entries.length;
    const binderSpan = combinedPageCount;
    rebuiltBlocks.push({
      kind: 'footer',
      x: originalTocPage.page.margin,
      y: originalTocPage.page.height - originalTocPage.page.margin - 10,
      w: originalTocPage.page.width - 2 * originalTocPage.page.margin,
      h: 10,
      fontSize: 8,
      text:
        `TOC \u00b7 ${entryCount} ${entryCount === 1 ? 'entry' : 'entries'} \u00b7 ` +
        `Index only (binder spans ${binderSpan} ${binderSpan === 1 ? 'page' : 'pages'})`,
      align: 'center',
      color: '6b7280',
      bold: false,
    });
  }

  const rebuiltTocPage: EmergencyCardPdfTwoUpRosterTocPage = {
    ...originalTocPage,
    blocks: rebuiltBlocks,
    rosterHeaderStrip: rebuiltHeaderStrip,
  };

  return {
    tocPage: rebuiltTocPage,
    tocEntries: entries,
    batchId: combined.batchId,
    generatedAt: combined.generatedAt,
    totalCardCount: combined.totalCardCount,
    combinedDocumentPageCount: combinedPageCount,
  };
}

/**
 * Convenience: returns the rendered footer text for callers who
 * want to display "Index only (binder spans 8 pages)" outside the
 * PDF block stream (e.g. in a UI preview banner).
 */
export function renderPrintOnlyTocFooterText(
  result: EmergencyCardPdfTwoUpRosterTocPrintOnlyResult,
): string {
  const n = result.tocEntries.length;
  const span = result.combinedDocumentPageCount;
  return (
    `TOC \u00b7 ${n} ${n === 1 ? 'entry' : 'entries'} \u00b7 ` +
    `Index only (binder spans ${span} ${span === 1 ? 'page' : 'pages'})`
  );
}

/**
 * Convenience: a one-line summary for the cron log.
 *
 *   "Roster TOC print-only: 14 entries; binder spans 8 pages (Batch ABC-123 generated 2026-06-22)."
 */
export function summarizeRosterTocPrintOnlyResult(
  result: EmergencyCardPdfTwoUpRosterTocPrintOnlyResult,
): string {
  const n = result.tocEntries.length;
  const span = result.combinedDocumentPageCount;
  return (
    `Roster TOC print-only: ${n} ${n === 1 ? 'entry' : 'entries'}; ` +
    `binder spans ${span} ${span === 1 ? 'page' : 'pages'} ` +
    `(Batch ${result.batchId} generated ${isoDate(result.generatedAt)}).`
  );
}
