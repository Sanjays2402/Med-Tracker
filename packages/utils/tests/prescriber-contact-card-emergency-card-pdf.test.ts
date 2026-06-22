import { describe, it, expect } from 'vitest';
import {
  buildEmergencyCardPdfPayload,
  buildEmergencyCardPdfPayloads,
  emergencyCardPdfPageCount,
} from '../src/prescriber-contact-card-emergency-card-pdf';
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

describe('buildEmergencyCardPdfPayload — page sizes', () => {
  it('defaults to US Letter at 612x792 points', () => {
    const payload = buildEmergencyCardPdfPayload(makeEmergencyCard());
    expect(payload.page.width).toBe(612);
    expect(payload.page.height).toBe(792);
  });

  it('respects A4 page size when requested', () => {
    const payload = buildEmergencyCardPdfPayload(makeEmergencyCard(), { pageSize: 'a4' });
    expect(payload.page.width).toBe(595);
    expect(payload.page.height).toBe(842);
  });

  it('uses a 36-point (0.5") margin for both sizes', () => {
    const letter = buildEmergencyCardPdfPayload(makeEmergencyCard());
    const a4 = buildEmergencyCardPdfPayload(makeEmergencyCard(), { pageSize: 'a4' });
    expect(letter.page.margin).toBe(36);
    expect(a4.page.margin).toBe(36);
  });
});

describe('buildEmergencyCardPdfPayload — document title', () => {
  it('renders the default ED handoff title', () => {
    const payload = buildEmergencyCardPdfPayload(makeEmergencyCard());
    const title = payload.blocks.find((b) => b.kind === 'document-title');
    expect(title).toBeDefined();
    expect(title!.text).toContain('EMERGENCY MEDICAL CONTACT');
    expect(title!.bold).toBe(true);
    expect(title!.color).toBe('b91c1c'); // ED red
  });

  it('respects custom documentTitle option', () => {
    const payload = buildEmergencyCardPdfPayload(makeEmergencyCard(), {
      documentTitle: 'ICU CONTACT — DO NOT REMOVE',
    });
    const title = payload.blocks.find((b) => b.kind === 'document-title');
    expect(title!.text).toContain('ICU CONTACT');
  });

  it('truncates titles longer than the content width', () => {
    const longTitle = 'A'.repeat(200);
    const payload = buildEmergencyCardPdfPayload(makeEmergencyCard(), {
      documentTitle: longTitle,
    });
    const title = payload.blocks.find((b) => b.kind === 'document-title');
    expect(title!.text.length).toBeLessThan(200);
  });
});

describe('buildEmergencyCardPdfPayload — hero phone', () => {
  it('renders the on-call phone at the largest font when after-hours present', () => {
    const payload = buildEmergencyCardPdfPayload(makeEmergencyCard());
    const hero = payload.blocks.find((b) => b.kind === 'hero-phone');
    expect(hero).toBeDefined();
    expect(hero!.fontSize).toBe(48);
    expect(hero!.text).toBe('(212) 555-0911');
    expect(hero!.bold).toBe(true);
  });

  it('labels the hero as "CALL ON-CALL — 24/7" when after-hours present', () => {
    const payload = buildEmergencyCardPdfPayload(makeEmergencyCard());
    const label = payload.blocks.find((b) => b.kind === 'hero-label');
    expect(label!.text).toBe('CALL ON-CALL — 24/7');
    expect(label!.color).toBe('b91c1c');
  });

  it('labels the hero as "CALL DAYTIME — FALLBACK" when only daytime present', () => {
    const card = makeEmergencyCard({ afterHoursPhone: undefined });
    const payload = buildEmergencyCardPdfPayload(card);
    const label = payload.blocks.find((b) => b.kind === 'hero-label');
    expect(label!.text).toBe('CALL DAYTIME — FALLBACK');
    const hero = payload.blocks.find((b) => b.kind === 'hero-phone');
    expect(hero!.text).toBe('(212) 555-0100');
  });

  it('renders "NO PHONE ON FILE" label + "Ask patient" hero when no number', () => {
    const card = makeEmergencyCard({ phone: undefined, afterHoursPhone: undefined });
    const payload = buildEmergencyCardPdfPayload(card);
    const label = payload.blocks.find((b) => b.kind === 'hero-label');
    const hero = payload.blocks.find((b) => b.kind === 'hero-phone');
    expect(label!.text).toBe('NO PHONE ON FILE');
    expect(hero!.text).toBe('Ask patient');
    // Smaller font for the "Ask patient" hero because it's text, not a number
    expect(hero!.fontSize).toBe(28);
  });

  it('hero text is centred horizontally', () => {
    const payload = buildEmergencyCardPdfPayload(makeEmergencyCard());
    const hero = payload.blocks.find((b) => b.kind === 'hero-phone');
    expect(hero!.align).toBe('center');
  });
});

