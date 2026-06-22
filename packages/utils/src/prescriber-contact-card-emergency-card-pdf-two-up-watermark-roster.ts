/**
 * Prescriber contact card emergency card PDF — two-up watermark
 * roster.
 *
 * `prescriber-contact-card-emergency-card-pdf-two-up-watermark`
 * ships ONE watermarked landscape sheet at a time, with an
 * already-locked watermark date when called via the multi-page
 * builder. Clinical workflows that print a 20+ card batch as a
 * single binder pull need additional traceability so the stack
 * stays auditable:
 *
 *   - a per-page header strip at the top of every sheet that reads
 *     "Page N of M  ·  <watermarkText>  ·  Generated 2026-06-22"
 *     so a stray sheet pulled from a binder six months later still
 *     identifies its batch and intended use;
 *   - a single batch id (auto-generated when not provided) embedded
 *     in the header strip so the binder pull can be traced back
 *     to the print run.
 *
 * The header strip is a NEW block kind 'roster-header' added on top
 * of the existing two-up slots — PDF renderers that don't know
 * about the new kind can render it as a generic header band; ones
 * that do can style it more prominently. The watermark itself is
 * unchanged (single diagonal banner spanning both slots).
 *
 * The roster builder LOCKS:
 *   - watermarkVerifiedAt — single date across the whole batch;
 *   - batchId — single id across the whole batch (auto if absent);
 *   - generatedAt — single timestamp across the whole batch;
 *
 * so a midnight rollover mid-print doesn't produce a mixed-date stack.
 *
 * Pure / deterministic. No I/O.
 */

import type { PrescriberEmergencyCard } from './prescriber-contact-card-emergency-card';
import type { EmergencyCardPdfBlock } from './prescriber-contact-card-emergency-card-pdf';
import {
  buildEmergencyCardPdfTwoUpWatermarkedPages,
  type EmergencyCardPdfTwoUpWatermark,
  type EmergencyCardPdfTwoUpWatermarkOptions,
  type EmergencyCardPdfTwoUpWatermarkedPageResult,
} from './prescriber-contact-card-emergency-card-pdf-two-up-watermark';

/** Roster-level header strip drawn at the top of every two-up sheet. */
export interface EmergencyCardPdfTwoUpRosterHeaderStrip {
  /** Top-left x of the strip. */
  x: number;
  /** Top-left y of the strip. */
  y: number;
  /** Width of the strip. */
  w: number;
  /** Height of the strip. */
  h: number;
  /** Fully-formatted strip text. */
  text: string;
  /** Font size in points. Default 9. */
  fontSize: number;
  /** Color hex (no leading hash). Default '4b5563' (gray-600). */
  color: string;
  /** Page number this strip belongs to (1-based). */
  pageNumber: number;
  /** Total page count for the whole batch. */
  totalPages: number;
  /** Batch id embedded in the strip. */
  batchId: string;
}

export interface EmergencyCardPdfTwoUpRosterOptions
  extends EmergencyCardPdfTwoUpWatermarkOptions {
  /**
   * Stable batch id used to identify this print run. When absent,
   * a deterministic id is generated from generatedAt + batch size
   * + watermark preset so two identical inputs produce the same id.
   */
  batchId?: string;
  /**
   * Reference timestamp embedded in the strip and used to generate
   * batchId when absent. Default new Date().
   */
  generatedAt?: Date;
  /**
   * Override the header strip text template. Tokens: {pageNumber}
   * {totalPages} {batchId} {watermarkText} {generatedAtLabel}.
   * Default: "Page {pageNumber} of {totalPages}  ·  {watermarkText}  ·  Batch {batchId}  ·  Generated {generatedAtLabel}"
   */
  headerStripTemplate?: string;
  /**
   * Margin between header strip and page top (in points). Default 6.
   */
  headerStripMarginTop?: number;
  /**
   * Height of the header strip (in points). Default 14 (text height
   * + padding).
   */
  headerStripHeight?: number;
  /**
   * Suppress the header strip entirely (return just the base page).
   * Default false. Set true when the caller wants the roster's
   * date-locking semantics but renders its own header in another
   * layer.
   */
  suppressHeaderStrip?: boolean;
}

