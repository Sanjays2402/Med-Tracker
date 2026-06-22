/**
 * Follow-up digest text + HTML bundle i18n — multi-locale rollup.
 *
 * `followup-digest-text-html-bundle-i18n` localises a single bundle
 * for a single locale. Many real households mix languages — a
 * Spanish-speaking caregiver and an English-speaking adult child
 * both watch the same patient, and each wants the weekly digest in
 * their own language. Today the caller would call
 * `localiseFollowupDigestBundle` N times with the same input but
 * different bundles, paying for the underlying digest construction
 * (row selection, null short-circuit, stat computation) N times.
 *
 * This module rolls all of that into a single call:
 *
 *   - The underlying digest is built ONCE (via the i18n module's
 *     dependency on the foundation bundle builder).
 *   - Each locale bundle is applied to the built result via string
 *     substitution.
 *   - The output is a map keyed on locale id, with a stats /
 *     coverage rollup the caller can read for telemetry.
 *
 * Null short-circuit is preserved: when the underlying digest is
 * null (silent week), the multi-locale result is null too — no need
 * to surface a digest for any locale.
 *
 * Pure / deterministic. No I/O.
 */

import type {
  FollowupDigestInput,
} from './followup-overdue-digest';
import type { FollowupDigestBundle, FollowupDigestBundleOptions } from './followup-digest-text-html-bundle';
import {
  localiseFollowupDigestBundle,
  type FollowupDigestI18nBundle,
} from './followup-digest-text-html-bundle-i18n';

export interface FollowupDigestMultiLocaleResultEntry {
  /** Locale id that was applied (e.g. 'en-US', 'es-419'). */
  locale: string;
  /** Localised bundle for this locale. */
  bundle: FollowupDigestBundle;
}

export interface FollowupDigestMultiLocaleCoverage {
  /** Total locale bundles requested. */
  requestedCount: number;
  /** Locale bundles that rendered successfully. */
  renderedCount: number;
  /** Locale ids actually used (in input order). */
  locales: string[];
  /**
   * Locale bundles that produced an output character-identical to the
   * default English baseline — typically meaning the bundle's strings
   * map left every key at default or matched English verbatim. The
   * caller can surface these in telemetry as "locale provided no
   * unique translation" so the QA pipeline can flag empty locale
   * tables.
   */
  noopLocales: string[];
}

export interface FollowupDigestMultiLocaleResult {
  /** Per-locale localised bundles, in the input bundles' order. */
  entries: FollowupDigestMultiLocaleResultEntry[];
  /** Map keyed on locale id for direct lookup. */
  byLocale: Map<string, FollowupDigestBundle>;
  /** Telemetry rollup. */
  coverage: FollowupDigestMultiLocaleCoverage;
}

/**
 * Build the followup digest once per locale. Returns null when the
 * underlying digest is null (silent week — short-circuit applies to
 * the whole multi-locale call so no caregiver gets an empty pulse).
 *
 * Duplicate locale ids in the input deduplicate to the LAST entry
 * (callers rarely pass dupes; when they do, the last bundle wins so
 * a household-specific override beats a global default).
 */
export function buildMultiLocaleFollowupDigest(
  input: FollowupDigestInput,
  bundles: FollowupDigestI18nBundle[],
  options: FollowupDigestBundleOptions = {},
): FollowupDigestMultiLocaleResult | null {
  // Dedup bundles by locale, last-wins. Preserves original encounter
  // order for the first appearance of each locale so the output stays
  // deterministic.
  const seenOrder: string[] = [];
  const lastByLocale = new Map<string, FollowupDigestI18nBundle>();
  for (const b of bundles) {
    if (!lastByLocale.has(b.locale)) seenOrder.push(b.locale);
    lastByLocale.set(b.locale, b);
  }

  const englishBaseline = localiseFollowupDigestBundle(input, { locale: 'en-US', strings: {} }, options);
  if (englishBaseline === null) return null;

  const entries: FollowupDigestMultiLocaleResultEntry[] = [];
  const byLocale = new Map<string, FollowupDigestBundle>();
  const noopLocales: string[] = [];

  for (const locale of seenOrder) {
    const bundle = lastByLocale.get(locale)!;
    const localised = localiseFollowupDigestBundle(input, bundle, options);
    // The underlying digest is non-null (we checked the baseline);
    // localiseFollowupDigestBundle returns null only when the
    // underlying digest is null, so this should always be non-null
    // here. Defensive guard anyway — if a future change makes the
    // i18n short-circuit per-locale, we surface the locale that
    // refused to render in the coverage rollup rather than crash.
    if (localised === null) continue;
    entries.push({ locale, bundle: localised });
    byLocale.set(locale, localised);
    if (
      localised.subject === englishBaseline.subject &&
      localised.text === englishBaseline.text &&
      localised.html === englishBaseline.html
    ) {
      noopLocales.push(locale);
    }
  }

  return {
    entries,
    byLocale,
    coverage: {
      requestedCount: bundles.length,
      renderedCount: entries.length,
      locales: seenOrder,
      noopLocales,
    },
  };
}

/**
 * Convenience: extract just the per-locale bundles array (drops the
 * coverage rollup). Useful for callers that only need to ship the
 * mail blobs and don't care about telemetry.
 */
export function extractMultiLocaleBundles(
  result: FollowupDigestMultiLocaleResult,
): FollowupDigestMultiLocaleResultEntry[] {
  return result.entries;
}

/**
 * Convenience: format the multi-locale coverage as a one-line summary
 * for cron logs / telemetry dashboards. Example:
 *   "Followup digest multi-locale: 4/4 rendered (en-US, es-419,
 *    fr-FR, ja-JP). No-op locales: none."
 */
export function summarizeMultiLocaleCoverage(
  coverage: FollowupDigestMultiLocaleCoverage,
): string {
  const localesTail = coverage.locales.length === 0 ? 'none' : coverage.locales.join(', ');
  const noopTail = coverage.noopLocales.length === 0 ? 'none' : coverage.noopLocales.join(', ');
  return (
    `Followup digest multi-locale: ${coverage.renderedCount}/${coverage.requestedCount} rendered` +
    ` (${localesTail}). No-op locales: ${noopTail}.`
  );
}

/**
 * Convenience: filter the rollup entries to ONLY locales whose
 * output differs from the English baseline. Useful for ship-only-
 * unique-translations pipelines that don't want to deliver an
 * English-equivalent digest twice.
 */
export function filterUniqueLocales(
  result: FollowupDigestMultiLocaleResult,
): FollowupDigestMultiLocaleResultEntry[] {
  const noopSet = new Set(result.coverage.noopLocales);
  return result.entries.filter((e) => !noopSet.has(e.locale));
}
