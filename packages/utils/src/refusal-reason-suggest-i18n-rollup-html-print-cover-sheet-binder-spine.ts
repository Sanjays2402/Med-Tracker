/**
 * Refusal reason suggest i18n rollup HTML print cover sheet —
 * binder-spine label.
 *
 * `refusal-reason-suggest-i18n-rollup-html-print-cover-sheet`
 * produces a single-page HTML cover sheet that fronts the
 * paginated print roster. Clinics that file rosters in physical
 * binders DON'T LOOK AT THE COVER PAGE when pulling a binder off
 * the shelf — they look at the BINDER SPINE.
 *
 * The spine label is a tall, narrow, vertically-oriented sticker
 * (typically 3.5x1.5 cm in clinical-records archives) printed and
 * stuck on the binder spine so the file is identifiable at a
 * glance from across the room. It carries:
 *
 *   - patient name (vertically oriented, takes most of the spine);
 *   - date generated (small, near the bottom);
 *   - panel label (small, optional).
 *
 * This module produces a print-ready HTML fragment for the spine
 * label. Geometry:
 *
 *   - default 3.5cm wide x 1.5cm tall, rotated 90deg counter-
 *     clockwise (or 270deg clockwise) so the patient name reads
 *     bottom-to-top when the binder is upright on a shelf;
 *   - alternative 5cm x 2cm and 2.5cm x 1cm presets for different
 *     binder thicknesses;
 *   - default print background is white, label border black, text
 *     near-black for B&W photocopier survivability.
 *
 * The fragment is a standalone block (no <html> or <head>) suitable
 * for splicing into a print-preview window AFTER the cover sheet
 * and BEFORE the body, or onto its own page entirely. A
 * page-break-before:always is included by default so the spine
 * label always lands on its own page (sticky-paper printers
 * typically expect one sticker per page).
 *
 * Pure / deterministic. No I/O. The HTML is just CSS-positioned
 * text — no fonts loaded externally, no images, no remote URLs.
 *
 * Composes:
 *   - the cover sheet's typography conventions (Georgia serif,
 *     black-on-white, large patient name);
 *   - the cover sheet's date phrasing if the caller passes the
 *     same dateLabel.
 */

import type { RefusalReasonI18nRollupResult } from './refusal-reason-suggest-i18n-rollup';

export type BinderSpineSizePreset = '3.5x1.5cm' | '5x2cm' | '2.5x1cm' | 'custom';

export interface RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineOptions {
  /** Patient name printed vertically across the spine. Falls back to a generic label. */
  patientName?: string;
  /** Date label printed near the bottom of the spine (e.g. "2026-06-22"). */
  dateLabel?: string;
  /** Panel label printed below the patient name (e.g. "Q3 Review"). */
  panelLabel?: string;
  /** Size preset. Default '3.5x1.5cm'. */
  sizePreset?: BinderSpineSizePreset;
  /** Custom width in cm. Used only when sizePreset='custom'. */
  customWidthCm?: number;
  /** Custom height in cm. Used only when sizePreset='custom'. */
  customHeightCm?: number;
  /**
   * Rotation degrees. Default -90 (text reads bottom-to-top).
   * 90 = text reads top-to-bottom (some binders open right-to-
   * left and prefer this). 0 = no rotation (horizontal text;
   * unusual but supported).
   */
  rotationDegrees?: -90 | 90 | 0;
  /** Override the font-family. Default print-friendly serif. */
  fontFamily?: string;
  /**
   * Include a 1px solid black border around the label so the
   * cut-line is visible during printing. Default true.
   */
  includeBorder?: boolean;
  /**
   * Page-break before the spine label fragment. Default true so the
   * spine lands on its own page (sticky-paper printers expect one
   * sticker per page).
   */
  pageBreakBefore?: boolean;
  /**
   * Optionally include the patient panel size (number of suggested
   * doses) on the spine. Off by default — spine labels stay sparse.
   */
  includePanelSize?: boolean;
}

export interface RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine {
  /** HTML fragment for the spine label. */
  html: string;
  /** Rendered width in cm. */
  widthCm: number;
  /** Rendered height in cm. */
  heightCm: number;
  /** Rotation actually applied in degrees. */
  rotationDegrees: number;
  /** Whether a border was rendered. */
  borderIncluded: boolean;
}

