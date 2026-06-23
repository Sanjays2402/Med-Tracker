/**
 * Follow-up digest text + HTML bundle i18n multi-locale cron batcher
 * HTML mailer BCC TIER-POLICY COVERAGE REPORT — WARNINGS HTML.
 *
 * `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report`
 * exposes `detectBccTierPolicyCoverageWarnings(report)`. That helper
 * returns a flat string array — fine for log lines, fine for the
 * basic coverage HTML which collapses every warning into one red
 * panel.
 *
 * The basic panel is wrong for the ops DASHBOARD because:
 *
 *   - all warnings render in the same red, regardless of severity.
 *     "Channel always critical" (an alert that the on-call is
 *     getting paged for everything) is the same colour as
 *     "Unused destination: secondary@example.com" (a low-grade
 *     misconfiguration). The dashboard needs to SCREAM the
 *     critical issue and MURMUR the cleanup;
 *
 *   - the panel is flat — no grouping by category. The on-call
 *     can't tell at a glance whether 6 warnings are 6 unused
 *     destinations or 5 unused + 1 always-critical;
 *
 *   - the unused-destination address is interpolated into a free-
 *     text "Unused destination: ${addr}" string, so consumers
 *     parsing the warning for the address have to slice the
 *     string by hand. A structured chip per category exposes the
 *     address on its own.
 *
 * This module is the warnings HTML companion. It classifies each
 * warning into one of three severity tiers and emits per-tier chips:
 *
 *   - 'always-critical' — RED. The on-call MUST act: every envelope
 *     is page-worthy. Tier label: "Channel always critical".
 *
 *   - 'always-routine' / 'always-actionable' — YELLOW. The channel
 *     is one-dimensional: nothing is escalating beyond its own tier.
 *     Often a configuration smell (e.g. the policy is mis-tiered);
 *     the dashboard surfaces it as caution.
 *
 *   - 'unused-destination' — GREY. Cleanup, not action. The
 *     destination address is exposed on the chip as a separate
 *     mono-spaced field for one-click copy/paste into the destination
 *     editor.
 *
 * No-warnings empty state renders as a single green "All checks
 * passed" chip so the dashboard never shows a literal blank panel.
 *
 * Pure / deterministic. No I/O. HTML escaped.
 *
 * Composes:
 *   - detectBccTierPolicyCoverageWarnings (warning source)
 *   - FollowupDigestBccTierPolicyCoverageReport shape
 */

import type { FollowupDigestBccTierPolicyCoverageReport } from './followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report';
import { detectBccTierPolicyCoverageWarnings } from './followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report';

export type BccTierPolicyCoverageWarningSeverity =
  | 'always-critical'
  | 'always-tier'
  | 'unused-destination';

export interface BccTierPolicyCoverageWarningHtmlChip {
  /** Severity tier for chip styling. */
  severity: BccTierPolicyCoverageWarningSeverity;
  /** Human label (no prefix); used in the chip body. */
  label: string;
  /**
   * Address attached to the chip (non-null only for
   * 'unused-destination' severity). Rendered in a monospace span
   * so the on-call can copy it without selecting the surrounding
   * label.
   */
  address: string | null;
  /** Raw warning string from the source report (mirrored verbatim). */
  rawWarning: string;
}

export interface BccTierPolicyCoverageWarningsHtmlOptions {
  /** Wrap fragment in a full HTML document. Default false. */
  wrapHtmlDocument?: boolean;
  /** Document title. Default "BCC tier-policy coverage warnings". */
  documentTitle?: string;
  /** Optional caption shown under the title (HTML escaped). */
  caption?: string;
  /** Optional font-family override. */
  fontFamily?: string;
  /**
   * Empty-state suppression. Default false. When true, an empty
   * warning set produces no fragment at all (just an empty string).
   * Useful for dashboards that hide the panel when nothing is wrong.
   */
  suppressEmptyState?: boolean;
  /**
   * Empty-state label. Default "All checks passed". HTML escaped.
   */
  emptyStateLabel?: string;
  /**
   * Per-severity label override (e.g. localised). Any unset key
   * falls back to the default label.
   */
  severityLabels?: Partial<
    Record<BccTierPolicyCoverageWarningSeverity, string>
  >;
}

export interface BccTierPolicyCoverageWarningsHtmlResult {
  /** HTML fragment (or full document). */
  html: string;
  /** Structured chips, in input order. */
  chips: BccTierPolicyCoverageWarningHtmlChip[];
  /** Count of chips per severity tier (always present, possibly 0). */
  countsBySeverity: Record<BccTierPolicyCoverageWarningSeverity, number>;
  /** True when the report contained zero warnings. */
  isEmpty: boolean;
}

