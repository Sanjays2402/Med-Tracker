/**
 * Refusal reason suggest i18n rollup HTML print cover sheet —
 * binder-spine BATCH layout.
 *
 * `refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine`
 * renders ONE spine label per HTML fragment on its own page. Real
 * sticker-paper printers don't print one sticker per sheet — they
 * print N stickers on an 8.5x11" (or A4) sticker sheet. A typical
 * sticker-paper layout is:
 *
 *   - 10 spine labels per sheet on common 8.5x11 stock (Avery
 *     5160-style label paper, 1" x 2.6" per label);
 *   - 30 labels per sheet on smaller-format stock;
 *   - flexible NxM grid sized to the binder-spine geometry.
 *
 * A clinic printing N binder spines at once (after a Q3 review,
 * when 20+ new binders go on the shelf) wants all N spines on ONE
 * sticker sheet, not N separate pages.
 *
 * This module is the multi-spine layout. It composes
 * renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine and
 * arranges N spines in a CSS grid sized to the sticker sheet
 * geometry. Default 8.5x11" letter sheet with 1cm margins; 3.5x1.5cm
 * spine labels — comes out to a 5x6 grid (30 spines per sheet)
 * which fits most clinical-records sticker stock.
 *
 * Output is a single HTML fragment per SHEET. When N exceeds the
 * sheet capacity, the fragment paginates (page-break-before on each
 * subsequent sheet) and emits a multi-sheet block.
 *
 * Pure / deterministic. No I/O. No remote URLs.
 *
 * Composes:
 *   - renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine
 */

import type { RefusalReasonI18nRollupResult } from './refusal-reason-suggest-i18n-rollup';
import type {
  BinderSpineSizePreset,
  RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineOptions,
  RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine,
} from './refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine';
import { renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine } from './refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine';

export type SpineBatchSheetPreset = 'us-letter' | 'a4' | 'custom';

export interface RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatchEntry {
  /** Patient name printed vertically on the spine. */
  patientName: string;
  /** Optional date label. */
  dateLabel?: string;
  /** Optional panel label. */
  panelLabel?: string;
  /** Per-patient rollup result, used by includePanelSize. */
  result: RefusalReasonI18nRollupResult;
}

export interface RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatchOptions
  extends Omit<
    RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineOptions,
    'patientName' | 'dateLabel' | 'panelLabel' | 'pageBreakBefore'
  > {
  /** Sheet size preset. Default 'us-letter' (8.5x11 inches). */
  sheetPreset?: SpineBatchSheetPreset;
  /** Custom sheet width in cm. Used when sheetPreset='custom'. */
  customSheetWidthCm?: number;
  /** Custom sheet height in cm. Used when sheetPreset='custom'. */
  customSheetHeightCm?: number;
  /**
   * Page margin in cm on all four sides. Default 1.0cm. Sticker-paper
   * stock typically requires a small print-safe margin.
   */
  sheetMarginCm?: number;
  /**
   * Horizontal gap between spines in cm. Default 0.4cm so the cut
   * lines are clearly separated.
   */
  spineGapHorizontalCm?: number;
  /**
   * Vertical gap between spines in cm. Default 0.4cm.
   */
  spineGapVerticalCm?: number;
  /**
   * Force a specific number of columns. By default columns are
   * computed from the spine size + sheet size + gap. Useful when
   * a clinic has fixed-stock paper that requires e.g. exactly 3
   * columns per sheet.
   */
  forceColumns?: number;
  /**
   * Force a specific number of rows per sheet. Default computed.
   */
  forceRows?: number;
}

export interface RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatchSheet {
  /** HTML fragment for this sheet. */
  html: string;
  /** Spine count placed on this sheet. */
  spineCount: number;
  /** Sheet number (1-based). */
  sheetNumber: number;
  /** Total sheets in the batch. */
  totalSheets: number;
}

export interface RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatch {
  /** One sheet per sheet (page-break-before on each after the first). */
  sheets: RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatchSheet[];
  /** Combined HTML fragment (all sheets concatenated). */
  html: string;
  /** Sheet width in cm actually used. */
  sheetWidthCm: number;
  /** Sheet height in cm actually used. */
  sheetHeightCm: number;
  /** Columns per sheet. */
  columnsPerSheet: number;
  /** Rows per sheet. */
  rowsPerSheet: number;
  /** Spines per sheet (columns * rows). */
  spinesPerSheet: number;
  /** Total spines emitted across all sheets. */
  totalSpines: number;
}

