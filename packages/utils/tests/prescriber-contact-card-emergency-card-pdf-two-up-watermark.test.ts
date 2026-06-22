import { describe, it, expect } from 'vitest';
import {
  buildEmergencyCardPdfTwoUpWatermarkedPage,
  buildEmergencyCardPdfTwoUpWatermarkedPages,
  watermarkTextsAcrossPages,
} from '../src/prescriber-contact-card-emergency-card-pdf-two-up-watermark';
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
  };
}

function makeEmergencyCard(opts: Partial<PrescriberContactInput> = {}) {
  return buildEmergencyCard(buildPrescriberContactCard(makeInput(opts)));
}

describe('buildEmergencyCardPdfTwoUpWatermarkedPage — no watermark', () => {
  it('returns watermark=null when no preset is specified', () => {
    const page = buildEmergencyCardPdfTwoUpWatermarkedPage(
      makeEmergencyCard(),
      makeEmergencyCard(),
    );
    expect(page.watermark).toBeNull();
    expect(page.watermarkPreset).toBeNull();
  });

  it('passes through the base two-up page geometry unchanged', () => {
    const page = buildEmergencyCardPdfTwoUpWatermarkedPage(
      makeEmergencyCard(),
      makeEmergencyCard(),
    );
    expect(page.page.width).toBe(792);
    expect(page.page.height).toBe(612);
    expect(page.left.blocks.length).toBeGreaterThan(0);
    expect(page.right.blocks.length).toBeGreaterThan(0);
  });
});

describe('buildEmergencyCardPdfTwoUpWatermarkedPage — preset texts', () => {
  it('emits DRAFT text for watermark="draft"', () => {
    const page = buildEmergencyCardPdfTwoUpWatermarkedPage(
      makeEmergencyCard(),
      makeEmergencyCard(),
      { watermark: 'draft' },
    );
    expect(page.watermark?.text).toBe('DRAFT');
    expect(page.watermarkPreset).toBe('draft');
  });

  it('emits VERIFIED YYYY-MM-DD using watermarkVerifiedAt', () => {
    const page = buildEmergencyCardPdfTwoUpWatermarkedPage(
      makeEmergencyCard(),
      makeEmergencyCard(),
      { watermark: 'verified', watermarkVerifiedAt: new Date(2026, 5, 22) },
    );
    expect(page.watermark?.text).toBe('VERIFIED 2026-06-22');
  });

  it('emits ICU COPY for watermark="icu-copy"', () => {
    const page = buildEmergencyCardPdfTwoUpWatermarkedPage(
      makeEmergencyCard(),
      makeEmergencyCard(),
      { watermark: 'icu-copy' },
    );
    expect(page.watermark?.text).toBe('ICU COPY');
  });

  it('emits DO NOT FAX for watermark="do-not-fax"', () => {
    const page = buildEmergencyCardPdfTwoUpWatermarkedPage(
      makeEmergencyCard(),
      makeEmergencyCard(),
      { watermark: 'do-not-fax' },
    );
    expect(page.watermark?.text).toBe('DO NOT FAX');
  });

  it('emits CONTROLLED for watermark="controlled"', () => {
    const page = buildEmergencyCardPdfTwoUpWatermarkedPage(
      makeEmergencyCard(),
      makeEmergencyCard(),
      { watermark: 'controlled' },
    );
    expect(page.watermark?.text).toBe('CONTROLLED');
  });

  it('emits custom text for watermark="custom"', () => {
    const page = buildEmergencyCardPdfTwoUpWatermarkedPage(
      makeEmergencyCard(),
      makeEmergencyCard(),
      { watermark: 'custom', watermarkText: 'PEDIATRIC ED' },
    );
    expect(page.watermark?.text).toBe('PEDIATRIC ED');
  });

  it('throws when watermark="custom" but no watermarkText is supplied', () => {
    expect(() =>
      buildEmergencyCardPdfTwoUpWatermarkedPage(
        makeEmergencyCard(),
        makeEmergencyCard(),
        { watermark: 'custom' },
      ),
    ).toThrow(/watermarkText/);
  });

  it('throws when watermark="custom" and watermarkText is empty string', () => {
    expect(() =>
      buildEmergencyCardPdfTwoUpWatermarkedPage(
        makeEmergencyCard(),
        makeEmergencyCard(),
        { watermark: 'custom', watermarkText: '' },
      ),
    ).toThrow(/watermarkText/);
  });
});

