/**
 * Prescriber contact card emergency card PDF two-up watermark roster
 * TOC HTML anchored SEARCH INPUT — KEYBOARD NAVIGATION variant.
 *
 * `prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html-anchored-search-input`
 * emits a search input, per-row data attributes, and a datalist for
 * autocomplete. The host page wires the actual typed-filter logic via
 * a small oninput hook (CSS cannot read input value).
 *
 * What it DOESN'T ship: the focusable element order the host page
 * needs to wire arrow-key navigation. A keyboard-only user pressing
 * Down inside the search input expects to land on the FIRST visible
 * TOC row; pressing Down again on that row expects the SECOND visible
 * row; etc. The host page can plausibly walk the DOM for this — but
 * the DOM walk requires re-deriving the per-row anchor ids + filter
 * data attributes (which the underlying renderer already computed)
 * and gets it subtly wrong on edge cases (specialty-grouped renders
 * with section headers between rows).
 *
 * This module is the keyboard-navigation helper. It composes the
 * search-input render and exposes:
 *
 *   - `focusableOrder` — flat, deterministic array of focusable
 *     element descriptors in TAB order. The search input is always
 *     position 0; each TOC row anchor follows in TOC display order.
 *   - `keyMap` — per-element-id list of {key, targetId} entries that
 *     describe the WIRED key bindings (ArrowDown -> next, ArrowUp ->
 *     prev, Home -> first row, End -> last row, Escape -> search).
 *     A host page reads this map and binds the actions directly to
 *     `event.key` -> `document.getElementById(targetId).focus()` in
 *     a single 8-line keydown handler.
 *
 * This module ships the SCAFFOLDING. The keydown handler itself is
 * intentionally NOT shipped (a host page may want to suppress the
 * default behaviour, integrate with their existing keyboard router,
 * or extend the bindings). The shipped data is everything the host
 * needs to wire the bindings in 8 lines or less.
 *
 * Pure / deterministic. No DOM access. No JS event emission.
 *
 * Composes:
 *   - renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput
 *     (TOC entries + search input id)
 */

import type { PrescriberEmergencyCard } from './prescriber-contact-card-emergency-card';
import type { EmergencyCardPdfTwoUpRosterTocEntry } from './prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc';
import type {
  EmergencyCardPdfTwoUpRosterTocHtmlAnchoredSearchInputOptions,
  EmergencyCardPdfTwoUpRosterTocHtmlAnchoredSearchInputResult,
} from './prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html-anchored-search-input';
import { renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput } from './prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html-anchored-search-input';

export type EmergencyCardSearchInputKeyboardNavKind =
  | 'search-input'
  | 'toc-row';

export interface EmergencyCardSearchInputKeyboardNavEntry {
  /** Element id (the host page focuses this via getElementById). */
  id: string;
  /** What kind of focusable this is. */
  kind: EmergencyCardSearchInputKeyboardNavKind;
  /**
   * cardIndex this row corresponds to (only for 'toc-row' entries;
   * undefined for 'search-input'). The host page can pair this with
   * the anchor map from the underlying render to navigate to the
   * matching card on Enter.
   */
  cardIndex?: number;
  /**
   * Display name of the prescriber (only for 'toc-row' entries).
   * Surfaced so a host page that wants to announce focus via
   * aria-live can say the prescriber's name without re-deriving it
   * from the DOM.
   */
  displayName?: string;
}

export interface EmergencyCardSearchInputKeyboardNavBinding {
  /** `event.key` value (e.g. 'ArrowDown', 'Home', 'Escape'). */
  key: string;
  /** Element id to focus when the key fires from this slot. */
  targetId: string;
}

export interface EmergencyCardSearchInputKeyboardNavOptions
  extends EmergencyCardPdfTwoUpRosterTocHtmlAnchoredSearchInputOptions {
  /**
   * id attribute used on each TOC row anchor (the focusable target).
   * The base render's anchor map provides the id; this option exists
   * for hosts that want to customise the per-row id template via the
   * base render's `tocPrefix` chain. Reading the base render's
   * anchorByCardIndex is the safer choice (and the default).
   */
  rowIdTemplate?: (cardIndex: number, displayName: string) => string;
  /**
   * When true, omit the Escape -> search-input binding from every
   * TOC row. Default false (Escape goes back to the search). Set
   * true if the host page already binds Escape to its own modal-
   * close behaviour.
   */
  suppressEscapeBinding?: boolean;
  /**
   * When true, omit the Home / End bindings (first / last row).
   * Default false. Set true if the host page binds Home / End to
   * its own scroll-to-top / scroll-to-bottom behaviour.
   */
  suppressHomeEndBindings?: boolean;
}