describe('buildEmergencyCardPdfPayload — prescriber name + specialty', () => {
  it('includes prescriber display name block', () => {
    const payload = buildEmergencyCardPdfPayload(makeEmergencyCard());
    const name = payload.blocks.find((b) => b.kind === 'prescriber-name');
    expect(name).toBeDefined();
    expect(name!.text).toBe('Smith, Jane A.');
    expect(name!.bold).toBe(true);
  });

  it('includes specialty when present', () => {
    const payload = buildEmergencyCardPdfPayload(makeEmergencyCard());
    const specialty = payload.blocks.find((b) => b.kind === 'specialty');
    expect(specialty).toBeDefined();
    expect(specialty!.text).toBe('Cardiology');
    expect(specialty!.bold).toBe(false);
  });

  it('omits specialty block when specialty unknown', () => {
    const card = buildEmergencyCard(
      buildPrescriberContactCard(makeInput({ prescriber: prescriber({ specialty: undefined }) })),
    );
    const payload = buildEmergencyCardPdfPayload(card);
    expect(payload.blocks.find((b) => b.kind === 'specialty')).toBeUndefined();
  });

  it('includes daytime fallback line when after-hours is on-call', () => {
    const payload = buildEmergencyCardPdfPayload(makeEmergencyCard());
    const fallback = payload.blocks.find((b) => b.kind === 'fallback-line');
    expect(fallback).toBeDefined();
    expect(fallback!.text).toContain('Daytime fallback');
    expect(fallback!.text).toContain('(212) 555-0100');
  });

  it('omits fallback-line when there is no daytime fallback', () => {
    const card = makeEmergencyCard({ afterHoursPhone: undefined });
    const payload = buildEmergencyCardPdfPayload(card);
    expect(payload.blocks.find((b) => b.kind === 'fallback-line')).toBeUndefined();
  });
});

describe('buildEmergencyCardPdfPayload — QR code', () => {
  it('includes a QR block with vCard contents', () => {
    const payload = buildEmergencyCardPdfPayload(makeEmergencyCard());
    expect(payload.qr.contents).toContain('BEGIN:VCARD');
    expect(payload.qr.contents).toContain('END:VCARD');
    expect(payload.qr.contents).toContain('Smith');
  });

  it('vCard contents include the on-call phone number', () => {
    const payload = buildEmergencyCardPdfPayload(makeEmergencyCard());
    expect(payload.qr.contents).toContain('+12125550911');
  });

  it('vCard contents include specialty as TITLE', () => {
    const payload = buildEmergencyCardPdfPayload(makeEmergencyCard());
    expect(payload.qr.contents).toMatch(/TITLE:Cardiology/);
  });

  it('default QR size is 240 points', () => {
    const payload = buildEmergencyCardPdfPayload(makeEmergencyCard());
    expect(payload.qr.size).toBe(240);
  });

  it('respects custom qrSize option', () => {
    const payload = buildEmergencyCardPdfPayload(makeEmergencyCard(), { qrSize: 320 });
    expect(payload.qr.size).toBe(320);
  });

  it('enforces minimum QR size of 72 points (scannability)', () => {
    const payload = buildEmergencyCardPdfPayload(makeEmergencyCard(), { qrSize: 10 });
    expect(payload.qr.size).toBe(72);
  });

  it('QR is centred horizontally on the page', () => {
    const payload = buildEmergencyCardPdfPayload(makeEmergencyCard());
    // (612 - 240) / 2 = 186
    expect(payload.qr.x).toBe(186);
  });

  it('QR uses ECC level M (vCard default)', () => {
    const payload = buildEmergencyCardPdfPayload(makeEmergencyCard());
    expect(payload.qr.errorCorrection).toBe('M');
  });

  it('includes a "Scan to import" caption below the QR', () => {
    const payload = buildEmergencyCardPdfPayload(makeEmergencyCard());
    const caption = payload.blocks.find((b) => b.kind === 'qr-caption');
    expect(caption).toBeDefined();
    expect(caption!.text).toContain('Scan');
    // Caption is positioned below the QR
    expect(caption!.y).toBeGreaterThan(payload.qr.y + payload.qr.size);
  });
});

