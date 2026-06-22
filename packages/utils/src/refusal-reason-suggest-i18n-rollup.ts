/**
 * Refusal reason suggest i18n rollup.
 *
 * `refusal-reason-suggest` produces a suggestion per dose (one call,
 * one dose). `suggestRefusalReasonsBatch` already gives us per-dose
 * suggestions for an array. `refusal-reason-suggest-i18n` localises
 * a single suggestion's explanation string.
 *
 * The patient adjudication UI needs ALL THREE at once: walk a batch
 * of doses, compute the suggestion per dose, localise the
 * explanation, return the result keyed by doseId so the picker can
 * render N rows with N localised tooltips in a single pass.
 *
 * Doing this naively (3 nested loops in the caller) drops information
 * we want to preserve:
 *   - which doses had NO suggestion (the picker still needs to
 *     render those rows; "" tooltip is fine but the row count must
 *     be right);
 *   - which doses had a fallback (locale missing the key for that
 *     source);
 *   - per-source rollup counts so QA can see "98% of npo-window
 *     suggestions had localised text; 2 missed the locale table".
 *
 * This module is that batch helper. It walks a Dose[], computes the
 * suggestion per dose, applies the i18n bundle, and returns a map +
 * a coverage rollup the picker UI can read for telemetry.
 *
 * Pure / deterministic. No I/O.
 */

import type { Dose } from '@med/types';
import {
  suggestRefusalReason,
  type RefusalReasonSuggestInput,
  type RefusalReasonSuggestResult,
} from './refusal-reason-suggest';
import {
  renderRefusalReasonExplanation,
  type RefusalReasonI18nBundle,
  type RefusalReasonI18nKey,
  type RefusalReasonI18nResult,
} from './refusal-reason-suggest-i18n';

export interface LocalisedRefusalSuggestion {
  /** Dose this suggestion is for. Always present. */
  doseId: string;
  /**
   * Localised explanation + locale + fallback flag. Null when the
   * suggester returned no suggestion for this dose at all (the
   * picker should default to empty selection).
   */
  suggestion: RefusalReasonI18nResult | null;
  /** Stable suggester source discriminator. Null when no suggestion. */
  source: RefusalReasonI18nKey | null;
  /** Underlying RefusalReasonCode the picker should pre-select. Null when no suggestion. */
  reason: RefusalReasonSuggestResult['suggested'] extends infer T
    ? T extends { reason: infer R }
      ? R
      : null
    : null;
  /**
   * Localised alternatives in priority order (same data as
   * RefusalReasonSuggestResult.alternatives but with each
   * explanation localised). Empty when no suggestion fired.
   */
  alternatives: RefusalReasonI18nResult[];
}

export interface RefusalReasonI18nRollupCoverage {
  /** Total doses walked. */
  doseCount: number;
  /** Doses with at least one suggestion. */
  suggestedCount: number;
  /** Doses whose suggestion came back from i18n with fallback=true. */
  fallbackCount: number;
  /**
   * Per-source rollup: { 'npo-window': { suggested: 12, fallback: 1 }, ... }
   * Sources never observed are absent from the map.
   */
  bySource: Map<RefusalReasonI18nKey, { suggested: number; fallback: number }>;
  /**
   * Distinct placeholders the rendered templates referenced but
   * the renderer could not supply. Empty in the happy path.
   * Surfacing this lets caller QA flag bad locale entries without
   * iterating the per-dose result map.
   */
  missingPlaceholders: string[];
}

export interface RefusalReasonI18nRollupResult {
  /** Per-dose suggestions in input order. */
  suggestions: LocalisedRefusalSuggestion[];
  /** Quick lookup map keyed by doseId. */
  byDoseId: Map<string, LocalisedRefusalSuggestion>;
  /** Aggregate coverage rollup for telemetry / QA. */
  coverage: RefusalReasonI18nRollupCoverage;
}

function isI18nKey(s: string): s is RefusalReasonI18nKey {
  return (
    s === 'npo-window' ||
    s === 'prescriber-pause' ||
    s === 'out-of-supply' ||
    s === 'sleeping-window' ||
    s === 'recent-pattern'
  );
}

/**
 * Walk a Dose[], compute the suggestion per dose, localise every
 * suggestion via the bundle, return a map keyed on doseId plus a
 * coverage rollup.
 *
 * Doses for which the suggester fires NO rule still appear in the
 * result map (with suggestion=null) so the picker UI's row count
 * always matches the input doses.
 */
