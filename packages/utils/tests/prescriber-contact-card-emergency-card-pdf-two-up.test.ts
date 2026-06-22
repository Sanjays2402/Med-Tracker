import { describe, it, expect } from 'vitest';
import {
  buildEmergencyCardPdfTwoUpPage,
  buildEmergencyCardPdfTwoUpPages,
  emergencyCardPdfTwoUpPageCount,
} from '../src/prescriber-contact-card-emergency-card-pdf-two-up';
import {
  buildEmergencyCard,
} from '../src/prescriber-contact-card-emergency-card';
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

describe('buildEmergencyCardPdfTwoUpPage — page geometry', () => {
  it('defaults to landscape US Letter (792 x 612)', () => {
    const page = buildEmergencyCardPdfTwoUpPage(makeEmergencyCard(), makeEmergencyCard());
    expect(page.page.width).toBe(792);
    expect(page.page.height).toBe(612);
  });

  it('switches to landscape A4 when requested (842 x 595)', () => {
    const page = buildEmergencyCardPdfTwoUpPage(
      makeEmergencyCard(),
      makeEmergencyCard(),
      { pageSize: 'a4' },
    );
    expect(page.page.width).toBe(842);
    expect(page.page.height).toBe(595);
  });

  it('places left slot at margin, right slot to the right of the gutter', () => {
    const page = buildEmergencyCardPdfTwoUpPage(makeEmergencyCard(), makeEmergencyCard());
    const expectedHalfWidth = (792 - 2 * 36 - 18) / 2;
    expect(page.left.slotX).toBe(36);
    expect(page.left.slotW).toBe(expectedHalfWidth);
    expect(page.right.slotX).toBe(36 + expectedHalfWidth + 18);
    expect(page.right.slotW).toBe(expectedHalfWidth);
  });

  it('computes centerLineX as the midpoint of the gutter', () => {
    const page = buildEmergencyCardPdfTwoUpPage(makeEmergencyCard(), makeEmergencyCard());
    expect(page.centerLineX).toBe(36 + page.left.slotW + 18 / 2);
  });

  it('respects custom gutter width', () => {
    const page = buildEmergencyCardPdfTwoUpPage(makeEmergencyCard(), makeEmergencyCard(), {
      gutter: 36,
    });
    expect(page.page.gutter).toBe(36);
    const expectedHalfWidth = (792 - 2 * 36 - 36) / 2;
    expect(page.left.slotW).toBe(expectedHalfWidth);
  });
});

describe('buildEmergencyCardPdfTwoUpPage — both slots populated', () => {
  it('renders document title, hero phone, prescriber name in both slots', () => {
    const page = buildEmergencyCardPdfTwoUpPage(
      makeEmergencyCard({ prescriber: prescriber({ displayName: 'Doctor LEFT' }) }),
      makeEmergencyCard({ prescriber: prescriber({ displayName: 'Doctor RIGHT' }) }),
    );
    expect(page.left.blocks.find((b) => b.kind === 'document-title')).toBeDefined();
    expect(page.right.blocks.find((b) => b.kind === 'document-title')).toBeDefined();
    expect(page.left.blocks.find((b) => b.kind === 'hero-phone')).toBeDefined();
    expect(page.right.blocks.find((b) => b.kind === 'hero-phone')).toBeDefined();
    expect(page.left.blocks.find((b) => b.kind === 'prescriber-name')?.text).toContain('Doctor LEFT');
    expect(page.right.blocks.find((b) => b.kind === 'prescriber-name')?.text).toContain('Doctor RIGHT');
    expect(page.rightSlotEmpty).toBe(false);
  });

  it('positions left blocks at slotX and right blocks at right slotX', () => {
    const page = buildEmergencyCardPdfTwoUpPage(makeEmergencyCard(), makeEmergencyCard());
    const leftHero = page.left.blocks.find((b) => b.kind === 'hero-phone')!;
    const rightHero = page.right.blocks.find((b) => b.kind === 'hero-phone')!;
    expect(leftHero.x).toBe(page.left.slotX);
    expect(rightHero.x).toBe(page.right.slotX);
    expect(rightHero.x).toBeGreaterThan(leftHero.x);
  });

  it('renders QR codes for both slots with vCard contents', () => {
    const page = buildEmergencyCardPdfTwoUpPage(makeEmergencyCard(), makeEmergencyCard());
    expect(page.left.qr).not.toBeNull();
    expect(page.right.qr).not.toBeNull();
    expect(page.left.qr!.contents).toContain('BEGIN:VCARD');
    expect(page.right.qr!.contents).toContain('BEGIN:VCARD');
    expect(page.left.qr!.errorCorrection).toBe('M');
  });

  it('centres each QR within its own slot', () => {
    const page = buildEmergencyCardPdfTwoUpPage(makeEmergencyCard(), makeEmergencyCard());
    const leftQr = page.left.qr!;
    const rightQr = page.right.qr!;
    expect(leftQr.x).toBe(page.left.slotX + (page.left.slotW - leftQr.size) / 2);
    expect(rightQr.x).toBe(page.right.slotX + (page.right.slotW - rightQr.size) / 2);
  });

  it('defaults qrSize to 180 (smaller than single-up 240)', () => {
    const page = buildEmergencyCardPdfTwoUpPage(makeEmergencyCard(), makeEmergencyCard());
    expect(page.left.qr!.size).toBe(180);
  });

  it('respects custom qrSize override', () => {
    const page = buildEmergencyCardPdfTwoUpPage(makeEmergencyCard(), makeEmergencyCard(), {
      qrSize: 200,
    });
    expect(page.left.qr!.size).toBe(200);
    expect(page.right.qr!.size).toBe(200);
  });

  it('uses smaller hero font than single-up (36pt vs 48pt)', () => {
    const page = buildEmergencyCardPdfTwoUpPage(makeEmergencyCard(), makeEmergencyCard());
    const hero = page.left.blocks.find((b) => b.kind === 'hero-phone');
    expect(hero!.fontSize).toBe(36);
  });
});

