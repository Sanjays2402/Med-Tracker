import { describe, it, expect } from 'vitest';
import {
  renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputKeyboardNav,
  resolveEmergencyCardSearchInputKeyboardNavTarget,
  summarizeEmergencyCardSearchInputKeyboardNav,
  exportEmergencyCardSearchInputKeyboardNavAsJson,
} from '../src/prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html-anchored-search-input-keyboard-nav';
import { buildEmergencyCard } from '../src/prescriber-contact-card-emergency-card';
import {
  buildPrescriberContactCard,
  type PrescriberContactInput,
} from '../src/prescriber-contact-card';
import type { CanonicalPrescriber } from '../src/prescriber-directory';

// Test helpers --------------------------------------------------------

function prescriber(
  overrides: Partial<CanonicalPrescriber> = {},
): CanonicalPrescriber {
  return {
    id: 'npi:1234567893',
    displayName: 'Smith, Jane A.',
    canonicalKey: 'smith|j',
    npi: '1234567893',
    npiValid: true,
    specialty: 'cardiology',
    sources: ['ehr'],
    medicationIds: ['m1'],
    aliases: [],
    recordCount: 1,
    ...overrides,
  };
}

function makeInput(
  overrides: Partial<PrescriberContactInput> = {},
): PrescriberContactInput {
  return {
    prescriber: prescriber(),
    phone: '212-555-0100',
    afterHoursPhone: '212-555-0911',
    practiceName: 'Midtown Cardiology',
    addressLine: '123 Park Ave',
    city: 'NY',
    state: 'NY',
    postalCode: '10017',
    ...overrides,
  } as PrescriberContactInput;
}

function makeCard(
  id: string,
  displayName: string,
  specialty: string | undefined,
) {
  return buildEmergencyCard(
    buildPrescriberContactCard(
      makeInput({
        prescriber: prescriber({ id, displayName, specialty }),
      }),
    ),
  );
}

function makeCards(n: number) {
  return Array.from({ length: n }, (_, i) =>
    makeCard(
      `npi:${i}`,
      `Doc ${i}`,
      i % 2 === 0 ? 'cardiology' : 'oncology',
    ),
  );
}

// Happy path tests ---------------------------------------------------

describe('renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputKeyboardNav — happy path', () => {
  it('places search input first in focusable order', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputKeyboardNav(
      makeCards(3),
    );
    expect(r.focusableOrder[0]!.kind).toBe('search-input');
    expect(r.focusableOrder[0]!.id).toBe(r.searchInputId);
  });

  it('places TOC rows in TOC display order after the search input', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputKeyboardNav(
      makeCards(4),
    );
    expect(r.focusableCount).toBe(5); // 1 search + 4 rows
    expect(r.focusableOrder).toHaveLength(5);
    for (let i = 1; i < r.focusableOrder.length; i++) {
      expect(r.focusableOrder[i]!.kind).toBe('toc-row');
      expect(r.focusableOrder[i]!.cardIndex).toBeDefined();
      expect(r.focusableOrder[i]!.displayName).toBeDefined();
    }
  });

  it('reads anchor id from base render for each TOC row', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputKeyboardNav(
      makeCards(3),
    );
    for (let i = 1; i < r.focusableOrder.length; i++) {
      const entry = r.focusableOrder[i]!;
      expect(r.anchorByCardIndex.get(entry.cardIndex!)).toBe(entry.id);
    }
  });

  it('exposes search input + TOC entries from the underlying render', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputKeyboardNav(
      makeCards(2),
    );
    expect(r.tocEntries).toHaveLength(2);
    expect(r.searchInputId).toBe('toc-search');
  });
});

// keyMap tests -------------------------------------------------------

