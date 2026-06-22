import { describe, it, expect } from 'vitest';
import {
  buildEmergencyCardPdfTwoUpWatermarkedRoster,
  rosterHeaderStripsAsBlocks,
  rosterHeaderStripTextsAcrossPages,
} from '../src/prescriber-contact-card-emergency-card-pdf-two-up-watermark-roster';
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
    medicationIds: ['m1', 'm2'],
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
    fax: '212-555-0101',
    email: 'office@example.com',
    practiceName: 'Midtown Cardiology Associates',
    addressLine: '123 Park Ave',
    city: 'New York',
    state: 'NY',
    postalCode: '10017',
    ...overrides,
  } as PrescriberContactInput;
}

function makeCards(n: number) {
  return Array.from({ length: n }, (_, i) =>
    buildEmergencyCard(
      buildPrescriberContactCard(
        makeInput({
          prescriber: prescriber({ id: `npi:${i}`, displayName: `Doc ${i}` }),
        }),
      ),
    ),
  );
}

describe('buildEmergencyCardPdfTwoUpWatermarkedRoster — pagination + locking', () => {
  it('emits one page per pair of cards (rounded up)', () => {
    const cards = makeCards(5);
    const result = buildEmergencyCardPdfTwoUpWatermarkedRoster(cards, {
      watermark: 'draft',
    });
    // 5 cards / 2 per page = 3 pages
    expect(result.totalPages).toBe(3);
    expect(result.pages).toHaveLength(3);
    expect(result.totalCardCount).toBe(5);
  });

  it('totalPages mirrors pages.length', () => {
    const cards = makeCards(4);
    const result = buildEmergencyCardPdfTwoUpWatermarkedRoster(cards, {
      watermark: 'draft',
    });
    expect(result.totalPages).toBe(result.pages.length);
    expect(result.totalPages).toBe(2);
  });

  it('zero cards produces zero pages but still returns a stable batchId', () => {
    const result = buildEmergencyCardPdfTwoUpWatermarkedRoster([], {
      watermark: 'draft',
    });
    expect(result.pages).toEqual([]);
    expect(result.totalPages).toBe(0);
    expect(typeof result.batchId).toBe('string');
    expect(result.batchId.length).toBeGreaterThan(0);
  });

  it('locks watermarkVerifiedAt across the batch (verified-at uniform)', () => {
    const cards = makeCards(8);
    const fixedDate = new Date('2026-06-22T12:00:00Z');
    const result = buildEmergencyCardPdfTwoUpWatermarkedRoster(cards, {
      watermark: 'verified',
      watermarkVerifiedAt: fixedDate,
    });
    const texts = result.pages.map((p) => p.watermark?.text ?? '');
    // Every page's watermark text must match (single date string).
    expect(new Set(texts).size).toBe(1);
    expect(texts[0]).toContain('VERIFIED');
  });

  it('generatedAt is uniform across pages', () => {
    const cards = makeCards(6);
    const result = buildEmergencyCardPdfTwoUpWatermarkedRoster(cards, {
      watermark: 'draft',
    });
    // All pages must share the same generatedAt timestamp.
    expect(result.generatedAt instanceof Date).toBe(true);
    const texts = rosterHeaderStripTextsAcrossPages(result);
    const dates = texts
      .filter((t): t is string => t !== null)
      .map((t) => t.match(/Generated (\d{4}-\d{2}-\d{2})/)![1]);
    expect(new Set(dates).size).toBe(1);
  });
});

