/**
 * Follow-up digest text + HTML bundle i18n multi-locale cron batcher
 * HTML mailer BCC tier-policy coverage report WARNINGS HTML — PRINT
 * variant.
 *
 * `followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report-warnings-html`
 * emits per-severity coloured chips (red / amber / grey) for the
 * dashboard panel. Colour is the right channel for an on-call
 * SCREEN render — "red = page, grey = cleanup" reads in a glance.
 *
 * That render is the WRONG choice for binder filing:
 *
 *   - colour fills don't reproduce well on monochrome printers; the
 *     red and amber backgrounds wash out into uniform mid-grey rectangles
 *     and the severity differentiation disappears entirely;
 *   - the unused-destination address span uses a coloured background
 *     for the monospace highlight (rgba(0,0,0,0.04)) which prints as
 *     barely-visible noise;
 *   - the chip cluster uses flex-wrap with 6pt gaps that work for
 *     screen but waste paper — printable variants stack chips
 *     vertically with explicit page breaks;
 *   - dashboards live behind login walls; binders are physical, so
 *     the visual hierarchy must survive monochrome reproduction.
 *
 * This module is the print-friendly variant. It composes the same
 * `renderBccTierPolicyCoverageWarningsHtml` so every chip datum stays
 * consistent (same severity, same label, same address split), then
 * post-processes the fragment for paper:
 *
 *   - palette swapped to monochrome (white background, black border,
 *     black text). Severity differentiation moves to BORDER WIDTH +
 *     monochrome badge PREFIXES ("[CRITICAL]", "[CAUTION]", "[INFO]")
 *     so it survives both colour-vision differences and B&W printing;
 *   - chips stack vertically (full-width rows) rather than wrapping
 *     horizontally — easier to scan on paper, cleaner page breaks;
 *   - the monospace address span loses its background fill, gains
 *     a light hairline border, and uses tabular-nums for printer-
 *     friendly digit alignment;
 *   - a "Printed on YYYY-MM-DD" footer is added below the chip
 *     stack so the auditor can timestamp the binder page;
 *   - `@page` CSS sized to US Letter or A4 (caller picks) so the
 *     browser's "print as PDF" dialog hits the right paper.
 *
 * Pure / deterministic. No I/O. HTML escaped.
 *
 * Composes:
 *   - renderBccTierPolicyCoverageWarningsHtml (chip datum)
 *   - BccTierPolicyCoverageWarningHtmlChip (per-chip shape)
 */

import type { FollowupDigestBccTierPolicyCoverageReport } from './followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report';
import type {
  BccTierPolicyCoverageWarningHtmlChip,
  BccTierPolicyCoverageWarningSeverity,
  BccTierPolicyCoverageWarningsHtmlOptions,
  BccTierPolicyCoverageWarningsHtmlResult,
} from './followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report-warnings-html';
import { renderBccTierPolicyCoverageWarningsHtml } from './followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report-warnings-html';

export type BccTierPolicyCoverageWarningsHtmlPrintPaper = 'us-letter' | 'a4';

export interface BccTierPolicyCoverageWarningsHtmlPrintOptions
  extends Omit<BccTierPolicyCoverageWarningsHtmlOptions, 'wrapHtmlDocument'> {
  /**
   * Paper preset. Default 'us-letter'. Drives the @page CSS so the
   * browser print dialog defaults to the right paper.
   */
  paper?: BccTierPolicyCoverageWarningsHtmlPrintPaper;
  /**
   * "Printed on" timestamp. When set, formatted under the chip stack
   * as "Printed YYYY-MM-DD" (ISO date in the supplied timezone).
   * When undefined, no printed-on line is emitted.
   */
  printedAt?: Date;
  /**
   * Timezone for the printedAt timestamp. Defaults to
   * 'America/Los_Angeles'.
   */
  printedAtTimezone?: string;
  /**
   * Footer text override. Default
   * "Coverage warnings snapshot — does not update once printed."
   * Set '' to suppress.
   */
  footerText?: string;
  /**
   * Wrap fragment in a complete HTML document. Default true because
   * printable pages are typically standalone documents.
   */
  wrapHtmlDocument?: boolean;
  /**
   * Suppress the badge prefix in the chip body (e.g. "[CRITICAL]").
   * Default false. The badge is the only signal left after the colour
   * fill is removed, so suppress only if the host page wants a
   * chrome-free print render.
   */
  suppressBadgePrefix?: boolean;
  /**
   * Suppress the printed-on stamp entirely. Default false. Useful
   * for stable hash-equal snapshots where the timestamp would drift.
   */
  suppressPrintedAt?: boolean;
}

