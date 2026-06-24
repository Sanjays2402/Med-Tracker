/**
 * Follow-up digest text + HTML bundle i18n multi-locale cron batcher
 * HTML mailer BCC tier-policy coverage report WARNINGS HTML PRINT —
 * I18N variant.
 *
 * `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report-warnings-html-print`
 * is the print-friendly monochrome warnings panel. Its chrome text
 * is English-only:
 *
 *   - severity badge prefixes: "[CRITICAL]", "[CAUTION]", "[INFO]";
 *   - default severity labels: "Always critical", "Always single-tier",
 *     "Unused destination";
 *   - empty-state label: "All checks passed";
 *   - "Printed" prefix on the timestamp;
 *   - default footer text.
 *
 * The same per-locale household / clinic-chain that needs the i18n
 * calendar (tick 26 ships that companion) also needs the warnings
 * panel localised — the household admin in Berlin gets the binder in
 * German; the on-call in Tokyo prefers Japanese.
 *
 * This module is the i18n bundle layer for the print warnings
 * panel, parallel to the calendar's tick-26 i18n module. It composes
 * the base printable renderer + applies a per-locale string table:
 *
 *   - per-locale badge prefixes (e.g. "[CRÍTICO]", "[ATENCIÓN]",
 *     "[INFO]");
 *   - per-locale severity labels (e.g. "Siempre crítico");
 *   - per-locale empty-state label ("Todo correcto");
 *   - per-locale "Printed" prefix ("Impreso");
 *   - per-locale default footer.
 *
 * Graceful fallback to English when the bundle is missing a key;
 * fallbackUsed + missingKeys flag the gaps so a CI gate can catch
 * incomplete locales without breaking the render. detectCoverage
 * helper for the standalone CI check parallel to the calendar i18n
 * module.
 *
 * Pure / deterministic. No I/O. HTML escaped.
 *
 * Composes:
 *   - renderBccTierPolicyCoverageWarningsHtmlPrint (base render)
 *   - BccTierPolicyCoverageWarningSeverity (enum)
 *   - FollowupDigestBccTierPolicyCoverageReport (input)
 */

import type { FollowupDigestBccTierPolicyCoverageReport } from './followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report';
import type {
  BccTierPolicyCoverageWarningSeverity,
} from './followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report-warnings-html';
import type {
  BccTierPolicyCoverageWarningsHtmlPrintOptions,
  BccTierPolicyCoverageWarningsHtmlPrintResult,
} from './followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report-warnings-html-print';
import { renderBccTierPolicyCoverageWarningsHtmlPrint } from './followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report-warnings-html-print';

export interface BccTierPolicyCoverageWarningsHtmlPrintI18nStrings {
  /** Per-severity badge prefix (e.g. "[CRITICAL]"). */
  badgePrefix: Record<BccTierPolicyCoverageWarningSeverity, string>;
  /** Per-severity human label (e.g. "Always critical"). */
  severityLabel: Record<BccTierPolicyCoverageWarningSeverity, string>;
  /** Empty-state label ("All checks passed" / "Todo correcto"). */
  emptyStateLabel: string;
  /** "Printed" prefix on the timestamp ("Printed" / "Impreso"). */
  printedPrefix: string;
  /** Default footer text used when no override supplied. */
  defaultFooterText: string;
  /** "All clear" badge for the empty-state chip ("All clear" / "Sin alertas"). */
  emptyStateBadge: string;
}

export interface BccTierPolicyCoverageWarningsHtmlPrintI18nBundleStrings {
  badgePrefix?: Partial<
    Record<BccTierPolicyCoverageWarningSeverity, string>
  >;
  severityLabel?: Partial<
    Record<BccTierPolicyCoverageWarningSeverity, string>
  >;
  emptyStateLabel?: string;
  printedPrefix?: string;
  defaultFooterText?: string;
  emptyStateBadge?: string;
}

export interface BccTierPolicyCoverageWarningsHtmlPrintI18nBundle {
  /** Locale identifier (BCP 47), e.g. 'en-US', 'es-419', 'ja-JP'. */
  locale: string;
  /** Strings. Any missing key falls back to the English bundle. */
  strings: BccTierPolicyCoverageWarningsHtmlPrintI18nBundleStrings;
}

/**
 * Built-in English bundle. The badgePrefix + severityLabel match the
 * base print module's hard-coded strings; emptyStateLabel matches
 * the base warnings-html default; printedPrefix + defaultFooterText
 * match the print module's defaults; emptyStateBadge matches the
 * base warnings-html "All clear" chip text.
 */