describe('buildEmergencyCardPdfTwoUpWatermarkedRoster — batchId', () => {
  it('uses explicit batchId when provided', () => {
    const cards = makeCards(4);
    const result = buildEmergencyCardPdfTwoUpWatermarkedRoster(cards, {
      watermark: 'draft',
      batchId: 'binder-2026-07',
    });
    expect(result.batchId).toBe('binder-2026-07');
    for (const page of result.pages) {
      expect(page.rosterHeaderStrip!.batchId).toBe('binder-2026-07');
      expect(page.rosterHeaderStrip!.text).toContain('binder-2026-07');
    }
  });

  it('auto-generates a deterministic batchId when absent', () => {
    const cards = makeCards(4);
    const fixedDate = new Date('2026-06-22T12:00:00Z');
    const a = buildEmergencyCardPdfTwoUpWatermarkedRoster(cards, {
      watermark: 'draft',
      generatedAt: fixedDate,
    });
    const b = buildEmergencyCardPdfTwoUpWatermarkedRoster(cards, {
      watermark: 'draft',
      generatedAt: fixedDate,
    });
    expect(a.batchId).toBe(b.batchId);
    expect(a.batchId).toMatch(/^roster-/);
  });

  it('different inputs yield different auto batchIds', () => {
    const fixedDate = new Date('2026-06-22T12:00:00Z');
    const a = buildEmergencyCardPdfTwoUpWatermarkedRoster(makeCards(4), {
      watermark: 'draft',
      generatedAt: fixedDate,
    });
    const b = buildEmergencyCardPdfTwoUpWatermarkedRoster(makeCards(6), {
      watermark: 'draft',
      generatedAt: fixedDate,
    });
    expect(a.batchId).not.toBe(b.batchId);
  });

  it('different watermark presets yield different auto batchIds', () => {
    const fixedDate = new Date('2026-06-22T12:00:00Z');
    const draft = buildEmergencyCardPdfTwoUpWatermarkedRoster(makeCards(4), {
      watermark: 'draft',
      generatedAt: fixedDate,
    });
    const icu = buildEmergencyCardPdfTwoUpWatermarkedRoster(makeCards(4), {
      watermark: 'icu-copy',
      generatedAt: fixedDate,
    });
    expect(draft.batchId).not.toBe(icu.batchId);
  });

  it('empty explicit batchId falls back to auto-generated', () => {
    const cards = makeCards(2);
    const result = buildEmergencyCardPdfTwoUpWatermarkedRoster(cards, {
      watermark: 'draft',
      batchId: '',
    });
    expect(result.batchId).toMatch(/^roster-/);
  });
});

describe('buildEmergencyCardPdfTwoUpWatermarkedRoster — header strip', () => {
  it('emits a rosterHeaderStrip on every page by default', () => {
    const cards = makeCards(6);
    const result = buildEmergencyCardPdfTwoUpWatermarkedRoster(cards, {
      watermark: 'draft',
    });
    for (const page of result.pages) {
      expect(page.rosterHeaderStrip).not.toBeNull();
    }
  });

  it('strip text uses the default template with all 5 tokens', () => {
    const cards = makeCards(4);
    const result = buildEmergencyCardPdfTwoUpWatermarkedRoster(cards, {
      watermark: 'draft',
      batchId: 'b-1',
      // Local-time midday so isoDate is unambiguous across timezones.
      generatedAt: new Date(2026, 5, 22, 12, 0, 0),
    });
    const t1 = result.pages[0]!.rosterHeaderStrip!.text;
    expect(t1).toContain('Page 1 of 2');
    expect(t1).toContain('DRAFT');
    expect(t1).toContain('Batch b-1');
    expect(t1).toContain('Generated 2026-06-22');
    // Page 2 uses "Page 2 of 2"
    expect(result.pages[1]!.rosterHeaderStrip!.text).toContain('Page 2 of 2');
  });

  it('custom template replaces tokens', () => {
    const cards = makeCards(2);
    const result = buildEmergencyCardPdfTwoUpWatermarkedRoster(cards, {
      watermark: 'icu-copy',
      batchId: 'b-icu',
      headerStripTemplate: '[{batchId}] page {pageNumber}/{totalPages} · {watermarkText}',
    });
    expect(result.pages[0]!.rosterHeaderStrip!.text).toBe(
      '[b-icu] page 1/1 · ICU COPY',
    );
  });

  it('strip geometry: x = page margin, w = pageWidth - 2*margin', () => {
    const cards = makeCards(2);
    const result = buildEmergencyCardPdfTwoUpWatermarkedRoster(cards, {
      watermark: 'draft',
    });
    const page = result.pages[0]!;
    expect(page.rosterHeaderStrip!.x).toBe(page.page.margin);
    expect(page.rosterHeaderStrip!.w).toBe(page.page.width - 2 * page.page.margin);
  });

  it('custom headerStripMarginTop shifts strip y', () => {
    const cards = makeCards(2);
    const result = buildEmergencyCardPdfTwoUpWatermarkedRoster(cards, {
      watermark: 'draft',
      headerStripMarginTop: 24,
    });
    expect(result.pages[0]!.rosterHeaderStrip!.y).toBe(24);
  });

  it('custom headerStripHeight shifts strip h', () => {
    const cards = makeCards(2);
    const result = buildEmergencyCardPdfTwoUpWatermarkedRoster(cards, {
      watermark: 'draft',
      headerStripHeight: 22,
    });
    expect(result.pages[0]!.rosterHeaderStrip!.h).toBe(22);
  });

  it('suppressHeaderStrip=true drops the strip from every page', () => {
    const cards = makeCards(4);
    const result = buildEmergencyCardPdfTwoUpWatermarkedRoster(cards, {
      watermark: 'draft',
      suppressHeaderStrip: true,
    });
    for (const page of result.pages) {
      expect(page.rosterHeaderStrip).toBeNull();
    }
  });

  it('per-page strip carries pageNumber + totalPages + batchId', () => {
    const cards = makeCards(6);
    const result = buildEmergencyCardPdfTwoUpWatermarkedRoster(cards, {
      watermark: 'draft',
      batchId: 'b-roster',
    });
    expect(result.pages[0]!.rosterHeaderStrip!.pageNumber).toBe(1);
    expect(result.pages[0]!.rosterHeaderStrip!.totalPages).toBe(3);
    expect(result.pages[2]!.rosterHeaderStrip!.pageNumber).toBe(3);
    expect(result.pages[2]!.rosterHeaderStrip!.totalPages).toBe(3);
    expect(result.pages[1]!.rosterHeaderStrip!.batchId).toBe('b-roster');
  });

  it('strip text is identical across the batch in batchId + watermark + generated date', () => {
    const cards = makeCards(6);
    const result = buildEmergencyCardPdfTwoUpWatermarkedRoster(cards, {
      watermark: 'verified',
      watermarkVerifiedAt: new Date('2026-06-22T00:00:00Z'),
      batchId: 'b-1',
    });
    const texts = result.pages.map((p) => p.rosterHeaderStrip!.text);
    // Drop the per-page "Page N of M" prefix and compare the rest.
    const trimmedTexts = texts.map((t) => t.replace(/^Page \d+ of \d+ {2}\u00b7 {2}/, ''));
    expect(new Set(trimmedTexts).size).toBe(1);
  });
});