export interface BccTierPolicyCoverageWarningsHtmlPrintResult {
  /** Print-ready HTML fragment or full document. */
  html: string;
  /** Mirror of the underlying render's chips (in input order). */
  chips: BccTierPolicyCoverageWarningHtmlChip[];
  /** Count of chips per severity tier (always present, possibly 0). */
  countsBySeverity: Record<BccTierPolicyCoverageWarningSeverity, number>;
  /** True when the report contained zero warnings. */
  isEmpty: boolean;
  /** Resolved paper preset. */
  paper: BccTierPolicyCoverageWarningsHtmlPrintPaper;
  /** ISO date stamp emitted in the footer (or null). */
  printedAtIso: string | null;
}

const PAPER_PAGE: Record<BccTierPolicyCoverageWarningsHtmlPrintPaper, string> = {
  'us-letter': '@page { size: 8.5in 11in; margin: 0.5in; }',
  'a4': '@page { size: 210mm 297mm; margin: 15mm; }',
};

/**
 * Monochrome badge prefix per severity. Survives B&W printing AND
 * is colour-vision-difference safe. The brackets are explicit so
 * even on a low-DPI printer the prefix reads as structured text.
 */
const SEVERITY_BADGE_PREFIX: Record<
  BccTierPolicyCoverageWarningSeverity,
  string
> = {
  'always-critical': '[CRITICAL]',
  'always-tier': '[CAUTION]',
  'unused-destination': '[INFO]',
};

/**
 * Border width per severity (monochrome — width replaces colour as
 * the differentiator). Thicker border = higher severity.
 */
const SEVERITY_BORDER_WIDTH: Record<
  BccTierPolicyCoverageWarningSeverity,
  string
> = {
  'always-critical': '3px',
  'always-tier': '2px',
  'unused-destination': '1px',
};

const PRINTABLE_OVERLAY_CSS =
  // Override the chip palette — every chip becomes white/black
  // regardless of severity.
  `.cov-warn-chip { background: #ffffff !important; color: #000000 !important; border-color: #000000 !important; }` +
  // Stack chips vertically rather than the screen's flex-wrap row.
  `.cov-warn-chips { display: flex !important; flex-direction: column !important; gap: 6pt !important; }` +
  // Each chip becomes a full-width row.
  `.cov-warn-chip { display: flex !important; width: 100% !important; align-items: baseline !important; gap: 8pt !important; padding: 6pt 10pt !important; border-radius: 2pt !important; }` +
  // Severity badge label gets bolded; spacing gives it room.
  `.cov-warn-severity { font-weight: 800 !important; letter-spacing: 0.04em !important; }` +
  // Strip the screen's empty-state green; keep the rest of the styling.
  `.cov-warn-chip--empty { background: #ffffff !important; color: #000000 !important; border-color: #000000 !important; }` +
  // Address span: drop the screen's coloured background highlight,
  // add a light border for separation, use tabular-nums for digit
  // alignment.
  `.cov-warn-addr { background: transparent !important; border: 1px solid #9ca3af !important; padding: 1pt 4pt !important; border-radius: 2pt !important; font-variant-numeric: tabular-nums !important; }` +
  // Footer styles.
  `.cov-warn-printed-on { font-size: 8pt; color: #4b5563; margin-top: 12pt; text-align: right; font-variant-numeric: tabular-nums; }` +
  `.cov-warn-print-footer { font-size: 8pt; color: #4b5563; margin-top: 4pt; text-align: center; font-style: italic; }`;

const DEFAULT_FOOTER_TEXT =
  'Coverage warnings snapshot \u2014 does not update once printed.';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPrintedAt(at: Date, timezone: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(at);
}

