/**
 * Prescriber contact card emergency card PDF two-up watermark roster
 * TOC HTML anchored SEARCH INPUT — I18N variant.
 *
 * `prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html-anchored-search-input`
 * renders an HTML5 `<input type="search">` for TOC filtering with
 * three English-only chrome strings:
 *
 *   - the input's `placeholder` text ('Filter prescribers');
 *   - the input's `aria-label` ('Filter the table of contents by
 *     prescriber name or specialty');
 *   - the visually-hidden empty-state hint ('Type to filter; matches
 *     highlight as you type.').
 *
 * Same i18n problem as the calendar / refusal-reason / warnings
 * modules tick 22+: an international clinic chain ships the same
 * portal across NL / DE / JP locales and each renders the search
 * input in the local language. Forking the renderer per locale
 * defeats the consistency this module promises.
 *
 * This module is the i18n bundle layer for the search-input render,
 * parallel to the calendar / refusal-reason / warnings i18n modules.
 * It composes the base anchored-search-input renderer + applies a
 * per-locale string table:
 *
 *   - per-locale placeholder ("Filtrar prescriptores" / "処方者を絞り
 *     込む" / "Verschreiber filtern");
 *   - per-locale aria-label ("Filtrar el índice por nombre o
 *     especialidad del prescriptor");
 *   - per-locale empty-state hint ("Escribe para filtrar; las
 *     coincidencias se resaltan").
 *
 * Graceful fallback to English when the bundle is missing a key;
 * fallbackUsed + missingKeys flag the gaps so a CI gate can catch
 * incomplete locales. detectCoverage helper for the standalone CI
 * check parallel to the calendar / warnings i18n modules.
 *
 * The structured data fields (searchInputId, anchorByCardIndex,
 * tocEntries, etc) stay English-typed — only the rendered chrome
 * text changes — so downstream typed consumers don't break.
 *
 * Pure / deterministic. No I/O. HTML escaped.
 *
 * Composes:
 *   - renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput
 *     (base render)
 */

import type { PrescriberEmergencyCard } from './prescriber-contact-card-emergency-card';
import type {
  EmergencyCardPdfTwoUpRosterTocHtmlAnchoredSearchInputOptions,
  EmergencyCardPdfTwoUpRosterTocHtmlAnchoredSearchInputResult,
} from './prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html-anchored-search-input';
import { renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput } from './prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html-anchored-search-input';

export interface EmergencyCardSearchInputI18nStrings {
  /** `placeholder` attribute on the search input. */
  placeholder: string;
  /** `aria-label` attribute on the search input. */
  ariaLabel: string;
  /** Visually-hidden empty-state hint span body. */
  emptyStateHint: string;
}

export interface EmergencyCardSearchInputI18nBundleStrings {
  placeholder?: string;
  ariaLabel?: string;
  emptyStateHint?: string;
}

export interface EmergencyCardSearchInputI18nBundle {
  /** Locale identifier (BCP 47), e.g. 'en-US', 'es-419', 'ja-JP'. */
  locale: string;
  /** Strings. Any missing key falls back to the English bundle. */
  strings: EmergencyCardSearchInputI18nBundleStrings;
}

/**
 * Built-in English reference bundle. Matches the base render's
 * hard-coded defaults exactly so callers copying this for a new
 * locale can keep the structural meaning intact.
 */
export const EMERGENCY_CARD_SEARCH_INPUT_I18N_EN: EmergencyCardSearchInputI18nStrings =
  {
    placeholder: 'Filter prescribers',
    ariaLabel:
      'Filter the table of contents by prescriber name or specialty',
    emptyStateHint: 'Type to filter; matches highlight as you type.',
  };

export interface EmergencyCardSearchInputI18nOptions
  extends Omit<
    EmergencyCardPdfTwoUpRosterTocHtmlAnchoredSearchInputOptions,
    'searchPlaceholder' | 'searchAriaLabel' | 'emptyStateHint'
  > {
  /**
   * Locale to render. The bundle keyed on this locale is used; any
   * missing key falls back to the English bundle.
   */
  locale: string;
  /**
   * Per-locale bundle. The English bundle is implicit (built-in
   * fallback).
   */
  bundle: EmergencyCardSearchInputI18nBundle;
}

export interface EmergencyCardSearchInputI18nResult
  extends EmergencyCardPdfTwoUpRosterTocHtmlAnchoredSearchInputResult {
  /** Locale the strings came from (always equals options.bundle.locale). */
  resolvedLocale: string;
  /** True when ANY key was filled from the English fallback. */
  fallbackUsed: boolean;
  /** Keys the bundle didn't provide (dotted paths). */
  missingKeys: string[];
}

function resolveString(
  bundle: EmergencyCardSearchInputI18nBundle,
  key: keyof EmergencyCardSearchInputI18nStrings,
  missingKeys: string[],
): string {
  const value = bundle.strings[key];
  if (value !== undefined) return value;
  missingKeys.push(key);
  return EMERGENCY_CARD_SEARCH_INPUT_I18N_EN[key];
}

