import { describe, it, expect } from 'vitest';
import {
  renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput,
  buildEmergencyCardSearchInputAttributeFragments,
  summarizeSearchInputRosterTocHtmlResult,
} from '../src/prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html-anchored-search-input';
import { buildEmergencyCard } from '../src/prescriber-contact-card-emergency-card';
import {
  buildPrescriberContactCard,
  type PrescriberContactInput,
} from '../src/prescriber-contact-card';
import type { CanonicalPrescriber } from '../src/prescriber-directory';

// Test helpers --------------------------------------------------------

function prescriber(overrides: Partial<CanonicalPrescriber> = {}): CanonicalPrescriber {
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

function makeInput(overrides: Partial<PrescriberContactInput> = {}): PrescriberContactInput {
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

function makeCard(id: string, displayName: string, specialty: string | undefined) {
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
    makeCard(`npi:${i}`, `Doc ${i}`, i % 2 === 0 ? 'cardiology' : 'oncology'),
  );
}

const FIXED_DATE = new Date('2026-06-22T12:00:00Z');

// Search input scaffolding tests --------------------------------------

describe('renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput — scaffolding', () => {
  it('emits a search input at the top of the wrapper', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput(
      makeCards(3),
      { watermark: 'draft', generatedAt: FIXED_DATE },
    );
    expect(r.html).toContain('<input type="search"');
    expect(r.html).toContain('id="toc-search"');
    expect(r.html).toContain('placeholder="Filter prescribers"');
    expect(r.html).toContain(
      'aria-label="Filter the table of contents by prescriber name or specialty"',
    );
    expect(r.html).toContain('aria-controls="toc-body"');
    expect(r.html).toContain('autocomplete="off"');
    expect(r.html).toContain('spellcheck="false"');
  });

  it('positions the search input BEFORE the title (first focusable element)', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput(
      makeCards(3),
      { watermark: 'draft', generatedAt: FIXED_DATE },
    );
    const inputIdx = r.html.indexOf('<input type="search"');
    const titleIdx = r.html.indexOf('class="toc-title"');
    expect(inputIdx).toBeLessThan(titleIdx);
    expect(inputIdx).toBeGreaterThan(-1);
  });

  it('respects custom placeholder, aria-label, and ids', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput(
      makeCards(3),
      {
        watermark: 'draft',
        generatedAt: FIXED_DATE,
        searchPlaceholder: 'Search the binder',
        searchAriaLabel: 'Search the binder by name',
        searchInputId: 'custom-search',
        searchTocBodyId: 'custom-body',
        searchDatalistId: 'custom-list',
      },
    );
    expect(r.html).toContain('placeholder="Search the binder"');
    expect(r.html).toContain('aria-label="Search the binder by name"');
    expect(r.html).toContain('id="custom-search"');
    expect(r.html).toContain('aria-controls="custom-body"');
    expect(r.html).toContain('id="custom-list"');
    expect(r.searchInputId).toBe('custom-search');
    expect(r.searchTocBodyId).toBe('custom-body');
    expect(r.searchDatalistId).toBe('custom-list');
  });

  it('escapes HTML in the placeholder + aria-label', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput(
      makeCards(1),
      {
        watermark: 'draft',
        generatedAt: FIXED_DATE,
        searchPlaceholder: '<malicious>',
        searchAriaLabel: '&"\'',
      },
    );
    expect(r.html).toContain('placeholder="&lt;malicious&gt;"');
    expect(r.html).toContain('aria-label="&amp;&quot;&#39;"');
  });
});

// Datalist autocomplete tests -----------------------------------------

describe('renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput — datalist', () => {
  it('emits a datalist with one option per prescriber by default', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput(
      makeCards(3),
      { watermark: 'draft', generatedAt: FIXED_DATE },
    );
    expect(r.html).toContain('<datalist id="toc-datalist">');
    expect(r.html).toContain('<option value="Doc 0"></option>');
    expect(r.html).toContain('<option value="Doc 1"></option>');
    expect(r.html).toContain('<option value="Doc 2"></option>');
    expect(r.html).toContain('list="toc-datalist"');
    expect(r.searchDatalistId).toBe('toc-datalist');
  });

  it('suppresses the datalist when suppressDatalist=true', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput(
      makeCards(3),
      {
        watermark: 'draft',
        generatedAt: FIXED_DATE,
        suppressDatalist: true,
      },
    );
    expect(r.html).not.toContain('<datalist');
    expect(r.html).not.toContain('list="toc-datalist"');
    expect(r.searchDatalistId).toBe('');
  });

  it('omits the datalist when zero prescribers (empty result is empty)', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput(
      [],
      { watermark: 'draft', generatedAt: FIXED_DATE },
    );
    expect(r.html).not.toContain('<datalist');
    expect(r.searchDatalistId).toBe('');
  });

  it('escapes HTML in option values', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput(
      [makeCard('npi:0', 'Smith<script>', 'cardiology')],
      { watermark: 'draft', generatedAt: FIXED_DATE },
    );
    expect(r.html).toContain('<option value="Smith&lt;script&gt;"');
    expect(r.html).not.toContain('<option value="Smith<script>"');
  });
});