describe('buildEmergencyCardPdfTwoUpPage — odd run (right=null)', () => {
  it('emits an empty right slot when right is null', () => {
    const page = buildEmergencyCardPdfTwoUpPage(makeEmergencyCard(), null);
    expect(page.rightSlotEmpty).toBe(true);
    expect(page.right.emergencyCard).toBeNull();
    expect(page.right.blocks).toEqual([]);
    expect(page.right.qr).toBeNull();
    expect(page.left.blocks.length).toBeGreaterThan(0);
  });

  it('still positions the empty slot at the correct slotX', () => {
    const page = buildEmergencyCardPdfTwoUpPage(makeEmergencyCard(), null);
    expect(page.right.slotX).toBeGreaterThan(page.left.slotX);
    expect(page.right.slotW).toBe(page.left.slotW);
  });
});

describe('buildEmergencyCardPdfTwoUpPage — content variants', () => {
  it('renders the missing-phone hero label when there is no on-call number', () => {
    const card = makeEmergencyCard({
      phone: undefined,
      afterHoursPhone: undefined,
    });
    expect(card.onCall).toBeNull();
    const page = buildEmergencyCardPdfTwoUpPage(card, makeEmergencyCard());
    const heroLabel = page.left.blocks.find((b) => b.kind === 'hero-label');
    expect(heroLabel!.text).toBe('NO PHONE ON FILE');
  });

  it('renders warning block when card has ED warnings', () => {
    const card = makeEmergencyCard({
      prescriber: prescriber({ specialty: undefined }),
    });
    const page = buildEmergencyCardPdfTwoUpPage(card, makeEmergencyCard());
    const warning = page.left.blocks.find((b) => b.kind === 'warning');
    expect(warning).toBeDefined();
    expect(warning!.text.toLowerCase()).toContain('warnings');
  });

  it('omits specialty block when prescriber lacks specialty', () => {
    const card = makeEmergencyCard({
      prescriber: prescriber({ specialty: undefined }),
    });
    const page = buildEmergencyCardPdfTwoUpPage(card, null);
    const specialty = page.left.blocks.find((b) => b.kind === 'specialty');
    expect(specialty).toBeUndefined();
  });

  it('omits daytime fallback when card lacks daytime phone', () => {
    const card = makeEmergencyCard({
      phone: undefined,
      afterHoursPhone: '212-555-0911',
    });
    const page = buildEmergencyCardPdfTwoUpPage(card, null);
    const fallback = page.left.blocks.find((b) => b.kind === 'fallback-line');
    expect(fallback).toBeUndefined();
  });

  it('respects custom documentTitle option', () => {
    const page = buildEmergencyCardPdfTwoUpPage(makeEmergencyCard(), makeEmergencyCard(), {
      documentTitle: 'ICU BINDER PAGE',
    });
    const title = page.left.blocks.find((b) => b.kind === 'document-title')!;
    expect(title.text).toContain('ICU BINDER PAGE');
  });

  it('uses provided printedAt in the default footer', () => {
    const page = buildEmergencyCardPdfTwoUpPage(makeEmergencyCard(), makeEmergencyCard(), {
      printedAt: new Date('2026-06-22T03:00:00Z'),
    });
    const footer = page.left.blocks.find((b) => b.kind === 'footer')!;
    expect(footer.text).toContain('2026-06-2'); // date format YYYY-MM-DD (local timezone-aware)
  });

  it('omits footer when empty string supplied', () => {
    const page = buildEmergencyCardPdfTwoUpPage(makeEmergencyCard(), makeEmergencyCard(), {
      footer: '',
    });
    const footer = page.left.blocks.find((b) => b.kind === 'footer');
    expect(footer).toBeUndefined();
  });
});