describe('buildEmergencyCardPdfTwoUpWatermarkedPage — geometry', () => {
  it('places the watermark at the page centre', () => {
    const page = buildEmergencyCardPdfTwoUpWatermarkedPage(
      makeEmergencyCard(),
      makeEmergencyCard(),
      { watermark: 'draft' },
    );
    expect(page.watermark?.x).toBe(792 / 2);
    expect(page.watermark?.y).toBe(612 / 2);
  });

  it('uses default rotation -30 degrees (lower-left to upper-right)', () => {
    const page = buildEmergencyCardPdfTwoUpWatermarkedPage(
      makeEmergencyCard(),
      makeEmergencyCard(),
      { watermark: 'draft' },
    );
    expect(page.watermark?.rotationDegrees).toBe(-30);
  });

  it('uses default font size 96pt for landscape two-up', () => {
    const page = buildEmergencyCardPdfTwoUpWatermarkedPage(
      makeEmergencyCard(),
      makeEmergencyCard(),
      { watermark: 'draft' },
    );
    expect(page.watermark?.fontSize).toBe(96);
  });

  it('uses default opacity 0.18', () => {
    const page = buildEmergencyCardPdfTwoUpWatermarkedPage(
      makeEmergencyCard(),
      makeEmergencyCard(),
      { watermark: 'draft' },
    );
    expect(page.watermark?.opacity).toBe(0.18);
  });

  it('respects all watermark style overrides', () => {
    const page = buildEmergencyCardPdfTwoUpWatermarkedPage(
      makeEmergencyCard(),
      makeEmergencyCard(),
      {
        watermark: 'draft',
        watermarkRotationDegrees: -45,
        watermarkFontSize: 72,
        watermarkColor: 'ff0000',
        watermarkOpacity: 0.4,
        watermarkBold: false,
      },
    );
    expect(page.watermark?.rotationDegrees).toBe(-45);
    expect(page.watermark?.fontSize).toBe(72);
    expect(page.watermark?.color).toBe('ff0000');
    expect(page.watermark?.opacity).toBe(0.4);
    expect(page.watermark?.bold).toBe(false);
  });

  it('clamps opacity to [0, 1]', () => {
    const pageHigh = buildEmergencyCardPdfTwoUpWatermarkedPage(
      makeEmergencyCard(),
      makeEmergencyCard(),
      { watermark: 'draft', watermarkOpacity: 1.5 },
    );
    expect(pageHigh.watermark?.opacity).toBe(1);
    const pageLow = buildEmergencyCardPdfTwoUpWatermarkedPage(
      makeEmergencyCard(),
      makeEmergencyCard(),
      { watermark: 'draft', watermarkOpacity: -0.2 },
    );
    expect(pageLow.watermark?.opacity).toBe(0);
  });

  it('handles A4 landscape geometry', () => {
    const page = buildEmergencyCardPdfTwoUpWatermarkedPage(
      makeEmergencyCard(),
      makeEmergencyCard(),
      { watermark: 'draft', pageSize: 'a4' },
    );
    expect(page.page.width).toBe(842);
    expect(page.page.height).toBe(595);
    expect(page.watermark?.x).toBe(842 / 2);
    expect(page.watermark?.y).toBe(595 / 2);
  });

  it('passes through right=null for odd-count terminal page', () => {
    const page = buildEmergencyCardPdfTwoUpWatermarkedPage(
      makeEmergencyCard(),
      null,
      { watermark: 'draft' },
    );
    expect(page.rightSlotEmpty).toBe(true);
    expect(page.watermark?.text).toBe('DRAFT');
  });
});

describe('buildEmergencyCardPdfTwoUpWatermarkedPages — multi-page', () => {
  it('applies the same watermark to every page', () => {
    const cards = [
      makeEmergencyCard(),
      makeEmergencyCard(),
      makeEmergencyCard(),
      makeEmergencyCard(),
    ];
    const pages = buildEmergencyCardPdfTwoUpWatermarkedPages(cards, { watermark: 'icu-copy' });
    expect(pages.length).toBe(2);
    for (const p of pages) {
      expect(p.watermark?.text).toBe('ICU COPY');
    }
  });

  it('locks watermarkVerifiedAt across all pages so the verified date is uniform', () => {
    const cards = [makeEmergencyCard(), makeEmergencyCard(), makeEmergencyCard()];
    const pages = buildEmergencyCardPdfTwoUpWatermarkedPages(cards, {
      watermark: 'verified',
      watermarkVerifiedAt: new Date(2026, 5, 22),
    });
    expect(pages.length).toBe(2);
    for (const p of pages) {
      expect(p.watermark?.text).toBe('VERIFIED 2026-06-22');
    }
  });

  it('returns null watermark on every page when no preset is supplied', () => {
    const cards = [makeEmergencyCard(), makeEmergencyCard()];
    const pages = buildEmergencyCardPdfTwoUpWatermarkedPages(cards);
    expect(pages[0]!.watermark).toBeNull();
  });

  it('returns empty array for empty input', () => {
    const pages = buildEmergencyCardPdfTwoUpWatermarkedPages([], { watermark: 'draft' });
    expect(pages).toEqual([]);
  });
});

describe('watermarkTextsAcrossPages', () => {
  it('extracts the watermark text from every page', () => {
    const cards = [
      makeEmergencyCard(),
      makeEmergencyCard(),
      makeEmergencyCard(),
      makeEmergencyCard(),
    ];
    const pages = buildEmergencyCardPdfTwoUpWatermarkedPages(cards, { watermark: 'draft' });
    expect(watermarkTextsAcrossPages(pages)).toEqual(['DRAFT', 'DRAFT']);
  });

  it('returns null entries when watermark is absent', () => {
    const cards = [makeEmergencyCard(), makeEmergencyCard()];
    const pages = buildEmergencyCardPdfTwoUpWatermarkedPages(cards);
    expect(watermarkTextsAcrossPages(pages)).toEqual([null]);
  });
});

describe('buildEmergencyCardPdfTwoUpWatermarkedPage — determinism', () => {
  it('produces byte-identical output across two invocations', () => {
    const a = buildEmergencyCardPdfTwoUpWatermarkedPage(
      makeEmergencyCard(),
      makeEmergencyCard(),
      { watermark: 'verified', watermarkVerifiedAt: new Date(2026, 5, 22) },
    );
    const b = buildEmergencyCardPdfTwoUpWatermarkedPage(
      makeEmergencyCard(),
      makeEmergencyCard(),
      { watermark: 'verified', watermarkVerifiedAt: new Date(2026, 5, 22) },
    );
    expect(JSON.stringify(a.watermark)).toBe(JSON.stringify(b.watermark));
    expect(JSON.stringify(a.left.blocks)).toBe(JSON.stringify(b.left.blocks));
  });
});