export interface EmergencyCardSearchInputKeyboardNavResult
  extends EmergencyCardPdfTwoUpRosterTocHtmlAnchoredSearchInputResult {
  /**
   * Flat, deterministic array of focusable element descriptors in
   * TAB order. The search input is always position 0; each TOC row
   * anchor follows in display order (matches the group-by-specialty
   * order the underlying render uses).
   */
  focusableOrder: EmergencyCardSearchInputKeyboardNavEntry[];
  /**
   * Per-element-id list of key bindings. The host page reads the
   * entry for the currently-focused element id and binds each key
   * to focus(targetId).
   *
   * Keys included by default (all configurable via options):
   *   - search-input row: ArrowDown -> first row id
   *   - search-input row: End -> last row id (when Home/End enabled)
   *   - search-input row: Home -> first row id (redundant; included
   *     for completeness)
   *   - per row: ArrowDown -> next row id (or no entry on last)
   *   - per row: ArrowUp -> previous row id (or back to search on first)
   *   - per row: Home -> first row id (when Home/End enabled)
   *   - per row: End -> last row id (when Home/End enabled)
   *   - per row: Escape -> search-input id (when Escape enabled)
   *
   * Map shape rather than Record so element ids with non-string-
   * indexable characters (none expected, but defensive) round-trip
   * cleanly.
   */
  keyMap: Map<string, EmergencyCardSearchInputKeyboardNavBinding[]>;
  /** Total focusable element count (1 + tocEntries.length). */
  focusableCount: number;
}

/**
 * Build the keyboard-navigation helper from a search-input TOC
 * render.
 *
 * Composes the underlying render so the search input id + anchor
 * map stay consistent. The focusable order matches the TOC display
 * order (group-by-specialty preserved). When there are zero TOC
 * entries, the search input is the only focusable element and the
 * keyMap exposes an empty binding list for it.
 *
 * Pure / deterministic.
 */
export function renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputKeyboardNav(
  emergencyCards: PrescriberEmergencyCard[],
  options: EmergencyCardSearchInputKeyboardNavOptions = {},
): EmergencyCardSearchInputKeyboardNavResult {
  const suppressEscape = options.suppressEscapeBinding ?? false;
  const suppressHomeEnd = options.suppressHomeEndBindings ?? false;

  const base = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput(
    emergencyCards,
    options,
  );

  // Resolve each TOC row's focusable id. Prefer the caller's template
  // when supplied; otherwise read the underlying anchor map.
  const rowIdFor = (entry: EmergencyCardPdfTwoUpRosterTocEntry): string => {
    if (options.rowIdTemplate !== undefined) {
      return options.rowIdTemplate(entry.cardIndex, entry.displayName);
    }
    const anchorId = base.anchorByCardIndex.get(entry.cardIndex);
    if (anchorId === undefined) {
      // Defensive fallback: any TOC entry missing from the anchor map
      // is an upstream bug; fall back to a stable per-cardIndex id so
      // the keyMap still produces something coherent.
      return `rx-toc-${entry.cardIndex}`;
    }
    return anchorId;
  };

  // Build the focusable order: search input first, then each TOC
  // entry in TOC display order.
  const focusableOrder: EmergencyCardSearchInputKeyboardNavEntry[] = [
    { id: base.searchInputId, kind: 'search-input' },
  ];
  for (const entry of base.tocEntries) {
    focusableOrder.push({
      id: rowIdFor(entry),
      kind: 'toc-row',
      cardIndex: entry.cardIndex,
      displayName: entry.displayName,
    });
  }

  // Build the per-id key map.
  const keyMap = new Map<string, EmergencyCardSearchInputKeyboardNavBinding[]>();

  // Edge case: zero TOC entries -> only the search input is focusable.
  // We still expose an empty binding list for it so the host page can
  // distinguish "no entries yet" from "missing keyMap entry".
  if (focusableOrder.length === 1) {
    keyMap.set(base.searchInputId, []);
    return {
      ...base,
      focusableOrder,
      keyMap,
      focusableCount: 1,
    };
  }

  const firstRow = focusableOrder[1]!;
  const lastRow = focusableOrder[focusableOrder.length - 1]!;

  // Search input bindings.
  const searchBindings: EmergencyCardSearchInputKeyboardNavBinding[] = [];
  searchBindings.push({ key: 'ArrowDown', targetId: firstRow.id });
  if (!suppressHomeEnd) {
    searchBindings.push({ key: 'Home', targetId: firstRow.id });
    searchBindings.push({ key: 'End', targetId: lastRow.id });
  }
  keyMap.set(base.searchInputId, searchBindings);

  // Per-row bindings.
  for (let i = 1; i < focusableOrder.length; i++) {
    const row = focusableOrder[i]!;
    const bindings: EmergencyCardSearchInputKeyboardNavBinding[] = [];

    // ArrowDown -> next row (no entry on last row to allow the
    // browser's default tab-out behaviour).
    if (i + 1 < focusableOrder.length) {
      bindings.push({
        key: 'ArrowDown',
        targetId: focusableOrder[i + 1]!.id,
      });
    }
    // ArrowUp -> previous row (or back to search input on first row).
    bindings.push({
      key: 'ArrowUp',
      targetId: focusableOrder[i - 1]!.id,
    });
    if (!suppressHomeEnd) {
      bindings.push({ key: 'Home', targetId: firstRow.id });
      bindings.push({ key: 'End', targetId: lastRow.id });
    }
    if (!suppressEscape) {
      bindings.push({ key: 'Escape', targetId: base.searchInputId });
    }

    keyMap.set(row.id, bindings);
  }

  return {
    ...base,
    focusableOrder,
    keyMap,
    focusableCount: focusableOrder.length,
  };
}

