/**
 * Prescriber contact card emergency card PDF — two-up watermark
 * roster, table-of-contents HTML companion, ANCHOR-LINK variant.
 *
 * `prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html`
 * emits TOC rows that read "Page N" but the row text is NOT a link.
 * That's fine for paper print (no interactivity available anyway),
 * but it's WRONG for a single-page HTML render of the binder where
 * the TOC and the cards live in the same document:
 *
 *   - the household admin browsing the in-app digest wants to click
 *     a prescriber's name in the TOC and JUMP to the card;
 *   - the clinician scrolling a long roster on screen wants the
 *     same affordance the print TOC implies but never delivered;
 *   - screen-reader users navigating by link list want each TOC
 *     entry exposed as a discrete anchor target.
 *
 * This module is the anchor-link variant. It emits the TOC AND a
 * parallel anchor map so the host page can wrap each card in a
 * matching `<a id="...">` target. The TOC names are rendered as
 * `<a href="#{anchorId}">` rather than `<span>`, and an anchorById
 * map exposes the {cardIndex -> anchorId} mapping so the host page
 * can place anchors at the right positions.
 *
 * Anchor id scheme (stable, URL-safe, deterministic):
 *
 *   tocPrefix-{cardIndex}                         (default)
 *   tocPrefix-{slugify(displayName)}              (when useDisplayNameSlug=true)
 *   tocPrefix-{slugify(specialty)}-{cardIndex}    (when groupBySpecialty=true)
 *
 * tocPrefix defaults to "rx-toc" so a host page that embeds multiple
 * TOCs can disambiguate via different prefixes.
 *
 * Pure / deterministic. No JS. HTML escaped. URL-safe anchor ids.
 *
 * Composes:
 *   - renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlFragment
 *   - the underlying TOC entries from
 *     buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc
 */

import type { PrescriberEmergencyCard } from './prescriber-contact-card-emergency-card';
import type {
  EmergencyCardPdfTwoUpRosterTocEntry,
  EmergencyCardPdfTwoUpRosterWithTocOptions,
  EmergencyCardPdfTwoUpRosterWithTocResult,
} from './prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc';
import { buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc } from './prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc';

export interface EmergencyCardPdfTwoUpRosterTocHtmlAnchoredOptions
  extends EmergencyCardPdfTwoUpRosterWithTocOptions {
  /**
   * Wrap the fragment in a complete HTML document. Default false (the
   * fragment is a <section> suitable for splicing into a host page
   * alongside the actual card markup).
   */
  wrapHtmlDocument?: boolean;
  /** Optional <title>. Default "Emergency contact roster - table of contents". */
  documentTitle?: string;
  /** Optional font-family. Default print-friendly sans-serif. */
  fontFamily?: string;
  /**
   * Anchor id prefix. Default "rx-toc". Host pages that embed
   * multiple TOCs can disambiguate via per-TOC prefixes (e.g.
   * "primary-toc", "specialist-toc").
   */
  tocPrefix?: string;
  /**
   * Use slugified displayName in the anchor id instead of cardIndex
   * (default false). Off by default because two prescribers with the
   * same surname collide; on when the host page wants human-readable
   * anchor ids in the URL bar.
   */
  useDisplayNameSlug?: boolean;
  /**
   * Include the specialty in the anchor id (default false). Useful
   * when the host page wants /toc#cardiology-3 style URLs.
   */
  includeSpecialtyInAnchor?: boolean;
}

