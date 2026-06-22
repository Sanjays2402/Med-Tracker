/**
 * Refusal reason suggest i18n.
 *
 * `refusal-reason-suggest` returns a `RefusalReasonSuggestion` whose
 * `explanation` field is English-only ("Scheduled date falls inside a
 * known NPO window."). The picker tooltip on the patient UI needs to
 * show this string to the user, who may not read English. We have a
 * stable `source` discriminator on every suggestion so the rule
 * vocabulary doesn't depend on string content — i18n becomes a
 * lookup keyed on that discriminator plus a small parameter bag.
 *
 * This module is the i18n layer. It does NOT change the rule logic
 * (English explanations stay in the suggester so cron logs and dev
 * tools remain stable); it produces a localised string given a
 * suggestion + locale + string table.
 *
 * Design choices:
 *
 *   - String tables are pure JS objects, not file-backed. Callers
 *     bundle the locale(s) they need into the app boot path; we don't
 *     pretend to be a runtime gettext.
 *   - Strings use ICU-style {placeholders} (no fancy plurals — none
 *     of our explanations are plural-sensitive). One missing
 *     placeholder is logged in the result's `missingPlaceholders`
 *     list, not thrown; the tooltip still renders.
 *   - Falls back to the suggestion's English explanation when the
 *     locale is missing the key. The patient gets SOMETHING readable
 *     rather than a blank tooltip.
 *   - Ships a built-in English table that mirrors the suggester's
 *     own strings; callers extending to a new locale start by
 *     copying that table.
 *
 * Pure / deterministic. No I/O.
 */

import type {
  RefusalReasonSuggestion,
  RefusalReasonSuggestResult,
} from './refusal-reason-suggest';

/**
 * Stable identifier used as the i18n key. Matches
 * RefusalReasonSuggestion.source one-to-one so the i18n layer never
 * has to parse explanation strings.
 */
export type RefusalReasonI18nKey =
  | 'npo-window'
  | 'prescriber-pause'
  | 'out-of-supply'
  | 'sleeping-window'
  | 'recent-pattern';

/**
 * Per-key string table. Each value is an ICU-style template with
 * named {placeholders}. We document the available placeholders so a
 * translator knows what's substitutable.
 *
 * Placeholders available per key (DO NOT add new ones without
 * updating the renderer):
 *   npo-window:        {reason} — free-form NPO reason (may be '').
 *   prescriber-pause:  {reason} — free-form pause reason (may be '').
 *   out-of-supply:     (no placeholders)
 *   sleeping-window:   {time}   — HH:MM scheduled time.
 *                       {start}  — sleep window start (HH:MM).
 *                       {end}    — sleep window end (HH:MM).
 *   recent-pattern:    {count}  — number of refusals in window.
 *                       {days}   — window length in days.
 *                       {reason} — top reason (the medication-refusal-log
 *                                  RefusalReasonCode string).
 */
export type RefusalReasonI18nTable = Record<RefusalReasonI18nKey, string>;

export interface RefusalReasonI18nBundle {
  /** Locale identifier (BCP 47), e.g. 'en-US', 'es-419'. */
  locale: string;
  /** Strings keyed by RefusalReasonI18nKey. */
  strings: Partial<RefusalReasonI18nTable>;
}

export interface RefusalReasonI18nResult {
  /** Localised explanation string. */
  text: string;
  /** Locale actually used. May be 'en-US' (fallback) when locale missing. */
  locale: string;
  /** True when the suggester's English fallback was used. */
  fallback: boolean;
  /**
   * Placeholders the template referenced but the renderer could not
   * supply (left unsubstituted in the output). Empty in the happy
   * path. Surfacing this lets callers log bad templates without
   * crashing the UI.
   */
  missingPlaceholders: string[];
}

/**
 * Built-in English table. Matches the suggester's own strings as of
 * tick 14; callers copying this for a new locale should keep the
 * placeholder set intact.
 */
