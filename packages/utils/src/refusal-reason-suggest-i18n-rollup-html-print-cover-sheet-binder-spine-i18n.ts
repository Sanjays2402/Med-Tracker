/**
 * Refusal reason suggest i18n rollup HTML print cover sheet —
 * binder-spine, i18n CHROME bundle.
 *
 * `refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine`
 * renders a vertical spine label with a few optional pieces of
 * "chrome" text:
 *
 *   - the optional `includePanelSize=true` label
 *     ("3 doses" / "1 dose") tacked under the patient name;
 *   - the optional patientName fallback when no patientName is
 *     provided ("Refusal-reason roster").
 *
 * Both strings are hard-coded English. Clinics with Spanish,
 * French, German, Hindi, etc speaking caregivers want those chrome
 * strings in their language. The patient name + date stay
 * untranslated (they're proper nouns / numeric).
 *
 * This module is the i18n chrome bundle layer. Given a per-locale
 * bundle of chrome strings + a locale identifier, it renders the
 * spine with the localised chrome:
 *
 *   {
 *     locale,
 *     strings: {
 *       dosesUnitSingular: "dose",
 *       dosesUnitPlural: "doses",
 *       defaultPatientName: "Refusal-reason roster",
 *     },
 *   }
 *
 * Output structure matches the base spine module exactly so callers
 * can drop in this i18n variant without other code changes.
 *
 * Pure / deterministic.
 *
 * Composes:
 *   - renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine
 */

import type { RefusalReasonI18nRollupResult } from './refusal-reason-suggest-i18n-rollup';
import type {
  RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine,
  RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineOptions,
} from './refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine';
import { renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine } from './refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine';

export interface RefusalReasonSpineI18nStrings {
  /** Unit label for ONE dose (e.g. "dose" / "dosis" / "Dosis" / "खुराक"). */
  dosesUnitSingular: string;
  /** Unit label for >1 doses (e.g. "doses" / "dosis" / "Dosen"). */
  dosesUnitPlural: string;
  /**
   * Fallback patientName when none was provided. Default English:
   * "Refusal-reason roster".
   */
  defaultPatientName: string;
}

export interface RefusalReasonSpineI18nBundle {
  /** BCP-47 locale identifier, e.g. 'en-US', 'es-419', 'de-DE'. */
  locale: string;
  /**
   * Partial string table — missing keys fall back to the English
   * defaults so a contributor-submitted partial locale doesn't
   * blank the spine.
   */
  strings: Partial<RefusalReasonSpineI18nStrings>;
}

/**
 * Built-in English chrome strings. Matches the base spine module's
 * literals as of tick 19; any future locale starts from this shape.
 */
export const REFUSAL_REASON_SPINE_I18N_EN: RefusalReasonSpineI18nStrings = {
  dosesUnitSingular: 'dose',
  dosesUnitPlural: 'doses',
  defaultPatientName: 'Refusal-reason roster',
};

/**
 * Built-in Spanish (es-419) chrome strings. Useful as a quickstart
 * for the most common clinical second-language deployment.
 */
export const REFUSAL_REASON_SPINE_I18N_ES_419: RefusalReasonSpineI18nStrings = {
  dosesUnitSingular: 'dosis',
  dosesUnitPlural: 'dosis',
  defaultPatientName: 'Padrón de motivos de rechazo',
};

/** Built-in French (fr-FR). */
export const REFUSAL_REASON_SPINE_I18N_FR_FR: RefusalReasonSpineI18nStrings = {
  dosesUnitSingular: 'dose',
  dosesUnitPlural: 'doses',
  defaultPatientName: "Registre des motifs de refus",
};

/** Built-in German (de-DE). */
export const REFUSAL_REASON_SPINE_I18N_DE_DE: RefusalReasonSpineI18nStrings = {
  dosesUnitSingular: 'Dosis',
  dosesUnitPlural: 'Dosen',
  defaultPatientName: 'Ablehnungsgrund-Liste',
};

/** Built-in Hindi (hi-IN). */
export const REFUSAL_REASON_SPINE_I18N_HI_IN: RefusalReasonSpineI18nStrings = {
  dosesUnitSingular: 'खुराक',
  dosesUnitPlural: 'खुराकें',
  defaultPatientName: 'इनकार कारण सूची',
};

/**
 * Built-in fallback bundle: English. Used when no bundle is
 * provided to renderLocalisedRefusalReasonSpine.
 */
export const REFUSAL_REASON_SPINE_I18N_FALLBACK: RefusalReasonSpineI18nBundle = {
  locale: 'en-US',
  strings: REFUSAL_REASON_SPINE_I18N_EN,
};