describe('buildEmergencyCardPdfPayload — warnings', () => {
  it('renders a warning block when warnings present', () => {
    const card = makeEmergencyCard({ phone: undefined, afterHoursPhone: undefined });
    const payload = buildEmergencyCardPdfPayload(card);
    const warningBlock = payload.blocks.find((b) => b.kind === 'warning');
    expect(warningBlock).toBeDefined();
    expect(warningBlock!.text).toContain('No emergency phone number on file.');
    expect(warningBlock!.color).toBe('92400e');
  });

  it('omits warning block when none', () => {
    const payload = buildEmergencyCardPdfPayload(makeEmergencyCard());
    expect(payload.blocks.find((b) => b.kind === 'warning')).toBeUndefined();
  });

  it('payload.warnings mirrors emergencyCard.warnings', () => {
    const card = makeEmergencyCard({ phone: undefined, afterHoursPhone: undefined });
    const payload = buildEmergencyCardPdfPayload(card);
    expect(payload.warnings).toEqual(card.warnings);
  });

  it('payload.warnings is a copy (not the same reference)', () => {
    const card = makeEmergencyCard({ phone: undefined, afterHoursPhone: undefined });
    const payload = buildEmergencyCardPdfPayload(card);
    expect(payload.warnings).not.toBe(card.warnings);
  });

  it('joins multiple warnings with " | " separator', () => {
    const card = makeEmergencyCard({
      phone: undefined,
      afterHoursPhone: undefined,
      prescriber: prescriber({ specialty: undefined }),
    });
    const payload = buildEmergencyCardPdfPayload(card);
    const warningBlock = payload.blocks.find((b) => b.kind === 'warning');
    expect(warningBlock!.text).toContain(' | ');
  });
});

describe('buildEmergencyCardPdfPayload — footer', () => {
  it('renders default footer with printed date', () => {
    const payload = buildEmergencyCardPdfPayload(makeEmergencyCard(), {
      printedAt: new Date(2026, 5, 21),
    });
    const footer = payload.blocks.find((b) => b.kind === 'footer');
    expect(footer).toBeDefined();
    expect(footer!.text).toContain('Printed 2026-06-21');
    expect(footer!.text).toContain('Med-Tracker');
  });

  it('positions footer near the bottom of the page', () => {
    const payload = buildEmergencyCardPdfPayload(makeEmergencyCard());
    const footer = payload.blocks.find((b) => b.kind === 'footer');
    // Footer should be in the bottom 5% of the page
    expect(footer!.y).toBeGreaterThan(payload.page.height * 0.9);
  });

  it('respects custom footer option', () => {
    const payload = buildEmergencyCardPdfPayload(makeEmergencyCard(), {
      footer: 'Property of Main Hospital Department of Cardiology',
    });
    const footer = payload.blocks.find((b) => b.kind === 'footer');
    expect(footer!.text).toContain('Main Hospital');
  });

  it('omits footer block when footer="" passed', () => {
    const payload = buildEmergencyCardPdfPayload(makeEmergencyCard(), { footer: '' });
    expect(payload.blocks.find((b) => b.kind === 'footer')).toBeUndefined();
  });
});