describe('rosterHeaderStripsAsBlocks', () => {
  it('returns one footer-style block per page with the strip text', () => {
    const cards = makeCards(4);
    const result = buildEmergencyCardPdfTwoUpWatermarkedRoster(cards, {
      watermark: 'draft',
    });
    const blocks = rosterHeaderStripsAsBlocks(result);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.kind).toBe('footer');
    expect(blocks[0]!.text).toContain('Page 1 of 2');
  });

  it('returns empty array when all strips suppressed', () => {
    const cards = makeCards(4);
    const result = buildEmergencyCardPdfTwoUpWatermarkedRoster(cards, {
      watermark: 'draft',
      suppressHeaderStrip: true,
    });
    expect(rosterHeaderStripsAsBlocks(result)).toEqual([]);
  });
});

describe('rosterHeaderStripTextsAcrossPages', () => {
  it('returns one text entry per page', () => {
    const cards = makeCards(6);
    const result = buildEmergencyCardPdfTwoUpWatermarkedRoster(cards, {
      watermark: 'draft',
    });
    const texts = rosterHeaderStripTextsAcrossPages(result);
    expect(texts).toHaveLength(3);
    expect(texts.every((t) => typeof t === 'string')).toBe(true);
  });

  it('returns nulls when strips are suppressed', () => {
    const cards = makeCards(4);
    const result = buildEmergencyCardPdfTwoUpWatermarkedRoster(cards, {
      watermark: 'draft',
      suppressHeaderStrip: true,
    });
    expect(rosterHeaderStripTextsAcrossPages(result)).toEqual([null, null]);
  });
});

describe('watermark interplay', () => {
  it('watermark text still spans both slots (unchanged from underlying two-up-watermark)', () => {
    const cards = makeCards(2);
    const result = buildEmergencyCardPdfTwoUpWatermarkedRoster(cards, {
      watermark: 'draft',
    });
    const page = result.pages[0]!;
    expect(page.watermark).not.toBeNull();
    expect(page.watermark!.text).toBe('DRAFT');
    // Centered watermark: x ~ pageWidth/2, y ~ pageHeight/2
    expect(page.watermark!.x).toBe(page.page.width / 2);
    expect(page.watermark!.y).toBe(page.page.height / 2);
  });

  it('no watermark preset: still emits roster header strip (empty watermarkText)', () => {
    const cards = makeCards(2);
    const result = buildEmergencyCardPdfTwoUpWatermarkedRoster(cards, {
      batchId: 'no-watermark-batch',
    });
    expect(result.pages[0]!.rosterHeaderStrip).not.toBeNull();
    expect(result.pages[0]!.watermark).toBeNull();
    // The watermarkText token resolves to empty string.
    expect(result.pages[0]!.rosterHeaderStrip!.text).toContain('Batch no-watermark-batch');
  });
});
