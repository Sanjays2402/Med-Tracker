import { describe, it, expect } from 'vitest';
import {
  renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputI18n,
  summarizeEmergencyCardSearchInputI18n,
  detectEmergencyCardSearchInputI18nCoverage,
  renderEmergencyCardSearchInputI18nMultiLocale,
  EMERGENCY_CARD_SEARCH_INPUT_I18N_EN,
  type EmergencyCardSearchInputI18nBundle,
} from '../src/prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-html-anchored-search-input-i18n';
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

const ES_BUNDLE: EmergencyCardSearchInputI18nBundle = {
  locale: 'es-419',
  strings: {
    placeholder: 'Filtrar prescriptores',
    ariaLabel: 'Filtrar el índice por nombre o especialidad del prescriptor',
    emptyStateHint: 'Escribe para filtrar; las coincidencias se resaltan.',
  },
};

const JA_BUNDLE: EmergencyCardSearchInputI18nBundle = {
  locale: 'ja-JP',
  strings: {
    placeholder: '処方者を絞り込む',
    ariaLabel: '名前または専門分野で目次を絞り込む',
    emptyStateHint: '入力すると一致する項目が強調表示されます。',
  },
};

const PARTIAL_DE_BUNDLE: EmergencyCardSearchInputI18nBundle = {
  locale: 'de-DE',
  strings: {
    placeholder: 'Verschreiber filtern',
    // ariaLabel + emptyStateHint missing
  },
};

// Happy path tests ---------------------------------------------------

describe('renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputI18n — happy path', () => {
  it('renders the search input with the localised placeholder + aria-label + empty hint', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputI18n(
      makeCards(3),
      { locale: 'es-419', bundle: ES_BUNDLE },
    );
    expect(r.resolvedLocale).toBe('es-419');
    expect(r.fallbackUsed).toBe(false);
    expect(r.missingKeys).toEqual([]);
    expect(r.html).toContain('placeholder="Filtrar prescriptores"');
    expect(r.html).toContain(
      'aria-label="Filtrar el índice por nombre o especialidad del prescriptor"',
    );
    expect(r.html).toContain('Escribe para filtrar; las coincidencias se resaltan.');
    // Old English not present.
    expect(r.html).not.toContain('placeholder="Filter prescribers"');
    expect(r.html).not.toContain('Type to filter; matches highlight as you type.');
  });

  it('renders the Japanese variant with full JA chrome', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputI18n(
      makeCards(2),
      { locale: 'ja-JP', bundle: JA_BUNDLE },
    );
    expect(r.html).toContain('placeholder="処方者を絞り込む"');
    expect(r.html).toContain('aria-label="名前または専門分野で目次を絞り込む"');
    expect(r.html).toContain('入力すると一致する項目が強調表示されます。');
  });

  it('preserves underlying searchInputId / searchTocBodyId / searchDatalistId', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputI18n(
      makeCards(3),
      { locale: 'es-419', bundle: ES_BUNDLE },
    );
    expect(r.searchInputId).toBe('toc-search');
    expect(r.searchTocBodyId).toBe('toc-body');
    expect(r.searchDatalistId).toBe('toc-datalist');
  });

  it('preserves the underlying searchAttributesByCardIndex map', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputI18n(
      makeCards(3),
      { locale: 'es-419', bundle: ES_BUNDLE },
    );
    expect(r.searchAttributesByCardIndex.size).toBe(3);
    for (const [, attrs] of r.searchAttributesByCardIndex) {
      // Data attributes stay lowercased English (downstream typed consumers).
      expect(attrs.dataTocName).toMatch(/^doc \d+$/);
    }
  });

  it('preserves the underlying anchorByCardIndex map + tocEntries', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputI18n(
      makeCards(3),
      { locale: 'es-419', bundle: ES_BUNDLE },
    );
    expect(r.tocEntries.length).toBe(3);
    expect(r.anchorByCardIndex.size).toBe(3);
  });
});

// Fallback tests -----------------------------------------------------

