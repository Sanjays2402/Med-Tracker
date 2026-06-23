/**
 * Prescriber contact card emergency card PDF — two-up watermark
 * roster, TOC HTML anchored, BACK-TO-TOP variant.
 *
 * `prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html-anchored`
 * generates TOC entries as `<a href="#anchor-id">` so the household
 * admin can click a name and jump to the matching card. That's right
 * for one-way navigation (TOC -> card), but on a single-page binder
 * render the user lands on a card 200 cards deep and has to scroll
 * back manually to find another prescriber.
 *
 * Real long-roster workflows want a return path:
 *
 *   - the TOC carries an `<a id="tocTopAnchorId">` target;
 *   - every card gets a "Back to TOC" link pointing at that target;
 *   - the link is keyboard-focusable + screen-reader friendly.
 *
 * This module is the back-to-top variant. It composes the anchored
 * TOC HTML directly and exposes:
 *
 *   - the same `anchorByCardIndex` Map (TOC -> card destinations);
 *   - a single `tocTopAnchorId` (card -> TOC destination);
 *   - a `backLinkByCardIndex` Map of pre-rendered back-link HTML
 *     fragments so the host page can splice them into each card's
 *     markup without rewriting them per-card.
 *
 * Pure / deterministic. No JS. HTML escaped. URL-safe anchor ids.
 *
 * Composes:
 *   - renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored
 *     (the underlying anchored TOC + anchorByCardIndex Map)
 *   - the underlying TOC entries from
 *     buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc
 */

import type { PrescriberEmergencyCard } from './prescriber-contact-card-emergency-card';
import type {
  EmergencyCardPdfTwoUpRosterTocEntry,
} from './prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc';
import type {
  EmergencyCardPdfTwoUpRosterTocHtmlAnchoredOptions,
  EmergencyCardPdfTwoUpRosterTocHtmlAnchoredResult,
} from './prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html-anchored';
import { renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored } from './prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html-anchored';

export interface EmergencyCardPdfTwoUpRosterTocHtmlAnchoredBackToTopOptions
  extends EmergencyCardPdfTwoUpRosterTocHtmlAnchoredOptions {
  /**
   * Anchor id for the TOC TOP target. Default `${tocPrefix}-top`
   * (e.g. "rx-toc-top"). Card "Back to TOC" links target this id.
   */
  tocTopAnchorId?: string;
  /**
   * Visible text for the back-to-top link. Default "Back to TOC".
   * Localised label override (HTML-escaped in output).
   */
  backLinkLabel?: string;
  /**
   * Position class for the back-link element. Default
   * 'rx-card-back-to-toc' — the host page can style it via that
   * class. Useful when the host page wants top-right vs bottom-left
   * variants.
   */
  backLinkClassName?: string;
  /**
   * Include an aria-label on the back link. Default
   * "Return to table of contents from {displayName} card".
   */
  buildBackLinkAriaLabel?: (
    entry: EmergencyCardPdfTwoUpRosterTocEntry,
  ) => string;
}

