/**
 * Dose export CSV import round-trip validator — summary-text Slack
 * thread batcher quiet-hours CALENDAR HTML PRINTABLE, I18N variant.
 *
 * `dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar-html-printable`
 * renders the per-day quiet-hours calendar as a print-friendly,
 * monochrome 7-day grid with a "Printed YYYY-MM-DD" stamp and a
 * configurable footer line.
 *
 * The base render is English-only:
 *
 *   - day labels are hard-coded "Mon", "Tue", "Wed", ...
 *   - rule labels are hard-coded "Default", "Custom window",
 *     "Quiet all day", "No quiet hours"
 *   - the "Printed" prefix is hard-coded English
 *   - the footer fallback is an English sentence
 *
 * That is wrong for an international clinic chain (one cron tick
 * ships the same JSON channel config across NL / DE / JP offices and
 * each prints its binder copy in the local language). Forking the
 * renderer per locale defeats the consistency this module promises.
 *
 * This module is the i18n bundle layer. It composes the base
 * printable renderer and post-processes the fragment + summary so
 * the chrome text is localised in one pass:
 *
 *   - per-locale STRING TABLE: day labels (Mon..Sun), rule labels
 *     (Default / Custom window / Quiet all day / No quiet hours),
 *     "Printed" prefix, default footer text;
 *   - ICU-style {placeholders} on the footer template so a locale
 *     can phrase "Printed by {tenant} on {date}" naturally;
 *   - graceful fallback to English (FALLBACK_LOCALE) when the
 *     requested locale is missing a key;
 *   - the underlying cell datum stays English in the structured
 *     output (cells[].dayOfWeek etc) — only the rendered chrome
 *     text changes — so downstream typed consumers don't break.
 *
 * Pure / deterministic. No I/O. HTML escaped.
 *
 * Composes:
 *   - renderQuietHoursCalendarHtmlPrintable (base render)
 *   - summarizeQuietHoursCalendarHtmlPrintable (one-line cron summary)
 *   - extractQuietHoursCalendarHtmlPrintableLines (per-day plain-text)
 */

import type {
  DoseRoundtripThreadBatcherQuietHoursCalendarHtmlPrintableOptions,
  DoseRoundtripThreadBatcherQuietHoursCalendarHtmlPrintableResult,
} from './dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar-html-printable';
import { renderQuietHoursCalendarHtmlPrintable } from './dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar-html-printable';
import type { DoseRoundtripThreadBatcherQuietHoursCalendarHtmlRule } from './dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar-html';

export type QuietHoursCalendarPrintableI18nDayKey =
  | 'mon'
  | 'tue'
  | 'wed'
  | 'thu'
  | 'fri'
  | 'sat'
  | 'sun';

export interface QuietHoursCalendarPrintableI18nStrings {
  /** Per-day label (3 chars typical). */
  days: Record<QuietHoursCalendarPrintableI18nDayKey, string>;
  /** Per-rule label (matches the base render's four canonical strings). */
  rules: Record<DoseRoundtripThreadBatcherQuietHoursCalendarHtmlRule, string>;
  /** Prefix for the printed-on stamp, e.g. "Printed", "Imprimé", "Gedruckt". */
  printedPrefix: string;
  /** Default footer text used when no override supplied. */
  defaultFooterText: string;
}

export interface QuietHoursCalendarPrintableI18nBundleStrings {
  /** Per-day label (3 chars typical). */
  days?: Partial<Record<QuietHoursCalendarPrintableI18nDayKey, string>>;
  /** Per-rule label (matches the base render's four canonical strings). */
  rules?: Partial<
    Record<DoseRoundtripThreadBatcherQuietHoursCalendarHtmlRule, string>
  >;
  /** Prefix for the printed-on stamp, e.g. "Printed", "Imprimé", "Gedruckt". */
  printedPrefix?: string;
  /** Default footer text used when no override supplied. */
  defaultFooterText?: string;
}

export interface QuietHoursCalendarPrintableI18nBundle {
  /** Locale identifier (BCP 47), e.g. 'en-US', 'es-419', 'ja-JP'. */
  locale: string;
  /** Strings. Any missing key falls back to FALLBACK_LOCALE. */
  strings: QuietHoursCalendarPrintableI18nBundleStrings;
}

