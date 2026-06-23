/**
 * Follow-up digest text + HTML bundle i18n multi-locale cron batcher
 * HTML mailer BCC TIER-POLICY COVERAGE REPORT — HTML render variant.
 *
 * `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report`
 * produces a JSON-friendly coverage struct for the analytics pipeline.
 * Pretty for machines; useless for a household admin trying to answer
 * "why is the on-call always getting paged?" on a dashboard.
 *
 * Real ops dashboards want an HTML render:
 *
 *   - a headline card at the top with the dominant tier and the
 *     envelope count;
 *   - per-tier distribution bars showing the ratio of routine /
 *     actionable / critical envelopes;
 *   - a top fan-out table listing addresses by count DESC;
 *   - a misconfiguration warnings panel (channel always X, unused
 *     destinations) flagged in red;
 *   - an empty-state message when no envelopes were classified.
 *
 * This module produces that HTML. It composes the report straight
 * through and emits one HTML fragment + tabular CSS so a host page
 * splices it into a dashboard. Inline SVG bars (no JS, no canvas).
 *
 * Pure / deterministic. No I/O. HTML escaped.
 *
 * Composes:
 *   - FollowupDigestBccTierPolicyCoverageReport shape
 *   - detectBccTierPolicyCoverageWarnings (for the warnings panel)
 */

import type {
  FollowupDigestBccTierPolicyCoverageReport,
  FollowupDigestBccTierPolicyCoverageFanOutEntry,
} from './followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report';
import { detectBccTierPolicyCoverageWarnings } from './followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report';
import type { FollowupDigestHtmlMailerBccTier } from './followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy';

export interface BccTierPolicyCoverageReportHtmlOptions {
  /** Wrap fragment in a full HTML document. Default false. */
  wrapHtmlDocument?: boolean;
  /** Document title for <title> + h1. Default "BCC tier-policy coverage". */
  documentTitle?: string;
  /** Optional caption (HTML escaped) shown under the title. */
  caption?: string;
  /** Optional font-family override. */
  fontFamily?: string;
  /**
   * Max rows in the top fan-out table. Default 10. Set to 0 to
   * suppress the table entirely.
   */
  topFanoutRowLimit?: number;
  /**
   * Suppress the warnings panel even if warnings exist. Default false.
   */
  suppressWarnings?: boolean;
  /**
   * Optional per-tier label override (e.g. localised labels). Default
   * uses the tier code in title case.
   */
  tierLabels?: Partial<Record<FollowupDigestHtmlMailerBccTier, string>>;
}

export interface BccTierPolicyCoverageReportHtmlResult {
  /** HTML fragment (or full document). */
  html: string;
  /** Mirror of the report's headline numbers for caller convenience. */
  envelopeCount: number;
  dominantTier: FollowupDigestHtmlMailerBccTier | null;
  topFanoutRowsRendered: number;
  warningsRendered: number;
}

const DEFAULT_TIER_LABELS: Record<FollowupDigestHtmlMailerBccTier, string> = {
  routine: 'Routine',
  actionable: 'Actionable',
  critical: 'Critical',
};