describe('keyMap', () => {
  it('binds ArrowDown on search input -> first row', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputKeyboardNav(
      makeCards(3),
    );
    const bindings = r.keyMap.get(r.searchInputId);
    expect(bindings).toBeDefined();
    const arrowDown = bindings!.find((b) => b.key === 'ArrowDown');
    expect(arrowDown!.targetId).toBe(r.focusableOrder[1]!.id);
  });

  it('binds ArrowUp on first row -> search input', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputKeyboardNav(
      makeCards(3),
    );
    const firstRowId = r.focusableOrder[1]!.id;
    const bindings = r.keyMap.get(firstRowId);
    const arrowUp = bindings!.find((b) => b.key === 'ArrowUp');
    expect(arrowUp!.targetId).toBe(r.searchInputId);
  });

  it('binds ArrowDown on every row except last -> next row', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputKeyboardNav(
      makeCards(4),
    );
    for (let i = 1; i < r.focusableOrder.length - 1; i++) {
      const rowId = r.focusableOrder[i]!.id;
      const bindings = r.keyMap.get(rowId)!;
      const arrowDown = bindings.find((b) => b.key === 'ArrowDown');
      expect(arrowDown!.targetId).toBe(r.focusableOrder[i + 1]!.id);
    }
  });

  it('omits ArrowDown on last row (browser tab-out default)', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputKeyboardNav(
      makeCards(3),
    );
    const lastRowId = r.focusableOrder[r.focusableOrder.length - 1]!.id;
    const bindings = r.keyMap.get(lastRowId)!;
    const arrowDown = bindings.find((b) => b.key === 'ArrowDown');
    expect(arrowDown).toBeUndefined();
  });

  it('binds Home + End to first / last row by default', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputKeyboardNav(
      makeCards(4),
    );
    const middleRowId = r.focusableOrder[2]!.id;
    const bindings = r.keyMap.get(middleRowId)!;
    const home = bindings.find((b) => b.key === 'Home');
    const end = bindings.find((b) => b.key === 'End');
    expect(home!.targetId).toBe(r.focusableOrder[1]!.id);
    expect(end!.targetId).toBe(r.focusableOrder[r.focusableOrder.length - 1]!.id);
  });

  it('binds Escape on every row -> search input by default', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputKeyboardNav(
      makeCards(3),
    );
    for (let i = 1; i < r.focusableOrder.length; i++) {
      const rowId = r.focusableOrder[i]!.id;
      const bindings = r.keyMap.get(rowId)!;
      const esc = bindings.find((b) => b.key === 'Escape');
      expect(esc!.targetId).toBe(r.searchInputId);
    }
  });

  it('suppresses Home / End bindings when suppressHomeEndBindings=true', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputKeyboardNav(
      makeCards(3),
      { suppressHomeEndBindings: true },
    );
    const rowId = r.focusableOrder[1]!.id;
    const bindings = r.keyMap.get(rowId)!;
    expect(bindings.find((b) => b.key === 'Home')).toBeUndefined();
    expect(bindings.find((b) => b.key === 'End')).toBeUndefined();
  });

  it('suppresses Escape binding when suppressEscapeBinding=true', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputKeyboardNav(
      makeCards(3),
      { suppressEscapeBinding: true },
    );
    const rowId = r.focusableOrder[1]!.id;
    const bindings = r.keyMap.get(rowId)!;
    expect(bindings.find((b) => b.key === 'Escape')).toBeUndefined();
  });

  it('search input keyMap omits Home / End when suppressed', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputKeyboardNav(
      makeCards(3),
      { suppressHomeEndBindings: true },
    );
    const searchBindings = r.keyMap.get(r.searchInputId)!;
    expect(searchBindings.find((b) => b.key === 'Home')).toBeUndefined();
    expect(searchBindings.find((b) => b.key === 'End')).toBeUndefined();
    // ArrowDown still present.
    expect(searchBindings.find((b) => b.key === 'ArrowDown')).toBeDefined();
  });
});

// rowIdTemplate tests ------------------------------------------------

describe('rowIdTemplate override', () => {
  it('overrides per-row id via callback', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputKeyboardNav(
      makeCards(3),
      {
        rowIdTemplate: (cardIndex, displayName) =>
          `custom-${cardIndex}-${displayName.toLowerCase().replace(/\s+/g, '-')}`,
      },
    );
    for (let i = 1; i < r.focusableOrder.length; i++) {
      const entry = r.focusableOrder[i]!;
      expect(entry.id).toBe(
        `custom-${entry.cardIndex}-${entry.displayName!.toLowerCase().replace(/\s+/g, '-')}`,
      );
    }
  });

  it('keyMap uses the overridden id', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputKeyboardNav(
      makeCards(3),
      { rowIdTemplate: (cardIndex) => `row-${cardIndex}` },
    );
    const firstRowId = r.focusableOrder[1]!.id;
    expect(firstRowId).toBe(`row-${r.focusableOrder[1]!.cardIndex}`);
    expect(r.keyMap.has(firstRowId)).toBe(true);
  });
});

// Edge case tests ----------------------------------------------------

describe('renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputKeyboardNav — edge cases', () => {
  it('handles empty card array with only the search input focusable', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputKeyboardNav(
      [],
    );
    expect(r.focusableOrder).toHaveLength(1);
    expect(r.focusableOrder[0]!.kind).toBe('search-input');
    expect(r.focusableCount).toBe(1);
    // The keyMap still exposes the search input slot (with empty
    // bindings) so a host page can distinguish "no entries" from
    // "missing keyMap entry".
    expect(r.keyMap.has(r.searchInputId)).toBe(true);
    expect(r.keyMap.get(r.searchInputId)).toEqual([]);
  });

  it('handles single-card input with ArrowDown -> only row', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputKeyboardNav(
      makeCards(1),
    );
    expect(r.focusableCount).toBe(2);
    const searchBindings = r.keyMap.get(r.searchInputId)!;
    expect(searchBindings.find((b) => b.key === 'ArrowDown')!.targetId).toBe(
      r.focusableOrder[1]!.id,
    );
    // Single row: ArrowDown omitted (last row), ArrowUp -> search.
    const rowBindings = r.keyMap.get(r.focusableOrder[1]!.id)!;
    expect(rowBindings.find((b) => b.key === 'ArrowDown')).toBeUndefined();
    expect(rowBindings.find((b) => b.key === 'ArrowUp')!.targetId).toBe(
      r.searchInputId,
    );
  });

  it('passes through underlying searchInputId override', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputKeyboardNav(
      makeCards(2),
      { searchInputId: 'custom-search' },
    );
    expect(r.searchInputId).toBe('custom-search');
    expect(r.focusableOrder[0]!.id).toBe('custom-search');
  });
});