/**
 * Render the anchored search-input TOC with localised chrome.
 *
 * Composes renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored
 * SearchInput so the data attributes + datalist + anchor map stay
 * consistent across locales; only the placeholder, aria-label, and
 * empty-state hint are rewritten via the bundle.
 *
 * Pure / deterministic.
 */
export function renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputI18n(
  emergencyCards: PrescriberEmergencyCard[],
  options: EmergencyCardSearchInputI18nOptions,
): EmergencyCardSearchInputI18nResult {
  const missingKeys: string[] = [];
  const bundle = options.bundle;

  const placeholder = resolveString(bundle, 'placeholder', missingKeys);
  const ariaLabel = resolveString(bundle, 'ariaLabel', missingKeys);
  const emptyStateHint = resolveString(bundle, 'emptyStateHint', missingKeys);

  // Run the base render with the resolved per-locale strings. The
  // base render does HTML escaping for placeholder + aria-label +
  // empty-state hint, so passing localised text directly is safe.
  const base = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput(
    emergencyCards,
    {
      ...options,
      searchPlaceholder: placeholder,
      searchAriaLabel: ariaLabel,
      emptyStateHint,
    },
  );

  return {
    ...base,
    resolvedLocale: bundle.locale,
    fallbackUsed: missingKeys.length > 0,
    missingKeys,
  };
}

/**
 * Convenience: one-line cron-log summary of the localised render.
 *
 *   "Search-input TOC (es-419): 14 entries (input 'toc-search',
 *    datalist 'toc-datalist' with 14 options)."
 *   "Search-input TOC (ja-JP): 0 entries (input 'toc-search', no
 *    datalist) (fallback: 2 keys)."
 */
export function summarizeEmergencyCardSearchInputI18n(
  result: EmergencyCardSearchInputI18nResult,
): string {
  const entries = result.tocEntries.length;
  const datalistPart =
    result.searchDatalistId === ''
      ? 'no datalist'
      : `datalist '${result.searchDatalistId}' with ${entries} options`;
  const fallbackPart = result.fallbackUsed
    ? ` (fallback: ${result.missingKeys.length} ${result.missingKeys.length === 1 ? 'key' : 'keys'})`
    : '';
  return (
    `Search-input TOC (${result.resolvedLocale}): ${entries} ` +
    `${entries === 1 ? 'entry' : 'entries'} (input '${result.searchInputId}', ${datalistPart})${fallbackPart}.`
  );
}

/**
 * Convenience: report bundle coverage against the full key set so
 * a CI job can flag locale bundles that are missing entries before
 * production rollout. Parallel to detectQuietHoursCalendarPrintableI18n
 * Coverage / detectBccTierPolicyCoverageWarningsHtmlPrintI18nCoverage.
 */
export interface EmergencyCardSearchInputI18nCoverage {
  /** Locale checked. */
  locale: string;
  /** Total expected keys (constant — 3). */
  expectedKeys: number;
  /** Keys the bundle supplied. */
  providedKeys: number;
  /** Keys missing from the bundle. */
  missingKeys: string[];
  /** 0.0 to 1.0 ratio. */
  coverage: number;
  /** True when every key was supplied. */
  isComplete: boolean;
}

const EXPECTED_KEYS: (keyof EmergencyCardSearchInputI18nStrings)[] = [
  'placeholder',
  'ariaLabel',
  'emptyStateHint',
];

export function detectEmergencyCardSearchInputI18nCoverage(
  bundle: EmergencyCardSearchInputI18nBundle,
): EmergencyCardSearchInputI18nCoverage {
  const missingKeys: string[] = [];
  for (const k of EXPECTED_KEYS) {
    if (bundle.strings[k] === undefined) missingKeys.push(k);
  }
  const providedKeys = EXPECTED_KEYS.length - missingKeys.length;
  const coverage =
    EXPECTED_KEYS.length === 0 ? 1 : providedKeys / EXPECTED_KEYS.length;
  return {
    locale: bundle.locale,
    expectedKeys: EXPECTED_KEYS.length,
    providedKeys,
    missingKeys,
    coverage,
    isComplete: missingKeys.length === 0,
  };
}

/**
 * Convenience: roll the same render across N locales in one call so
 * a multi-locale clinic chain can ship one portal with every locale
 * pre-rendered server-side. Returns a Map keyed on locale string.
 *
 * Each per-locale render is independent (no cross-locale state).
 *
 * Pure / deterministic.
 */
export function renderEmergencyCardSearchInputI18nMultiLocale(
  emergencyCards: PrescriberEmergencyCard[],
  bundles: EmergencyCardSearchInputI18nBundle[],
  baseOptions: Omit<EmergencyCardSearchInputI18nOptions, 'locale' | 'bundle'> = {},
): Map<string, EmergencyCardSearchInputI18nResult> {
  const out = new Map<string, EmergencyCardSearchInputI18nResult>();
  for (const bundle of bundles) {
    out.set(
      bundle.locale,
      renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputI18n(
        emergencyCards,
        { ...baseOptions, locale: bundle.locale, bundle },
      ),
    );
  }
  return out;
}
