/**
 * Prescriber contact card emergency card PDF — two-up watermark.
 *
 * `prescriber-contact-card-emergency-card-pdf-two-up` ships the
 * landscape A4 / Letter two-card layout. Healthcare workflows
 * frequently need to mark a printed copy with a status banner that
 * cuts across the entire physical sheet:
 *
 *   - "DRAFT" — for in-progress revisions still under prescriber
 *     review;
 *   - "VERIFIED YYYY-MM-DD" — for the legal-records copy in the
 *     patient binder that proves a check was done that day;
 *   - "ICU COPY" — for the high-acuity setting where the binder is
 *     pulled from a wall pocket beside the bed and shouldn't be
 *     confused with a generic patient copy;
 *   - "DO NOT FAX" / "CONTROLLED" / custom — for compliance-driven
 *     overlay markers.
 *
 * This module wraps buildEmergencyCardPdfTwoUpPage(s) and adds a
 * single diagonal watermark BLOCK whose coordinates span the entire
 * landscape sheet. The watermark is placed in a separate
 * `watermark` field on the page result (not inside left.blocks /
 * right.blocks) so the caller's PDF library can render it AFTER
 * the per-slot blocks — drawing it on top of the cards with
 * configurable opacity. Parallel design to the future single-up
 * watermark module (#144).
 *
 * The watermark spans BOTH slots because the half-page slots share
 * a single physical sheet — a per-slot watermark would render two
 * separate banners with a visible discontinuity at the gutter,
 * defeating the visual signal. Single-banner across both slots is
 * also what every clinical-records "DRAFT" stamp does in practice.
 *
 * Pure / deterministic. No I/O.
 */

import type { PrescriberEmergencyCard } from './prescriber-contact-card-emergency-card';
import {
  buildEmergencyCardPdfTwoUpPage,
  buildEmergencyCardPdfTwoUpPages,
  type EmergencyCardPdfTwoUpOptions,
  type EmergencyCardPdfTwoUpPageResult,
} from './prescriber-contact-card-emergency-card-pdf-two-up';

/**
 * A diagonal watermark drawn on top of the two-up sheet. The PDF
 * library uses (x, y) as the centre of the text run, rotates by
 * `rotationDegrees`, and applies `opacity` (0..1) for translucency.
 */
export interface EmergencyCardPdfTwoUpWatermark {
  /** Text rendered (e.g. "DRAFT", "VERIFIED 2026-06-22", "ICU COPY"). */
  text: string;
  /** Centre x of the watermark text run. */
  x: number;
  /** Centre y of the watermark text run. */
  y: number;
  /** Rotation in degrees. Negative values rotate counter-clockwise. Default -30 (lower-left to upper-right). */
  rotationDegrees: number;
  /** Font size (in PDF points). Default 96pt for landscape two-up. */
  fontSize: number;
  /** RGB hex color of the watermark text (no leading hash). Default '9ca3af' (gray-400). */
  color: string;
  /** Opacity 0..1; PDF library uses this for transparency on text fill. Default 0.18. */
  opacity: number;
  /** Bold weight. Default true. */
  bold: boolean;
}

export type EmergencyCardPdfTwoUpWatermarkPreset =
  | 'draft'
  | 'verified'
  | 'icu-copy'
  | 'do-not-fax'
  | 'controlled'
  | 'custom';

export interface EmergencyCardPdfTwoUpWatermarkOptions
  extends EmergencyCardPdfTwoUpOptions {
  /**
   * Preset watermark to apply. 'custom' requires `watermarkText`
   * to be supplied (otherwise we throw).
   */
  watermark?: EmergencyCardPdfTwoUpWatermarkPreset;
  /** Custom watermark text (used when watermark='custom'). */
  watermarkText?: string;
  /** Override the default rotation. */
  watermarkRotationDegrees?: number;
  /** Override the default font size. */
  watermarkFontSize?: number;
  /** Override the default color (hex string, no leading hash). */
  watermarkColor?: string;
  /** Override the default opacity (0..1). */
  watermarkOpacity?: number;
  /** Override the default bold weight. */
  watermarkBold?: boolean;
  /**
   * Reference date used when watermark='verified' to format the
   * label "VERIFIED YYYY-MM-DD". Default new Date().
   */
  watermarkVerifiedAt?: Date;
}

export interface EmergencyCardPdfTwoUpWatermarkedPageResult
  extends EmergencyCardPdfTwoUpPageResult {
  /** Single diagonal watermark covering both slots. */
  watermark: EmergencyCardPdfTwoUpWatermark | null;
  /** Preset that was applied, for caller telemetry. */
  watermarkPreset: EmergencyCardPdfTwoUpWatermarkPreset | null;
}