describe('renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputI18n — locale fallback', () => {
  it('falls back to English for missing keys', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputI18n(
      makeCards(2),
      { locale: 'de-DE', bundle: PARTIAL_DE_BUNDLE },
    );
    expect(r.fallbackUsed).toBe(true);
    expect(r.missingKeys).toEqual(['ariaLabel', 'emptyStateHint']);
    // Supplied DE placeholder.
    expect(r.html).toContain('placeholder="Verschreiber filtern"');
    // Missing keys fall back to English.
    expect(r.html).toContain(
      'aria-label="Filter the table of contents by prescriber name or specialty"',
    );
    expect(r.html).toContain('Type to filter; matches highlight as you type.');
  });

  it('resolvedLocale always equals the requested locale, even on partial fill', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputI18n(
      makeCards(1),
      { locale: 'de-DE', bundle: PARTIAL_DE_BUNDLE },
    );
    expect(r.resolvedLocale).toBe('de-DE');
  });

  it('handles a completely empty bundle by filling every key from English', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputI18n(
      makeCards(2),
      { locale: 'pt-BR', bundle: { locale: 'pt-BR', strings: {} } },
    );
    expect(r.fallbackUsed).toBe(true);
    expect(r.missingKeys).toEqual(['placeholder', 'ariaLabel', 'emptyStateHint']);
    expect(r.html).toContain('placeholder="Filter prescribers"');
  });
});

// HTML escaping ------------------------------------------------------

describe('renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputI18n — HTML escaping', () => {
  it('escapes HTML in the localised placeholder via the base renderer', () => {
    const trickyBundle: EmergencyCardSearchInputI18nBundle = {
      locale: 'xss-test',
      strings: {
        placeholder: '<script>alert(1)</script>',
        ariaLabel: 'Safe label',
        emptyStateHint: 'Safe hint',
      },
    };
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputI18n(
      makeCards(1),
      { locale: 'xss-test', bundle: trickyBundle },
    );
    expect(r.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(r.html).not.toContain('<script>alert(1)</script>');
  });

  it('escapes HTML in the localised aria-label', () => {
    const trickyBundle: EmergencyCardSearchInputI18nBundle = {
      locale: 'xss-test',
      strings: {
        placeholder: 'p',
        ariaLabel: '" onfocus="alert(1)',
        emptyStateHint: 'h',
      },
    };
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputI18n(
      makeCards(1),
      { locale: 'xss-test', bundle: trickyBundle },
    );
    // The escapeHtml in the base render turns " into &quot;.
    expect(r.html).toContain('aria-label="&quot; onfocus=&quot;alert(1)"');
  });

  it('escapes HTML in the localised empty-state hint', () => {
    const trickyBundle: EmergencyCardSearchInputI18nBundle = {
      locale: 'xss-test',
      strings: {
        placeholder: 'p',
        ariaLabel: 'a',
        emptyStateHint: '<img src=x onerror=alert(1)>',
      },
    };
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputI18n(
      makeCards(1),
      { locale: 'xss-test', bundle: trickyBundle },
    );
    expect(r.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(r.html).not.toContain('<img src=x');
  });
});

// detectCoverage tests -----------------------------------------------

describe('detectEmergencyCardSearchInputI18nCoverage', () => {
  it('reports complete coverage for the EN reference bundle', () => {
    const bundle: EmergencyCardSearchInputI18nBundle = {
      locale: 'en-US',
      strings: { ...EMERGENCY_CARD_SEARCH_INPUT_I18N_EN },
    };
    const cov = detectEmergencyCardSearchInputI18nCoverage(bundle);
    expect(cov.isComplete).toBe(true);
    expect(cov.coverage).toBe(1);
    expect(cov.missingKeys).toEqual([]);
    expect(cov.expectedKeys).toBe(3);
    expect(cov.providedKeys).toBe(3);
    expect(cov.locale).toBe('en-US');
  });

  it('reports complete coverage for ES_BUNDLE + JA_BUNDLE', () => {
    expect(detectEmergencyCardSearchInputI18nCoverage(ES_BUNDLE).isComplete).toBe(true);
    expect(detectEmergencyCardSearchInputI18nCoverage(JA_BUNDLE).isComplete).toBe(true);
  });

  it('flags PARTIAL_DE_BUNDLE as incomplete with the right missing list', () => {
    const cov = detectEmergencyCardSearchInputI18nCoverage(PARTIAL_DE_BUNDLE);
    expect(cov.isComplete).toBe(false);
    expect(cov.locale).toBe('de-DE');
    expect(cov.missingKeys).toEqual(['ariaLabel', 'emptyStateHint']);
    expect(cov.providedKeys).toBe(1);
    expect(cov.coverage).toBeCloseTo(1 / 3, 5);
  });

  it('reports zero coverage for an empty bundle', () => {
    const cov = detectEmergencyCardSearchInputI18nCoverage({
      locale: 'pt-BR',
      strings: {},
    });
    expect(cov.providedKeys).toBe(0);
    expect(cov.coverage).toBe(0);
    expect(cov.missingKeys).toEqual(['placeholder', 'ariaLabel', 'emptyStateHint']);
  });
});

// summarize tests ----------------------------------------------------

describe('summarizeEmergencyCardSearchInputI18n', () => {
  it('summarises a populated locale render in one line', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputI18n(
      makeCards(3),
      { locale: 'es-419', bundle: ES_BUNDLE },
    );
    expect(summarizeEmergencyCardSearchInputI18n(r)).toBe(
      "Search-input TOC (es-419): 3 entries (input 'toc-search', datalist 'toc-datalist' with 3 options).",
    );
  });

  it('summarises an empty roster (no datalist) with no fallback parenthetical', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputI18n(
      [],
      { locale: 'es-419', bundle: ES_BUNDLE },
    );
    expect(summarizeEmergencyCardSearchInputI18n(r)).toBe(
      "Search-input TOC (es-419): 0 entries (input 'toc-search', no datalist).",
    );
  });

  it('mentions the fallback count when bundle is partial', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputI18n(
      makeCards(2),
      { locale: 'de-DE', bundle: PARTIAL_DE_BUNDLE },
    );
    const s = summarizeEmergencyCardSearchInputI18n(r);
    expect(s).toContain('(fallback: 2 keys)');
  });

  it('uses singular "key" when exactly 1 fallback', () => {
    const partialEs: EmergencyCardSearchInputI18nBundle = {
      locale: 'es-419',
      strings: {
        placeholder: 'P',
        ariaLabel: 'A',
        // emptyStateHint missing
      },
    };
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputI18n(
      makeCards(1),
      { locale: 'es-419', bundle: partialEs },
    );
    expect(summarizeEmergencyCardSearchInputI18n(r)).toContain('(fallback: 1 key)');
  });

  it('uses singular "entry" when there is exactly 1 TOC entry', () => {
    const r = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputI18n(
      makeCards(1),
      { locale: 'es-419', bundle: ES_BUNDLE },
    );
    expect(summarizeEmergencyCardSearchInputI18n(r)).toContain('1 entry');
  });
});