const SHEET_PRESETS: Record<Exclude<SpineBatchSheetPreset, 'custom'>, { w: number; h: number }> = {
  // 8.5 x 11 inches = 21.59 x 27.94 cm
  'us-letter': { w: 21.59, h: 27.94 },
  // A4 = 21.0 x 29.7 cm
  'a4': { w: 21.0, h: 29.7 },
};

const SIZE_PRESETS: Record<Exclude<BinderSpineSizePreset, 'custom'>, { w: number; h: number }> = {
  '3.5x1.5cm': { w: 3.5, h: 1.5 },
  '5x2cm': { w: 5, h: 2 },
  '2.5x1cm': { w: 2.5, h: 1 },
};

function resolveSpineSize(
  options: RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatchOptions,
): { w: number; h: number } {
  const preset = options.sizePreset ?? '3.5x1.5cm';
  if (preset === 'custom') {
    const w = options.customWidthCm;
    const h = options.customHeightCm;
    if (typeof w !== 'number' || typeof h !== 'number' || w <= 0 || h <= 0) {
      throw new Error(
        "sizePreset='custom' requires positive customWidthCm + customHeightCm.",
      );
    }
    return { w, h };
  }
  return SIZE_PRESETS[preset];
}

function resolveSheetSize(
  options: RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatchOptions,
): { w: number; h: number } {
  const preset = options.sheetPreset ?? 'us-letter';
  if (preset === 'custom') {
    const w = options.customSheetWidthCm;
    const h = options.customSheetHeightCm;
    if (typeof w !== 'number' || typeof h !== 'number' || w <= 0 || h <= 0) {
      throw new Error(
        "sheetPreset='custom' requires positive customSheetWidthCm + customSheetHeightCm.",
      );
    }
    return { w, h };
  }
  return SHEET_PRESETS[preset];
}

/**
 * Render N binder-spine labels on one or more sticker sheets.
 *
 * Lays out spines on a CSS grid sized to fit the sheet's printable
 * area (sheet - margins). When N exceeds the sheet capacity, the
 * fragment paginates onto additional sheets (page-break-before on
 * each after the first).
 *
 * Pure / deterministic.
 */