export interface EmergencyCardPdfTwoUpRosterTocHtmlAnchoredResult {
  /** HTML fragment or full document. */
  html: string;
  /** TOC entries used to build the body (mirrored from the underlying TOC). */
  tocEntries: EmergencyCardPdfTwoUpRosterTocEntry[];
  /**
   * Per-card anchor id, keyed on cardIndex. The host page wraps the
   * corresponding card in `<a id="{anchorId}"></a>` (or sets the id
   * on the card's outer element) so the TOC link navigates to it.
   */
  anchorByCardIndex: Map<number, string>;
  /** Mirror batchId / generatedAt / totalPages / totalCardCount. */
  batchId: string;
  generatedAt: Date;
  totalPages: number;
  totalCardCount: number;
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

/**
 * URL-safe slug: lowercased, hyphen-separated, alphanumeric only.
 * Empty input -> 'untitled' (so the anchor is always non-empty).
 */
function slugify(s: string): string {
  const normalised = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalised.length === 0 ? 'untitled' : normalised;
}

function buildAnchorId(
  entry: EmergencyCardPdfTwoUpRosterTocEntry,
  prefix: string,
  useDisplayNameSlug: boolean,
  includeSpecialty: boolean,
): string {
  const parts: string[] = [prefix];
  if (includeSpecialty) {
    parts.push(slugify(entry.specialty ?? 'other'));
  }
  if (useDisplayNameSlug) {
    parts.push(slugify(entry.displayName));
  }
  // ALWAYS append cardIndex so the anchor is unique even if displayName
  // collides (Smith, Jane A. on card 3 vs. Smith, Jane A. on card 7).
  parts.push(String(entry.cardIndex));
  return parts.join('-');
}

function buildAnchoredTocBodyHtml(
  entries: EmergencyCardPdfTwoUpRosterTocEntry[],
  anchorMap: Map<number, string>,
  options: EmergencyCardPdfTwoUpRosterTocHtmlAnchoredOptions,
  title: string,
  totalPages: number,
): string {
  const groupBySpecialty = options.tocGroupBySpecialty ?? true;
  const fallback = options.tocSpecialtyFallback ?? 'Other';

  const sectionParts: string[] = [];
  sectionParts.push(
    `<h1 class="toc-title">${escapeHtml(title)}</h1>`,
  );

  if (entries.length === 0) {
    sectionParts.push('<p class="toc-empty">No entries.</p>');
  } else {
    let lastGroupLabel: string | null = null;
    sectionParts.push('<div class="toc-body">');
    for (const e of entries) {
      const groupLabel = groupBySpecialty
        ? titleCase(e.specialty ?? fallback)
        : '';
      if (groupBySpecialty && groupLabel !== lastGroupLabel) {
        sectionParts.push(
          `<div class="toc-group-label">${escapeHtml(groupLabel.toUpperCase())}</div>`,
        );
        lastGroupLabel = groupLabel;
      }
      const anchorId = anchorMap.get(e.cardIndex) ?? '';
      sectionParts.push(
        `<div class="toc-row">` +
          `<a class="toc-name" href="#${escapeHtml(anchorId)}">${escapeHtml(e.displayName)}</a>` +
          `<span class="toc-page">Page ${e.pageNumber}</span>` +
          `</div>`,
      );
    }
    sectionParts.push('</div>');
  }

  const footerText =
    `TOC \u00b7 ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} ` +
    `\u00b7 Document ${totalPages} ${totalPages === 1 ? 'page' : 'pages'} total`;
  sectionParts.push(`<footer class="toc-footer">${escapeHtml(footerText)}</footer>`);

  return sectionParts.join('');
}

function buildCss(fontFamily: string): string {
  return (
    `* { box-sizing: border-box; }` +
    `body { margin: 0; padding: 0; font-family: ${fontFamily}; color: #111827; background: #fff; }` +
    `.toc-wrapper { padding: 0.25in; max-width: 100%; }` +
    `.toc-title { font-size: 18pt; font-weight: 700; margin: 0 0 18pt 0; text-align: center; color: #111827; }` +
    `.toc-group-label { font-size: 10pt; font-weight: 700; color: #6b7280; margin-top: 14pt; margin-bottom: 6pt; letter-spacing: 0.08em; text-transform: uppercase; }` +
    `.toc-body { display: grid; grid-template-columns: 1fr; gap: 4pt; }` +
    `.toc-row { display: grid; grid-template-columns: 1fr auto; align-items: baseline; gap: 12pt; font-size: 10pt; }` +
    `.toc-name { font-weight: 500; color: #1d4ed8; text-decoration: none; }` +
    `.toc-name:hover { text-decoration: underline; }` +
    `.toc-name:focus { outline: 2px solid #1d4ed8; outline-offset: 2px; }` +
    `.toc-page { color: #6b7280; font-variant-numeric: tabular-nums; }` +
    `.toc-empty { color: #6b7280; font-style: italic; }` +
    `.toc-footer { margin-top: 24pt; padding-top: 8pt; border-top: 1px solid #e5e7eb; font-size: 8pt; color: #6b7280; text-align: center; }`
  );
}

/**
 * Render the TOC page as an anchor-linked HTML fragment + an anchor
 * map for the host page to wire the cards to the TOC links.
 *
 * Pure / deterministic. No JS. URL-safe anchor ids.
 */
export function renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored(
  emergencyCards: PrescriberEmergencyCard[],
  options: EmergencyCardPdfTwoUpRosterTocHtmlAnchoredOptions = {},
): EmergencyCardPdfTwoUpRosterTocHtmlAnchoredResult {
  const tocResult: EmergencyCardPdfTwoUpRosterWithTocResult =
    buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc(emergencyCards, options);

  const prefix = options.tocPrefix ?? 'rx-toc';
  const useSlug = options.useDisplayNameSlug ?? false;
  const includeSpecialty = options.includeSpecialtyInAnchor ?? false;

  // Build anchorByCardIndex from the underlying TOC entries (which
  // already carry cardIndex + displayName + specialty).
  const anchorByCardIndex = new Map<number, string>();
  for (const entry of tocResult.tocEntries) {
    const id = buildAnchorId(entry, prefix, useSlug, includeSpecialty);
    anchorByCardIndex.set(entry.cardIndex, id);
  }

  const wrapDoc = options.wrapHtmlDocument ?? false;
  const docTitle =
    options.documentTitle ?? 'Emergency contact roster \u2014 table of contents';
  const tocTitle = options.tocTitle ?? docTitle;
  const fontFamily =
    options.fontFamily ??
    "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

  const css = buildCss(fontFamily);
  const bodyHtml = buildAnchoredTocBodyHtml(
    tocResult.tocEntries,
    anchorByCardIndex,
    options,
    tocTitle,
    tocResult.totalPages,
  );

  const wrapperOpen = `<section class="toc-wrapper">`;
  const wrapperClose = `</section>`;

  const fragment =
    `<style>${css}</style>` + wrapperOpen + bodyHtml + wrapperClose;

  const html = wrapDoc
    ? `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(docTitle)}</title></head><body>${fragment}</body></html>`
    : fragment;

  return {
    html,
    tocEntries: tocResult.tocEntries,
    anchorByCardIndex,
    batchId: tocResult.batchId,
    generatedAt: tocResult.generatedAt,
    totalPages: tocResult.totalPages,
    totalCardCount: tocResult.totalCardCount,
  };
}

/**
 * Convenience: produce the anchor map alone for callers that already
 * have the TOC entries from another render path and only need the
 * cardIndex -> anchorId mapping for the host-page card markup.
 *
 * Pure / deterministic.
 */
export function buildEmergencyCardTocAnchorMap(
  tocEntries: EmergencyCardPdfTwoUpRosterTocEntry[],
  options: Pick<
    EmergencyCardPdfTwoUpRosterTocHtmlAnchoredOptions,
    'tocPrefix' | 'useDisplayNameSlug' | 'includeSpecialtyInAnchor'
  > = {},
): Map<number, string> {
  const prefix = options.tocPrefix ?? 'rx-toc';
  const useSlug = options.useDisplayNameSlug ?? false;
  const includeSpecialty = options.includeSpecialtyInAnchor ?? false;
  const out = new Map<number, string>();
  for (const entry of tocEntries) {
    out.set(
      entry.cardIndex,
      buildAnchorId(entry, prefix, useSlug, includeSpecialty),
    );
  }
  return out;
}

/**
 * Convenience: a one-line cron-log summary of the anchored TOC.
 *
 *   "Anchored roster TOC: 14 entries (prefix 'rx-toc', specialty
 *    + slug ids); 14 anchors emitted."
 */
export function summarizeAnchoredRosterTocHtmlResult(
  result: EmergencyCardPdfTwoUpRosterTocHtmlAnchoredResult,
  options: Pick<
    EmergencyCardPdfTwoUpRosterTocHtmlAnchoredOptions,
    'tocPrefix' | 'useDisplayNameSlug' | 'includeSpecialtyInAnchor'
  > = {},
): string {
  const e = result.tocEntries.length;
  const prefix = options.tocPrefix ?? 'rx-toc';
  const parts: string[] = [];
  if (options.includeSpecialtyInAnchor) parts.push('specialty');
  if (options.useDisplayNameSlug) parts.push('slug');
  parts.push('index');
  const idShape = parts.join(' + ');
  return (
    `Anchored roster TOC: ${e} ${e === 1 ? 'entry' : 'entries'} ` +
    `(prefix '${prefix}', ${idShape} ids); ` +
    `${result.anchorByCardIndex.size} ${result.anchorByCardIndex.size === 1 ? 'anchor' : 'anchors'} emitted.`
  );
}