describe('buildEmergencyCardPdfTwoUpPages — multi-page roster', () => {
  it('pairs cards 1+2, 3+4 across pages', () => {
    const cards = [
      makeEmergencyCard({ prescriber: prescriber({ displayName: 'Card 1' }) }),
      makeEmergencyCard({ prescriber: prescriber({ displayName: 'Card 2' }) }),
      makeEmergencyCard({ prescriber: prescriber({ displayName: 'Card 3' }) }),
      makeEmergencyCard({ prescriber: prescriber({ displayName: 'Card 4' }) }),
    ];
    const pages = buildEmergencyCardPdfTwoUpPages(cards);
    expect(pages).toHaveLength(2);
    expect(pages[0]!.left.emergencyCard).toBe(cards[0]);
    expect(pages[0]!.right.emergencyCard).toBe(cards[1]);
    expect(pages[1]!.left.emergencyCard).toBe(cards[2]);
    expect(pages[1]!.right.emergencyCard).toBe(cards[3]);
  });

  it('renders the last page with an empty right slot for odd runs', () => {
    const cards = [
      makeEmergencyCard({ prescriber: prescriber({ displayName: 'Card 1' }) }),
      makeEmergencyCard({ prescriber: prescriber({ displayName: 'Card 2' }) }),
      makeEmergencyCard({ prescriber: prescriber({ displayName: 'Card 3' }) }),
    ];
    const pages = buildEmergencyCardPdfTwoUpPages(cards);
    expect(pages).toHaveLength(2);
    expect(pages[1]!.right.emergencyCard).toBeNull();
    expect(pages[1]!.rightSlotEmpty).toBe(true);
  });

  it('produces an empty array for an empty input', () => {
    expect(buildEmergencyCardPdfTwoUpPages([])).toEqual([]);
  });

  it('single card produces a one-page result with right slot empty', () => {
    const pages = buildEmergencyCardPdfTwoUpPages([makeEmergencyCard()]);
    expect(pages).toHaveLength(1);
    expect(pages[0]!.rightSlotEmpty).toBe(true);
  });
});

describe('emergencyCardPdfTwoUpPageCount', () => {
  it('computes ceil(n / 2) for all common counts', () => {
    expect(emergencyCardPdfTwoUpPageCount([])).toBe(0);
    expect(emergencyCardPdfTwoUpPageCount([makeEmergencyCard()])).toBe(1);
    expect(emergencyCardPdfTwoUpPageCount([makeEmergencyCard(), makeEmergencyCard()])).toBe(1);
    expect(emergencyCardPdfTwoUpPageCount(Array.from({ length: 5 }, () => makeEmergencyCard()))).toBe(3);
    expect(emergencyCardPdfTwoUpPageCount(Array.from({ length: 8 }, () => makeEmergencyCard()))).toBe(4);
  });
});

describe('buildEmergencyCardPdfTwoUpPage — determinism', () => {
  it('produces structurally identical output across two invocations', () => {
    const left = makeEmergencyCard();
    const right = makeEmergencyCard();
    const a = buildEmergencyCardPdfTwoUpPage(left, right, { printedAt: new Date('2026-06-22T00:00:00Z') });
    const b = buildEmergencyCardPdfTwoUpPage(left, right, { printedAt: new Date('2026-06-22T00:00:00Z') });
    expect(a.left.blocks.length).toBe(b.left.blocks.length);
    expect(a.right.blocks.length).toBe(b.right.blocks.length);
    expect(a.left.qr!.contents).toBe(b.left.qr!.contents);
  });
});