export interface RefusalReasonI18nSpineOptions
  extends RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineOptions {
  /**
   * Locale bundle. Missing keys fall back to English. When omitted,
   * the English fallback bundle is used.
   */
  bundle?: RefusalReasonSpineI18nBundle;
}

export interface RefusalReasonI18nSpineResult
  extends RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine {
  /** Locale actually applied to the chrome strings. */
  locale: string;
  /** True when the bundle was missing one or more keys and English filled in. */
  fallbackUsedForAnyKey: boolean;
  /** Specific keys that fell back to English. */
  fallbackKeys: Array<keyof RefusalReasonSpineI18nStrings>;
}

function resolveStrings(
  bundle: RefusalReasonSpineI18nBundle,
): {
  strings: RefusalReasonSpineI18nStrings;
  fallbackKeys: Array<keyof RefusalReasonSpineI18nStrings>;
} {
  const fallbackKeys: Array<keyof RefusalReasonSpineI18nStrings> = [];
  const dosesUnitSingular =
    bundle.strings.dosesUnitSingular ??
    (fallbackKeys.push('dosesUnitSingular'), REFUSAL_REASON_SPINE_I18N_EN.dosesUnitSingular);
  const dosesUnitPlural =
    bundle.strings.dosesUnitPlural ??
    (fallbackKeys.push('dosesUnitPlural'), REFUSAL_REASON_SPINE_I18N_EN.dosesUnitPlural);
  const defaultPatientName =
    bundle.strings.defaultPatientName ??
    (fallbackKeys.push('defaultPatientName'), REFUSAL_REASON_SPINE_I18N_EN.defaultPatientName);
  return {
    strings: { dosesUnitSingular, dosesUnitPlural, defaultPatientName },
    fallbackKeys,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render the binder spine with localised chrome strings.
 *
 * Approach:
 *   1. Resolve the bundle's chrome strings (falling back to English
 *      for any missing key).
 *   2. Replace the patientName default with the localised
 *      defaultPatientName when none was provided.
 *   3. Call the base spine renderer WITHOUT includePanelSize so it
 *      emits its standard output (we'll inject the localised doses
 *      label separately, below).
 *   4. When includePanelSize=true on the input options, splice the
 *      localised "<count> <unit>" label into the rendered HTML
 *      immediately before the closing </div></section>.
 *
 * Pure / deterministic given (result, options, bundle).
 */
export function renderLocalisedRefusalReasonSpine(
  result: RefusalReasonI18nRollupResult,
  options: RefusalReasonI18nSpineOptions = {},
): RefusalReasonI18nSpineResult {
  const bundle = options.bundle ?? REFUSAL_REASON_SPINE_I18N_FALLBACK;
  const { strings, fallbackKeys } = resolveStrings(bundle);

  // Build sub-options for the base renderer.
  // We DROP includePanelSize because the base renderer hard-codes
  // English ("dose" / "doses"); we'll re-inject the label below
  // using the localised strings.
  const subOptions: RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineOptions = {
    ...options,
  };
  // Drop includePanelSize so the base never emits the hard-coded label.
  delete (subOptions as { includePanelSize?: boolean }).includePanelSize;
  // Apply the localised default patient name when none provided.
  if (subOptions.patientName === undefined || subOptions.patientName.length === 0) {
    subOptions.patientName = strings.defaultPatientName;
  }

  const baseSpine = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine(
    result,
    subOptions,
  );

  // Re-inject the localised panel-size label when requested.
  const includePanelSize = options.includePanelSize ?? false;
  let html = baseSpine.html;
  if (includePanelSize) {
    const panelSize = result.coverage.suggestedCount;
    const unit =
      panelSize === 1 ? strings.dosesUnitSingular : strings.dosesUnitPlural;
    const sizeText = `${panelSize} ${unit}`;
    // Mirror the base module's chrome styling for the panel-size label
    // so the localised inject is visually identical to the base output.
    // We re-use the inner content area font sizing heuristics
    // (cross-axis ~ height/width when rotated; we approximate by
    // computing from baseSpine.widthCm/heightCm).
    const rotated =
      baseSpine.rotationDegrees === -90 || baseSpine.rotationDegrees === 90;
    const crossAxis = rotated ? baseSpine.widthCm : baseSpine.heightCm;
    const metaFontPt = Math.max(6, Math.round(crossAxis * 4));
    const fontFamily =
      options.fontFamily ?? 'Georgia, "Times New Roman", Times, serif';
    const labelHtml =
      `<div style="font-family:${fontFamily};font-size:${metaFontPt}pt;font-weight:400;color:#000;letter-spacing:0.02em;line-height:1.1;white-space:nowrap;text-align:center;margin-top:2pt;">${escapeHtml(sizeText)}</div>`;
    // Inject before the inner div closes (</div></section> at end).
    const lastInnerDivClose = html.lastIndexOf('</div></section>');
    if (lastInnerDivClose >= 0) {
      html =
        html.slice(0, lastInnerDivClose) +
        labelHtml +
        html.slice(lastInnerDivClose);
    } else {
      // Defensive: append at the end of the fragment.
      html = html + labelHtml;
    }
  }

  return {
    ...baseSpine,
    html,
    locale: bundle.locale,
    fallbackUsedForAnyKey: fallbackKeys.length > 0,
    fallbackKeys,
  };
}

/**
 * Convenience: localise the spine using a pre-built locale bundle
 * by locale id (BCP-47). Falls back to English when the locale id
 * is unrecognised.
 */
export function renderLocalisedRefusalReasonSpineByLocale(
  result: RefusalReasonI18nRollupResult,
  locale: string,
  options: Omit<RefusalReasonI18nSpineOptions, 'bundle'> = {},
): RefusalReasonI18nSpineResult {
  const bundle = pickBuiltInSpineBundle(locale);
  return renderLocalisedRefusalReasonSpine(result, { ...options, bundle });
}

const BUILT_IN_SPINE_BUNDLES: Record<string, RefusalReasonSpineI18nBundle> = {
  'en-US': { locale: 'en-US', strings: REFUSAL_REASON_SPINE_I18N_EN },
  en: { locale: 'en-US', strings: REFUSAL_REASON_SPINE_I18N_EN },
  'es-419': { locale: 'es-419', strings: REFUSAL_REASON_SPINE_I18N_ES_419 },
  'es-ES': { locale: 'es-ES', strings: REFUSAL_REASON_SPINE_I18N_ES_419 },
  es: { locale: 'es-419', strings: REFUSAL_REASON_SPINE_I18N_ES_419 },
  'fr-FR': { locale: 'fr-FR', strings: REFUSAL_REASON_SPINE_I18N_FR_FR },
  'fr-CA': { locale: 'fr-CA', strings: REFUSAL_REASON_SPINE_I18N_FR_FR },
  fr: { locale: 'fr-FR', strings: REFUSAL_REASON_SPINE_I18N_FR_FR },
  'de-DE': { locale: 'de-DE', strings: REFUSAL_REASON_SPINE_I18N_DE_DE },
  de: { locale: 'de-DE', strings: REFUSAL_REASON_SPINE_I18N_DE_DE },
  'hi-IN': { locale: 'hi-IN', strings: REFUSAL_REASON_SPINE_I18N_HI_IN },
  hi: { locale: 'hi-IN', strings: REFUSAL_REASON_SPINE_I18N_HI_IN },
};

/**
 * Look up a built-in bundle by locale id. Falls back to English
 * when the id is unrecognised.
 */
export function pickBuiltInSpineBundle(
  locale: string,
): RefusalReasonSpineI18nBundle {
  // Exact match first.
  if (BUILT_IN_SPINE_BUNDLES[locale] !== undefined) {
    return BUILT_IN_SPINE_BUNDLES[locale]!;
  }
  // Strip region (e.g. 'es-XX' -> 'es') and retry.
  const stripped = locale.split('-')[0];
  if (stripped && BUILT_IN_SPINE_BUNDLES[stripped] !== undefined) {
    return BUILT_IN_SPINE_BUNDLES[stripped]!;
  }
  return REFUSAL_REASON_SPINE_I18N_FALLBACK;
}

/**
 * Convenience: validate a partial chrome bundle. Returns the keys
 * that are missing so CI checks can flag incomplete contributor
 * submissions.
 */
export function validateSpineI18nBundle(
  bundle: RefusalReasonSpineI18nBundle,
): Array<keyof RefusalReasonSpineI18nStrings> {
  const missing: Array<keyof RefusalReasonSpineI18nStrings> = [];
  if (typeof bundle.strings.dosesUnitSingular !== 'string') {
    missing.push('dosesUnitSingular');
  }
  if (typeof bundle.strings.dosesUnitPlural !== 'string') {
    missing.push('dosesUnitPlural');
  }
  if (typeof bundle.strings.defaultPatientName !== 'string') {
    missing.push('defaultPatientName');
  }
  return missing;
}

/**
 * Convenience: a one-line cron-log summary for the localised render.
 *
 *   "Localised spine: es-419 (no fallbacks)."
 *   "Localised spine: de-DE (fallback for: defaultPatientName)."
 */
export function summarizeLocalisedSpineResult(
  result: RefusalReasonI18nSpineResult,
): string {
  if (!result.fallbackUsedForAnyKey) {
    return `Localised spine: ${result.locale} (no fallbacks).`;
  }
  return `Localised spine: ${result.locale} (fallback for: ${result.fallbackKeys.join(', ')}).`;
}