export function renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatch(
  entries: RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatchEntry[],
  options: RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatchOptions = {},
): RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatch {
  const spineSize = resolveSpineSize(options);
  const sheetSize = resolveSheetSize(options);
  const margin = options.sheetMarginCm ?? 1.0;
  const gapH = options.spineGapHorizontalCm ?? 0.4;
  const gapV = options.spineGapVerticalCm ?? 0.4;
  const printableW = sheetSize.w - 2 * margin;
  const printableH = sheetSize.h - 2 * margin;

  // Auto-compute columns + rows from sheet + spine + gap.
  // Each spine occupies spineSize.w + gapH horizontally (except the
  // last in a row, which has no trailing gap). The same math applies
  // vertically. We allow trailing partial columns/rows to fit the
  // remaining space.
  const autoCols = Math.max(
    1,
    Math.floor((printableW + gapH) / (spineSize.w + gapH)),
  );
  const autoRows = Math.max(
    1,
    Math.floor((printableH + gapV) / (spineSize.h + gapV)),
  );
  const columnsPerSheet = options.forceColumns ?? autoCols;
  const rowsPerSheet = options.forceRows ?? autoRows;
  const spinesPerSheet = columnsPerSheet * rowsPerSheet;

  // Validate forced layouts fit.
  if (columnsPerSheet < 1 || rowsPerSheet < 1) {
    throw new Error('columns and rows must be >= 1.');
  }
  if (
    options.forceColumns !== undefined &&
    columnsPerSheet * spineSize.w + (columnsPerSheet - 1) * gapH > printableW + 0.001
  ) {
    throw new Error(
      `forceColumns=${columnsPerSheet} does not fit in printable width ${printableW.toFixed(2)}cm.`,
    );
  }
  if (
    options.forceRows !== undefined &&
    rowsPerSheet * spineSize.h + (rowsPerSheet - 1) * gapV > printableH + 0.001
  ) {
    throw new Error(
      `forceRows=${rowsPerSheet} does not fit in printable height ${printableH.toFixed(2)}cm.`,
    );
  }

  // Build per-spine HTML and tile into sheets.
  // Each spine's outer fragment includes page-break-before by default;
  // we have to suppress that for spines that aren't first on a sheet.
  // We always emit the spine WITHOUT page-break-before (we wrap the
  // grid in a sheet container with our own page-break logic).
  const totalSpines = entries.length;
  const totalSheets =
    totalSpines === 0 ? 1 : Math.ceil(totalSpines / spinesPerSheet);

  const sheets: RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatchSheet[] = [];

  for (let sheetIdx = 0; sheetIdx < totalSheets; sheetIdx++) {
    const startEntry = sheetIdx * spinesPerSheet;
    const endEntry = Math.min(startEntry + spinesPerSheet, totalSpines);
    const sheetEntries = entries.slice(startEntry, endEntry);

    // Build each spine on this sheet.
    const spineFragments: string[] = [];
    for (const entry of sheetEntries) {
      const spineOptions: RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineOptions = {
        ...options,
        patientName: entry.patientName,
        pageBreakBefore: false, // we paginate at the SHEET level
      };
      if (entry.dateLabel !== undefined) spineOptions.dateLabel = entry.dateLabel;
      if (entry.panelLabel !== undefined) spineOptions.panelLabel = entry.panelLabel;
      const spine: RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine =
        renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine(entry.result, spineOptions);
      // Wrap each spine in a grid cell box (no extra padding;
      // the spine's own container already enforces its size).
      spineFragments.push(`<div style="display:inline-block;margin:0;padding:0;">${spine.html}</div>`);
    }

    // Sheet wrapper: A grid with explicit columns + gap; page-break-before
    // on sheets after the first.
    const pageBreakStyle = sheetIdx === 0 ? '' : 'page-break-before:always;';
    const sheetStyle =
      `${pageBreakStyle}` +
      `display:grid;` +
      `grid-template-columns:repeat(${columnsPerSheet}, ${spineSize.w}cm);` +
      `grid-template-rows:repeat(${rowsPerSheet}, ${spineSize.h}cm);` +
      `column-gap:${gapH}cm;` +
      `row-gap:${gapV}cm;` +
      `width:${printableW}cm;` +
      `height:${printableH}cm;` +
      `margin:${margin}cm;` +
      `padding:0;` +
      `box-sizing:border-box;` +
      `background:#fff;`;

    const sheetHtml = `<section style="${sheetStyle}">${spineFragments.join('')}</section>`;
    sheets.push({
      html: sheetHtml,
      spineCount: sheetEntries.length,
      sheetNumber: sheetIdx + 1,
      totalSheets,
    });
  }

  const html = sheets.map((s) => s.html).join('');

  return {
    sheets,
    html,
    sheetWidthCm: sheetSize.w,
    sheetHeightCm: sheetSize.h,
    columnsPerSheet,
    rowsPerSheet,
    spinesPerSheet,
    totalSpines,
  };
}

/**
 * Convenience: compute the spine capacity for a given sheet + spine
 * geometry without actually rendering anything. For UI previews
 * that want to display "your batch of 47 spines will need 2 sheets"
 * before the user commits to print.
 */
export function computeSpineBatchCapacity(
  options: RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatchOptions,
): {
  columnsPerSheet: number;
  rowsPerSheet: number;
  spinesPerSheet: number;
} {
  const spineSize = resolveSpineSize(options);
  const sheetSize = resolveSheetSize(options);
  const margin = options.sheetMarginCm ?? 1.0;
  const gapH = options.spineGapHorizontalCm ?? 0.4;
  const gapV = options.spineGapVerticalCm ?? 0.4;
  const printableW = sheetSize.w - 2 * margin;
  const printableH = sheetSize.h - 2 * margin;
  const autoCols = Math.max(
    1,
    Math.floor((printableW + gapH) / (spineSize.w + gapH)),
  );
  const autoRows = Math.max(
    1,
    Math.floor((printableH + gapV) / (spineSize.h + gapV)),
  );
  const columnsPerSheet = options.forceColumns ?? autoCols;
  const rowsPerSheet = options.forceRows ?? autoRows;
  return {
    columnsPerSheet,
    rowsPerSheet,
    spinesPerSheet: columnsPerSheet * rowsPerSheet,
  };
}

/**
 * Convenience: a one-line summary for the cron log / UI preview.
 *
 *   "Spine batch: 47 spines on 2 sheets (30 per sheet, 5x6 grid)."
 */
export function summarizeSpineBatchLayout(
  result: RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatch,
): string {
  const t = result.totalSpines;
  const s = result.sheets.length;
  return (
    `Spine batch: ${t} ${t === 1 ? 'spine' : 'spines'} on ${s} ${s === 1 ? 'sheet' : 'sheets'} ` +
    `(${result.spinesPerSheet} per sheet, ${result.columnsPerSheet}x${result.rowsPerSheet} grid).`
  );
}