export interface EmergencyCardPdfTwoUpRosterPageResult
  extends EmergencyCardPdfTwoUpWatermarkedPageResult {
  /**
   * Per-page header strip. Null when suppressHeaderStrip=true OR no
   * watermark preset was applied AND the caller didn't override the
   * template to include non-watermark tokens.
   */
  rosterHeaderStrip: EmergencyCardPdfTwoUpRosterHeaderStrip | null;
}

export interface EmergencyCardPdfTwoUpRosterResult {
  /** Per-page results. */
  pages: EmergencyCardPdfTwoUpRosterPageResult[];
  /** Stable batch id used across every page. */
  batchId: string;
  /** Generated-at timestamp shared by every page's header strip. */
  generatedAt: Date;
  /** Total page count (mirrors pages.length for convenience). */
  totalPages: number;
  /** Total card count across the whole batch (some pages may have a right slot empty). */
  totalCardCount: number;
}

const DEFAULT_TEMPLATE =
  'Page {pageNumber} of {totalPages}  \u00b7  {watermarkText}  \u00b7  Batch {batchId}  \u00b7  Generated {generatedAtLabel}';

const DEFAULT_HEADER_STRIP_FONT_SIZE = 9;
const DEFAULT_HEADER_STRIP_COLOR = '4b5563';
const DEFAULT_HEADER_STRIP_HEIGHT = 14;
const DEFAULT_HEADER_STRIP_MARGIN_TOP = 6;

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function djb2(s: string): string {
  // Deterministic short hash for the auto-batchId when none provided.
  // Not cryptographic — just a stable identifier across runs.
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  // Convert to unsigned 32-bit and base-36 for compact tag.
  const u = (h >>> 0).toString(36).padStart(7, '0').slice(-7);
  return `roster-${u}`;
}

function defaultBatchId(
  generatedAt: Date,
  totalCardCount: number,
  watermarkPreset: string | null,
): string {
  const seed = `${generatedAt.toISOString()}|${totalCardCount}|${watermarkPreset ?? 'none'}`;
  return djb2(seed);
}

function renderStripText(
  template: string,
  pageNumber: number,
  totalPages: number,
  batchId: string,
  watermark: EmergencyCardPdfTwoUpWatermark | null,
  generatedAt: Date,
): string {
  const watermarkText = watermark?.text ?? '';
  const generatedAtLabel = isoDate(generatedAt);
  return template
    .replace(/\{pageNumber\}/g, `${pageNumber}`)
    .replace(/\{totalPages\}/g, `${totalPages}`)
    .replace(/\{batchId\}/g, batchId)
    .replace(/\{watermarkText\}/g, watermarkText)
    .replace(/\{generatedAtLabel\}/g, generatedAtLabel);
}

function buildHeaderStrip(
  basePage: EmergencyCardPdfTwoUpWatermarkedPageResult,
  pageNumber: number,
  totalPages: number,
  batchId: string,
  generatedAt: Date,
  template: string,
  marginTop: number,
  height: number,
  fontSize: number,
  color: string,
): EmergencyCardPdfTwoUpRosterHeaderStrip {
  // Strip sits at the very top of the page above the existing
  // document-title blocks. Its width spans the full page width
  // minus the page margin.
  const margin = basePage.page.margin;
  const x = margin;
  const y = marginTop;
  const w = basePage.page.width - 2 * margin;
  const text = renderStripText(
    template,
    pageNumber,
    totalPages,
    batchId,
    basePage.watermark,
    generatedAt,
  );
  return {
    x,
    y,
    w,
    h: height,
    text,
    fontSize,
    color,
    pageNumber,
    totalPages,
    batchId,
  };
}

