/**
 * Refusal reason suggest i18n rollup HTML print cover sheet —
 * binder-spine, per-source color coding.
 *
 * `refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine`
 * renders a vertical spine label in B&W (black text, white
 * background, optional 1px black border). In a high-volume clinic
 * with binders for many patients, ALL spines look identical from
 * across the room. That defeats the spine's primary purpose: visual
 * triage at-a-glance.
 *
 * Real triage use case: when a clinician walks toward the binder
 * shelf they want to immediately see WHICH patients had which
 * dominant refusal source last week:
 *
 *   - NPO-window refusals (procedures coming up) -> RED stripe
 *   - prescriber-pause (intentional hold) -> BLUE stripe
 *   - out-of-supply (refill issue) -> ORANGE stripe
 *   - sleeping-window (overnight) -> PURPLE stripe
 *   - recent-pattern (chronic non-adherence) -> YELLOW stripe
 *
 * The dominant source is the source with the most suggestions in
 * the patient's rollup. A small color stripe at the top OR side of
 * the spine carries the visual signal; the black-text patient name
 * stays high-contrast for legibility.
 *
 * Monochrome printers can't render color, so this module emits a
 * tone-down VARIANT for monochrome fallback: a small text tag
 * ("NPO" / "PAUSE" / "SUPPLY" / "SLEEP" / "PATTERN") in the same
 * position so the visual triage signal degrades gracefully to a
 * verbal one.
 *
 * Defaults:
 *   - stripePlacement = 'top' (horizontal bar across the top of the
 *     spine, visible when the binder is upright)
 *   - stripeThicknessMm = 4 (visible from a few meters)
 *   - monochromeFallback = false (assume color printer; opt in for
 *     mono via monochromeFallback=true)
 *   - includeSourceTag = true (always emit the verbal tag even on
 *     color spines for legibility from very close range)
 *
 * Pure / deterministic. No I/O. No external fonts.
 *
 * Composes:
 *   - renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine
 *   - LocalisedRefusalSuggestion[].source from the rollup
 */

import type { RefusalReasonI18nKey } from './refusal-reason-suggest-i18n';
import type {
  RefusalReasonI18nRollupCoverage,
  RefusalReasonI18nRollupResult,
} from './refusal-reason-suggest-i18n-rollup';
import type {
  RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine,
  RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineOptions,
} from './refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine';
import { renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine } from './refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine';

export type RefusalReasonSpineStripePlacement = 'top' | 'bottom' | 'left' | 'right';

export interface RefusalReasonSpineColorCodingPalette {
  /** Hex color (e.g. #DC2626) for the NPO-window stripe. */
  'npo-window': string;
  /** Hex color for the prescriber-pause stripe. */
  'prescriber-pause': string;
  /** Hex color for the out-of-supply stripe. */
  'out-of-supply': string;
  /** Hex color for the sleeping-window stripe. */
  'sleeping-window': string;
  /** Hex color for the recent-pattern stripe. */
  'recent-pattern': string;
  /** Hex color for the "no dominant source" fallback stripe. */
  'no-dominant': string;
}

export interface RefusalReasonSpineColorCodingOptions
  extends RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineOptions {
  /**
   * Color palette. Defaults provide a clinical triage palette:
   * red for NPO (most urgent), blue for prescriber-pause
   * (intentional), orange for supply, purple for sleeping, yellow
   * for recent-pattern (chronic), gray for no-dominant.
   */
  palette?: Partial<RefusalReasonSpineColorCodingPalette>;
  /**
   * Stripe placement on the spine. Default 'top' (horizontal bar
   * across the spine top). 'left' / 'right' useful for clinics
   * filing binders shelved side-by-side where the top is hidden.
   */
  stripePlacement?: RefusalReasonSpineStripePlacement;
  /**
   * Stripe thickness in millimetres. Default 4mm (visible from
   * several meters). Clamped to [1, 20].
   */
  stripeThicknessMm?: number;
  /**
   * Emit the verbal source tag ("NPO" / "PAUSE" / etc) next to /
   * inside the stripe so the spine remains identifiable on
   * monochrome printers and for clinicians with color-vision
   * differences. Default true.
   */
  includeSourceTag?: boolean;
  /**
   * Monochrome fallback: skip the color stripe entirely and emit
   * only the verbal source tag in black text. Default false (color
   * printer assumed). Set true on a B&W printer to keep visual
   * triage degrading gracefully.
   */
  monochromeFallback?: boolean;
}