const SIZE_PRESETS: Record<Exclude<BinderSpineSizePreset, 'custom'>, { w: number; h: number }> = {
  '3.5x1.5cm': { w: 3.5, h: 1.5 },
  '5x2cm': { w: 5, h: 2 },
  '2.5x1cm': { w: 2.5, h: 1 },
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveSize(
  options: RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineOptions,
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

/**
 * Render the binder-spine label HTML fragment.
 *
 * The fragment positions the label inside a container of the
 * specified size (width / height in cm) and rotates the inner text
 * by `rotationDegrees`. The rotated text is positioned so it fills
 * the long axis of the spine (height when rotated 90deg).
 *
 * Output is deterministic given the same options.
 */
export function renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine(
  result: RefusalReasonI18nRollupResult,
  options: RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineOptions = {},
): RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine {
  const { w, h } = resolveSize(options);
  const rotation = options.rotationDegrees ?? -90;
  const fontFamily =
    options.fontFamily ?? 'Georgia, "Times New Roman", Times, serif';
  const includeBorder = options.includeBorder ?? true;
  const pageBreakBefore = options.pageBreakBefore ?? true;
  const includePanelSize = options.includePanelSize ?? false;
  const patientName = options.patientName ?? 'Refusal-reason roster';
  const dateLabel = options.dateLabel ?? '';
  const panelLabel = options.panelLabel ?? '';

  // When rotated, the inner text container's width becomes the
  // spine's height in cm (long axis). When not rotated, the inner
  // width matches the spine's width. We render text in a container
  // whose pre-rotation size matches the long axis and rotate the
  // container into the spine box.
  const isRotated = rotation === -90 || rotation === 90;
  // Long-axis / cross-axis in cm.
  const longAxis = isRotated ? h : w;
  const crossAxis = isRotated ? w : h;
  // Pre-rotation container: width=longAxis (cm), height=crossAxis (cm),
  // then rotated about its centre so it fits the spine box.
  const containerWidthCm = isRotated ? h : w;
  const containerHeightCm = isRotated ? w : h;

  const borderStyle = includeBorder
    ? 'border:1px solid #000;'
    : '';
  const breakStyle = pageBreakBefore ? 'page-break-before:always;' : '';

  // Font sizing scales to the cross-axis. With 1cm height and a
  // 3.5cm long axis, ~ 11pt patient name + 6pt date is legible.
  const patientFontPt = Math.max(8, Math.round(crossAxis * 9));
  const metaFontPt = Math.max(6, Math.round(crossAxis * 4));

  const escapedPatient = escapeHtml(patientName);
  const escapedDate = escapeHtml(dateLabel);
  const escapedPanel = escapeHtml(panelLabel);
  const panelSize = result.coverage.suggestedCount;

  // Inner content: patient name takes the most room, then panel,
  // then date, then optional panel size.
  const innerParts: string[] = [];
  innerParts.push(
    `<div style="font-family:${fontFamily};font-size:${patientFontPt}pt;font-weight:700;color:#000;letter-spacing:0.04em;line-height:1.1;white-space:nowrap;text-align:center;">${escapedPatient}</div>`,
  );
  if (panelLabel) {
    innerParts.push(
      `<div style="font-family:${fontFamily};font-size:${metaFontPt}pt;font-weight:400;color:#000;letter-spacing:0.08em;text-transform:uppercase;line-height:1.1;white-space:nowrap;text-align:center;margin-top:2pt;">${escapedPanel}</div>`,
    );
  }
  if (dateLabel) {
    innerParts.push(
      `<div style="font-family:${fontFamily};font-size:${metaFontPt}pt;font-weight:400;color:#000;letter-spacing:0.04em;line-height:1.1;white-space:nowrap;text-align:center;margin-top:2pt;">${escapedDate}</div>`,
    );
  }
  if (includePanelSize) {
    const sizeLabel = `${panelSize} ${panelSize === 1 ? 'dose' : 'doses'}`;
    innerParts.push(
      `<div style="font-family:${fontFamily};font-size:${metaFontPt}pt;font-weight:400;color:#000;letter-spacing:0.02em;line-height:1.1;white-space:nowrap;text-align:center;margin-top:2pt;">${escapeHtml(sizeLabel)}</div>`,
    );
  }

  const innerHtml = innerParts.join('');

  const rotationStyle =
    rotation === 0 ? '' : `transform:rotate(${rotation}deg);`;

  // The outer container is the physical spine label box (width/height
  // in cm). The inner container is the rotated content area; its
  // dimensions match the pre-rotation long/cross axes so when rotated
  // it fits the outer box's long/cross axes (which differ from the
  // inner's).
  const outerStyle =
    `${breakStyle}` +
    `width:${w}cm;` +
    `height:${h}cm;` +
    `${borderStyle}` +
    `box-sizing:border-box;` +
    `position:relative;` +
    `overflow:hidden;` +
    `padding:0;` +
    `margin:0 auto;` +
    `background:#fff;`;

  const innerStyle =
    `position:absolute;` +
    `top:50%;` +
    `left:50%;` +
    `width:${containerWidthCm}cm;` +
    `height:${containerHeightCm}cm;` +
    `${rotationStyle}` +
    // After rotation, translate back by half its own pre-rotation
    // dimensions so the centre of the rotated content lands at the
    // centre of the outer box.
    `transform-origin:50% 50%;` +
    `margin-top:-${containerHeightCm / 2}cm;` +
    `margin-left:-${containerWidthCm / 2}cm;` +
    `display:flex;` +
    `flex-direction:column;` +
    `justify-content:center;` +
    `align-items:center;` +
    `text-align:center;`;

  const html =
    `<section style="${outerStyle}">` +
    `<div style="${innerStyle}">${innerHtml}</div>` +
    `</section>`;

  return {
    html,
    widthCm: w,
    heightCm: h,
    rotationDegrees: rotation,
    borderIncluded: includeBorder,
  };
}

/**
 * Convenience: combine the cover sheet + spine label into a single
 * HTML print packet (cover on page 1, spine on page 2). For
 * pipelines that want both in one fragment.
 *
 * Note: spine labels are typically printed on sticker stock, NOT
 * regular paper — the caller usually splits the combined fragment
 * into two print jobs. This helper is for the rare case both go on
 * the same media.
 */
export function renderRefusalReasonI18nRollupHtmlPrintCoverSheetWithBinderSpine(
  result: RefusalReasonI18nRollupResult,
  coverSheetHtml: string,
  spineOptions: RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineOptions = {},
): string {
  const spine = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine(
    result,
    spineOptions,
  );
  return coverSheetHtml + spine.html;
}