export interface EmergencyCardPdfTwoUpRosterTocHtmlAnchoredBackToTopResult
  extends EmergencyCardPdfTwoUpRosterTocHtmlAnchoredResult {
  /** The TOC-top anchor id that back-links target. */
  tocTopAnchorId: string;
  /**
   * Pre-rendered back-to-TOC link HTML per cardIndex. The host page
   * splices the matching fragment into each card's markup.
   */
  backLinkByCardIndex: Map<number, string>;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildDefaultBackLinkAria(
  entry: EmergencyCardPdfTwoUpRosterTocEntry,
): string {
  return `Return to table of contents from ${entry.displayName} card`;
}

function buildBackLinkHtml(
  entry: EmergencyCardPdfTwoUpRosterTocEntry,
  tocTopAnchorId: string,
  label: string,
  className: string,
  ariaLabel: string,
): string {
  return (
    `<a class="${escapeHtml(className)}" ` +
    `href="#${escapeHtml(tocTopAnchorId)}" ` +
    `aria-label="${escapeHtml(ariaLabel)}">` +
    `${escapeHtml(label)}` +
    `</a>`
  );
}

function injectTocTopAnchor(html: string, tocTopAnchorId: string): string {
  // The base TOC HTML always starts with `<style>...</style><section
  // class="toc-wrapper">`. We insert the top anchor directly inside
  // the wrapper so it's the first focusable element on the section.
  const wrapperOpen = '<section class="toc-wrapper">';
  const wrapperOpenIdx = html.indexOf(wrapperOpen);
  if (wrapperOpenIdx === -1) return html;
  const insertAt = wrapperOpenIdx + wrapperOpen.length;
  const anchor =
    `<a id="${escapeHtml(tocTopAnchorId)}" class="toc-top-anchor" tabindex="-1"></a>`;
  return html.slice(0, insertAt) + anchor + html.slice(insertAt);
}

/**
 * Render the anchored TOC HTML with a back-to-top anchor target,
 * plus pre-rendered back-link HTML per cardIndex.
 *
 * Pure / deterministic. No JS. URL-safe anchor ids.
 */
export function renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredBackToTop(
  emergencyCards: PrescriberEmergencyCard[],
  options: EmergencyCardPdfTwoUpRosterTocHtmlAnchoredBackToTopOptions = {},
): EmergencyCardPdfTwoUpRosterTocHtmlAnchoredBackToTopResult {
  const base = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored(
    emergencyCards,
    options,
  );

  const prefix = options.tocPrefix ?? 'rx-toc';
  const tocTopAnchorId = options.tocTopAnchorId ?? `${prefix}-top`;
  const backLinkLabel = options.backLinkLabel ?? 'Back to TOC';
  const backLinkClassName = options.backLinkClassName ?? 'rx-card-back-to-toc';
  const buildAria = options.buildBackLinkAriaLabel ?? buildDefaultBackLinkAria;

  const backLinkByCardIndex = new Map<number, string>();
  for (const entry of base.tocEntries) {
    const ariaLabel = buildAria(entry);
    const html = buildBackLinkHtml(
      entry,
      tocTopAnchorId,
      backLinkLabel,
      backLinkClassName,
      ariaLabel,
    );
    backLinkByCardIndex.set(entry.cardIndex, html);
  }

  const htmlWithTopAnchor = injectTocTopAnchor(base.html, tocTopAnchorId);

  return {
    ...base,
    html: htmlWithTopAnchor,
    tocTopAnchorId,
    backLinkByCardIndex,
  };
}

/**
 * Convenience: produce just the back-link map alone for callers that
 * already have the TOC HTML rendered separately and only need the
 * back-link fragments.
 *
 * Pure / deterministic.
 */
export function buildEmergencyCardTocBackToTopLinks(
  tocEntries: EmergencyCardPdfTwoUpRosterTocEntry[],
  options: Pick<
    EmergencyCardPdfTwoUpRosterTocHtmlAnchoredBackToTopOptions,
    'tocPrefix' | 'tocTopAnchorId' | 'backLinkLabel' | 'backLinkClassName' | 'buildBackLinkAriaLabel'
  > = {},
): { tocTopAnchorId: string; backLinkByCardIndex: Map<number, string> } {
  const prefix = options.tocPrefix ?? 'rx-toc';
  const tocTopAnchorId = options.tocTopAnchorId ?? `${prefix}-top`;
  const backLinkLabel = options.backLinkLabel ?? 'Back to TOC';
  const backLinkClassName = options.backLinkClassName ?? 'rx-card-back-to-toc';
  const buildAria = options.buildBackLinkAriaLabel ?? buildDefaultBackLinkAria;

  const out = new Map<number, string>();
  for (const entry of tocEntries) {
    out.set(
      entry.cardIndex,
      buildBackLinkHtml(
        entry,
        tocTopAnchorId,
        backLinkLabel,
        backLinkClassName,
        buildAria(entry),
      ),
    );
  }
  return { tocTopAnchorId, backLinkByCardIndex: out };
}

/**
 * Convenience: a one-line cron-log summary.
 *
 *   "Back-to-top TOC: 14 anchors, 14 back-links targeting 'rx-toc-top'."
 *   "Back-to-top TOC: 1 anchor, 1 back-link targeting 'primary-toc-top'."
 */
export function summarizeAnchoredRosterTocBackToTopResult(
  result: EmergencyCardPdfTwoUpRosterTocHtmlAnchoredBackToTopResult,
): string {
  const a = result.anchorByCardIndex.size;
  const b = result.backLinkByCardIndex.size;
  return (
    `Back-to-top TOC: ${a} ${a === 1 ? 'anchor' : 'anchors'}, ` +
    `${b} ${b === 1 ? 'back-link' : 'back-links'} targeting '${result.tocTopAnchorId}'.`
  );
}