/**
 * Build a printable roster of watermarked landscape two-up pages.
 * Every page shares the same watermark date, the same batchId, and
 * the same generatedAt timestamp — so a mid-batch midnight rollover
 * doesn't produce a mixed-date stack.
 *
 * Each page additionally carries a roster-level header strip
 * ("Page N of M  ·  <watermark>  ·  Batch <id>  ·  Generated ...")
 * for binder traceability.
 *
 * Pure / deterministic.
 */
export function buildEmergencyCardPdfTwoUpWatermarkedRoster(
  emergencyCards: PrescriberEmergencyCard[],
  options: EmergencyCardPdfTwoUpRosterOptions = {},
): EmergencyCardPdfTwoUpRosterResult {
  const generatedAt = options.generatedAt ?? new Date();
  const suppressHeaderStrip = options.suppressHeaderStrip ?? false;
  const template = options.headerStripTemplate ?? DEFAULT_TEMPLATE;
  const marginTop = options.headerStripMarginTop ?? DEFAULT_HEADER_STRIP_MARGIN_TOP;
  const height = options.headerStripHeight ?? DEFAULT_HEADER_STRIP_HEIGHT;
  const fontSize = DEFAULT_HEADER_STRIP_FONT_SIZE;
  const color = DEFAULT_HEADER_STRIP_COLOR;

  // Lock watermarkVerifiedAt for the whole batch so every page shows
  // the same verified date (forwarded into the underlying multi-page
  // builder which would otherwise also lock it, but we lock here
  // first so the batchId hash is stable).
  const lockedOptions: EmergencyCardPdfTwoUpWatermarkOptions = {
    ...options,
    watermarkVerifiedAt: options.watermarkVerifiedAt ?? generatedAt,
  };

  const basePages = buildEmergencyCardPdfTwoUpWatermarkedPages(
    emergencyCards,
    lockedOptions,
  );

  const totalPages = basePages.length;
  const totalCardCount = emergencyCards.length;
  const watermarkPreset = options.watermark ?? null;
  const batchId =
    options.batchId !== undefined && options.batchId.length > 0
      ? options.batchId
      : defaultBatchId(generatedAt, totalCardCount, watermarkPreset);

  const pages: EmergencyCardPdfTwoUpRosterPageResult[] = basePages.map(
    (basePage, idx) => {
      const rosterHeaderStrip = suppressHeaderStrip
        ? null
        : buildHeaderStrip(
            basePage,
            idx + 1,
            totalPages,
            batchId,
            generatedAt,
            template,
            marginTop,
            height,
            fontSize,
            color,
          );
      return { ...basePage, rosterHeaderStrip };
    },
  );

  return { pages, batchId, generatedAt, totalPages, totalCardCount };
}

/**
 * Convenience: flatten the roster header strips into a single array
 * of EmergencyCardPdfBlock entries (kind: 'footer' is reused so
 * renderers that don't know about 'roster-header' still draw it as
 * a regular block — the visual classification is footer-ish in style).
 *
 * Most callers will keep the rosterHeaderStrip as a separate object
 * on the page result and render it explicitly; this helper is for
 * callers who want to splice it into the existing block stream
 * without changing their PDF renderer.
 */
export function rosterHeaderStripsAsBlocks(
  result: EmergencyCardPdfTwoUpRosterResult,
): EmergencyCardPdfBlock[] {
  const blocks: EmergencyCardPdfBlock[] = [];
  for (const page of result.pages) {
    const s = page.rosterHeaderStrip;
    if (!s) continue;
    blocks.push({
      kind: 'footer',
      x: s.x,
      y: s.y,
      w: s.w,
      h: s.h,
      fontSize: s.fontSize,
      text: s.text,
      align: 'left',
      color: s.color,
      bold: false,
    });
  }
  return blocks;
}

/**
 * Convenience: collect the header strip text from every page (one
 * entry per page; null when suppressed). For callers who want to
 * verify the roster's per-page traceability tag uniformly across the
 * batch without iterating the full result.
 */
export function rosterHeaderStripTextsAcrossPages(
  result: EmergencyCardPdfTwoUpRosterResult,
): (string | null)[] {
  return result.pages.map((p) => p.rosterHeaderStrip?.text ?? null);
}