export const BCC_TIER_POLICY_COVERAGE_WARNINGS_HTML_PRINT_I18N_EN: BccTierPolicyCoverageWarningsHtmlPrintI18nStrings =
  {
    badgePrefix: {
      'always-critical': '[CRITICAL]',
      'always-tier': '[CAUTION]',
      'unused-destination': '[INFO]',
    },
    severityLabel: {
      'always-critical': 'Always critical',
      'always-tier': 'Always single-tier',
      'unused-destination': 'Unused destination',
    },
    emptyStateLabel: 'All checks passed',
    printedPrefix: 'Printed',
    defaultFooterText:
      'Coverage warnings snapshot \u2014 does not update once printed.',
    emptyStateBadge: 'All clear',
  };

export interface BccTierPolicyCoverageWarningsHtmlPrintI18nOptions
  extends Omit<
    BccTierPolicyCoverageWarningsHtmlPrintOptions,
    'severityLabels' | 'emptyStateLabel' | 'footerText'
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
  bundle: BccTierPolicyCoverageWarningsHtmlPrintI18nBundle;
  /**
   * Footer text override. When set, used verbatim (the i18n layer
   * does NOT touch caller-supplied copy). When unset, the bundle's
   * defaultFooterText is used.
   */
  footerText?: string;
}

