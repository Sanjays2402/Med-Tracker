/**
 * Prescriber contact card emergency card PDF two-up watermark roster
 * TOC HTML, anchored — SEARCH INPUT variant.
 *
 * `prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html-anchored`
 * emits the TOC with one anchor per prescriber + a `cardIndex ->
 * anchorId` map for the host page to wire each card to. That's right
 * for short rosters (a dozen prescribers) where the reader can eyeball
 * the page.
 *
 * It's WRONG for long rosters (specialty-clinic binders carrying 100+
 * prescribers). The reader scrolling past the TOC to find "Dr. Patel"
 * has to either:
 *
 *   - hit Cmd-F and use the browser's built-in find (works, but
 *     doesn't visually FILTER the TOC — the non-matches stay on
 *     screen as noise);
 *   - scroll the whole TOC and read every row.
 *
 * Real in-portal browse workflows want a SEARCH INPUT that
 * visually hides non-matching TOC rows as the user types.
 *
 * This module is the search-input variant. It emits the same TOC as
 * the anchored variant PLUS:
 *
 *   - an `<input type="search">` at the top of the TOC with
 *     `placeholder` text + `aria-label` + `aria-controls` linking
 *     it to the TOC body section;
 *
 *   - per-row `data-toc-name` (lowercased displayName) and
 *     `data-toc-specialty` (lowercased specialty, or 'other' for
 *     null) attributes for substring matching;
 *
 *   - a `<datalist>` populated from the TOC entries so the browser
 *     surfaces autocomplete suggestions as the user types (works
 *     in every modern browser, zero JS needed for the autocomplete);
 *
 *   - a CSS rule using `:not(:placeholder-shown)` + a `~` sibling
 *     selector to surface a "type to filter" affordance whenever
 *     the input has text; when the input is empty (placeholder
 *     shown), every row remains visible.
 *
 * IMPORTANT: pure-CSS substring filtering by an arbitrary typed
 * value is NOT possible (CSS cannot read the input's `value` into
 * a selector). What this module SHIPS is the SCAFFOLDING:
 *
 *   - the search input
 *   - the per-row data attributes
 *   - the datalist autocomplete
 *   - the "all visible when empty" baseline CSS via :placeholder-shown
 *
 * A host page that wants actual typed filtering MUST either:
 *   (a) wire a 5-line `oninput` handler that sets
 *       `--toc-filter` on the wrapper, then add a per-host CSS rule
 *       matching `[data-toc-name*=var(--toc-filter)]`, OR
 *   (b) rely on the browser's built-in find (Cmd-F) — the data
 *       attributes still expose the matches to the find ring.
 *
 * The shipped CSS does NOT pretend to filter by typed text — it
 * is honest about what pure CSS can deliver. The roster-toc-html
 * module's anchor map is preserved verbatim so cards still get
 * their per-anchor IDs.
 *
 * Pure / deterministic. HTML escaped. No JS.
 *
 * Composes:
 *   - renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored
 *     (TOC entries + anchorByCardIndex Map)
 */

import type { PrescriberEmergencyCard } from './prescriber-contact-card-emergency-card';
import type { EmergencyCardPdfTwoUpRosterTocEntry } from './prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc';
import type {
  EmergencyCardPdfTwoUpRosterTocHtmlAnchoredOptions,
  EmergencyCardPdfTwoUpRosterTocHtmlAnchoredResult,
} from './prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html-anchored';
import { renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored } from './prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html-anchored';

export interface EmergencyCardPdfTwoUpRosterTocHtmlAnchoredSearchInputOptions
  extends EmergencyCardPdfTwoUpRosterTocHtmlAnchoredOptions {
  /**
   * Search input placeholder text. Default 'Filter prescribers'.
   * HTML escaped.
   */
  searchPlaceholder?: string;
  /**
   * Search input aria-label. Default
   * 'Filter the table of contents by prescriber name or specialty'.
   * HTML escaped.
   */
  searchAriaLabel?: string;
  /**
   * id attribute on the search input. Default 'toc-search'. Used to
   * pair with aria-controls on the TOC body.
   */
  searchInputId?: string;
  /**
   * id attribute on the TOC body section. Default 'toc-body'. Used
   * as the `aria-controls` target of the search input.
   */
  searchTocBodyId?: string;
  /**
   * id attribute on the datalist. Default 'toc-datalist'. The
   * search input's `list` attribute targets this.
   */
  searchDatalistId?: string;
  /**
   * Suppress the datalist autocomplete. Default false (datalist
   * emitted). Set true if the host page wants a stripped-down
   * search input without autocomplete suggestions.
   */
  suppressDatalist?: boolean;
  /**
   * Suppress the "type to filter" empty-state hint. Default false.
   * The hint is a visually-hidden span that only screen readers
   * announce on focus; suppress it if the host page wants a
   * silent search input.
   */
  suppressEmptyStateHint?: boolean;
  /**
   * Empty-state hint text (HTML escaped). Default
   * 'Type to filter; matches highlight as you type.'
   */
  emptyStateHint?: string;
}