const DEFAULT_SEVERITY_LABELS: Record<
  BccTierPolicyCoverageWarningSeverity,
  string
> = {
  'always-critical': 'Always critical',
  'always-tier': 'Always single-tier',
  'unused-destination': 'Unused destination',
};

const SEVERITY_COLORS: Record<
  BccTierPolicyCoverageWarningSeverity,
  { bg: string; fg: string; border: string }
> = {
  'always-critical': { bg: '#fef2f2', fg: '#991b1b', border: '#dc2626' },
  'always-tier': { bg: '#fffbeb', fg: '#92400e', border: '#f59e0b' },
  'unused-destination': { bg: '#f3f4f6', fg: '#374151', border: '#9ca3af' },
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Classify a single warning string into a severity tier + label +
 * address.
 *
 * Recognised shapes (mirrored from detectBccTierPolicyCoverageWarnings):
 *
 *   "Channel always critical"           -> always-critical
 *   "Channel always routine"            -> always-tier ("Routine" sublabel)
 *   "Channel always actionable"         -> always-tier ("Actionable" sublabel)
 *   "Unused destination: <address>"     -> unused-destination (address split)
 *
 * Anything else falls into 'unused-destination' as a graceful default
 * (treats unknown text as low-severity cleanup) so a future warning
 * shape does NOT crash the dashboard.
 */
function classifyWarning(
  raw: string,
): { severity: BccTierPolicyCoverageWarningSeverity; label: string; address: string | null } {
  if (raw === 'Channel always critical') {
    return { severity: 'always-critical', label: 'Channel always critical', address: null };
  }
  if (raw === 'Channel always routine') {
    return { severity: 'always-tier', label: 'Channel always routine', address: null };
  }
  if (raw === 'Channel always actionable') {
    return { severity: 'always-tier', label: 'Channel always actionable', address: null };
  }
  const unusedPrefix = 'Unused destination: ';
  if (raw.startsWith(unusedPrefix)) {
    return {
      severity: 'unused-destination',
      label: 'Unused destination',
      address: raw.slice(unusedPrefix.length),
    };
  }
  return { severity: 'unused-destination', label: raw, address: null };
}

function buildChipHtml(
  chip: BccTierPolicyCoverageWarningHtmlChip,
  severityLabel: string,
): string {
  const c = SEVERITY_COLORS[chip.severity];
  const addressHtml =
    chip.address === null
      ? ''
      : `<span class="cov-warn-addr">${escapeHtml(chip.address)}</span>`;
  return (
    `<div class="cov-warn-chip cov-warn-chip--${chip.severity}" ` +
    `style="background:${c.bg};color:${c.fg};border:1px solid ${c.border};">` +
    `<span class="cov-warn-severity">${escapeHtml(severityLabel)}</span>` +
    `<span class="cov-warn-label">${escapeHtml(chip.label)}</span>` +
    addressHtml +
    `</div>`
  );
}

function buildEmptyStateHtml(label: string): string {
  return (
    `<div class="cov-warn-chip cov-warn-chip--empty" ` +
    `style="background:#ecfdf5;color:#065f46;border:1px solid #10b981;">` +
    `<span class="cov-warn-severity">All clear</span>` +
    `<span class="cov-warn-label">${escapeHtml(label)}</span>` +
    `</div>`
  );
}

function buildCss(fontFamily: string): string {
  return (
    `* { box-sizing: border-box; }` +
    `.cov-warn-wrapper { font-family: ${fontFamily}; color: #111827; padding: 12pt; }` +
    `.cov-warn-title { font-size: 14pt; font-weight: 700; margin: 0 0 4pt 0; }` +
    `.cov-warn-caption { font-size: 10pt; color: #6b7280; margin: 0 0 10pt 0; }` +
    `.cov-warn-chips { display: flex; flex-wrap: wrap; gap: 6pt; }` +
    `.cov-warn-chip { display: inline-flex; align-items: center; gap: 6pt; padding: 4pt 8pt; border-radius: 4pt; font-size: 9pt; max-width: 100%; }` +
    `.cov-warn-severity { font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; font-size: 8pt; }` +
    `.cov-warn-label { font-weight: 500; }` +
    `.cov-warn-addr { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 9pt; padding: 1pt 4pt; background: rgba(0,0,0,0.04); border-radius: 3pt; }`
  );
}

/**
 * Render the warnings list as a per-severity chip cluster.
 *
 * Composes detectBccTierPolicyCoverageWarnings, classifies each warning
 * into a severity tier, emits one chip per warning with category
 * colour + separate monospace address field for unused-destination
 * cases. Empty state renders as a single green "All checks passed"
 * chip (unless suppressEmptyState=true).
 *
 * Pure / deterministic. No JS. HTML escaped.
 */
export function renderBccTierPolicyCoverageWarningsHtml(
  report: FollowupDigestBccTierPolicyCoverageReport,
  options: BccTierPolicyCoverageWarningsHtmlOptions = {},
): BccTierPolicyCoverageWarningsHtmlResult {
  const wrapDoc = options.wrapHtmlDocument ?? false;
  const docTitle = options.documentTitle ?? 'BCC tier-policy coverage warnings';
  const captionText = options.caption;
  const fontFamily =
    options.fontFamily ??
    "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  const suppressEmptyState = options.suppressEmptyState ?? false;
  const emptyStateLabel = options.emptyStateLabel ?? 'All checks passed';
  const severityLabels = options.severityLabels ?? {};

  const rawWarnings = detectBccTierPolicyCoverageWarnings(report);
  const chips: BccTierPolicyCoverageWarningHtmlChip[] = rawWarnings.map(
    (raw) => {
      const { severity, label, address } = classifyWarning(raw);
      return { severity, label, address, rawWarning: raw };
    },
  );

  const countsBySeverity: Record<
    BccTierPolicyCoverageWarningSeverity,
    number
  > = {
    'always-critical': 0,
    'always-tier': 0,
    'unused-destination': 0,
  };
  for (const chip of chips) countsBySeverity[chip.severity] += 1;

  const isEmpty = chips.length === 0;

  if (isEmpty && suppressEmptyState) {
    return {
      html: '',
      chips,
      countsBySeverity,
      isEmpty,
    };
  }

  const chipHtmls = isEmpty
    ? [buildEmptyStateHtml(emptyStateLabel)]
    : chips.map((c) => {
        const sevLabel =
          severityLabels[c.severity] ?? DEFAULT_SEVERITY_LABELS[c.severity];
        return buildChipHtml(c, sevLabel);
      });

  const captionHtml = captionText
    ? `<div class="cov-warn-caption">${escapeHtml(captionText)}</div>`
    : '';
  const css = buildCss(fontFamily);
  const fragment =
    `<style>${css}</style>` +
    `<section class="cov-warn-wrapper">` +
    `<h3 class="cov-warn-title">${escapeHtml(docTitle)}</h3>` +
    captionHtml +
    `<div class="cov-warn-chips">${chipHtmls.join('')}</div>` +
    `</section>`;

  const html = wrapDoc
    ? `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(
        docTitle,
      )}</title></head><body>${fragment}</body></html>`
    : fragment;

  return {
    html,
    chips,
    countsBySeverity,
    isEmpty,
  };
}

/**
 * Convenience: one-line cron-log summary of the warnings render.
 *
 *   "Coverage warnings HTML: 3 chips (1 always-critical, 2 unused-
 *    destination)."
 *   "Coverage warnings HTML: 0 chips (all checks passed)."
 */
export function summarizeBccTierPolicyCoverageWarningsHtml(
  result: BccTierPolicyCoverageWarningsHtmlResult,
): string {
  if (result.isEmpty) {
    return 'Coverage warnings HTML: 0 chips (all checks passed).';
  }
  const breakdown: string[] = [];
  for (const sev of [
    'always-critical',
    'always-tier',
    'unused-destination',
  ] as const) {
    const n = result.countsBySeverity[sev];
    if (n > 0) breakdown.push(`${n} ${sev}`);
  }
  const total = result.chips.length;
  return `Coverage warnings HTML: ${total} ${total === 1 ? 'chip' : 'chips'} (${breakdown.join(', ')}).`;
}

/**
 * Convenience: pull just the addresses from the unused-destination
 * chips (for downstream cleanup tooling that wants the address list
 * without re-parsing the warning strings).
 */
export function extractBccTierPolicyCoverageUnusedDestinations(
  result: BccTierPolicyCoverageWarningsHtmlResult,
): string[] {
  return result.chips
    .filter((c) => c.severity === 'unused-destination' && c.address !== null)
    .map((c) => c.address!)
    .sort();
}