export const REFUSAL_REASON_I18N_EN: RefusalReasonI18nTable = {
  'npo-window': 'Scheduled date falls inside a known NPO window{reasonSuffix}.',
  'prescriber-pause':
    'Prescriber paused this medication for the current window{reasonSuffix}.',
  'out-of-supply': 'No supply remaining for this medication on the dose date.',
  'sleeping-window':
    "Scheduled time {time} falls inside the patient's sleep window ({start}\u2013{end}).",
  'recent-pattern':
    'Patient refused this medication {count} time(s) in the last {days} days citing "{reason}".',
};

const FALLBACK_LOCALE = 'en-US';

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
 * Extract structured placeholders from a suggestion's English text.
 * The suggester's templates are simple enough to recover the
 * substitutions deterministically; doing it here avoids changing the
 * suggester's public shape.
 *
 * Where the parse fails (e.g. unrecognised template), the i18n layer
 * falls back to the suggestion's full English explanation — the user
 * sees readable text either way.
 */
function extractPlaceholders(
  suggestion: RefusalReasonSuggestion,
): { ok: true; values: Record<string, string> } | { ok: false } {
  const values: Record<string, string> = {};
  switch (suggestion.source) {
    case 'npo-window': {
      // "Scheduled date falls inside a known NPO window[ (reason)]."
      const m = /known NPO window(?: \(([^)]*)\))?\.$/.exec(suggestion.explanation);
      if (!m) return { ok: false };
      const reason = m[1] ?? '';
      values.reason = reason;
      values.reasonSuffix = reason ? ` (${reason})` : '';
      return { ok: true, values };
    }
    case 'prescriber-pause': {
      const m = /current window(?: \(([^)]*)\))?\.$/.exec(suggestion.explanation);
      if (!m) return { ok: false };
      const reason = m[1] ?? '';
      values.reason = reason;
      values.reasonSuffix = reason ? ` (${reason})` : '';
      return { ok: true, values };
    }
    case 'out-of-supply':
      return { ok: true, values: {} };
    case 'sleeping-window': {
      // "Scheduled time HH:MM falls inside the patient's sleep window (HH:MM\u2013HH:MM)."
      const m =
        /Scheduled time (\d{2}:\d{2}) falls inside the patient's sleep window \((\d{2}:\d{2})[\u2013\-](\d{2}:\d{2})\)\.$/.exec(
          suggestion.explanation,
        );
      if (!m) return { ok: false };
      values.time = m[1]!;
      values.start = m[2]!;
      values.end = m[3]!;
      return { ok: true, values };
    }
    case 'recent-pattern': {
      // "Patient refused this medication N time(s) in the last D days citing "REASON"."
      const m =
        /Patient refused this medication (\d+) times? in the last (\d+) days citing "([^"]*)"\.$/.exec(
          suggestion.explanation,
        );
      if (!m) return { ok: false };
      values.count = m[1]!;
      values.days = m[2]!;
      values.reason = m[3]!;
      return { ok: true, values };
    }
  }
}

/**
 * Substitute {placeholders} in template using values. Unknown
 * placeholders are left as-is and reported in the result's missing
 * list so the UI can surface bad locale entries.
 */
function renderTemplate(
  template: string,
  values: Record<string, string>,
): { text: string; missing: string[] } {
  const missing: string[] = [];
  const text = template.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (full, key: string) => {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      return values[key]!;
    }
    missing.push(key);
    return full;
  });
  return { text, missing };
}

/**
 * Render a refusal-reason suggestion's explanation in the requested
 * locale. The bundle is the caller's responsibility — they decide
 * which locales the app ships with.
 *
 * Falls back to the English explanation stored on the suggestion if:
 *   - the locale is missing the key for this source, OR
 *   - the placeholder extraction fails (unrecognised English template).
 *
 * The fallback case is the suggestion's full original text so the UI
 * still has SOMETHING readable.
 */