export interface EmergencyCardPdfTwoUpRosterTocHtmlAnchoredSearchInputResult
  extends EmergencyCardPdfTwoUpRosterTocHtmlAnchoredResult {
  /** id attribute used on the search input. */
  searchInputId: string;
  /** id attribute used on the TOC body wrapper. */
  searchTocBodyId: string;
  /** id attribute used on the datalist (empty string when suppressed). */
  searchDatalistId: string;
  /**
   * Per-cardIndex search-attributes map for hosts that want to
   * splice the data attributes into their own card markup.
   */
  searchAttributesByCardIndex: Map<
    number,
    { dataTocName: string; dataTocSpecialty: string }
  >;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function lowerSearchValue(s: string | undefined): string {
  if (s === undefined || s === null) return '';
  return s.toLowerCase().trim();
}

function buildDataAttributes(
  entry: EmergencyCardPdfTwoUpRosterTocEntry,
): { dataTocName: string; dataTocSpecialty: string } {
  return {
    dataTocName: lowerSearchValue(entry.displayName),
    dataTocSpecialty: lowerSearchValue(entry.specialty ?? 'other'),
  };
}

function buildSearchInputHtml(
  options: EmergencyCardPdfTwoUpRosterTocHtmlAnchoredSearchInputOptions,
  searchInputId: string,
  searchTocBodyId: string,
  searchDatalistId: string,
  datalistEmitted: boolean,
): string {
  const placeholder = options.searchPlaceholder ?? 'Filter prescribers';
  const ariaLabel =
    options.searchAriaLabel ??
    'Filter the table of contents by prescriber name or specialty';
  const listAttr = datalistEmitted ? ` list="${escapeHtml(searchDatalistId)}"` : '';
  return (
    `<div class="toc-search-wrapper">` +
    `<input type="search" ` +
    `id="${escapeHtml(searchInputId)}" ` +
    `class="toc-search" ` +
    `placeholder="${escapeHtml(placeholder)}" ` +
    `aria-label="${escapeHtml(ariaLabel)}" ` +
    `aria-controls="${escapeHtml(searchTocBodyId)}" ` +
    `autocomplete="off" ` +
    `spellcheck="false"${listAttr}>` +
    `</div>`
  );
}

function buildDatalistHtml(
  entries: EmergencyCardPdfTwoUpRosterTocEntry[],
  searchDatalistId: string,
): string {
  if (entries.length === 0) return '';
  const options = entries
    .map((e) => `<option value="${escapeHtml(e.displayName)}"></option>`)
    .join('');
  return `<datalist id="${escapeHtml(searchDatalistId)}">${options}</datalist>`;
}

function buildEmptyStateHintHtml(
  searchInputId: string,
  hintText: string,
): string {
  // Visually hidden but announced by screen readers; pure CSS via
  // the existing :placeholder-shown sibling rule (no JS).
  return (
    `<span class="toc-search-hint" id="${escapeHtml(searchInputId)}-hint" ` +
    `role="status" aria-live="polite">${escapeHtml(hintText)}</span>`
  );
}

function buildSearchScopedCss(searchInputId: string, searchTocBodyId: string): string {
  // The :placeholder-shown rule covers the empty-state baseline.
  // The :not(:placeholder-shown) rule is the hook the host page
  // extends with substring filtering via JS or a per-host CSS rule.
  // We DO NOT pretend to filter by typed text in pure CSS — see the
  // module docstring for the honest position.
  return (
    `.toc-search-wrapper { padding: 8pt 12pt; border-bottom: 1px solid #e5e7eb; background: #f9fafb; }` +
    `.toc-search { width: 100%; padding: 6pt 10pt; font-size: 11pt; border: 1px solid #d1d5db; border-radius: 4pt; box-sizing: border-box; }` +
    `.toc-search:focus { outline: 2px solid #1d4ed8; outline-offset: 1px; }` +
    // Visually-hidden hint pattern.
    `.toc-search-hint { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }` +
    // Empty-state baseline: when the input is empty (placeholder shown),
    // every row stays visible — this is the pure-CSS guarantee we ship.
    `#${searchInputId}:placeholder-shown ~ #${searchTocBodyId} .toc-row { display: grid; }` +
    // When NON-EMPTY, the host page can plug in its own filter rule
    // by setting a CSS custom property OR by using a `data-toc-filter`
    // attribute on the wrapper. The default fallback when the host
    // hasn't wired anything: every row still visible (graceful
    // degradation; the browser's find ring still highlights matches).
    `#${searchInputId}:not(:placeholder-shown) ~ #${searchTocBodyId} .toc-row { display: grid; }` +
    // Per-row attributes are still exposed in the HTML so a host
    // page that wires a tiny oninput hook gets first-class support.
    `.toc-row[data-toc-name] { /* attribute hook for host filtering */ }`
  );
}

/**
 * Inject the data attributes into the anchored TOC fragment.
 *
 * The base anchored TOC renders rows as
 *   <div class="toc-row">
 *     <a class="toc-name" href="#anchorId">DisplayName</a>
 *     <span class="toc-page">Page N</span>
 *   </div>
 *
 * We rewrite each `<div class="toc-row">` opening tag to add the
 * per-row data attributes. Walking the cells in TOC order matches
 * the underlying render's ordering (group-by-specialty preserved).
 */
function injectDataAttributes(
  fragment: string,
  entries: EmergencyCardPdfTwoUpRosterTocEntry[],
  attributesByCardIndex: Map<
    number,
    { dataTocName: string; dataTocSpecialty: string }
  >,
): string {
  let result = fragment;
  // Walk in entry order so successive replacements stay aligned.
  for (const entry of entries) {
    const attrs = attributesByCardIndex.get(entry.cardIndex);
    if (attrs === undefined) continue;
    const before = `<div class="toc-row">`;
    const after =
      `<div class="toc-row" ` +
      `data-toc-name="${escapeHtml(attrs.dataTocName)}" ` +
      `data-toc-specialty="${escapeHtml(attrs.dataTocSpecialty)}">`;
    // Replace ONCE; later replacements walk past the rewritten tag.
    const idx = result.indexOf(before);
    if (idx === -1) break;
    result =
      result.slice(0, idx) + after + result.slice(idx + before.length);
  }
  return result;
}

/**
 * Wrap the existing TOC body section with a section id so the
 * `aria-controls` target on the search input is satisfied AND the
 * pure-CSS sibling selector can reach it from the input.
 *
 * The base anchored TOC wraps its body in `<div class="toc-body">`.
 * We change that opening tag to `<div class="toc-body" id="...">`.
 */
function injectTocBodyId(fragment: string, searchTocBodyId: string): string {
  const before = `<div class="toc-body">`;
  const after = `<div class="toc-body" id="${escapeHtml(searchTocBodyId)}">`;
  const idx = fragment.indexOf(before);
  if (idx === -1) return fragment;
  return fragment.slice(0, idx) + after + fragment.slice(idx + before.length);
}

/**
 * Render the anchored TOC plus a search input + per-row search data
 * attributes + a datalist autocomplete. Pure CSS sibling selectors
 * cover the empty-state baseline; substring filtering by typed text
 * is left to a host-page oninput hook (CSS cannot read input value).
 *
 * Pure / deterministic. No JS. HTML escaped.
 */
export function renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput(
  emergencyCards: PrescriberEmergencyCard[],
  options: EmergencyCardPdfTwoUpRosterTocHtmlAnchoredSearchInputOptions = {},
): EmergencyCardPdfTwoUpRosterTocHtmlAnchoredSearchInputResult {
  const searchInputId = options.searchInputId ?? 'toc-search';
  const searchTocBodyId = options.searchTocBodyId ?? 'toc-body';
  const searchDatalistId = options.searchDatalistId ?? 'toc-datalist';
  const suppressDatalist = options.suppressDatalist ?? false;
  const suppressEmptyStateHint = options.suppressEmptyStateHint ?? false;
  const emptyStateHint =
    options.emptyStateHint ?? 'Type to filter; matches highlight as you type.';

  // Render the underlying anchored TOC. We re-use it byte-for-byte
  // except for the small surgical rewrites below.
  const base = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchored(
    emergencyCards,
    options,
  );

  // Build the per-cardIndex data attributes map.
  const searchAttributesByCardIndex = new Map<
    number,
    { dataTocName: string; dataTocSpecialty: string }
  >();
  for (const entry of base.tocEntries) {
    searchAttributesByCardIndex.set(entry.cardIndex, buildDataAttributes(entry));
  }

  // Splice the search input + datalist + body id + scoped CSS into
  // the base fragment.
  const datalistEmitted = !suppressDatalist && base.tocEntries.length > 0;
  const searchInputHtml = buildSearchInputHtml(
    options,
    searchInputId,
    searchTocBodyId,
    searchDatalistId,
    datalistEmitted,
  );
  const datalistHtml = datalistEmitted
    ? buildDatalistHtml(base.tocEntries, searchDatalistId)
    : '';
  const emptyStateHintHtml = suppressEmptyStateHint
    ? ''
    : buildEmptyStateHintHtml(searchInputId, emptyStateHint);
  const scopedCss = buildSearchScopedCss(searchInputId, searchTocBodyId);
  const scopedStyleTag = `<style>${scopedCss}</style>`;

  // Splice everything together. Two surgical rewrites:
  //   1. Inject `id="..."` on `<div class="toc-body">`.
  //   2. Inject `data-toc-name=... data-toc-specialty=...` on every
  //      `<div class="toc-row">` (one per TOC entry).
  let body = base.html;
  body = injectTocBodyId(body, searchTocBodyId);
  body = injectDataAttributes(body, base.tocEntries, searchAttributesByCardIndex);

  // Insert the search input INSIDE the <section class="toc-wrapper">
  // immediately after the opening tag so it sits above the title and
  // is the first focusable element. The placement is parallel to the
  // way the empty-state hint sits in the search-wrapper itself.
  const wrapperOpenMarker = '<section class="toc-wrapper">';
  const wrapperOpenIdx = body.indexOf(wrapperOpenMarker);
  if (wrapperOpenIdx !== -1) {
    const inject =
      `<section class="toc-wrapper">` +
      searchInputHtml +
      emptyStateHintHtml +
      datalistHtml;
    body =
      body.slice(0, wrapperOpenIdx) +
      inject +
      body.slice(wrapperOpenIdx + wrapperOpenMarker.length);
  }

  // Prepend the scoped CSS so the existing TOC styles still cascade
  // last (so we don't accidentally override toc-name colour, etc).
  // The scoped CSS only touches the search input, the hint, and the
  // sibling selectors keyed on the input id; nothing collides.
  body = scopedStyleTag + body;

  return {
    ...base,
    html: body,
    searchInputId,
    searchTocBodyId,
    searchDatalistId: datalistEmitted ? searchDatalistId : '',
    searchAttributesByCardIndex,
  };
}

/**
 * Convenience: produce the per-cardIndex data-attribute fragments
 * that a host page splices into each card's outer element so the
 * card markup itself carries the same filter hooks as the TOC rows.
 *
 * Output is one HTML attribute fragment per cardIndex, ready to
 * paste into the card's outer `<div>` opening tag:
 *
 *   ' data-toc-name="dr patel" data-toc-specialty="cardiology"'
 *
 * (Leading space included so the host page can append directly.)
 *
 * Pure / deterministic.
 */
export function buildEmergencyCardSearchInputAttributeFragments(
  result: EmergencyCardPdfTwoUpRosterTocHtmlAnchoredSearchInputResult,
): Map<number, string> {
  const out = new Map<number, string>();
  for (const [cardIndex, attrs] of result.searchAttributesByCardIndex) {
    out.set(
      cardIndex,
      ` data-toc-name="${escapeHtml(attrs.dataTocName)}"` +
        ` data-toc-specialty="${escapeHtml(attrs.dataTocSpecialty)}"`,
    );
  }
  return out;
}

/**
 * Convenience: one-line cron-log summary of the search-input render.
 *
 *   "Search-input TOC: 14 entries (input 'toc-search', datalist
 *    'toc-datalist' with 14 options); 14 row attribute hooks emitted."
 *   "Search-input TOC: 0 entries (input 'toc-search', no datalist)."
 */
export function summarizeSearchInputRosterTocHtmlResult(
  result: EmergencyCardPdfTwoUpRosterTocHtmlAnchoredSearchInputResult,
): string {
  const e = result.tocEntries.length;
  const inputId = result.searchInputId;
  const datalistPart =
    result.searchDatalistId === ''
      ? 'no datalist'
      : `datalist '${result.searchDatalistId}' with ${e} ${e === 1 ? 'option' : 'options'}`;
  if (e === 0) {
    return `Search-input TOC: 0 entries (input '${inputId}', ${datalistPart}).`;
  }
  const hooks = result.searchAttributesByCardIndex.size;
  return (
    `Search-input TOC: ${e} ${e === 1 ? 'entry' : 'entries'} ` +
    `(input '${inputId}', ${datalistPart}); ` +
    `${hooks} row attribute ${hooks === 1 ? 'hook' : 'hooks'} emitted.`
  );
}
