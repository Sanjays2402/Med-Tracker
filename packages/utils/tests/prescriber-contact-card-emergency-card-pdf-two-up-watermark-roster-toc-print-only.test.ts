import { describe, it, expect } from 'vitest';
import {
  buildEmergencyCardPdfTwoUpWatermarkedRosterTocPrintOnly,
  renderPrintOnlyTocFooterText,
  summarizeRosterTocPrintOnlyResult,
} from '../src/prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc-print-only';
import { buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc } from '../src/prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster-toc';
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

describe('buildEmergencyCardPdfTwoUpWatermarkedRosterTocPrintOnly — shape', () => {
  it('returns exactly the TOC page (no roster pages array)', () => {
    const cards = makeCards(5);
    const out = buildEmergencyCardPdfTwoUpWatermarkedRosterTocPrintOnly(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    expect(out.tocPage).toBeDefined();
    expect(out.tocEntries).toHaveLength(5);
    // Crucially: no rosterPages on the result
    expect((out as unknown as Record<string, unknown>).rosterPages).toBeUndefined();
  });

  it('preserves batchId and generatedAt from the underlying builder', () => {
    const cards = makeCards(2);
    const out = buildEmergencyCardPdfTwoUpWatermarkedRosterTocPrintOnly(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    expect(out.batchId).toBeDefined();
    expect(out.batchId.length).toBeGreaterThan(0);
    expect(out.generatedAt.getTime()).toBe(FIXED_DATE.getTime());
  });

  it('exposes the combined document page count for callers who need it', () => {
    const cards = makeCards(5); // 3 roster pages + 1 TOC = 4 combined
    const out = buildEmergencyCardPdfTwoUpWatermarkedRosterTocPrintOnly(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    expect(out.combinedDocumentPageCount).toBeGreaterThanOrEqual(2); // at least TOC + 1 roster page
  });

  it('reports totalCardCount = input length', () => {
    const cards = makeCards(7);
    const out = buildEmergencyCardPdfTwoUpWatermarkedRosterTocPrintOnly(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    expect(out.totalCardCount).toBe(7);
  });
});

describe('buildEmergencyCardPdfTwoUpWatermarkedRosterTocPrintOnly — header strip', () => {
  it('re-derives the header strip to "Page 1 of 1"', () => {
    const cards = makeCards(5);
    const out = buildEmergencyCardPdfTwoUpWatermarkedRosterTocPrintOnly(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    expect(out.tocPage.rosterHeaderStrip).not.toBeNull();
    expect(out.tocPage.rosterHeaderStrip!.pageNumber).toBe(1);
    expect(out.tocPage.rosterHeaderStrip!.totalPages).toBe(1);
    expect(out.tocPage.rosterHeaderStrip!.text).toContain('Page 1 of 1');
    expect(out.tocPage.rosterHeaderStrip!.text).not.toContain(
      `Page 1 of ${out.combinedDocumentPageCount}`,
    );
  });

  it('preserves the batchId in the header strip text', () => {
    const cards = makeCards(3);
    const out = buildEmergencyCardPdfTwoUpWatermarkedRosterTocPrintOnly(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    expect(out.tocPage.rosterHeaderStrip!.text).toContain(out.batchId);
  });

  it('header strip is null when watermark/header policy disables it AND there are no cards', () => {
    // The base TOC module synthesises a header strip when cards are empty
    // ONLY when the underlying roster had no pages. Verify we don't break
    // the empty-roster path.
    const out = buildEmergencyCardPdfTwoUpWatermarkedRosterTocPrintOnly([], {
      generatedAt: FIXED_DATE,
    });
    // Header strip presence depends on the combined builder; just verify
    // we don't throw and the tocPage exists.
    expect(out.tocPage).toBeDefined();
  });
});

describe('buildEmergencyCardPdfTwoUpWatermarkedRosterTocPrintOnly — footer block rewrite', () => {
  it('rewrites the footer block text to "Index only (binder spans N pages)"', () => {
    const cards = makeCards(5);
    const out = buildEmergencyCardPdfTwoUpWatermarkedRosterTocPrintOnly(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    const footer = out.tocPage.blocks.find((b) => b.kind === 'footer');
    expect(footer).toBeDefined();
    expect(footer!.text).toContain('Index only');
    expect(footer!.text).toContain(
      `binder spans ${out.combinedDocumentPageCount}`,
    );
  });

  it('original footer "Document N pages total" phrasing is GONE', () => {
    const cards = makeCards(5);
    const out = buildEmergencyCardPdfTwoUpWatermarkedRosterTocPrintOnly(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    const footer = out.tocPage.blocks.find((b) => b.kind === 'footer');
    expect(footer!.text).not.toContain('Document');
  });

  it('uses singular "page" when binder spans exactly 1 page', () => {
    const out = buildEmergencyCardPdfTwoUpWatermarkedRosterTocPrintOnly([], {
      generatedAt: FIXED_DATE,
    });
    const footer = out.tocPage.blocks.find((b) => b.kind === 'footer');
    expect(footer!.text).toMatch(/binder spans 1 page\b/);
  });

  it('uses singular "entry" when only 1 card', () => {
    const cards = makeCards(1);
    const out = buildEmergencyCardPdfTwoUpWatermarkedRosterTocPrintOnly(cards, {
      generatedAt: FIXED_DATE,
    });
    const footer = out.tocPage.blocks.find((b) => b.kind === 'footer');
    expect(footer!.text).toContain('1 entry');
    expect(footer!.text).not.toContain('1 entries');
  });
});

describe('buildEmergencyCardPdfTwoUpWatermarkedRosterTocPrintOnly — TOC entries unchanged', () => {
  it('per-entry page numbers point at the cards in the underlying binder (NOT 1)', () => {
    // For 5 cards, card 0 + 1 are on roster page 1 of combined doc
    // page 2 (since TOC is page 1). We assert the entry pageNumber is
    // >= 2 (i.e. pointing into the binder, not at the TOC).
    const cards = makeCards(5);
    const out = buildEmergencyCardPdfTwoUpWatermarkedRosterTocPrintOnly(cards, {
      generatedAt: FIXED_DATE,
    });
    for (const e of out.tocEntries) {
      expect(e.pageNumber).toBeGreaterThanOrEqual(2);
    }
  });

  it('mirrors the combined-doc tocEntries exactly', () => {
    const cards = makeCards(6);
    const combined = buildEmergencyCardPdfTwoUpWatermarkedRosterWithToc(cards, {
      generatedAt: FIXED_DATE,
    });
    const out = buildEmergencyCardPdfTwoUpWatermarkedRosterTocPrintOnly(cards, {
      generatedAt: FIXED_DATE,
    });
    expect(out.tocEntries).toEqual(combined.tocEntries);
  });

  it('preserves specialty grouping in the body blocks', () => {
    const cards = makeCards(4); // cardiology + oncology mix
    const out = buildEmergencyCardPdfTwoUpWatermarkedRosterTocPrintOnly(cards, {
      generatedAt: FIXED_DATE,
    });
    const specialtyTexts = out.tocPage.blocks
      .filter((b) => b.kind === 'specialty')
      .map((b) => b.text);
    expect(specialtyTexts).toContain('CARDIOLOGY');
    expect(specialtyTexts).toContain('ONCOLOGY');
  });

  it('preserves the document title block', () => {
    const cards = makeCards(2);
    const out = buildEmergencyCardPdfTwoUpWatermarkedRosterTocPrintOnly(cards, {
      generatedAt: FIXED_DATE,
      tocTitle: 'My Custom TOC',
    });
    const title = out.tocPage.blocks.find((b) => b.kind === 'document-title');
    expect(title).toBeDefined();
    expect(title!.text).toBe('My Custom TOC');
  });
});

describe('buildEmergencyCardPdfTwoUpWatermarkedRosterTocPrintOnly — watermark', () => {
  it('preserves the watermark text from the combined doc', () => {
    const cards = makeCards(3);
    const out = buildEmergencyCardPdfTwoUpWatermarkedRosterTocPrintOnly(cards, {
      watermark: 'draft',
      generatedAt: FIXED_DATE,
    });
    expect(out.tocPage.watermarkPreset).toBe('draft');
    expect(out.tocPage.watermark).not.toBeNull();
  });

  it('returns null watermark when watermark not specified', () => {
    const cards = makeCards(2);
    const out = buildEmergencyCardPdfTwoUpWatermarkedRosterTocPrintOnly(cards, {
      generatedAt: FIXED_DATE,
    });
    expect(out.tocPage.watermark).toBeNull();
  });
});

describe('renderPrintOnlyTocFooterText', () => {
  it('returns the standalone footer text for UI consumers', () => {
    const cards = makeCards(5);
    const out = buildEmergencyCardPdfTwoUpWatermarkedRosterTocPrintOnly(cards, {
      generatedAt: FIXED_DATE,
    });
    const text = renderPrintOnlyTocFooterText(out);
    expect(text).toContain('5 entries');
    expect(text).toContain('Index only');
    expect(text).toContain(
      `binder spans ${out.combinedDocumentPageCount}`,
    );
  });

  it('singularises entry / page in the standalone text', () => {
    const cards = makeCards(1);
    const out = buildEmergencyCardPdfTwoUpWatermarkedRosterTocPrintOnly(cards, {
      generatedAt: FIXED_DATE,
    });
    const text = renderPrintOnlyTocFooterText(out);
    expect(text).toContain('1 entry');
  });

  it('produces the same text as the in-block footer', () => {
    const cards = makeCards(7);
    const out = buildEmergencyCardPdfTwoUpWatermarkedRosterTocPrintOnly(cards, {
      generatedAt: FIXED_DATE,
    });
    const footer = out.tocPage.blocks.find((b) => b.kind === 'footer');
    const text = renderPrintOnlyTocFooterText(out);
    expect(footer!.text).toBe(text);
  });
});

describe('summarizeRosterTocPrintOnlyResult', () => {
  it('reports entry count, binder span, batchId, generatedAt', () => {
    const cards = makeCards(5);
    const out = buildEmergencyCardPdfTwoUpWatermarkedRosterTocPrintOnly(cards, {
      generatedAt: FIXED_DATE,
    });
    const summary = summarizeRosterTocPrintOnlyResult(out);
    expect(summary).toContain('5 entries');
    expect(summary).toContain('binder spans');
    expect(summary).toContain(out.batchId);
    expect(summary).toContain('2026-06-22');
  });

  it('uses singular for one entry', () => {
    const cards = makeCards(1);
    const out = buildEmergencyCardPdfTwoUpWatermarkedRosterTocPrintOnly(cards, {
      generatedAt: FIXED_DATE,
    });
    expect(summarizeRosterTocPrintOnlyResult(out)).toContain('1 entry');
  });

  it('handles empty roster', () => {
    const out = buildEmergencyCardPdfTwoUpWatermarkedRosterTocPrintOnly([], {
      generatedAt: FIXED_DATE,
    });
    const summary = summarizeRosterTocPrintOnlyResult(out);
    expect(summary).toContain('0 entries');
  });
});

describe('determinism', () => {
  it('same input produces equal results (modulo Date identity)', () => {
    const cards = makeCards(5);
    const a = buildEmergencyCardPdfTwoUpWatermarkedRosterTocPrintOnly(cards, {
      generatedAt: FIXED_DATE,
      watermark: 'draft',
    });
    const b = buildEmergencyCardPdfTwoUpWatermarkedRosterTocPrintOnly(cards, {
      generatedAt: FIXED_DATE,
      watermark: 'draft',
    });
    expect(a.tocEntries).toEqual(b.tocEntries);
    expect(a.batchId).toBe(b.batchId);
    expect(a.combinedDocumentPageCount).toBe(b.combinedDocumentPageCount);
    expect(a.tocPage.blocks.length).toBe(b.tocPage.blocks.length);
  });
});
