import { describe, it, expect } from 'vitest';
import {
  buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc,
  flattenRosterWithTocPages,
  summarizeRosterWithTocResult,
} from '../src/prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc';
import { buildEmergencyCard } from '../src/prescriber-contact-card-emergency-card';
import {
  buildPrescriberContactCard,
  type PrescriberContactInput,
} from '../src/prescriber-contact-card';
import type { CanonicalPrescriber } from '../src/prescriber-directory';

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
    makeCard(`npi:${i}`, `Doc ${i}`, i % 2 === 0 ? 'cardiology' : 'oncology'),
  );
}

const FIXED_DATE = new Date('2026-06-22T12:00:00Z');

describe('buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc — pagination', () => {
  it('TOC page count is exactly 1 (TOC is always page 1)', () => {
    const cards = makeCards(5);
    const result = buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    expect(result.tocPage).toBeDefined();
    expect(result.rosterPages).toHaveLength(3); // 5 cards / 2 = ceil 3
    expect(result.totalPages).toBe(4); // 1 TOC + 3 roster
  });

  it('handles an empty roster (0 cards) with a still-renderable TOC', () => {
    const result = buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc([], {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    expect(result.rosterPages).toEqual([]);
    expect(result.totalPages).toBe(1);
    expect(result.tocEntries).toEqual([]);
    expect(result.tocPage).toBeDefined();
    expect(result.tocPage.blocks.length).toBeGreaterThan(0);
  });

  it('totalPages mirrors 1 + rosterPages.length', () => {
    for (const n of [1, 2, 3, 5, 8]) {
      const cards = makeCards(n);
      const result = buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc(cards, {
        watermark: 'draft',
        generatedAt: FIXED_DATE,
      });
      expect(result.totalPages).toBe(1 + result.rosterPages.length);
    }
  });
});

describe('buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc — TOC entries', () => {
  it('emits one entry per card', () => {
    const cards = makeCards(5);
    const result = buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    expect(result.tocEntries).toHaveLength(5);
  });

  it('every entry has a 1-based pageNumber that points into the combined document', () => {
    const cards = makeCards(5);
    const result = buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    // pageNumber must be >= 2 (TOC is page 1; roster starts at 2) and
    // <= totalPages.
    for (const e of result.tocEntries) {
      expect(e.pageNumber).toBeGreaterThanOrEqual(2);
      expect(e.pageNumber).toBeLessThanOrEqual(result.totalPages);
    }
  });

  it('pageNumber for card at index 0 is the FIRST roster page (page 2)', () => {
    const cards = makeCards(5);
    const result = buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    const card0 = result.tocEntries.find((e) => e.cardIndex === 0)!;
    expect(card0.pageNumber).toBe(2);
  });

  it('pageNumber for card at index 2 is the SECOND roster page (page 3)', () => {
    const cards = makeCards(5);
    const result = buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    const card2 = result.tocEntries.find((e) => e.cardIndex === 2)!;
    expect(card2.pageNumber).toBe(3);
  });

  it('TOC entries default-group by specialty alphabetically; within group by displayName', () => {
    const cards = [
      makeCard('a', 'Bob', 'oncology'),
      makeCard('b', 'Alice', 'cardiology'),
      makeCard('c', 'Carol', 'cardiology'),
      makeCard('d', 'Dave', 'oncology'),
    ];
    const result = buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    // cardiology group first (alphabetical), Alice + Carol; then oncology.
    const names = result.tocEntries.map((e) => e.displayName);
    expect(names).toEqual(['Alice', 'Carol', 'Bob', 'Dave']);
  });

  it("respects tocGroupBySpecialty=false (single ungrouped section by displayName)", () => {
    const cards = [
      makeCard('a', 'Bob', 'oncology'),
      makeCard('b', 'Alice', 'cardiology'),
      makeCard('c', 'Carol', 'cardiology'),
    ];
    const result = buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc(cards, {
      watermark: 'draft',
      tocGroupBySpecialty: false,
      generatedAt: FIXED_DATE,
    });
    expect(result.tocEntries.map((e) => e.displayName)).toEqual([
      'Alice',
      'Bob',
      'Carol',
    ]);
  });

  it("respects tocSortWithinGroup='cardOrder' (within group, input order wins)", () => {
    const cards = [
      makeCard('a', 'Carol', 'cardiology'),
      makeCard('b', 'Alice', 'cardiology'),
      makeCard('c', 'Bob', 'cardiology'),
    ];
    const result = buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc(cards, {
      watermark: 'draft',
      tocSortWithinGroup: 'cardOrder',
      generatedAt: FIXED_DATE,
    });
    expect(result.tocEntries.map((e) => e.displayName)).toEqual([
      'Carol',
      'Alice',
      'Bob',
    ]);
  });

  it('entries with no specialty fall into the "Other" group', () => {
    const cards = [
      makeCard('a', 'Alice', 'cardiology'),
      makeCard('b', 'Bob', undefined),
    ];
    const result = buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    // Cardiology then Other (alphabetical).
    expect(result.tocEntries[0]?.displayName).toBe('Alice');
    expect(result.tocEntries[1]?.displayName).toBe('Bob');
    expect(result.tocEntries[1]?.specialty).toBeUndefined();
  });

  it('respects a custom tocSpecialtyFallback', () => {
    const cards = [makeCard('a', 'Bob', undefined)];
    const result = buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc(cards, {
      watermark: 'draft',
      tocSpecialtyFallback: 'Misc',
      generatedAt: FIXED_DATE,
    });
    // The "Misc" label appears in the TOC blocks as a section header.
    const sectionBlock = result.tocPage.blocks.find(
      (b) => b.kind === 'specialty' && b.text === 'MISC',
    );
    expect(sectionBlock).toBeDefined();
  });
});

describe('buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc — TOC page blocks', () => {
  it('includes a document-title block with the default title', () => {
    const cards = makeCards(3);
    const result = buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    const title = result.tocPage.blocks.find((b) => b.kind === 'document-title');
    expect(title?.text).toContain('table of contents');
  });

  it('respects a custom tocTitle', () => {
    const cards = makeCards(3);
    const result = buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc(cards, {
      watermark: 'draft',
      tocTitle: 'Custom TOC',
      generatedAt: FIXED_DATE,
    });
    const title = result.tocPage.blocks.find((b) => b.kind === 'document-title');
    expect(title?.text).toBe('Custom TOC');
  });

  it('renders a specialty section header before each new group', () => {
    const cards = [
      makeCard('a', 'Alice', 'cardiology'),
      makeCard('b', 'Bob', 'oncology'),
    ];
    const result = buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    const sectionHeaders = result.tocPage.blocks.filter((b) => b.kind === 'specialty');
    expect(sectionHeaders.map((s) => s.text)).toEqual(['CARDIOLOGY', 'ONCOLOGY']);
  });

  it('renders TWO fallback-line blocks per entry (displayName + page number)', () => {
    const cards = [makeCard('a', 'Alice', 'cardiology')];
    const result = buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    const fallbackBlocks = result.tocPage.blocks.filter((b) => b.kind === 'fallback-line');
    expect(fallbackBlocks).toHaveLength(2);
    expect(fallbackBlocks.find((b) => b.align === 'left')?.text).toBe('Alice');
    expect(fallbackBlocks.find((b) => b.align === 'right')?.text).toBe('Page 2');
  });

  it('includes a footer block with the entry + page summary', () => {
    const cards = makeCards(5);
    const result = buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    const footer = result.tocPage.blocks.find((b) => b.kind === 'footer');
    expect(footer?.text).toContain('5 entries');
    expect(footer?.text).toContain('4 pages total');
  });

  it('uses singular "entry" / "page" in footer when count is 1', () => {
    const cards = [makeCard('a', 'Alice', 'cardiology')];
    const result = buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    const footer = result.tocPage.blocks.find((b) => b.kind === 'footer');
    expect(footer?.text).toContain('1 entry');
    // 1 card -> 1 roster page + 1 TOC = 2 total pages
    expect(footer?.text).toContain('2 pages total');
  });
});

describe('buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc — header strip alignment', () => {
  it('TOC header strip uses pageNumber=1 and totalPages=combined', () => {
    const cards = makeCards(3);
    const result = buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    expect(result.tocPage.rosterHeaderStrip?.pageNumber).toBe(1);
    expect(result.tocPage.rosterHeaderStrip?.totalPages).toBe(result.totalPages);
    expect(result.tocPage.rosterHeaderStrip?.text).toContain(
      `Page 1 of ${result.totalPages}`,
    );
  });

  it('roster page header strips are renumbered to account for the TOC offset', () => {
    const cards = makeCards(3);
    const result = buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    expect(result.rosterPages[0]?.rosterHeaderStrip?.pageNumber).toBe(2);
    expect(result.rosterPages[0]?.rosterHeaderStrip?.totalPages).toBe(result.totalPages);
    expect(result.rosterPages[0]?.rosterHeaderStrip?.text).toContain(
      `Page 2 of ${result.totalPages}`,
    );
  });
});

describe('buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc — watermark + batch consistency', () => {
  it('TOC page watermark matches the roster page watermark preset', () => {
    const cards = makeCards(3);
    const result = buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc(cards, {
      watermark: 'verified',
      generatedAt: FIXED_DATE,
    });
    expect(result.tocPage.watermarkPreset).toBe('verified');
    expect(result.rosterPages[0]?.watermarkPreset).toBe('verified');
    expect(result.tocPage.watermark?.text).toBe(result.rosterPages[0]?.watermark?.text);
  });

  it('TOC page and roster pages share a single locked generatedAt date', () => {
    const cards = makeCards(3);
    const result = buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc(cards, {
      watermark: 'verified',
      generatedAt: FIXED_DATE,
    });
    expect(result.generatedAt.getTime()).toBe(FIXED_DATE.getTime());
  });

  it('TOC page and roster pages share the same batchId', () => {
    const cards = makeCards(3);
    const result = buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    const tocBatchInStrip = result.tocPage.rosterHeaderStrip?.batchId;
    const rosterBatchInStrip = result.rosterPages[0]?.rosterHeaderStrip?.batchId;
    expect(tocBatchInStrip).toBe(result.batchId);
    expect(rosterBatchInStrip).toBe(result.batchId);
  });
});

describe('flattenRosterWithTocPages', () => {
  it('emits TOC first then each roster page in order', () => {
    const cards = makeCards(5);
    const result = buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    const flat = flattenRosterWithTocPages(result);
    expect(flat[0]?.kind).toBe('toc');
    expect(flat.slice(1).every((p) => p.kind === 'roster')).toBe(true);
    expect(flat).toHaveLength(result.totalPages);
  });

  it('emits only the TOC when the roster is empty', () => {
    const result = buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc([], {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    const flat = flattenRosterWithTocPages(result);
    expect(flat).toHaveLength(1);
    expect(flat[0]?.kind).toBe('toc');
  });
});

describe('summarizeRosterWithTocResult', () => {
  it('reports entries + roster pages + total pages', () => {
    const cards = makeCards(5);
    const result = buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    const line = summarizeRosterWithTocResult(result);
    expect(line).toContain('5 entries');
    expect(line).toContain('3 roster pages');
    expect(line).toContain('4 total document pages');
  });

  it('uses singular phrasing for 1-entry / 1-page rosters', () => {
    const cards = [makeCard('a', 'Alice', 'cardiology')];
    const result = buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    const line = summarizeRosterWithTocResult(result);
    expect(line).toContain('1 entry');
    expect(line).toContain('1 roster page');
  });
});

describe('determinism', () => {
  it('produces byte-identical results on repeat runs with the same inputs', () => {
    const cards = makeCards(5);
    const a = buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    const z = buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    expect(a.totalPages).toBe(z.totalPages);
    expect(a.tocEntries).toEqual(z.tocEntries);
    expect(a.batchId).toBe(z.batchId);
  });
});