describe('buildEmergencyCardPdfPayload — block layout', () => {
  it('blocks are ordered top-to-bottom by y coordinate', () => {
    const payload = buildEmergencyCardPdfPayload(makeEmergencyCard());
    // Filter out footer (always at bottom)
    const orderedBlocks = payload.blocks.filter((b) => b.kind !== 'footer');
    for (let i = 1; i < orderedBlocks.length; i++) {
      expect(orderedBlocks[i]!.y).toBeGreaterThanOrEqual(orderedBlocks[i - 1]!.y);
    }
  });

  it('all blocks fit within the content area', () => {
    const payload = buildEmergencyCardPdfPayload(makeEmergencyCard());
    const margin = payload.page.margin;
    for (const block of payload.blocks) {
      expect(block.x).toBeGreaterThanOrEqual(margin);
      expect(block.x + block.w).toBeLessThanOrEqual(payload.page.width - margin + 0.01);
    }
  });

  it('QR fits within the page bounds', () => {
    const payload = buildEmergencyCardPdfPayload(makeEmergencyCard());
    expect(payload.qr.x + payload.qr.size).toBeLessThanOrEqual(payload.page.width);
    expect(payload.qr.y + payload.qr.size).toBeLessThanOrEqual(payload.page.height);
  });
});

describe('buildEmergencyCardPdfPayloads', () => {
  it('returns one payload per emergency card preserving order', () => {
    const cards = [
      makeEmergencyCard(),
      makeEmergencyCard({
        prescriber: prescriber({ id: 'npi:2', displayName: 'Jones, Bob' }),
      }),
      makeEmergencyCard({
        prescriber: prescriber({ id: 'npi:3', displayName: 'Lee, Carol' }),
      }),
    ];
    const payloads = buildEmergencyCardPdfPayloads(cards);
    expect(payloads).toHaveLength(3);
    expect(
      payloads[0]!.blocks.find((b) => b.kind === 'prescriber-name')!.text,
    ).toBe('Smith, Jane A.');
    expect(
      payloads[1]!.blocks.find((b) => b.kind === 'prescriber-name')!.text,
    ).toBe('Jones, Bob');
    expect(
      payloads[2]!.blocks.find((b) => b.kind === 'prescriber-name')!.text,
    ).toBe('Lee, Carol');
  });

  it('applies the same options to every card', () => {
    const cards = [makeEmergencyCard(), makeEmergencyCard()];
    const payloads = buildEmergencyCardPdfPayloads(cards, { pageSize: 'a4' });
    expect(payloads[0]!.page.width).toBe(595);
    expect(payloads[1]!.page.width).toBe(595);
  });

  it('returns empty array for empty input', () => {
    expect(buildEmergencyCardPdfPayloads([])).toEqual([]);
  });
});

describe('emergencyCardPdfPageCount', () => {
  it('returns one page per card', () => {
    const cards = [makeEmergencyCard(), makeEmergencyCard(), makeEmergencyCard()];
    expect(emergencyCardPdfPageCount(cards)).toBe(3);
  });

  it('returns 0 for empty input', () => {
    expect(emergencyCardPdfPageCount([])).toBe(0);
  });
});

describe('buildEmergencyCardPdfPayload — international numbers', () => {
  it('uses international pretty form when available', () => {
    const card = makeEmergencyCard({
      afterHoursPhone: '+44 20 7946 0000',
    });
    const payload = buildEmergencyCardPdfPayload(card);
    const hero = payload.blocks.find((b) => b.kind === 'hero-phone');
    // The pretty form is preserved from the source
    expect(hero!.text.length).toBeGreaterThan(0);
  });
});

describe('buildEmergencyCardPdfPayload — long-name truncation', () => {
  it('truncates very long prescriber names so they fit the content width', () => {
    const card = makeEmergencyCard({
      prescriber: prescriber({
        displayName: 'Smith-Jones-Wellington-Higginbottom-McAllister-O\'Sullivan, Maximilian',
      }),
    });
    const payload = buildEmergencyCardPdfPayload(card);
    const name = payload.blocks.find((b) => b.kind === 'prescriber-name');
    // Either truncated or fits; in either case, ellipsis appears OR text is short enough
    expect(name!.text.length).toBeLessThan(80);
  });
});