// Multi-locale roll-up ------------------------------------------------

describe('renderEmergencyCardSearchInputI18nMultiLocale', () => {
  it('renders the same TOC across N locales, keyed by locale', () => {
    const map = renderEmergencyCardSearchInputI18nMultiLocale(
      makeCards(2),
      [ES_BUNDLE, JA_BUNDLE],
    );
    expect(map.size).toBe(2);
    expect(map.get('es-419')?.html).toContain('Filtrar prescriptores');
    expect(map.get('ja-JP')?.html).toContain('処方者を絞り込む');
  });

  it('produces independent results per locale', () => {
    const map = renderEmergencyCardSearchInputI18nMultiLocale(
      makeCards(2),
      [ES_BUNDLE, JA_BUNDLE],
    );
    expect(map.get('es-419')?.resolvedLocale).toBe('es-419');
    expect(map.get('ja-JP')?.resolvedLocale).toBe('ja-JP');
    expect(map.get('es-419')?.fallbackUsed).toBe(false);
    expect(map.get('ja-JP')?.fallbackUsed).toBe(false);
  });

  it('returns an empty map for an empty bundle list', () => {
    const map = renderEmergencyCardSearchInputI18nMultiLocale(makeCards(2), []);
    expect(map.size).toBe(0);
  });

  it('honours per-call base options across every locale', () => {
    const map = renderEmergencyCardSearchInputI18nMultiLocale(
      makeCards(2),
      [ES_BUNDLE, JA_BUNDLE],
      { searchInputId: 'custom-search' },
    );
    for (const r of map.values()) {
      expect(r.searchInputId).toBe('custom-search');
      expect(r.html).toContain('id="custom-search"');
    }
  });

  it('flags fallback per locale independently', () => {
    const map = renderEmergencyCardSearchInputI18nMultiLocale(
      makeCards(2),
      [ES_BUNDLE, PARTIAL_DE_BUNDLE],
    );
    expect(map.get('es-419')?.fallbackUsed).toBe(false);
    expect(map.get('de-DE')?.fallbackUsed).toBe(true);
    expect(map.get('de-DE')?.missingKeys).toEqual(['ariaLabel', 'emptyStateHint']);
  });
});

// Determinism --------------------------------------------------------

describe('renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputI18n — determinism', () => {
  it('produces identical output for identical input', () => {
    const a = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputI18n(
      makeCards(3),
      { locale: 'es-419', bundle: ES_BUNDLE },
    );
    const b = renderEmergencyCardPdfTwoUpWatermarkedRosterTocHtmlAnchoredSearchInputI18n(
      makeCards(3),
      { locale: 'es-419', bundle: ES_BUNDLE },
    );
    expect(a.html).toBe(b.html);
    expect(a.missingKeys).toEqual(b.missingKeys);
    expect(a.resolvedLocale).toBe(b.resolvedLocale);
  });
});