export interface RefusalReasonSpineColorCoding
  extends RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine {
  /** Dominant source detected from the rollup; null when none. */
  dominantSource: RefusalReasonI18nKey | null;
  /** Stripe color actually applied (hex). null under monochrome fallback. */
  stripeColor: string | null;
  /** Verbal source tag actually emitted; null when includeSourceTag=false AND no source. */
  sourceTag: string | null;
  /** True when monochrome fallback was applied. */
  monochromeFallbackApplied: boolean;
}

const DEFAULT_PALETTE: RefusalReasonSpineColorCodingPalette = {
  'npo-window': '#DC2626', // red-600
  'prescriber-pause': '#2563EB', // blue-600
  'out-of-supply': '#EA580C', // orange-600
  'sleeping-window': '#7C3AED', // purple-600
  'recent-pattern': '#CA8A04', // yellow-600
  'no-dominant': '#6B7280', // gray-500
};

const SOURCE_TAGS: Record<RefusalReasonI18nKey, string> = {
  'npo-window': 'NPO',
  'prescriber-pause': 'PAUSE',
  'out-of-supply': 'SUPPLY',
  'sleeping-window': 'SLEEP',
  'recent-pattern': 'PATTERN',
};

/**
 * Pick the dominant source for color coding from a coverage rollup.
 *
 * "Dominant" = the source with the most `suggested` count. Ties
 * are broken by stable per-source priority order matching the
 * clinical urgency in the palette comment (npo > prescriber-pause
 * > out-of-supply > sleeping-window > recent-pattern). Empty
 * bySource map returns null.
 */
export function pickDominantSource(
  coverage: RefusalReasonI18nRollupCoverage,
): RefusalReasonI18nKey | null {
  if (coverage.bySource.size === 0) return null;
  const priorityOrder: RefusalReasonI18nKey[] = [
    'npo-window',
    'prescriber-pause',
    'out-of-supply',
    'sleeping-window',
    'recent-pattern',
  ];
  let dominant: RefusalReasonI18nKey | null = null;
  let dominantCount = -1;
  for (const key of priorityOrder) {
    const entry = coverage.bySource.get(key);
    if (entry === undefined) continue;
    if (entry.suggested > dominantCount) {
      dominantCount = entry.suggested;
      dominant = key;
    }
  }
  return dominant;
}

function clampStripeThickness(mm: number): number {
  if (mm < 1) return 1;
  if (mm > 20) return 20;
  return mm;
}

function resolvePalette(
  options: RefusalReasonSpineColorCodingOptions,
): RefusalReasonSpineColorCodingPalette {
  const overrides = options.palette ?? {};
  return { ...DEFAULT_PALETTE, ...overrides };
}

/**
 * Render the spine with a per-source color-coded stripe.
 *
 * The base spine HTML is generated first, then the stripe is
 * spliced in as the FIRST child of the outer <section> so it lands
 * BEHIND / ABOVE the centred patient name (depending on
 * stripePlacement). The verbal tag follows the stripe so it stays
 * visible when the centred text overlaps.
 *
 * Under monochrome fallback the stripe is omitted; only the verbal
 * tag remains.
 *
 * Pure / deterministic.
 */