// resolve helper tests ----------------------------------------------

describe('resolveEmergencyCardSearchInputKeyboardNavTarget', () => {
  it('returns targetId for a matching (id, key) pair', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputKeyboardNav(
      makeCards(3),
    );
    const target = resolveEmergencyCardSearchInputKeyboardNavTarget(
      r,
      r.searchInputId,
      'ArrowDown',
    );
    expect(target).toBe(r.focusableOrder[1]!.id);
  });

  it('returns undefined for an unbound key', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputKeyboardNav(
      makeCards(3),
    );
    const target = resolveEmergencyCardSearchInputKeyboardNavTarget(
      r,
      r.searchInputId,
      'F12',
    );
    expect(target).toBeUndefined();
  });

  it('returns undefined for an unknown element id', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputKeyboardNav(
      makeCards(3),
    );
    const target = resolveEmergencyCardSearchInputKeyboardNavTarget(
      r,
      'not-an-element',
      'ArrowDown',
    );
    expect(target).toBeUndefined();
  });

  it('returns undefined for ArrowDown on last row (no binding)', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputKeyboardNav(
      makeCards(3),
    );
    const lastId = r.focusableOrder[r.focusableOrder.length - 1]!.id;
    const target = resolveEmergencyCardSearchInputKeyboardNavTarget(
      r,
      lastId,
      'ArrowDown',
    );
    expect(target).toBeUndefined();
  });
});

// summarize tests ----------------------------------------------------

describe('summarizeEmergencyCardSearchInputKeyboardNav', () => {
  it('reports focusable count + per-row key list', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputKeyboardNav(
      makeCards(4),
    );
    const s = summarizeEmergencyCardSearchInputKeyboardNav(r);
    expect(s).toContain('5 focusable elements');
    expect(s).toContain('1 search input + 4 TOC rows');
    expect(s).toContain('ArrowDown');
  });

  it('handles single-card singular phrasing', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputKeyboardNav(
      makeCards(1),
    );
    const s = summarizeEmergencyCardSearchInputKeyboardNav(r);
    expect(s).toContain('1 TOC row');
    expect(s).not.toContain('TOC rows;');
  });

  it('handles empty TOC with dedicated message', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputKeyboardNav(
      [],
    );
    const s = summarizeEmergencyCardSearchInputKeyboardNav(r);
    expect(s).toBe(
      'Keyboard nav: 1 focusable element (search input only; TOC empty).',
    );
  });

  it('reports fewer keys per row when suppressors enabled', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputKeyboardNav(
      makeCards(3),
      { suppressEscapeBinding: true, suppressHomeEndBindings: true },
    );
    const s = summarizeEmergencyCardSearchInputKeyboardNav(r);
    expect(s).not.toContain('Escape');
    expect(s).not.toContain('Home');
    expect(s).not.toContain('End');
  });
});

// exportAsJson tests --------------------------------------------------

describe('exportEmergencyCardSearchInputKeyboardNavAsJson', () => {
  it('produces JSON-stringify-clean nested record shape', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputKeyboardNav(
      makeCards(3),
    );
    const json = exportEmergencyCardSearchInputKeyboardNavAsJson(r);
    expect(typeof json).toBe('object');
    const stringified = JSON.stringify(json);
    expect(() => JSON.parse(stringified)).not.toThrow();
  });

  it('preserves the search-input -> ArrowDown -> first row mapping', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputKeyboardNav(
      makeCards(3),
    );
    const json = exportEmergencyCardSearchInputKeyboardNavAsJson(r);
    expect(json[r.searchInputId]!['ArrowDown']).toBe(r.focusableOrder[1]!.id);
  });

  it('omits last row ArrowDown entry (not in keyMap)', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputKeyboardNav(
      makeCards(3),
    );
    const json = exportEmergencyCardSearchInputKeyboardNavAsJson(r);
    const lastId = r.focusableOrder[r.focusableOrder.length - 1]!.id;
    expect(json[lastId]!.ArrowDown).toBeUndefined();
  });

  it('exports an empty bindings record for the search input when TOC is empty', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputKeyboardNav(
      [],
    );
    const json = exportEmergencyCardSearchInputKeyboardNavAsJson(r);
    expect(json[r.searchInputId]).toEqual({});
  });
});

// Underlying render passthrough --------------------------------------

describe('underlying render passthrough', () => {
  it('exposes html + tocEntries + anchorByCardIndex + searchAttributesByCardIndex', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputKeyboardNav(
      makeCards(2),
    );
    expect(r.html.length).toBeGreaterThan(0);
    expect(r.tocEntries).toHaveLength(2);
    expect(r.anchorByCardIndex.size).toBe(2);
    expect(r.searchAttributesByCardIndex.size).toBe(2);
  });
});
