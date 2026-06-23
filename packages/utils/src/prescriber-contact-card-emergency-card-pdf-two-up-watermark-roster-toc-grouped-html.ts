/**
 * Prescriber contact card emergency card PDF — two-up watermark
 * roster, table-of-contents HTML companion, collapsible/grouped variant.
 *
 * `prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html`
 * emits a flat CSS-grid TOC: every specialty group label as a
 * sticky heading, every entry in a single scrollable list. That's
 * the right layout for PRINT (no interactivity wanted on paper),
 * but it's wrong for SCREEN-FIRST review:
 *
 *   - the clinician scrolling the TOC inline wants to collapse
 *     specialties they don't care about to focus on the ones they
 *     do (rare in print, near-universal on screen);
 *   - the patient portal's TOC widget wants accordion behaviour by
 *     default so an 80-prescriber roster doesn't dominate the page;
 *   - the household admin reviewing a roster wants to expand only
 *     the active-care specialties.
 *
 * This module is the screen-first companion. It composes
 * buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc under the hood
 * and renders the TOC as a series of native HTML <details>/<summary>
 * elements:
 *
 *   <details class="toc-group" open|<closed>>
 *     <summary class="toc-group-summary">
 *       <span class="toc-group-label">CARDIOLOGY</span>
 *       <span class="toc-group-count">3 entries</span>
 *     </summary>
 *     <div class="toc-group-body">
 *       <div class="toc-row"><span class="toc-name">...</span><span class="toc-page">Page 4</span></div>
 *       ...
 *     </div>
 *   </details>
 *
 * Native <details>/<summary> works in all modern browsers with no
 * JavaScript and degrades gracefully on screen readers (announced as
 * a disclosure widget). For paper print, the @media print stylesheet
 * forces all groups OPEN so the screen-first behaviour doesn't break
 * the print workflow.
 *
 * Default: all groups open. opt in to collapsed defaults via
 * `defaultGroupState='collapsed'` or via per-specialty
 * `collapsedSpecialties` list.
 *
 * Pure / deterministic. No JS. No remote URLs.
 *
 * Composes:
 *   - buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc
 */

import type { PrescriberEmergencyCard } from './prescriber-contact-card-emergency-card';
import type {
  EmergencyCardPdfTwoUpRosterTocEntry,
  EmergencyCardPdfTwoUpRosterWithTocOptions,
  EmergencyCardPdfTwoUpRosterWithTocResult,
} from './prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc';
import { buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc } from './prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc';

export interface EmergencyCardPdfTwoUpRosterTocGroupedHtmlOptions
  extends EmergencyCardPdfTwoUpRosterWithTocOptions {
  /**
   * Default open/closed state for every group's <details>. Default
   * 'open' so screen-first reviewers see everything by default.
   * Set 'collapsed' to mimic an accordion (only one group expanded
   * at a time is NOT enforced — multiple groups can be open).
   */
  defaultGroupState?: 'open' | 'collapsed';
  /**
   * Per-specialty override of the default state. Useful when the
   * roster has a few small specialties the clinician always wants
   * expanded (e.g. CARDIOLOGY) while leaving the long ones
   * collapsed.
   *
   * Specialty matching is case-insensitive against the group label
   * AFTER titleCase normalisation (matches the underlying TOC's
   * group label produced by the toc-html module).
   */
  collapsedSpecialties?: string[];
  /**
   * Per-specialty override list to FORCE open even when the default
   * is collapsed.
   */
  openSpecialties?: string[];
  /**
   * Wrap the fragment in a complete HTML document. Default true.
   */
  wrapHtmlDocument?: boolean;
  /**
   * Optional <title>. Default "Emergency contact roster - table of
   * contents".
   */
  documentTitle?: string;
  /**
   * Optional override for the font-family. Default print-friendly
   * sans-serif.
   */
  fontFamily?: string;
  /**
   * Force ALL groups OPEN under @media print. Default true so a
   * screen-first reviewer who decides to print the TOC doesn't end
   * up with a collapsed paper copy.
   */
  forceOpenInPrint?: boolean;
}