/**
 * Walk the base fragment and inject (a) the severity-specific border
 * width into each chip's inline style + (b) the monochrome badge
 * prefix into the chip's `<span class="cov-warn-severity">` body.
 *
 * The base render emits chips in input order so a positional walk
 * matches the chip array.
 *
 * For the empty state we leave the chip alone (it has its own
 * single "All clear" badge that's already monochrome-friendly under
 * the overlay CSS).
 */
function rewriteSeverityBadges(
  fragment: string,
  chips: BccTierPolicyCoverageWarningHtmlChip[],
  severityLabels: Partial<Record<BccTierPolicyCoverageWarningSeverity, string>>,
  suppressBadgePrefix: boolean,
): string {
  if (chips.length === 0) return fragment;

  let result = fragment;

  // Walk the chips in order. Each chip occurs ONCE in the body
  // (positional). For each, find its severity-class marker and
  // rewrite the severity span to prepend the badge.
  for (const chip of chips) {
    const sev = chip.severity;
    const borderWidth = SEVERITY_BORDER_WIDTH[sev];
    const badge = suppressBadgePrefix ? '' : SEVERITY_BADGE_PREFIX[sev];
    const severityLabel = severityLabels[sev];

    // Find the unique class marker for this chip — first remaining
    // occurrence of cov-warn-chip--{severity}.
    const chipClassMarker = `cov-warn-chip cov-warn-chip--${sev}`;
    const chipIdx = result.indexOf(chipClassMarker);
    if (chipIdx === -1) continue;

    // Find the `style="..."` attribute that follows this chip's
    // opening tag (within ~200 chars — the base render's chip prefix
    // is tight).
    const styleMatch = /style="[^"]*"/g;
    styleMatch.lastIndex = chipIdx;
    const m = styleMatch.exec(result);
    if (!m || m.index - chipIdx > 200) continue;

    // Rewrite the border width inside this chip's style attribute.
    // The base render's style emits `border:1px solid <color>;`; we
    // replace the `1px` with the per-severity width while leaving
    // the rest of the inline style intact (the overlay CSS already
    // overrides background + color + border-color, so the inline
    // `1px` is the only piece we need to widen).
    const styleStart = m.index;
    const styleEnd = m.index + m[0].length;
    const rewrittenStyle = m[0].replace(
      /border:1px solid/,
      `border:${borderWidth} solid`,
    );
    result =
      result.slice(0, styleStart) +
      rewrittenStyle +
      result.slice(styleEnd);

    // Now rewrite the severity span body in THIS chip. Find the next
    // `<span class="cov-warn-severity">...</span>` AFTER the rewritten
    // style attribute.
    const severitySpanRe =
      /<span class="cov-warn-severity">([^<]*)<\/span>/g;
    severitySpanRe.lastIndex = styleEnd;
    const sm = severitySpanRe.exec(result);
    if (!sm) continue;
    const sevSpanStart = sm.index;
    const sevSpanEnd = sm.index + sm[0].length;
    const existing = sm[1] ?? '';
    // Use the caller's severityLabels override OR the existing label
    // OR the default badge text (no override + render emitted no body).
    const labelText =
      severityLabel !== undefined
        ? severityLabel
        : existing.length > 0
          ? existing
          : badge.replace(/[\[\]]/g, '');
    const rewrittenSeveritySpan = suppressBadgePrefix
      ? `<span class="cov-warn-severity">${escapeHtml(labelText)}</span>`
      : `<span class="cov-warn-severity">${escapeHtml(badge)} ${escapeHtml(labelText)}</span>`;
    result =
      result.slice(0, sevSpanStart) +
      rewrittenSeveritySpan +
      result.slice(sevSpanEnd);
  }

  return result;
}

/**
 * Render the print-friendly coverage warnings panel.
 *
 * Composes renderBccTierPolicyCoverageWarningsHtml so the chip datum
 * stays consistent with the dashboard variant, then layers
 * monochrome CSS, swaps the severity colour for a monochrome badge
 * prefix + border width, stacks chips vertically, drops the address
 * background highlight, and appends a printed-on + footer line below
 * the chip stack.
 *
 * Pure / deterministic.
 */