export function renderRefusalReasonSpineWithColorCoding(
  result: RefusalReasonI18nRollupResult,
  options: RefusalReasonSpineColorCodingOptions = {},
): RefusalReasonSpineColorCoding {
  const base = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine(
    result,
    options,
  );

  const dominant = pickDominantSource(result.coverage);
  const palette = resolvePalette(options);
  const placement = options.stripePlacement ?? 'top';
  const thicknessMm = clampStripeThickness(options.stripeThicknessMm ?? 4);
  const includeSourceTag = options.includeSourceTag ?? true;
  const monochromeFallback = options.monochromeFallback ?? false;

  const stripeColor =
    monochromeFallback
      ? null
      : dominant === null
        ? palette['no-dominant']
        : palette[dominant];
  const sourceTag =
    dominant === null
      ? null
      : includeSourceTag
        ? SOURCE_TAGS[dominant]
        : null;

  // Build the stripe fragment.
  const stripeFragments: string[] = [];

  if (stripeColor !== null) {
    let stripeStyle = `background:${stripeColor};position:absolute;`;
    switch (placement) {
      case 'top':
        stripeStyle += `top:0;left:0;right:0;height:${thicknessMm}mm;`;
        break;
      case 'bottom':
        stripeStyle += `bottom:0;left:0;right:0;height:${thicknessMm}mm;`;
        break;
      case 'left':
        stripeStyle += `top:0;bottom:0;left:0;width:${thicknessMm}mm;`;
        break;
      case 'right':
        stripeStyle += `top:0;bottom:0;right:0;width:${thicknessMm}mm;`;
        break;
    }
    stripeFragments.push(
      `<div class="spine-color-stripe" aria-hidden="true" style="${stripeStyle}"></div>`,
    );
  }

  if (sourceTag !== null) {
    // Verbal tag is small (font-size scales with stripe thickness when
    // a stripe is present so it visually anchors the stripe; smaller
    // when monochrome fallback applies).
    const baseTagFontMm = monochromeFallback ? 2.5 : Math.max(2.5, thicknessMm * 0.55);
    let tagStyle =
      `position:absolute;` +
      `font-family:Georgia, \"Times New Roman\", Times, serif;` +
      `font-size:${baseTagFontMm.toFixed(2)}mm;` +
      `font-weight:700;` +
      `letter-spacing:0.08em;` +
      `color:${monochromeFallback || stripeColor === null ? '#000' : '#FFF'};` +
      `text-shadow:${monochromeFallback ? 'none' : '0 0 1pt rgba(0,0,0,0.4)'};` +
      `line-height:1;`;
    switch (placement) {
      case 'top':
        tagStyle +=
          `top:${monochromeFallback ? '0.5mm' : '0.5mm'};` +
          `left:50%;` +
          `transform:translateX(-50%);`;
        break;
      case 'bottom':
        tagStyle +=
          `bottom:0.5mm;` + `left:50%;` + `transform:translateX(-50%);`;
        break;
      case 'left':
        tagStyle +=
          `top:50%;` + `left:0.5mm;` + `transform:translateY(-50%) rotate(-90deg);transform-origin:0 50%;`;
        break;
      case 'right':
        tagStyle +=
          `top:50%;` + `right:0.5mm;` + `transform:translateY(-50%) rotate(90deg);transform-origin:100% 50%;`;
        break;
    }
    stripeFragments.push(
      `<div class="spine-color-tag" style="${tagStyle}">${sourceTag}</div>`,
    );
  }

  const stripeHtml = stripeFragments.join('');

  // Splice stripe HTML inside the outer <section> as the FIRST child
  // (after the opening tag) so it lays behind / above the centred
  // text per stripeStyle's position:absolute.
  let html = base.html;
  if (stripeHtml.length > 0) {
    const sectionOpenIdx = html.indexOf('<section');
    const sectionTagEndIdx = sectionOpenIdx >= 0 ? html.indexOf('>', sectionOpenIdx) : -1;
    if (sectionOpenIdx >= 0 && sectionTagEndIdx >= 0) {
      html =
        html.slice(0, sectionTagEndIdx + 1) +
        stripeHtml +
        html.slice(sectionTagEndIdx + 1);
    } else {
      // Defensive fallback: prepend.
      html = stripeHtml + html;
    }
  }

  return {
    ...base,
    html,
    dominantSource: dominant,
    stripeColor,
    sourceTag,
    monochromeFallbackApplied: monochromeFallback,
  };
}

/**
 * Convenience: one-line summary for the cron log / printer manifest.
 *
 *   "Spine color: npo-window (red #DC2626; top stripe 4mm; tag=NPO)."
 *   "Spine color: no-dominant (gray fallback; top stripe 4mm)."
 *   "Spine color: monochrome fallback applied (tag=NPO; no stripe)."
 */
export function summarizeSpineColorCoding(
  result: RefusalReasonSpineColorCoding,
): string {
  if (result.monochromeFallbackApplied) {
    if (result.sourceTag === null) {
      return 'Spine color: monochrome fallback applied (no dominant source; no stripe).';
    }
    return `Spine color: monochrome fallback applied (tag=${result.sourceTag}; no stripe).`;
  }
  if (result.dominantSource === null) {
    return `Spine color: no-dominant (gray fallback; stripe color ${result.stripeColor ?? 'none'}).`;
  }
  const tagFrag = result.sourceTag !== null ? `; tag=${result.sourceTag}` : '';
  return (
    `Spine color: ${result.dominantSource} ` +
    `(stripe color ${result.stripeColor ?? 'none'}${tagFrag}).`
  );
}