export interface EmergencyCardPdfTwoUpRosterTocGroupedHtmlGroup {
  /** Group label as rendered (title-cased + uppercase for the heading). */
  label: string;
  /** Entries inside this group, in render order. */
  entries: EmergencyCardPdfTwoUpRosterTocEntry[];
  /** Whether this group is open by default. */
  openByDefault: boolean;
}

export interface EmergencyCardPdfTwoUpRosterTocGroupedHtmlResult {
  /** Complete HTML fragment. */
  html: string;
  /** Groups in render order. */
  groups: EmergencyCardPdfTwoUpRosterTocGroupedHtmlGroup[];
  /** Total entries across all groups. */
  totalEntryCount: number;
  /** Mirror of underlying batchId / generatedAt / totalPages. */
  batchId: string;
  generatedAt: Date;
  totalPages: number;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function titleCase(s: string): string {
  if (s.length === 0) return s;
  return s
    .split(/[\s-]+/)
    .map((w) => (w.length === 0 ? '' : w[0]!.toUpperCase() + w.slice(1)))
    .join(' ');
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildGroups(
  entries: EmergencyCardPdfTwoUpRosterTocEntry[],
  options: EmergencyCardPdfTwoUpRosterTocGroupedHtmlOptions,
): EmergencyCardPdfTwoUpRosterTocGroupedHtmlGroup[] {
  const groupBySpecialty = options.tocGroupBySpecialty ?? true;
  const fallback = options.tocSpecialtyFallback ?? 'Other';
  const defaultState = options.defaultGroupState ?? 'open';
  const collapsedSet = new Set(
    (options.collapsedSpecialties ?? []).map((s) => titleCase(s).toUpperCase()),
  );
  const openSet = new Set(
    (options.openSpecialties ?? []).map((s) => titleCase(s).toUpperCase()),
  );

  if (!groupBySpecialty) {
    return [
      {
        label: '',
        entries,
        openByDefault: defaultState === 'open',
      },
    ];
  }

  const byLabel = new Map<string, EmergencyCardPdfTwoUpRosterTocEntry[]>();
  // Preserve first-appearance order of groups (matches the underlying
  // toc module's order semantics).
  const orderedLabels: string[] = [];
  for (const e of entries) {
    const label = titleCase(e.specialty ?? fallback).toUpperCase();
    if (!byLabel.has(label)) {
      byLabel.set(label, []);
      orderedLabels.push(label);
    }
    byLabel.get(label)!.push(e);
  }

  return orderedLabels.map((label) => {
    // Open precedence: openSet > collapsedSet > defaultState
    let openByDefault: boolean;
    if (openSet.has(label)) {
      openByDefault = true;
    } else if (collapsedSet.has(label)) {
      openByDefault = false;
    } else {
      openByDefault = defaultState === 'open';
    }
    return {
      label,
      entries: byLabel.get(label)!,
      openByDefault,
    };
  });
}

function buildGroupBody(group: EmergencyCardPdfTwoUpRosterTocGroupedHtmlGroup): string {
  const parts: string[] = ['<div class="toc-group-body">'];
  for (const e of group.entries) {
    parts.push(
      `<div class="toc-row">` +
        `<span class="toc-name">${escapeHtml(e.displayName)}</span>` +
        `<span class="toc-page">Page ${e.pageNumber}</span>` +
        `</div>`,
    );
  }
  parts.push('</div>');
  return parts.join('');
}

function buildGroupedBodyHtml(
  groups: EmergencyCardPdfTwoUpRosterTocGroupedHtmlGroup[],
  title: string,
  totalPages: number,
  totalEntries: number,
): string {
  const parts: string[] = [];
  parts.push(`<h1 class="toc-title">${escapeHtml(title)}</h1>`);
  if (totalEntries === 0) {
    parts.push('<p class="toc-empty">No entries.</p>');
  } else {
    for (const g of groups) {
      const summaryParts: string[] = [];
      if (g.label.length > 0) {
        summaryParts.push(
          `<span class="toc-group-label">${escapeHtml(g.label)}</span>`,
        );
        summaryParts.push(
          `<span class="toc-group-count">${g.entries.length} ${
            g.entries.length === 1 ? 'entry' : 'entries'
          }</span>`,
        );
      } else {
        summaryParts.push(
          `<span class="toc-group-label">All entries</span>`,
        );
        summaryParts.push(
          `<span class="toc-group-count">${g.entries.length} ${
            g.entries.length === 1 ? 'entry' : 'entries'
          }</span>`,
        );
      }
      const openAttr = g.openByDefault ? ' open' : '';
      parts.push(
        `<details class="toc-group"${openAttr}>` +
          `<summary class="toc-group-summary">${summaryParts.join('')}</summary>` +
          buildGroupBody(g) +
          `</details>`,
      );
    }
  }
  const footerText =
    `TOC \u00b7 ${totalEntries} ${totalEntries === 1 ? 'entry' : 'entries'} ` +
    `\u00b7 Document ${totalPages} ${totalPages === 1 ? 'page' : 'pages'} total`;
  parts.push(
    `<footer class="toc-footer">${escapeHtml(footerText)}</footer>`,
  );
  return parts.join('');
}

function buildCss(
  options: EmergencyCardPdfTwoUpRosterTocGroupedHtmlOptions,
  forcePrintOpen: boolean,
): string {
  const fontFamily =
    options.fontFamily ??
    "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  const screenCss =
    `* { box-sizing: border-box; }` +
    `body { margin: 0; padding: 0; font-family: ${fontFamily}; color: #111827; background: #fff; }` +
    `.toc-wrapper { padding: 0.5in 0.25in; max-width: 100%; }` +
    `.toc-title { font-size: 18pt; font-weight: 700; margin: 0 0 18pt 0; text-align: center; color: #111827; }` +
    `.toc-empty { color: #6b7280; font-style: italic; }` +
    `details.toc-group { border: 1px solid #e5e7eb; border-radius: 4pt; margin-bottom: 8pt; }` +
    `details.toc-group > summary.toc-group-summary { cursor: pointer; padding: 8pt 12pt; display: flex; justify-content: space-between; align-items: baseline; gap: 12pt; user-select: none; background: #f9fafb; border-bottom: 1px solid transparent; list-style: none; }` +
    `details.toc-group[open] > summary.toc-group-summary { border-bottom: 1px solid #e5e7eb; }` +
    `details.toc-group > summary.toc-group-summary::-webkit-details-marker { display: none; }` +
    `.toc-group-label { font-size: 10pt; font-weight: 700; color: #111827; letter-spacing: 0.08em; text-transform: uppercase; }` +
    `.toc-group-count { font-size: 9pt; color: #6b7280; font-variant-numeric: tabular-nums; }` +
    `.toc-group-body { padding: 6pt 12pt 8pt 12pt; display: grid; grid-template-columns: 1fr; gap: 4pt; }` +
    `.toc-row { display: grid; grid-template-columns: 1fr auto; align-items: baseline; gap: 12pt; font-size: 10pt; }` +
    `.toc-name { font-weight: 500; }` +
    `.toc-page { color: #6b7280; font-variant-numeric: tabular-nums; }` +
    `.toc-footer { margin-top: 24pt; padding-top: 8pt; border-top: 1px solid #e5e7eb; font-size: 8pt; color: #6b7280; text-align: center; }`;
  const printCss = forcePrintOpen
    ? `@media print { @page { size: letter portrait; margin: 0.5in; } details.toc-group { border-color: #d1d5db; } details.toc-group > summary.toc-group-summary { background: #fff; cursor: default; } details.toc-group { display: block; } details.toc-group:not([open]) > .toc-group-body { display: grid !important; } details.toc-group > summary.toc-group-summary::-webkit-details-marker { display: none; } }`
    : `@media print { @page { size: letter portrait; margin: 0.5in; } }`;
  return screenCss + printCss;
}

/**
 * Render the TOC as a screen-first collapsible HTML document using
 * native <details>/<summary>. Composes the underlying TOC builder
 * to keep the grouping + ordering identical to the PDF TOC.
 *
 * Pure / deterministic.
 */
export function renderEmergencyCardPdfTwoUpWatermarkedRosterTocGroupedHtml(
  emergencyCards: PrescriberEmergencyCard[],
  options: EmergencyCardPdfTwoUpRosterTocGroupedHtmlOptions = {},
): EmergencyCardPdfTwoUpRosterTocGroupedHtmlResult {
  const tocResult: EmergencyCardPdfTwoUpRosterWithTocResult =
    buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc(emergencyCards, options);

  const groups = buildGroups(tocResult.tocEntries, options);
  const totalEntries = tocResult.tocEntries.length;
  const docTitle =
    options.documentTitle ?? 'Emergency contact roster - table of contents';
  const tocTitle = options.tocTitle ?? docTitle;
  const wrapDoc = options.wrapHtmlDocument ?? true;
  const forceOpenInPrint = options.forceOpenInPrint ?? true;

  const css = buildCss(options, forceOpenInPrint);
  const bodyHtml = buildGroupedBodyHtml(
    groups,
    tocTitle,
    tocResult.totalPages,
    totalEntries,
  );

  const metaLine =
    `<div class="toc-meta" style="font-size:8pt;color:#6b7280;text-align:right;margin-top:-6pt;margin-bottom:8pt;">` +
    `Batch ${escapeHtml(tocResult.batchId)} \u00b7 Generated ${escapeHtml(isoDate(tocResult.generatedAt))}` +
    `</div>`;

  const wrapperOpen = `<section class="toc-wrapper">`;
  const wrapperClose = `</section>`;

  if (!wrapDoc) {
    return {
      html:
        `<style>${css}</style>` +
        wrapperOpen +
        metaLine +
        bodyHtml +
        wrapperClose,
      groups,
      totalEntryCount: totalEntries,
      batchId: tocResult.batchId,
      generatedAt: tocResult.generatedAt,
      totalPages: tocResult.totalPages,
    };
  }

  const html =
    `<!DOCTYPE html>` +
    `<html lang="en">` +
    `<head>` +
    `<meta charset="utf-8">` +
    `<title>${escapeHtml(docTitle)}</title>` +
    `<style>${css}</style>` +
    `</head>` +
    `<body>` +
    wrapperOpen +
    metaLine +
    bodyHtml +
    wrapperClose +
    `</body>` +
    `</html>`;

  return {
    html,
    groups,
    totalEntryCount: totalEntries,
    batchId: tocResult.batchId,
    generatedAt: tocResult.generatedAt,
    totalPages: tocResult.totalPages,
  };
}

/**
 * Convenience: return the TOC as a stripped fragment with no
 * document wrapping. For splicing into a host page (e.g. the
 * patient portal).
 */
export function renderEmergencyCardPdfTwoUpWatermarkedRosterTocGroupedHtmlFragment(
  emergencyCards: PrescriberEmergencyCard[],
  options: Omit<
    EmergencyCardPdfTwoUpRosterTocGroupedHtmlOptions,
    'wrapHtmlDocument'
  > = {},
): EmergencyCardPdfTwoUpRosterTocGroupedHtmlResult {
  return renderEmergencyCardPdfTwoUpWatermarkedRosterTocGroupedHtml(
    emergencyCards,
    { ...options, wrapHtmlDocument: false },
  );
}

/**
 * Convenience: count how many groups are open vs collapsed in the
 * rendered result. Useful for the patient portal's "X of Y specialties
 * shown" tally above the TOC.
 */
export function tallyGroupedTocOpenState(
  result: EmergencyCardPdfTwoUpRosterTocGroupedHtmlResult,
): { openGroups: number; collapsedGroups: number; totalGroups: number } {
  let open = 0;
  let collapsed = 0;
  for (const g of result.groups) {
    if (g.openByDefault) open++;
    else collapsed++;
  }
  return {
    openGroups: open,
    collapsedGroups: collapsed,
    totalGroups: result.groups.length,
  };
}

/**
 * Convenience: one-line cron-log summary.
 *
 *   "Grouped TOC HTML: 14 entries across 4 groups (3 open, 1 collapsed)."
 */
export function summarizeGroupedTocHtmlResult(
  result: EmergencyCardPdfTwoUpRosterTocGroupedHtmlResult,
): string {
  const tally = tallyGroupedTocOpenState(result);
  return (
    `Grouped TOC HTML: ${result.totalEntryCount} ` +
    `${result.totalEntryCount === 1 ? 'entry' : 'entries'} across ` +
    `${tally.totalGroups} ${tally.totalGroups === 1 ? 'group' : 'groups'} ` +
    `(${tally.openGroups} open, ${tally.collapsedGroups} collapsed).`
  );
}