export function renderBccTierPolicyCoverageWarningsHtmlPrint(
  report: FollowupDigestBccTierPolicyCoverageReport,
  options: BccTierPolicyCoverageWarningsHtmlPrintOptions = {},
): BccTierPolicyCoverageWarningsHtmlPrintResult {
  const paper = options.paper ?? 'us-letter';
  const wrapDoc = options.wrapHtmlDocument ?? true;
  const suppressBadgePrefix = options.suppressBadgePrefix ?? false;
  const suppressPrintedAt = options.suppressPrintedAt ?? false;

  // Run the base render. We always run it as a fragment (NOT a full
  // document) so we can splice the overlay CSS + footer ourselves.
  const base = renderBccTierPolicyCoverageWarningsHtml(report, {
    ...options,
    wrapHtmlDocument: false,
  });

  // Rewrite per-chip border width + severity badge prefix.
  let fragment = rewriteSeverityBadges(
    base.html,
    base.chips,
    options.severityLabels ?? {},
    suppressBadgePrefix,
  );

  // Append the printable footer block (printed-on stamp + footer
  // line) INSIDE the wrapper section so the layout stays contained.
  const printedAtIso =
    suppressPrintedAt || options.printedAt === undefined
      ? null
      : formatPrintedAt(
          options.printedAt,
          options.printedAtTimezone ?? 'America/Los_Angeles',
        );
  const footerText = options.footerText ?? DEFAULT_FOOTER_TEXT;
  const footerHtml =
    (printedAtIso !== null
      ? `<div class="cov-warn-printed-on">Printed ${escapeHtml(printedAtIso)}</div>`
      : '') +
    (footerText.length > 0
      ? `<div class="cov-warn-print-footer">${escapeHtml(footerText)}</div>`
      : '');
  fragment = fragment.replace(
    /<\/section>$/,
    `${footerHtml}</section>`,
  );

  // Layer the printable overlay CSS BEFORE the existing <style> block
  // so the !important rules win the cascade.
  const overlayStyle = `<style>${PAPER_PAGE[paper]}${PRINTABLE_OVERLAY_CSS}</style>`;
  fragment = overlayStyle + fragment;

  const docTitle =
    options.documentTitle ?? 'BCC tier-policy coverage warnings';
  const html = wrapDoc
    ? `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(
        docTitle,
      )}</title></head><body>${fragment}</body></html>`
    : fragment;

  return {
    html,
    chips: base.chips,
    countsBySeverity: base.countsBySeverity,
    isEmpty: base.isEmpty,
    paper,
    printedAtIso,
  };
}

/**
 * Convenience: one-line cron-log summary of the printable render.
 *
 *   "Coverage warnings (print, us-letter): 3 chips (1 always-critical,
 *    2 unused-destination); printed 2026-06-23."
 *   "Coverage warnings (print, a4): 0 chips (all checks passed);
 *    printed 2026-06-23."
 */
export function summarizeBccTierPolicyCoverageWarningsHtmlPrint(
  result: BccTierPolicyCoverageWarningsHtmlPrintResult,
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
  const printedPart =
    result.printedAtIso === null
      ? ''
      : `; printed ${result.printedAtIso}`;
  return `Coverage warnings (print, ${result.paper}): ${total} ${total === 1 ? 'chip' : 'chips'} ${bodyDetail}${printedPart}.`;
}

/**
 * Convenience: extract the per-chip text as plain-text lines for log
 * review without rendering HTML. One line per chip, with badge prefix
 * + label + address (when present).
 *
 *   "[CRITICAL] Channel always critical"
 *   "[INFO] Unused destination — admin@example.com"
 *   "All clear — All checks passed"
 */
export function extractBccTierPolicyCoverageWarningsHtmlPrintLines(
  result: BccTierPolicyCoverageWarningsHtmlPrintResult,
): string[] {
  if (result.isEmpty) {
    return ['All clear \u2014 All checks passed'];
  }
  return result.chips.map((c) => {
    const badge = SEVERITY_BADGE_PREFIX[c.severity];
    const address = c.address === null ? '' : ` \u2014 ${c.address}`;
    return `${badge} ${c.label}${address}`;
  });
}