const TIER_COLORS: Record<FollowupDigestHtmlMailerBccTier, string> = {
  routine: '#9ca3af', // gray-400
  actionable: '#f59e0b', // amber-500
  critical: '#dc2626', // red-600
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPercent(ratio: number): string {
  // Ratio in 0..1; report shows whole percents.
  const pct = Math.round(ratio * 100);
  return `${pct}%`;
}

function resolveTierLabel(
  tier: FollowupDigestHtmlMailerBccTier,
  overrides: BccTierPolicyCoverageReportHtmlOptions['tierLabels'],
): string {
  return overrides?.[tier] ?? DEFAULT_TIER_LABELS[tier];
}

function buildHeadlineHtml(
  report: FollowupDigestBccTierPolicyCoverageReport,
  options: BccTierPolicyCoverageReportHtmlOptions,
): string {
  const dominantLabel =
    report.dominantTier === null
      ? 'No dominant tier'
      : `Dominant: ${resolveTierLabel(report.dominantTier, options.tierLabels)}`;
  const envBody =
    report.envelopeCount === 1 ? '1 envelope' : `${report.envelopeCount} envelopes`;
  const bccBody =
    report.totalBccHeadersShipped === 1
      ? '1 BCC header'
      : `${report.totalBccHeadersShipped} BCC headers`;
  return (
    `<div class="cov-headline">` +
    `<div class="cov-headline-row"><span class="cov-headline-label">Envelopes</span><span class="cov-headline-value">${escapeHtml(envBody)}</span></div>` +
    `<div class="cov-headline-row"><span class="cov-headline-label">BCC fan-out</span><span class="cov-headline-value">${escapeHtml(bccBody)}</span></div>` +
    `<div class="cov-headline-row"><span class="cov-headline-label">Status</span><span class="cov-headline-value">${escapeHtml(dominantLabel)}</span></div>` +
    `</div>`
  );
}

function buildTierBarsHtml(
  report: FollowupDigestBccTierPolicyCoverageReport,
  options: BccTierPolicyCoverageReportHtmlOptions,
): string {
  const tiers: FollowupDigestHtmlMailerBccTier[] = ['routine', 'actionable', 'critical'];
  const rows = tiers
    .map((t) => {
      const count = report.countsByTier[t];
      const ratio = report.tierDistribution[t];
      const label = resolveTierLabel(t, options.tierLabels);
      const widthPct = formatPercent(ratio);
      const color = TIER_COLORS[t];
      return (
        `<div class="cov-tier-row">` +
        `<div class="cov-tier-label">${escapeHtml(label)}</div>` +
        `<div class="cov-tier-bar-track">` +
        `<div class="cov-tier-bar-fill" style="width:${widthPct};background:${color};"></div>` +
        `</div>` +
        `<div class="cov-tier-value">${count} (${widthPct})</div>` +
        `</div>`
      );
    })
    .join('');
  return `<div class="cov-section"><h3 class="cov-section-title">Tier distribution</h3>${rows}</div>`;
}

function buildFanOutTableHtml(
  rows: FollowupDigestBccTierPolicyCoverageFanOutEntry[],
  limit: number,
): { html: string; rendered: number } {
  if (limit === 0) return { html: '', rendered: 0 };
  if (rows.length === 0) {
    return {
      html: `<div class="cov-section"><h3 class="cov-section-title">Top fan-out</h3><p class="cov-empty">No BCC fan-out.</p></div>`,
      rendered: 0,
    };
  }
  const sliced = rows.slice(0, limit);
  const rowHtml = sliced
    .map(
      (r) =>
        `<tr><td class="cov-fanout-addr">${escapeHtml(r.address)}</td><td class="cov-fanout-count">${r.count}</td></tr>`,
    )
    .join('');
  return {
    html:
      `<div class="cov-section">` +
      `<h3 class="cov-section-title">Top fan-out</h3>` +
      `<table class="cov-fanout-table"><thead><tr><th>Address</th><th>Count</th></tr></thead><tbody>${rowHtml}</tbody></table>` +
      `</div>`,
    rendered: sliced.length,
  };
}

function buildWarningsHtml(warnings: string[]): {
  html: string;
  rendered: number;
} {
  if (warnings.length === 0) return { html: '', rendered: 0 };
  const items = warnings
    .map((w) => `<li class="cov-warning">${escapeHtml(w)}</li>`)
    .join('');
  return {
    html:
      `<div class="cov-section cov-section--warnings">` +
      `<h3 class="cov-section-title">Warnings</h3>` +
      `<ul class="cov-warning-list">${items}</ul>` +
      `</div>`,
    rendered: warnings.length,
  };
}

function buildEscalationOnlyHtml(addresses: string[]): string {
  if (addresses.length === 0) return '';
  const items = addresses
    .map((a) => `<li class="cov-escalation">${escapeHtml(a)}</li>`)
    .join('');
  return (
    `<div class="cov-section">` +
    `<h3 class="cov-section-title">Escalation-only addresses</h3>` +
    `<ul class="cov-escalation-list">${items}</ul>` +
    `</div>`
  );
}

function buildCss(fontFamily: string): string {
  return (
    `* { box-sizing: border-box; }` +
    `.cov-wrapper { font-family: ${fontFamily}; color: #111827; padding: 16pt; }` +
    `.cov-title { font-size: 18pt; font-weight: 700; margin: 0 0 6pt 0; }` +
    `.cov-caption { font-size: 10pt; color: #6b7280; margin: 0 0 14pt 0; }` +
    `.cov-headline { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6pt; padding: 10pt 14pt; margin-bottom: 14pt; }` +
    `.cov-headline-row { display: flex; justify-content: space-between; align-items: baseline; padding: 4pt 0; }` +
    `.cov-headline-row + .cov-headline-row { border-top: 1px solid #e5e7eb; }` +
    `.cov-headline-label { font-size: 10pt; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.06em; }` +
    `.cov-headline-value { font-size: 12pt; font-weight: 700; color: #111827; }` +
    `.cov-section { margin-top: 14pt; }` +
    `.cov-section-title { font-size: 11pt; font-weight: 700; margin: 0 0 6pt 0; letter-spacing: 0.04em; }` +
    `.cov-tier-row { display: grid; grid-template-columns: 96pt 1fr 96pt; align-items: center; gap: 8pt; padding: 3pt 0; }` +
    `.cov-tier-label { font-size: 10pt; font-weight: 600; }` +
    `.cov-tier-bar-track { height: 10pt; background: #f3f4f6; border-radius: 5pt; overflow: hidden; }` +
    `.cov-tier-bar-fill { height: 100%; border-radius: 5pt; }` +
    `.cov-tier-value { font-size: 9pt; font-variant-numeric: tabular-nums; text-align: right; color: #374151; }` +
    `.cov-fanout-table { width: 100%; border-collapse: collapse; font-size: 10pt; }` +
    `.cov-fanout-table th, .cov-fanout-table td { padding: 4pt 6pt; text-align: left; border-bottom: 1px solid #e5e7eb; }` +
    `.cov-fanout-table th { font-weight: 600; color: #6b7280; background: #f9fafb; }` +
    `.cov-fanout-addr { font-family: ui-monospace, 'SF Mono', Menlo, monospace; }` +
    `.cov-fanout-count { font-variant-numeric: tabular-nums; text-align: right; width: 60pt; }` +
    `.cov-section--warnings { background: #fef2f2; border: 1px solid #fecaca; border-radius: 6pt; padding: 8pt 12pt; }` +
    `.cov-warning-list, .cov-escalation-list { margin: 0; padding: 0 0 0 16pt; }` +
    `.cov-warning { color: #b91c1c; padding: 2pt 0; }` +
    `.cov-escalation { font-family: ui-monospace, 'SF Mono', Menlo, monospace; padding: 2pt 0; }` +
    `.cov-empty { color: #6b7280; font-style: italic; margin: 0; }`
  );
}

/**
 * Render a tier-policy coverage report as a dashboard-ready HTML
 * fragment. Pure / deterministic. No JS.
 */
export function renderBccTierPolicyCoverageReportHtml(
  report: FollowupDigestBccTierPolicyCoverageReport,
  options: BccTierPolicyCoverageReportHtmlOptions = {},
): BccTierPolicyCoverageReportHtmlResult {
  const wrapDoc = options.wrapHtmlDocument ?? false;
  const docTitle = options.documentTitle ?? 'BCC tier-policy coverage';
  const captionText = options.caption;
  const fontFamily =
    options.fontFamily ??
    "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  const topFanoutRowLimit = options.topFanoutRowLimit ?? 10;
  const suppressWarnings = options.suppressWarnings ?? false;

  const headlineHtml = buildHeadlineHtml(report, options);
  const tierBarsHtml = buildTierBarsHtml(report, options);
  const fanOutResult = buildFanOutTableHtml(report.fanOutByAddress, topFanoutRowLimit);
  const warnings = suppressWarnings
    ? []
    : detectBccTierPolicyCoverageWarnings(report);
  const warningsResult = buildWarningsHtml(warnings);
  const escalationHtml = buildEscalationOnlyHtml(report.escalationOnlyAddresses);

  const captionHtml = captionText
    ? `<div class="cov-caption">${escapeHtml(captionText)}</div>`
    : '';

  const css = buildCss(fontFamily);
  const fragment =
    `<style>${css}</style>` +
    `<section class="cov-wrapper">` +
    `<h2 class="cov-title">${escapeHtml(docTitle)}</h2>` +
    captionHtml +
    headlineHtml +
    warningsResult.html +
    tierBarsHtml +
    fanOutResult.html +
    escalationHtml +
    `</section>`;

  const html = wrapDoc
    ? `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(docTitle)}</title></head><body>${fragment}</body></html>`
    : fragment;

  return {
    html,
    envelopeCount: report.envelopeCount,
    dominantTier: report.dominantTier,
    topFanoutRowsRendered: fanOutResult.rendered,
    warningsRendered: warningsResult.rendered,
  };
}

/**
 * Convenience: a one-line cron-log summary.
 *
 *   "Coverage report HTML: 6 envelopes, dominant=actionable, 4 fan-out
 *    rows, 1 warning."
 *   "Coverage report HTML: 0 envelopes, no dominant tier, no fan-out,
 *    no warnings."
 */
export function summarizeBccTierPolicyCoverageReportHtml(
  result: BccTierPolicyCoverageReportHtmlResult,
): string {
  const envBody =
    result.envelopeCount === 1 ? '1 envelope' : `${result.envelopeCount} envelopes`;
  const dom = result.dominantTier === null ? 'no dominant tier' : `dominant=${result.dominantTier}`;
  const fan =
    result.topFanoutRowsRendered === 0
      ? 'no fan-out'
      : `${result.topFanoutRowsRendered} fan-out ${result.topFanoutRowsRendered === 1 ? 'row' : 'rows'}`;
  const warn =
    result.warningsRendered === 0
      ? 'no warnings'
      : `${result.warningsRendered} ${result.warningsRendered === 1 ? 'warning' : 'warnings'}`;
  return `Coverage report HTML: ${envBody}, ${dom}, ${fan}, ${warn}.`;
}