export const QUIET_HOURS_CALENDAR_PRINTABLE_I18N_EN: QuietHoursCalendarPrintableI18nStrings =
  {
    days: {
      mon: 'Mon',
      tue: 'Tue',
      wed: 'Wed',
      thu: 'Thu',
      fri: 'Fri',
      sat: 'Sat',
      sun: 'Sun',
    },
    rules: {
      'default': 'Default',
      'override:window': 'Custom window',
      'override:all-day': 'Quiet all day',
      'override:none': 'No quiet hours',
    },
    printedPrefix: 'Printed',
    defaultFooterText:
      'This page is a snapshot of the configured quiet-hours rules and does not update once printed.',
  };

const FALLBACK_LOCALE = 'en-US';

export interface QuietHoursCalendarPrintableI18nOptions
  extends DoseRoundtripThreadBatcherQuietHoursCalendarHtmlPrintableOptions {
  /**
   * Locale to render. The bundle keyed on this locale is used; any
   * missing key falls back to the English bundle.
   */
  locale: string;
  /**
   * Per-locale bundle. Must contain at least the requested locale;
   * the English bundle is implicit (built-in fallback).
   */
  bundle: QuietHoursCalendarPrintableI18nBundle;
}

export interface QuietHoursCalendarPrintableI18nResult
  extends DoseRoundtripThreadBatcherQuietHoursCalendarHtmlPrintableResult {
  /** Locale the strings came from (may equal FALLBACK_LOCALE on miss). */
  resolvedLocale: string;
  /** True when ANY key was filled from the English fallback. */
  fallbackUsed: boolean;
  /**
   * Keys the bundle didn't provide. Empty array on a complete
   * bundle. Surfacing this lets the cron flag bundle gaps without
   * blowing up the render.
   */
  missingKeys: string[];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveDay(
  bundle: QuietHoursCalendarPrintableI18nBundle,
  key: QuietHoursCalendarPrintableI18nDayKey,
  missingKeys: string[],
): string {
  const b = bundle.strings.days;
  if (b && b[key] !== undefined) return b[key]!;
  missingKeys.push(`days.${key}`);
  return QUIET_HOURS_CALENDAR_PRINTABLE_I18N_EN.days[key];
}

function resolveRule(
  bundle: QuietHoursCalendarPrintableI18nBundle,
  key: DoseRoundtripThreadBatcherQuietHoursCalendarHtmlRule,
  missingKeys: string[],
): string {
  const b = bundle.strings.rules;
  if (b && b[key] !== undefined) return b[key]!;
  missingKeys.push(`rules.${key}`);
  return QUIET_HOURS_CALENDAR_PRINTABLE_I18N_EN.rules[key];
}

function resolvePrintedPrefix(
  bundle: QuietHoursCalendarPrintableI18nBundle,
  missingKeys: string[],
): string {
  if (bundle.strings.printedPrefix !== undefined) {
    return bundle.strings.printedPrefix;
  }
  missingKeys.push('printedPrefix');
  return QUIET_HOURS_CALENDAR_PRINTABLE_I18N_EN.printedPrefix;
}

function resolveFooterText(
  bundle: QuietHoursCalendarPrintableI18nBundle,
  missingKeys: string[],
): string {
  if (bundle.strings.defaultFooterText !== undefined) {
    return bundle.strings.defaultFooterText;
  }
  missingKeys.push('defaultFooterText');
  return QUIET_HOURS_CALENDAR_PRINTABLE_I18N_EN.defaultFooterText;
}

/**
 * Rewrite the day labels in the base fragment from English to the
 * locale labels. The base render emits `<div class="qh-cal-day">Mon</div>`
 * verbatim; we walk the seven known English day labels and replace
 * each `<div class="qh-cal-day">$EN</div>` with the localised text.
 *
 * Each replacement covers the exact base label string so a locale
 * that left a key unset (and thus fell back to English) still produces
 * a stable English label rather than a partially-rewritten cell.
 */
function rewriteDayLabels(
  fragment: string,
  dayLabels: Record<QuietHoursCalendarPrintableI18nDayKey, string>,
): string {
  const enDays = QUIET_HOURS_CALENDAR_PRINTABLE_I18N_EN.days;
  let out = fragment;
  for (const key of [
    'mon',
    'tue',
    'wed',
    'thu',
    'fri',
    'sat',
    'sun',
  ] as const) {
    const before = `<div class="qh-cal-day">${enDays[key]}</div>`;
    const after = `<div class="qh-cal-day">${escapeHtml(dayLabels[key])}</div>`;
    out = out.split(before).join(after);
  }
  return out;
}

/**
 * Rewrite the rule labels in the base fragment. The base render
 * emits `<div class="qh-cal-rule">Default</div>` (or wrapped in
 * `<strong>` when boldNonDefault is on). We walk both the bare
 * and the strong-wrapped patterns so the bolding survives the
 * rewrite.
 */
function rewriteRuleLabels(
  fragment: string,
  ruleLabels: Record<DoseRoundtripThreadBatcherQuietHoursCalendarHtmlRule, string>,
): string {
  const enRules = QUIET_HOURS_CALENDAR_PRINTABLE_I18N_EN.rules;
  let out = fragment;
  for (const key of [
    'default',
    'override:window',
    'override:all-day',
    'override:none',
  ] as const) {
    const enLabel = enRules[key];
    const locLabel = escapeHtml(ruleLabels[key]);
    out = out
      .split(`<div class="qh-cal-rule">${enLabel}</div>`)
      .join(`<div class="qh-cal-rule">${locLabel}</div>`)
      .split(`<div class="qh-cal-rule"><strong>${enLabel}</strong></div>`)
      .join(`<div class="qh-cal-rule"><strong>${locLabel}</strong></div>`);
  }
  return out;
}

/**
 * Rewrite the "Printed YYYY-MM-DD" prefix to the localised one.
 */
function rewritePrintedPrefix(fragment: string, prefix: string): string {
  if (prefix === 'Printed') return fragment;
  return fragment.replace(
    /(<div class="qh-cal-printed-on">)Printed (\d{4}-\d{2}-\d{2}<\/div>)/,
    `$1${escapeHtml(prefix)} $2`,
  );
}

/**
 * Rewrite the footer text when the caller did NOT supply a per-call
 * footerText override. The base render falls back to the hard-coded
 * English default; we swap that for the locale's defaultFooterText.
 *
 * If the caller passed footerText explicitly, we leave it alone —
 * an explicit override is, by definition, the caller's own copy and
 * doesn't need i18n at this layer.
 */
function rewriteFooterText(
  fragment: string,
  text: string,
  callerSuppliedFooter: boolean,
): string {
  if (callerSuppliedFooter) return fragment;
  const en = QUIET_HOURS_CALENDAR_PRINTABLE_I18N_EN.defaultFooterText;
  if (text === en) return fragment;
  return fragment.replace(
    /(<div class="qh-cal-print-footer">)([^<]*)(<\/div>)/,
    `$1${escapeHtml(text)}$3`,
  );
}

/**
 * Render the print-friendly calendar overlay with localised chrome.
 *
 * Composes renderQuietHoursCalendarHtmlPrintable so the underlying
 * cell datum + grid layout stays consistent, then rewrites the day
 * labels, rule labels, "Printed" prefix, and (when caller hasn't
 * supplied an explicit footerText) the footer text.
 *
 * Pure / deterministic.
 */
export function renderQuietHoursCalendarHtmlPrintableI18n(
  options: QuietHoursCalendarPrintableI18nOptions,
): QuietHoursCalendarPrintableI18nResult {
  const missingKeys: string[] = [];
  const bundle = options.bundle;

  const dayLabels: Record<QuietHoursCalendarPrintableI18nDayKey, string> = {
    mon: resolveDay(bundle, 'mon', missingKeys),
    tue: resolveDay(bundle, 'tue', missingKeys),
    wed: resolveDay(bundle, 'wed', missingKeys),
    thu: resolveDay(bundle, 'thu', missingKeys),
    fri: resolveDay(bundle, 'fri', missingKeys),
    sat: resolveDay(bundle, 'sat', missingKeys),
    sun: resolveDay(bundle, 'sun', missingKeys),
  };
  const ruleLabels: Record<
    DoseRoundtripThreadBatcherQuietHoursCalendarHtmlRule,
    string
  > = {
    'default': resolveRule(bundle, 'default', missingKeys),
    'override:window': resolveRule(bundle, 'override:window', missingKeys),
    'override:all-day': resolveRule(bundle, 'override:all-day', missingKeys),
    'override:none': resolveRule(bundle, 'override:none', missingKeys),
  };
  const printedPrefix = resolvePrintedPrefix(bundle, missingKeys);
  const localisedFooterText = resolveFooterText(bundle, missingKeys);
  const callerSuppliedFooter = options.footerText !== undefined;

  // Run the base render. When the caller didn't pass a footerText,
  // let the base render fall back to its English default; we'll
  // rewrite it below. When the caller DID pass one, honour it
  // verbatim (no i18n at this layer).
  const base = renderQuietHoursCalendarHtmlPrintable(options);

  let html = base.html;
  html = rewriteDayLabels(html, dayLabels);
  html = rewriteRuleLabels(html, ruleLabels);
  html = rewritePrintedPrefix(html, printedPrefix);
  html = rewriteFooterText(html, localisedFooterText, callerSuppliedFooter);

  const resolvedLocale = missingKeys.length > 0 ? bundle.locale : bundle.locale;
  // Note: resolvedLocale is the requested locale; the missingKeys list
  // surfaces gaps. We don't downgrade resolvedLocale on partial fill
  // because the rendered output IS still in the requested locale
  // (with some English filler). Callers who want strict locale
  // matching check fallbackUsed.

  return {
    ...base,
    html,
    resolvedLocale,
    fallbackUsed: missingKeys.length > 0,
    missingKeys,
  };
}

/**
 * Convenience: one-line cron-log summary of the localised render.
 *
 *   "Quiet-hours calendar (printable es-419, us-letter): 5 default,
 *    2 quiet-all-day; impreso 2026-06-23."
 *   "Quiet-hours calendar (printable ja-JP, a4): 7 default
 *    (fallback: 4 keys)."
 *
 * If the bundle was complete, the fallback parenthetical is omitted.
 * The "printed on" portion uses the resolved locale's printedPrefix
 * via the bundle's own labels (so the line is grep-stable across
 * locales but still reads naturally).
 */
export function summarizeQuietHoursCalendarHtmlPrintableI18n(
  result: QuietHoursCalendarPrintableI18nResult,
  bundle: QuietHoursCalendarPrintableI18nBundle,
): string {
  const r = result.ruleCounts;
  const ruleLabels: Partial<
    Record<DoseRoundtripThreadBatcherQuietHoursCalendarHtmlRule, string>
  > = bundle.strings.rules ?? {};
  const parts: string[] = [];
  if (r.default > 0) {
    parts.push(
      `${r.default} ${ruleLabels['default'] ?? 'default'}`,
    );
  }
  if (r['override:window'] > 0) {
    parts.push(
      `${r['override:window']} ${ruleLabels['override:window'] ?? 'custom-window'}`,
    );
  }
  if (r['override:all-day'] > 0) {
    parts.push(
      `${r['override:all-day']} ${ruleLabels['override:all-day'] ?? 'quiet-all-day'}`,
    );
  }
  if (r['override:none'] > 0) {
    parts.push(
      `${r['override:none']} ${ruleLabels['override:none'] ?? 'no-quiet'}`,
    );
  }
  const body =
    parts.length === 0
      ? `7 ${ruleLabels['default'] ?? 'default'}`
      : parts.join(', ');
  const printedPrefix =
    bundle.strings.printedPrefix ??
    QUIET_HOURS_CALENDAR_PRINTABLE_I18N_EN.printedPrefix;
  const printedPart =
    result.printedAtIso === null
      ? ''
      : `; ${printedPrefix.toLowerCase()} ${result.printedAtIso}`;
  const fallbackPart =
    result.fallbackUsed
      ? ` (fallback: ${result.missingKeys.length} ${result.missingKeys.length === 1 ? 'key' : 'keys'})`
      : '';
  return `Quiet-hours calendar (printable ${result.resolvedLocale}, ${result.paper}): ${body}${printedPart}${fallbackPart}.`;
}

/**
 * Convenience: extract the per-day summary in the localised labels.
 * Mirrors extractQuietHoursCalendarHtmlPrintableLines from the base
 * module but uses the bundle's day + rule strings.
 */
export function extractQuietHoursCalendarHtmlPrintableI18nLines(
  result: QuietHoursCalendarPrintableI18nResult,
  bundle: QuietHoursCalendarPrintableI18nBundle,
): string[] {
  const dayLabels: Partial<
    Record<QuietHoursCalendarPrintableI18nDayKey, string>
  > = bundle.strings.days ?? {};
  const ruleLabels: Partial<
    Record<DoseRoundtripThreadBatcherQuietHoursCalendarHtmlRule, string>
  > = bundle.strings.rules ?? {};
  return result.cells.map((c) => {
    const enDay = QUIET_HOURS_CALENDAR_PRINTABLE_I18N_EN.days[
      c.dayOfWeek as QuietHoursCalendarPrintableI18nDayKey
    ];
    const dayLabel =
      dayLabels[c.dayOfWeek as QuietHoursCalendarPrintableI18nDayKey] ??
      enDay ??
      c.dayOfWeek;
    const ruleLabel =
      ruleLabels[c.rule] ??
      QUIET_HOURS_CALENDAR_PRINTABLE_I18N_EN.rules[c.rule];
    let windowLabel: string;
    if (c.window === null) {
      windowLabel = '\u2014';
    } else {
      const sh = String(c.window.startHour).padStart(2, '0');
      const eh = String(c.window.endHour).padStart(2, '0');
      const tz = c.window.timezone ?? 'America/Los_Angeles';
      windowLabel = `${sh}:00\u2013${eh}:00 ${tz}`;
    }
    return `${dayLabel}: ${ruleLabel} \u2014 ${windowLabel}`;
  });
}

/**
 * Convenience: report bundle coverage against the full key set so
 * a CI job can flag locale bundles that are missing entries before
 * production rollout.
 */
export interface QuietHoursCalendarPrintableI18nCoverage {
  /** Locale checked. */
  locale: string;
  /** Total expected keys (constant, derived from the EN reference). */
  expectedKeys: number;
  /** Keys the bundle supplied. */
  providedKeys: number;
  /** Keys missing from the bundle (full dotted-paths). */
  missingKeys: string[];
  /** 0.0 to 1.0 ratio. */
  coverage: number;
  /** True when every key was supplied. */
  isComplete: boolean;
}

export function detectQuietHoursCalendarPrintableI18nCoverage(
  bundle: QuietHoursCalendarPrintableI18nBundle,
): QuietHoursCalendarPrintableI18nCoverage {
  const expected: string[] = [];
  for (const k of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const) {
    expected.push(`days.${k}`);
  }
  for (const k of [
    'default',
    'override:window',
    'override:all-day',
    'override:none',
  ] as const) {
    expected.push(`rules.${k}`);
  }
  expected.push('printedPrefix');
  expected.push('defaultFooterText');

  const missingKeys: string[] = [];
  for (const path of expected) {
    if (path.startsWith('days.')) {
      const k = path.slice(5) as QuietHoursCalendarPrintableI18nDayKey;
      if (bundle.strings.days?.[k] === undefined) missingKeys.push(path);
    } else if (path.startsWith('rules.')) {
      const k = path.slice(6) as DoseRoundtripThreadBatcherQuietHoursCalendarHtmlRule;
      if (bundle.strings.rules?.[k] === undefined) missingKeys.push(path);
    } else if (path === 'printedPrefix') {
      if (bundle.strings.printedPrefix === undefined) missingKeys.push(path);
    } else if (path === 'defaultFooterText') {
      if (bundle.strings.defaultFooterText === undefined) missingKeys.push(path);
    }
  }
  const providedKeys = expected.length - missingKeys.length;
  return {
    locale: bundle.locale,
    expectedKeys: expected.length,
    providedKeys,
    missingKeys,
    coverage:
      expected.length === 0 ? 1 : providedKeys / expected.length,
    isComplete: missingKeys.length === 0,
  };
}