/**
 * Convenience: extract the next-focus target for a given (id, key)
 * pair from the keyMap. Returns undefined when no binding matches
 * (the host page should let the browser handle the key).
 *
 * Pure / deterministic.
 */
export function resolveEmergencyCardSearchInputKeyboardNavTarget(
  result: EmergencyCardSearchInputKeyboardNavResult,
  fromId: string,
  key: string,
): string | undefined {
  const bindings = result.keyMap.get(fromId);
  if (bindings === undefined) return undefined;
  for (const b of bindings) {
    if (b.key === key) return b.targetId;
  }
  return undefined;
}

/**
 * Convenience: a one-line cron-log summary of the keyboard-nav
 * scaffold.
 *
 *   "Keyboard nav: 15 focusable elements (1 search input + 14 TOC
 *    rows); 4 keys per row (ArrowDown, ArrowUp, Home, End, Escape)."
 *   "Keyboard nav: 1 focusable element (search input only; TOC empty)."
 */
export function summarizeEmergencyCardSearchInputKeyboardNav(
  result: EmergencyCardSearchInputKeyboardNavResult,
): string {
  const rows = result.tocEntries.length;
  if (rows === 0) {
    return 'Keyboard nav: 1 focusable element (search input only; TOC empty).';
  }
  const sampleRowId = result.focusableOrder[1]!.id;
  const sampleBindings = result.keyMap.get(sampleRowId) ?? [];
  const keys = sampleBindings.map((b) => b.key).join(', ');
  const bindingCount = sampleBindings.length;
  return (
    `Keyboard nav: ${result.focusableCount} focusable ` +
    `${result.focusableCount === 1 ? 'element' : 'elements'} ` +
    `(1 search input + ${rows} TOC ${rows === 1 ? 'row' : 'rows'}); ` +
    `${bindingCount} ${bindingCount === 1 ? 'key' : 'keys'} per row (${keys}).`
  );
}

/**
 * Convenience: produce a single per-row keydown-handler-friendly
 * map: { [elementId]: { [eventKey]: targetId } }. Hosts that prefer
 * a strict-JSON-ready shape over a Map can ship this directly to
 * the browser via JSON.stringify.
 *
 * Pure / deterministic.
 */
export function exportEmergencyCardSearchInputKeyboardNavAsJson(
  result: EmergencyCardSearchInputKeyboardNavResult,
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const [elementId, bindings] of result.keyMap) {
    const perElement: Record<string, string> = {};
    for (const b of bindings) {
      perElement[b.key] = b.targetId;
    }
    out[elementId] = perElement;
  }
  return out;
}