const DEFAULT_ROTATION = -30; // lower-left to upper-right
const DEFAULT_FONT_SIZE = 96;
const DEFAULT_COLOR = '9ca3af';
const DEFAULT_OPACITY = 0.18;

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function presetText(
  preset: EmergencyCardPdfTwoUpWatermarkPreset,
  options: EmergencyCardPdfTwoUpWatermarkOptions,
): string {
  switch (preset) {
    case 'draft':
      return 'DRAFT';
    case 'verified':
      return `VERIFIED ${isoDate(options.watermarkVerifiedAt ?? new Date())}`;
    case 'icu-copy':
      return 'ICU COPY';
    case 'do-not-fax':
      return 'DO NOT FAX';
    case 'controlled':
      return 'CONTROLLED';
    case 'custom':
      if (options.watermarkText === undefined || options.watermarkText === '') {
        throw new Error(
          `watermark='custom' requires watermarkText to be a non-empty string.`,
        );
      }
      return options.watermarkText;
  }
}

function buildWatermark(
  pageWidth: number,
  pageHeight: number,
  preset: EmergencyCardPdfTwoUpWatermarkPreset,
  options: EmergencyCardPdfTwoUpWatermarkOptions,
): EmergencyCardPdfTwoUpWatermark {
  return {
    text: presetText(preset, options),
    x: pageWidth / 2,
    y: pageHeight / 2,
    rotationDegrees: options.watermarkRotationDegrees ?? DEFAULT_ROTATION,
    fontSize: options.watermarkFontSize ?? DEFAULT_FONT_SIZE,
    color: options.watermarkColor ?? DEFAULT_COLOR,
    opacity: clampUnit(options.watermarkOpacity ?? DEFAULT_OPACITY),
    bold: options.watermarkBold ?? true,
  };
}

function clampUnit(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_OPACITY;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Build a single watermarked landscape two-up page. The watermark
 * is laid in a separate field so the caller's PDF library can
 * render it on top of the slot blocks (drawing order: blocks first,
 * watermark last, gives the visual on-top-of-cards effect).
 *
 * Returns null watermark when options.watermark is undefined — the
 * caller gets the same shape but with no overlay to draw.
 */
export function buildEmergencyCardPdfTwoUpWatermarkedPage(
  left: PrescriberEmergencyCard,
  right: PrescriberEmergencyCard | null,
  options: EmergencyCardPdfTwoUpWatermarkOptions = {},
): EmergencyCardPdfTwoUpWatermarkedPageResult {
  const basePage = buildEmergencyCardPdfTwoUpPage(left, right, options);
  if (options.watermark === undefined) {
    return { ...basePage, watermark: null, watermarkPreset: null };
  }
  const watermark = buildWatermark(
    basePage.page.width,
    basePage.page.height,
    options.watermark,
    options,
  );
  return { ...basePage, watermark, watermarkPreset: options.watermark };
}

/**
 * Build a multi-page two-up roster with the same watermark applied
 * to every page. Cards pair off in input order (1+2, 3+4, ...); odd
 * counts produce a final page with the right slot empty (matches
 * the base two-up builder).
 *
 * When watermark='verified', the same isoDate is computed ONCE for
 * the whole batch so every page shows the same date — a per-page
 * watermark would risk mid-batch midnight rollover producing a
 * mixed-date stack.
 */
export function buildEmergencyCardPdfTwoUpWatermarkedPages(
  emergencyCards: PrescriberEmergencyCard[],
  options: EmergencyCardPdfTwoUpWatermarkOptions = {},
): EmergencyCardPdfTwoUpWatermarkedPageResult[] {
  // Lock in verified-at once for the whole run so every page has
  // the same VERIFIED YYYY-MM-DD.
  const lockedOptions: EmergencyCardPdfTwoUpWatermarkOptions = {
    ...options,
    watermarkVerifiedAt: options.watermarkVerifiedAt ?? new Date(),
  };
  const basePages = buildEmergencyCardPdfTwoUpPages(emergencyCards, lockedOptions);
  if (lockedOptions.watermark === undefined) {
    return basePages.map((p) => ({ ...p, watermark: null, watermarkPreset: null }));
  }
  return basePages.map((p) => {
    const watermark = buildWatermark(p.page.width, p.page.height, lockedOptions.watermark!, lockedOptions);
    return { ...p, watermark, watermarkPreset: lockedOptions.watermark! };
  });
}

/**
 * Convenience: extract the watermark text array across a multi-page
 * result (one entry per page). When watermark is null, the entry is
 * null too — for callers that want to verify the watermark was
 * applied uniformly without iterating the full result.
 */
export function watermarkTextsAcrossPages(
  pages: EmergencyCardPdfTwoUpWatermarkedPageResult[],
): (string | null)[] {
  return pages.map((p) => p.watermark?.text ?? null);
}