export function renderRefusalReasonExplanation(
  suggestion: RefusalReasonSuggestion,
  bundle: RefusalReasonI18nBundle,
): RefusalReasonI18nResult {
  if (!isI18nKey(suggestion.source)) {
    return {
      text: suggestion.explanation,
      locale: FALLBACK_LOCALE,
      fallback: true,
      missingPlaceholders: [],
    };
  }
  const template = bundle.strings[suggestion.source];
  if (!template) {
    return {
      text: suggestion.explanation,
      locale: FALLBACK_LOCALE,
      fallback: true,
      missingPlaceholders: [],
    };
  }
  const extracted = extractPlaceholders(suggestion);
  if (!extracted.ok) {
    return {
      text: suggestion.explanation,
      locale: FALLBACK_LOCALE,
      fallback: true,
      missingPlaceholders: [],
    };
  }
  const { text, missing } = renderTemplate(template, extracted.values);
  return {
    text,
    locale: bundle.locale,
    fallback: false,
    missingPlaceholders: missing,
  };
}

/**
 * Convenience: render the best suggestion + each alternative from a
 * full RefusalReasonSuggestResult. Returns null when result.suggested
 * is null. Useful when the UI shows a primary tooltip plus a
 * "see alternatives" drawer.
 */
export interface LocalisedRefusalReasonResult {
  suggested: RefusalReasonI18nResult;
  alternatives: RefusalReasonI18nResult[];
  /** Mirror of the underlying RefusalReasonCode for the picker default. */
  reason: RefusalReasonSuggestion['reason'];
}

export function localiseRefusalReasonResult(
  result: RefusalReasonSuggestResult,
  bundle: RefusalReasonI18nBundle,
): LocalisedRefusalReasonResult | null {
  if (!result.suggested) return null;
  const suggested = renderRefusalReasonExplanation(result.suggested, bundle);
  const alternatives = result.alternatives.map((s) =>
    renderRefusalReasonExplanation(s, bundle),
  );
  return {
    suggested,
    alternatives,
    reason: result.suggested.reason,
  };
}

/**
 * Validate that a candidate i18n table has all required keys and
 * (optionally) the right placeholder set per key. Useful for CI
 * checks of contributor-submitted locale files.
 *
 * Returns an array of validation errors; empty array means the table
 * passes.
 */
export interface RefusalReasonI18nValidationError {
  key: RefusalReasonI18nKey;
  code:
    | 'missing-key'
    | 'missing-placeholder'
    | 'unknown-placeholder';
  detail: string;
}

const REQUIRED_PLACEHOLDERS: Record<RefusalReasonI18nKey, string[]> = {
  'npo-window': ['reasonSuffix'],
  'prescriber-pause': ['reasonSuffix'],
  'out-of-supply': [],
  'sleeping-window': ['time', 'start', 'end'],
  'recent-pattern': ['count', 'days', 'reason'],
};

const ALLOWED_PLACEHOLDERS: Record<RefusalReasonI18nKey, ReadonlySet<string>> = {
  'npo-window': new Set(['reason', 'reasonSuffix']),
  'prescriber-pause': new Set(['reason', 'reasonSuffix']),
  'out-of-supply': new Set([]),
  'sleeping-window': new Set(['time', 'start', 'end']),
  'recent-pattern': new Set(['count', 'days', 'reason']),
};

export function validateRefusalReasonI18nTable(
  strings: Partial<RefusalReasonI18nTable>,
): RefusalReasonI18nValidationError[] {
  const errors: RefusalReasonI18nValidationError[] = [];
  const keys: RefusalReasonI18nKey[] = [
    'npo-window',
    'prescriber-pause',
    'out-of-supply',
    'sleeping-window',
    'recent-pattern',
  ];
  for (const key of keys) {
    const template = strings[key];
    if (template === undefined || template === null || template === '') {
      errors.push({ key, code: 'missing-key', detail: `template for "${key}" is empty` });
      continue;
    }
    const found = new Set<string>();
    template.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (_full, name: string) => {
      found.add(name);
      return '';
    });
    for (const req of REQUIRED_PLACEHOLDERS[key]) {
      if (!found.has(req)) {
        errors.push({
          key,
          code: 'missing-placeholder',
          detail: `template missing required placeholder "{${req}}"`,
        });
      }
    }
    const allowed = ALLOWED_PLACEHOLDERS[key];
    for (const f of found) {
      if (!allowed.has(f)) {
        errors.push({
          key,
          code: 'unknown-placeholder',
          detail: `unknown placeholder "{${f}}" for source "${key}"`,
        });
      }
    }
  }
  return errors;
}