// Per-row data attribute tests ----------------------------------------

describe('renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput — data attrs', () => {
  it('injects data-toc-name + data-toc-specialty onto every toc-row', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput(
      makeCards(3),
      { watermark: 'draft', generatedAt: FIXED_DATE },
    );
    expect(r.html).toContain('data-toc-name="doc 0"');
    expect(r.html).toContain('data-toc-specialty="cardiology"');
    expect(r.html).toContain('data-toc-name="doc 1"');
    expect(r.html).toContain('data-toc-specialty="oncology"');
  });

  it('lowercases the data-toc-name for case-insensitive substring matching', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput(
      [makeCard('npi:0', 'Smith, Jane A.', 'Cardiology')],
      { watermark: 'draft', generatedAt: FIXED_DATE },
    );
    expect(r.html).toContain('data-toc-name="smith, jane a."');
    expect(r.html).toContain('data-toc-specialty="cardiology"');
  });

  it('emits "other" as data-toc-specialty for prescribers with no specialty', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput(
      [makeCard('npi:0', 'Generalist', undefined)],
      { watermark: 'draft', generatedAt: FIXED_DATE },
    );
    expect(r.html).toContain('data-toc-specialty="other"');
  });

  it('exposes per-cardIndex attribute map for host-page card markup', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput(
      makeCards(3),
      { watermark: 'draft', generatedAt: FIXED_DATE },
    );
    expect(r.searchAttributesByCardIndex.size).toBe(3);
    expect(r.searchAttributesByCardIndex.get(0)?.dataTocName).toBe('doc 0');
    expect(r.searchAttributesByCardIndex.get(0)?.dataTocSpecialty).toBe(
      'cardiology',
    );
    expect(r.searchAttributesByCardIndex.get(1)?.dataTocSpecialty).toBe(
      'oncology',
    );
  });
});

// TOC body id tests ---------------------------------------------------

describe('renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput — toc body id', () => {
  it('adds id="toc-body" to the toc-body wrapper for aria-controls', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput(
      makeCards(3),
      { watermark: 'draft', generatedAt: FIXED_DATE },
    );
    expect(r.html).toContain('<div class="toc-body" id="toc-body">');
  });

  it('honors searchTocBodyId override', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput(
      makeCards(3),
      {
        watermark: 'draft',
        generatedAt: FIXED_DATE,
        searchTocBodyId: 'binder-body',
      },
    );
    expect(r.html).toContain('<div class="toc-body" id="binder-body">');
  });
});

// Empty-state hint tests ----------------------------------------------

describe('renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput — empty-state hint', () => {
  it('emits a visually-hidden screen-reader hint by default', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput(
      makeCards(3),
      { watermark: 'draft', generatedAt: FIXED_DATE },
    );
    expect(r.html).toContain('class="toc-search-hint"');
    expect(r.html).toContain(
      'Type to filter; matches highlight as you type.',
    );
    expect(r.html).toContain('role="status"');
    expect(r.html).toContain('aria-live="polite"');
  });

  it('respects emptyStateHint override', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput(
      makeCards(3),
      {
        watermark: 'draft',
        generatedAt: FIXED_DATE,
        emptyStateHint: 'Begin typing.',
      },
    );
    expect(r.html).toContain('Begin typing.');
    expect(r.html).not.toContain(
      'Type to filter; matches highlight as you type.',
    );
  });

  it('suppresses the hint when suppressEmptyStateHint=true', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput(
      makeCards(3),
      {
        watermark: 'draft',
        generatedAt: FIXED_DATE,
        suppressEmptyStateHint: true,
      },
    );
    expect(r.html).not.toContain('class="toc-search-hint"');
  });

  it('escapes HTML in the empty-state hint', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput(
      makeCards(3),
      {
        watermark: 'draft',
        generatedAt: FIXED_DATE,
        emptyStateHint: '<malicious>&"',
      },
    );
    expect(r.html).toContain('&lt;malicious&gt;&amp;&quot;');
  });
});

// CSS scoping tests ---------------------------------------------------