export interface BccTierPolicyCoverageWarningsHtmlPrintI18nResult
  extends BccTierPolicyCoverageWarningsHtmlPrintResult {
  /** Locale the strings came from (always equals options.bundle.locale). */
  resolvedLocale: string;
  /** True when ANY key was filled from the English fallback. */
  fallbackUsed: boolean;
  /**
   * Keys the bundle didn't provide. Dotted paths like
   * "badgePrefix.always-critical". Empty array on a complete bundle.
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

function resolveBadgePrefix(
  bundle: BccTierPolicyCoverageWarningsHtmlPrintI18nBundle,
  key: BccTierPolicyCoverageWarningSeverity,
  missingKeys: string[],
): string {
  const b = bundle.strings.badgePrefix;
  if (b && b[key] !== undefined) return b[key]!;
  missingKeys.push(`badgePrefix.${key}`);
  return BCC_TIER_POLICY_COVERAGE_WARNINGS_HTML_PRINT_I18N_EN.badgePrefix[key];
}

function resolveSeverityLabel(
  bundle: BccTierPolicyCoverageWarningsHtmlPrintI18nBundle,
  key: BccTierPolicyCoverageWarningSeverity,
  missingKeys: string[],
): string {
  const b = bundle.strings.severityLabel;
  if (b && b[key] !== undefined) return b[key]!;
  missingKeys.push(`severityLabel.${key}`);
  return BCC_TIER_POLICY_COVERAGE_WARNINGS_HTML_PRINT_I18N_EN.severityLabel[key];
}

function resolveScalar(
  value: string | undefined,
  fallback: string,
  pathName: string,
  missingKeys: string[],
): string {
  if (value !== undefined) return value;
  missingKeys.push(pathName);
  return fallback;
}

/**
 * Rewrite the "[CRITICAL]"-style badge prefix on every chip's
 * `cov-warn-severity` span. The base print render emits
 * `<span class="cov-warn-severity">[CRITICAL] Always critical</span>`
 * (when suppressBadgePrefix=false); we replace the entire span body
 * with the localised version. When suppressBadgePrefix=true, the
 * base render emits only the severity label — we still localise
 * that.
 *
 * The base render ALSO emits a `<span class="cov-warn-label">` whose
 * body is the chip.label (classifier output). For the
 * `unused-destination` severity, chip.label equals the English
 * severity label "Unused destination" verbatim — that's a structural
 * leak we localise here as well so the rendered output is consistent
 * across the chip body.
 */
function rewriteSeveritySpans(
  fragment: string,
  perSeverityRewrite: Record<
    BccTierPolicyCoverageWarningSeverity,
    { prefix: string; label: string }
  >,
  suppressBadgePrefix: boolean,
  chips: BccTierPolicyCoverageWarningsHtmlPrintResult['chips'],
): string {
  if (chips.length === 0) return fragment;

  // Walk chips in DOM order. Each chip has a unique
  // `cov-warn-chip cov-warn-chip--<severity>` marker followed by a
  // `<span class="cov-warn-severity">...</span>`.
  let result = fragment;
  let searchFrom = 0;
  for (const chip of chips) {
    const sev = chip.severity;
    const marker = `cov-warn-chip cov-warn-chip--${sev}`;
    const markerIdx = result.indexOf(marker, searchFrom);
    if (markerIdx === -1) continue;

    const severitySpanRe = /<span class="cov-warn-severity">([^<]*)<\/span>/g;
    severitySpanRe.lastIndex = markerIdx;
    const m = severitySpanRe.exec(result);
    if (!m) continue;

    const { prefix, label } = perSeverityRewrite[sev];
    const newBody = suppressBadgePrefix
      ? escapeHtml(label)
      : `${escapeHtml(prefix)} ${escapeHtml(label)}`;
    const replacement = `<span class="cov-warn-severity">${newBody}</span>`;
    result =
      result.slice(0, m.index) +
      replacement +
      result.slice(m.index + m[0].length);
    searchFrom = m.index + replacement.length;

    // For the unused-destination severity, the chip.label echoes the
    // English severity label ("Unused destination") which sits in the
    // following `cov-warn-label` span. Localise that too so the chip
    // doesn't leak English chrome alongside the localised severity.
    if (sev === 'unused-destination') {
      const labelSpanRe = /<span class="cov-warn-label">([^<]*)<\/span>/g;
      labelSpanRe.lastIndex = searchFrom;
      const lm = labelSpanRe.exec(result);
      if (lm && lm[1] === 'Unused destination') {
        const labelReplacement = `<span class="cov-warn-label">${escapeHtml(label)}</span>`;
        result =
          result.slice(0, lm.index) +
          labelReplacement +
          result.slice(lm.index + lm[0].length);
        searchFrom = lm.index + labelReplacement.length;
      }
    }
  }
  return result;
}

/**
 * Rewrite the empty-state chip's severity span + label. The base
 * print render emits a single chip with
 * `cov-warn-chip--empty` + `<span class="cov-warn-severity">All clear</span>`
 * + `<span class="cov-warn-label">All checks passed</span>`.
 */
function rewriteEmptyStateChip(
  fragment: string,
  emptyStateBadge: string,
  emptyStateLabel: string,
): string {
  let out = fragment;
  out = out.replace(
    /(<span class="cov-warn-severity">)All clear(<\/span>)/,
    `$1${escapeHtml(emptyStateBadge)}$2`,
  );
  out = out.replace(
    /(<span class="cov-warn-label">)All checks passed(<\/span>)/,
    `$1${escapeHtml(emptyStateLabel)}$2`,
  );
  return out;
}

/**
 * Rewrite the "Printed YYYY-MM-DD" prefix to the localised one.
 */
function rewritePrintedPrefix(fragment: string, prefix: string): string {
  if (prefix === 'Printed') return fragment;
  return fragment.replace(
    /(<div class="cov-warn-printed-on">)Printed (\d{4}-\d{2}-\d{2}<\/div>)/,
    `$1${escapeHtml(prefix)} $2`,
  );
}

/**
 * Rewrite the footer text when the caller did NOT supply a per-call
 * footerText override. The base render falls back to the hard-coded
 * English default; we swap that for the locale's defaultFooterText.
 */
function rewriteFooterText(
  fragment: string,
  text: string,
  callerSuppliedFooter: boolean,
): string {
  if (callerSuppliedFooter) return fragment;
  const en =
    BCC_TIER_POLICY_COVERAGE_WARNINGS_HTML_PRINT_I18N_EN.defaultFooterText;
  if (text === en) return fragment;
  return fragment.replace(
    /(<div class="cov-warn-print-footer">)([^<]*)(<\/div>)/,
    `$1${escapeHtml(text)}$3`,
  );
}

/**
 * Render the print-friendly coverage warnings panel with localised
 * chrome.
 *
 * Composes renderBccTierPolicyCoverageWarningsHtmlPrint so the chip
 * datum + monochrome layout stays consistent, then rewrites the
 * severity spans, empty-state chip, "Printed" prefix, and (when
 * caller hasn't supplied an explicit footerText) the footer text.
 *
 * Pure / deterministic.
 */
export function renderBccTierPolicyCoverageWarningsHtmlPrintI18n(
  report: FollowupDigestBccTierPolicyCoverageReport,
  options: BccTierPolicyCoverageWarningsHtmlPrintI18nOptions,
): BccTierPolicyCoverageWarningsHtmlPrintI18nResult {
  const missingKeys: string[] = [];
  const bundle = options.bundle;

  const perSeverityRewrite: Record<
    BccTierPolicyCoverageWarningSeverity,
    { prefix: string; label: string }
  > = {
    'always-critical': {
      prefix: resolveBadgePrefix(bundle, 'always-critical', missingKeys),
      label: resolveSeverityLabel(bundle, 'always-critical', missingKeys),
    },
    'always-tier': {
      prefix: resolveBadgePrefix(bundle, 'always-tier', missingKeys),
      label: resolveSeverityLabel(bundle, 'always-tier', missingKeys),
    },
    'unused-destination': {
      prefix: resolveBadgePrefix(bundle, 'unused-destination', missingKeys),
      label: resolveSeverityLabel(bundle, 'unused-destination', missingKeys),
    },
  };
  const emptyStateLabel = resolveScalar(
    bundle.strings.emptyStateLabel,
    BCC_TIER_POLICY_COVERAGE_WARNINGS_HTML_PRINT_I18N_EN.emptyStateLabel,
    'emptyStateLabel',
    missingKeys,
  );
  const emptyStateBadge = resolveScalar(
    bundle.strings.emptyStateBadge,
    BCC_TIER_POLICY_COVERAGE_WARNINGS_HTML_PRINT_I18N_EN.emptyStateBadge,
    'emptyStateBadge',
    missingKeys,
  );
  const printedPrefix = resolveScalar(
    bundle.strings.printedPrefix,
    BCC_TIER_POLICY_COVERAGE_WARNINGS_HTML_PRINT_I18N_EN.printedPrefix,
    'printedPrefix',
    missingKeys,
  );
  const localisedFooter = resolveScalar(
    bundle.strings.defaultFooterText,
    BCC_TIER_POLICY_COVERAGE_WARNINGS_HTML_PRINT_I18N_EN.defaultFooterText,
    'defaultFooterText',
    missingKeys,
  );
  const callerSuppliedFooter = options.footerText !== undefined;

  // Run the base render. We always pass the original English label
  // chrome through the base render (we rewrite below to keep the
  // locale fallback path on a single layer).
  const base = renderBccTierPolicyCoverageWarningsHtmlPrint(report, {
    ...options,
    footerText: options.footerText,
  });

  let html = base.html;
  html = rewriteSeveritySpans(
    html,
    perSeverityRewrite,
    options.suppressBadgePrefix ?? false,
    base.chips,
  );
  if (base.isEmpty) {
    html = rewriteEmptyStateChip(html, emptyStateBadge, emptyStateLabel);
  }
  html = rewritePrintedPrefix(html, printedPrefix);
  html = rewriteFooterText(html, localisedFooter, callerSuppliedFooter);

  return {
    ...base,
    html,
    resolvedLocale: bundle.locale,
    fallbackUsed: missingKeys.length > 0,
    missingKeys,
  };
}

/**
 * Convenience: one-line cron-log summary of the localised render.
 *
 *   "Coverage warnings (print es-419, us-letter): 2 chips
 *    (1 always-critical, 1 unused-destination); impreso 2026-06-23."
 *   "Coverage warnings (print ja-JP, a4): 0 chips (all checks passed)
 *    (fallback: 4 keys)."
 */
export function summarizeBccTierPolicyCoverageWarningsHtmlPrintI18n(
  result: BccTierPolicyCoverageWarningsHtmlPrintI18nResult,
  bundle: BccTierPolicyCoverageWarningsHtmlPrintI18nBundle,
): string {
  const total = result.chips.length;
  const breakdown: string[] = [];
  for (const sev of [
    'always-critical',
    'always-tier',
    'unused-destination',
  ] as const) {
    const n = result.countsBySeverity[sev];
    if (n > 0) breakdown.push(`${n} ${sev}`);
  }
  const bodyDetail = result.isEmpty
    ? '(all checks passed)'
    : `(${breakdown.join(', ')})`;
  const printedPrefix =
    bundle.strings.printedPrefix ??
    BCC_TIER_POLICY_COVERAGE_WARNINGS_HTML_PRINT_I18N_EN.printedPrefix;
  const printedPart =
    result.printedAtIso === null
      ? ''
      : `; ${printedPrefix.toLowerCase()} ${result.printedAtIso}`;
  const fallbackPart = result.fallbackUsed
    ? ` (fallback: ${result.missingKeys.length} ${result.missingKeys.length === 1 ? 'key' : 'keys'})`
    : '';
  return `Coverage warnings (print ${result.resolvedLocale}, ${result.paper}): ${total} ${total === 1 ? 'chip' : 'chips'} ${bodyDetail}${printedPart}${fallbackPart}.`;
}

/**
 * Convenience: report bundle coverage against the full key set so
 * a CI job can flag locale bundles that are missing entries before
 * production rollout. Parallel to the calendar i18n module's
 * detectQuietHoursCalendarPrintableI18nCoverage helper.
 */
export interface BccTierPolicyCoverageWarningsHtmlPrintI18nCoverage {
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

const SEVERITIES: BccTierPolicyCoverageWarningSeverity[] = [
  'always-critical',
  'always-tier',
  'unused-destination',
];

export function detectBccTierPolicyCoverageWarningsHtmlPrintI18nCoverage(
  bundle: BccTierPolicyCoverageWarningsHtmlPrintI18nBundle,
): BccTierPolicyCoverageWarningsHtmlPrintI18nCoverage {
  const expected: string[] = [];
  for (const k of SEVERITIES) {
    expected.push(`badgePrefix.${k}`);
    expected.push(`severityLabel.${k}`);
  }
  expected.push('emptyStateLabel');
  expected.push('printedPrefix');
  expected.push('defaultFooterText');
  expected.push('emptyStateBadge');

  const missingKeys: string[] = [];
  for (const path of expected) {
    if (path.startsWith('badgePrefix.')) {
      const key = path.slice('badgePrefix.'.length) as BccTierPolicyCoverageWarningSeverity;
      if (
        bundle.strings.badgePrefix === undefined ||
        bundle.strings.badgePrefix[key] === undefined
      ) {
        missingKeys.push(path);
      }
    } else if (path.startsWith('severityLabel.')) {
      const key = path.slice('severityLabel.'.length) as BccTierPolicyCoverageWarningSeverity;
      if (
        bundle.strings.severityLabel === undefined ||
        bundle.strings.severityLabel[key] === undefined
      ) {
        missingKeys.push(path);
      }
    } else if (path === 'emptyStateLabel') {
      if (bundle.strings.emptyStateLabel === undefined) missingKeys.push(path);
    } else if (path === 'emptyStateBadge') {
      if (bundle.strings.emptyStateBadge === undefined) missingKeys.push(path);
    } else if (path === 'printedPrefix') {
      if (bundle.strings.printedPrefix === undefined) missingKeys.push(path);
    } else if (path === 'defaultFooterText') {
      if (bundle.strings.defaultFooterText === undefined) missingKeys.push(path);
    }
  }

  const providedKeys = expected.length - missingKeys.length;
  const coverage =
    expected.length === 0 ? 1 : providedKeys / expected.length;
  return {
    locale: bundle.locale,
    expectedKeys: expected.length,
    providedKeys,
    missingKeys,
    coverage,
    isComplete: missingKeys.length === 0,
  };
}

/**
 * Convenience: extract the per-chip text as plain-text lines using
 * the localised badge + label. Mirrors
 * extractBccTierPolicyCoverageWarningsHtmlPrintLines from the base
 * module.
 *
 *   "[CRÍTICO] Siempre crítico"
 *   "[INFO] Destino no usado — admin@example.com"
 *   "Sin alertas — Todo correcto"
 */
export function extractBccTierPolicyCoverageWarningsHtmlPrintI18nLines(
  result: BccTierPolicyCoverageWarningsHtmlPrintI18nResult,
  bundle: BccTierPolicyCoverageWarningsHtmlPrintI18nBundle,
): string[] {
  const badgePrefix = bundle.strings.badgePrefix ?? {};
  const severityLabel = bundle.strings.severityLabel ?? {};
  const emptyStateBadge =
    bundle.strings.emptyStateBadge ??
    BCC_TIER_POLICY_COVERAGE_WARNINGS_HTML_PRINT_I18N_EN.emptyStateBadge;
  const emptyStateLabel =
    bundle.strings.emptyStateLabel ??
    BCC_TIER_POLICY_COVERAGE_WARNINGS_HTML_PRINT_I18N_EN.emptyStateLabel;
  if (result.isEmpty) {
    return [`${emptyStateBadge} \u2014 ${emptyStateLabel}`];
  }
  return result.chips.map((c) => {
    const badge =
      badgePrefix[c.severity] ??
      BCC_TIER_POLICY_COVERAGE_WARNINGS_HTML_PRINT_I18N_EN.badgePrefix[c.severity];
    const label =
      severityLabel[c.severity] ??
      BCC_TIER_POLICY_COVERAGE_WARNINGS_HTML_PRINT_I18N_EN.severityLabel[c.severity];
    const address = c.address === null ? '' : ` \u2014 ${c.address}`;
    return `${badge} ${label}${address}`;
  });
}