export function rollupLocalisedRefusalSuggestions(
  doses: Dose[],
  context: Omit<RefusalReasonSuggestInput, 'dose'>,
  bundle: RefusalReasonI18nBundle,
): RefusalReasonI18nRollupResult {
  const suggestions: LocalisedRefusalSuggestion[] = [];
  const byDoseId = new Map<string, LocalisedRefusalSuggestion>();
  const bySource = new Map<RefusalReasonI18nKey, { suggested: number; fallback: number }>();
  const missingPlaceholderSet = new Set<string>();
  let suggestedCount = 0;
  let fallbackCount = 0;

  for (const dose of doses) {
    const suggested = suggestRefusalReason({ ...context, dose });
    if (!suggested.suggested) {
      const entry: LocalisedRefusalSuggestion = {
        doseId: dose.id,
        suggestion: null,
        source: null,
        reason: null as never,
        alternatives: [],
      };
      suggestions.push(entry);
      byDoseId.set(dose.id, entry);
      continue;
    }
    const i18nResult = renderRefusalReasonExplanation(suggested.suggested, bundle);
    const alternatives = suggested.alternatives
      .filter((s) => s !== suggested.suggested)
      .map((s) => renderRefusalReasonExplanation(s, bundle));

    const source = isI18nKey(suggested.suggested.source) ? suggested.suggested.source : null;

    suggestedCount += 1;
    if (i18nResult.fallback) fallbackCount += 1;
    if (source) {
      const prev = bySource.get(source) ?? { suggested: 0, fallback: 0 };
      prev.suggested += 1;
      if (i18nResult.fallback) prev.fallback += 1;
      bySource.set(source, prev);
    }
    for (const m of i18nResult.missingPlaceholders) missingPlaceholderSet.add(m);
    for (const alt of alternatives) {
      for (const m of alt.missingPlaceholders) missingPlaceholderSet.add(m);
    }

    const entry: LocalisedRefusalSuggestion = {
      doseId: dose.id,
      suggestion: i18nResult,
      source,
      reason: suggested.suggested.reason as never,
      alternatives,
    };
    suggestions.push(entry);
    byDoseId.set(dose.id, entry);
  }

  return {
    suggestions,
    byDoseId,
    coverage: {
      doseCount: doses.length,
      suggestedCount,
      fallbackCount,
      bySource,
      missingPlaceholders: [...missingPlaceholderSet].sort(),
    },
  };
}

/**
 * Convenience: format the coverage rollup as a one-line summary for
 * cron logs / telemetry dashboards. Example:
 *   "Refusal suggester i18n: 42/50 suggested (1 fallback). Top
 *    source: npo-window (12). Missing placeholders: none."
 */
export function summarizeI18nRollupCoverage(coverage: RefusalReasonI18nRollupCoverage): string {
  const sources = [...coverage.bySource.entries()].sort((a, b) => b[1].suggested - a[1].suggested);
  const topSource =
    sources.length === 0
      ? 'none'
      : `${sources[0]![0]} (${sources[0]![1].suggested})`;
  const placeholderTail =
    coverage.missingPlaceholders.length === 0
      ? 'none'
      : coverage.missingPlaceholders.join(', ');
  return (
    `Refusal suggester i18n: ${coverage.suggestedCount}/${coverage.doseCount} suggested` +
    ` (${coverage.fallbackCount} fallback). ` +
    `Top source: ${topSource}. ` +
    `Missing placeholders: ${placeholderTail}.`
  );
}

/**
 * Convenience: filter the rollup suggestions to ONLY doses with a
 * non-null suggestion. Useful for the UI's "auto-fill applicable"
 * action which only writes rows the suggester had an opinion on.
 */
export function filterSuggestedOnly(
  rollup: RefusalReasonI18nRollupResult,
): LocalisedRefusalSuggestion[] {
  return rollup.suggestions.filter((s) => s.suggestion !== null);
}

/**
 * Convenience: group rollup suggestions by their stable i18n source
 * key. Doses without a suggestion are absent. Useful for the
 * adjudication UI's "review all NPO-rule suggestions" workflow.
 */
export function groupBySource(
  rollup: RefusalReasonI18nRollupResult,
): Map<RefusalReasonI18nKey, LocalisedRefusalSuggestion[]> {
  const out = new Map<RefusalReasonI18nKey, LocalisedRefusalSuggestion[]>();
  for (const s of rollup.suggestions) {
    if (!s.source) continue;
    const list = out.get(s.source) ?? [];
    list.push(s);
    out.set(s.source, list);
  }
  return out;
}