describe('renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput — CSS scoping', () => {
  it('emits a :placeholder-shown sibling selector keyed on input id', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput(
      makeCards(3),
      { watermark: 'draft', generatedAt: FIXED_DATE },
    );
    expect(r.html).toContain(
      '#toc-search:placeholder-shown ~ #toc-body .toc-row',
    );
    expect(r.html).toContain(
      '#toc-search:not(:placeholder-shown) ~ #toc-body .toc-row',
    );
  });

  it('respects custom searchInputId + searchTocBodyId in the CSS selectors', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput(
      makeCards(3),
      {
        watermark: 'draft',
        generatedAt: FIXED_DATE,
        searchInputId: 'custom-search',
        searchTocBodyId: 'custom-body',
      },
    );
    expect(r.html).toContain(
      '#custom-search:placeholder-shown ~ #custom-body .toc-row',
    );
  });

  it('emits the toc-search-wrapper + toc-search styles', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput(
      makeCards(3),
      { watermark: 'draft', generatedAt: FIXED_DATE },
    );
    expect(r.html).toContain('.toc-search-wrapper');
    expect(r.html).toContain('.toc-search ');
  });
});

// Base TOC preservation tests -----------------------------------------

describe('renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput — base TOC preservation', () => {
  it('preserves the anchorByCardIndex map from the base render', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput(
      makeCards(3),
      { watermark: 'draft', generatedAt: FIXED_DATE },
    );
    expect(r.anchorByCardIndex.size).toBe(3);
    expect(r.anchorByCardIndex.get(0)).toMatch(/^rx-toc/);
  });

  it('preserves the per-row anchor links (toc-name as <a href="#...">)', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput(
      makeCards(2),
      { watermark: 'draft', generatedAt: FIXED_DATE },
    );
    expect(r.html).toContain('class="toc-name" href="#');
  });

  it('preserves the batchId, generatedAt, totalPages, totalCardCount fields', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput(
      makeCards(3),
      { watermark: 'draft', generatedAt: FIXED_DATE },
    );
    expect(r.batchId).toBeTruthy();
    expect(r.generatedAt).toEqual(FIXED_DATE);
    expect(r.totalCardCount).toBe(3);
    expect(r.totalPages).toBeGreaterThan(0);
  });
});

// buildEmergencyCardSearchInputAttributeFragments tests ---------------

describe('buildEmergencyCardSearchInputAttributeFragments', () => {
  it('emits a per-cardIndex attribute fragment ready to splice into card markup', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput(
      makeCards(3),
      { watermark: 'draft', generatedAt: FIXED_DATE },
    );
    const fragments = buildEmergencyCardSearchInputAttributeFragments(r);
    expect(fragments.size).toBe(3);
    expect(fragments.get(0)).toBe(
      ' data-toc-name="doc 0" data-toc-specialty="cardiology"',
    );
    expect(fragments.get(1)).toBe(
      ' data-toc-name="doc 1" data-toc-specialty="oncology"',
    );
  });

  it('starts each fragment with a leading space for direct concat', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput(
      makeCards(1),
      { watermark: 'draft', generatedAt: FIXED_DATE },
    );
    const fragments = buildEmergencyCardSearchInputAttributeFragments(r);
    for (const frag of fragments.values()) {
      expect(frag.startsWith(' ')).toBe(true);
    }
  });
});

// summarizeSearchInputRosterTocHtmlResult tests -----------------------

describe('summarizeSearchInputRosterTocHtmlResult', () => {
  it('reports the entry count, input id, and datalist size', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput(
      makeCards(3),
      { watermark: 'draft', generatedAt: FIXED_DATE },
    );
    const s = summarizeSearchInputRosterTocHtmlResult(r);
    expect(s).toContain('3 entries');
    expect(s).toContain("input 'toc-search'");
    expect(s).toContain("datalist 'toc-datalist' with 3 options");
    expect(s).toContain('3 row attribute hooks emitted');
  });

  it('reports no datalist when suppressed', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput(
      makeCards(3),
      {
        watermark: 'draft',
        generatedAt: FIXED_DATE,
        suppressDatalist: true,
      },
    );
    const s = summarizeSearchInputRosterTocHtmlResult(r);
    expect(s).toContain('no datalist');
  });

  it('reports 0 entries cleanly', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput(
      [],
      { watermark: 'draft', generatedAt: FIXED_DATE },
    );
    const s = summarizeSearchInputRosterTocHtmlResult(r);
    expect(s).toContain('0 entries');
    expect(s).toContain('no datalist');
  });

  it('uses singular grammar for one entry', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInput(
      makeCards(1),
      { watermark: 'draft', generatedAt: FIXED_DATE },
    );
    const s = summarizeSearchInputRosterTocHtmlResult(r);
    expect(s).toContain('1 entry');
    expect(s).toContain('1 option');
    expect(s).toContain('1 row attribute hook');
  });
});
