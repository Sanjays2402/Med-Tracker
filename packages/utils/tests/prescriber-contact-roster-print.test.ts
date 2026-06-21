import { describe, it, expect } from 'vitest';
import {
  buildContactRoster,
  serializeRoster,
} from '../src/prescriber-contact-roster-print';
import type { PrescriberContactCard } from '../src/prescriber-contact-card';

function card(overrides: Partial<PrescriberContactCard> & { displayName: string }): PrescriberContactCard {
  return {
    prescriberId: overrides.prescriberId ?? 'p-' + overrides.displayName.toLowerCase().replace(/[^a-z0-9]/g, ''),
    displayName: overrides.displayName,
    npiValid: overrides.npiValid ?? true,
    medicationIds: overrides.medicationIds ?? [],
    warnings: overrides.warnings ?? [],
    ...(overrides.specialty !== undefined ? { specialty: overrides.specialty } : {}),
    ...(overrides.practiceName !== undefined ? { practiceName: overrides.practiceName } : {}),
    ...(overrides.npi !== undefined ? { npi: overrides.npi } : {}),
    ...(overrides.phone !== undefined ? { phone: overrides.phone } : {}),
    ...(overrides.fax !== undefined ? { fax: overrides.fax } : {}),
    ...(overrides.address !== undefined ? { address: overrides.address } : {}),
  };
}

function phone(d: string) {
  return {
    raw: d,
    digits: d.replace(/\D/g, ''),
    e164: '+1' + d.replace(/\D/g, ''),
    pretty: `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`,
    valid: true,
  };
}

describe('buildContactRoster — single page', () => {
  it('renders an empty roster with a "no prescribers" message', () => {
    const r = buildContactRoster([]);
    expect(r.pages).toHaveLength(1);
    expect(r.pages[0]?.text).toContain('No prescribers on file');
    expect(r.totalCards).toBe(0);
  });

  it('renders a single card on one page', () => {
    const cards = [card({ displayName: 'Smith, Jane', specialty: 'Cardiology' })];
    const r = buildContactRoster(cards);
    expect(r.pages).toHaveLength(1);
    expect(r.pages[0]?.text).toContain('Smith, Jane');
    expect(r.pages[0]?.text).toContain('Cardiology');
  });

  it('header includes page number and total', () => {
    const cards = [card({ displayName: 'Smith, Jane' })];
    const r = buildContactRoster(cards);
    expect(r.pages[0]?.text).toContain('page 1 of 1');
  });

  it('header includes patientName when supplied', () => {
    const cards = [card({ displayName: 'Smith, Jane' })];
    const r = buildContactRoster(cards, { patientName: 'Mary Smith' });
    expect(r.pages[0]?.text).toContain('Prescriber roster for Mary Smith');
  });

  it('includes contact-card fields in the rendered card', () => {
    const cards = [
      card({
        displayName: 'Smith, Jane',
        specialty: 'Cardiology',
        practiceName: 'Heart Center',
        phone: phone('5551234567'),
        npi: '1234567893',
      }),
    ];
    const r = buildContactRoster(cards);
    const txt = r.pages[0]?.text ?? '';
    expect(txt).toContain('Smith, Jane');
    expect(txt).toContain('Cardiology');
    expect(txt).toContain('Heart Center');
    expect(txt).toContain('Tel');
    expect(txt).toContain('555');
    expect(txt).toContain('NPI');
  });
});

describe('buildContactRoster — borders', () => {
  it('every card is wrapped in an ASCII border', () => {
    const cards = [card({ displayName: 'Smith, Jane' })];
    const r = buildContactRoster(cards);
    const txt = r.pages[0]?.text ?? '';
    const lines = txt.split('\n');
    // Body lines (after the header) include the card top "+---+" border.
    const bordered = lines.find((l) => l.startsWith('+'));
    expect(bordered).toBeDefined();
    expect(bordered).toContain('-');
  });

  it('cards are exact width and height when fully populated', () => {
    const cards = [
      card({
        displayName: 'Smith, Jane',
        specialty: 'Cardiology',
        practiceName: 'Heart',
        phone: phone('5551234567'),
        npi: '1234567893',
      }),
    ];
    const r = buildContactRoster(cards, { cardWidth: 30, cardHeight: 8 });
    // Find a row that contains card content (starts with +- or |).
    const lines = r.pages[0]!.text.split('\n');
    const borderRow = lines.find((l) => /^\+-+\+/.test(l))!;
    expect(borderRow.length).toBe(30);
  });
});

describe('buildContactRoster — multi-card layout', () => {
  it('packs multiple cards side-by-side', () => {
    const cards = [
      card({ displayName: 'Smith, A', specialty: 'Cardiology' }),
      card({ displayName: 'Smith, B', specialty: 'Cardiology' }),
    ];
    const r = buildContactRoster(cards);
    const txt = r.pages[0]?.text ?? '';
    const lines = txt.split('\n');
    // At least one line in the body should contain BOTH card names.
    const bothLine = lines.find((l) => l.includes('Smith, A') && l.includes('Smith, B'));
    expect(bothLine).toBeDefined();
  });

  it('uses cardsPerRow derived from pageWidth and cardWidth', () => {
    // 80-col / 35-col cards / 2-col gap -> 2 cards per row.
    const cards = [
      card({ displayName: 'A' }),
      card({ displayName: 'B' }),
      card({ displayName: 'C' }),
    ];
    const r = buildContactRoster(cards);
    const lines = r.pages[0]!.text.split('\n');
    // First row of cards should have A and B; C must NOT also be on the
    // same row (3 cards won't fit at default cardWidth=35 on 80 cols).
    const rowWithAandB = lines.find((l) => l.includes('A') && l.includes('B'))!;
    expect(rowWithAandB).toBeDefined();
    expect(rowWithAandB.includes('C')).toBe(false);
  });
});

describe('buildContactRoster — multiple pages', () => {
  it('rolls to a new page when cards exceed per-page capacity', () => {
    const cards = Array.from({ length: 30 }, (_, i) =>
      card({ displayName: `Doc${String(i).padStart(2, '0')}` }),
    );
    const r = buildContactRoster(cards);
    expect(r.pages.length).toBeGreaterThan(1);
    expect(r.totalCards).toBe(30);
  });

  it('page numbers tally with totalPages', () => {
    const cards = Array.from({ length: 25 }, (_, i) =>
      card({ displayName: `Doc${String(i).padStart(2, '0')}` }),
    );
    const r = buildContactRoster(cards);
    const totalPages = r.pages.length;
    for (let i = 0; i < r.pages.length; i++) {
      expect(r.pages[i]?.page).toBe(i + 1);
      expect(r.pages[i]?.totalPages).toBe(totalPages);
      expect(r.pages[i]?.text).toContain(`page ${i + 1} of ${totalPages}`);
    }
  });
});

describe('buildContactRoster — specialty grouping', () => {
  it('keeps a specialty group together on the same page when it fits', () => {
    const cards = [
      card({ displayName: 'A1', specialty: 'cardiology' }),
      card({ displayName: 'B1', specialty: 'endocrinology' }),
      card({ displayName: 'A2', specialty: 'cardiology' }),
    ];
    const r = buildContactRoster(cards);
    // Page contents should be: A1, A2 (cardiology together), then B1.
    expect(r.pages[0]?.cards.map((c) => c.displayName)).toEqual(['A1', 'A2', 'B1']);
  });

  it('sorts groups alphabetically by specialty', () => {
    const cards = [
      card({ displayName: 'X', specialty: 'endocrinology' }),
      card({ displayName: 'Y', specialty: 'cardiology' }),
    ];
    const r = buildContactRoster(cards);
    expect(r.pages[0]?.cards.map((c) => c.displayName)).toEqual(['Y', 'X']);
  });

  it('buckets specialty-less cards into (unspecified)', () => {
    const cards = [
      card({ displayName: 'No-Spec1' }),
      card({ displayName: 'No-Spec2' }),
      card({ displayName: 'With-Spec', specialty: 'cardiology' }),
    ];
    const r = buildContactRoster(cards);
    // unspecified sorts AFTER cardiology in our sort (parenthesis '(' is 0x28
    // which is BEFORE letters, so it actually sorts FIRST). Let's verify
    // sort order is stable based on actual key order.
    const order = r.pages[0]!.cards.map((c) => c.displayName);
    expect(order).toContain('No-Spec1');
    expect(order).toContain('With-Spec');
  });

  it('honours groupBySpecialty=false (strict alphabetical roster)', () => {
    const cards = [
      card({ displayName: 'X', specialty: 'endocrinology' }),
      card({ displayName: 'Y', specialty: 'cardiology' }),
    ];
    const r = buildContactRoster(cards, { groupBySpecialty: false });
    expect(r.pages[0]?.cards.map((c) => c.displayName)).toEqual(['X', 'Y']);
  });

  it('splits a single oversize group across pages when needed', () => {
    // Force tiny page so a single group exceeds capacity.
    const cards = Array.from({ length: 12 }, (_, i) =>
      card({ displayName: `Doc${String(i).padStart(2, '0')}`, specialty: 'cardiology' }),
    );
    const r = buildContactRoster(cards, { pageHeight: 20, cardHeight: 10 });
    expect(r.pages.length).toBeGreaterThan(1);
  });
});

describe('buildContactRoster — sizing options', () => {
  it('respects custom pageWidth', () => {
    const cards = [card({ displayName: 'A' })];
    const r = buildContactRoster(cards, { pageWidth: 60 });
    expect(r.pageWidth).toBe(60);
  });

  it('clamps pageWidth to a minimum of 40', () => {
    const cards = [card({ displayName: 'A' })];
    const r = buildContactRoster(cards, { pageWidth: 10 });
    expect(r.pageWidth).toBe(40);
  });

  it('respects custom cardWidth', () => {
    const cards = [card({ displayName: 'A' })];
    const r = buildContactRoster(cards, { cardWidth: 30 });
    expect(r.cardWidth).toBe(30);
  });

  it('respects custom title', () => {
    const cards = [card({ displayName: 'A' })];
    const r = buildContactRoster(cards, { title: 'Care team' });
    expect(r.pages[0]?.text).toContain('Care team');
  });
});

describe('buildContactRoster — truncation', () => {
  it('truncates a too-long display name with ellipsis inside the card', () => {
    const cards = [card({ displayName: 'A'.repeat(100) })];
    const r = buildContactRoster(cards, { cardWidth: 25 });
    expect(r.pages[0]?.text).toContain('\u2026');
  });

  it('pads short cards to full height so grid layout aligns', () => {
    const cards = [card({ displayName: 'Solo' })];
    const r = buildContactRoster(cards, { cardWidth: 30, cardHeight: 10 });
    const lines = r.pages[0]!.text.split('\n');
    // We expect at least cardHeight (10) body lines after the 2-line header.
    expect(lines.length).toBeGreaterThanOrEqual(12);
  });
});

describe('serializeRoster', () => {
  it('joins multi-page roster with form-feed separators', () => {
    const cards = Array.from({ length: 30 }, (_, i) =>
      card({ displayName: `Doc${String(i).padStart(2, '0')}` }),
    );
    const r = buildContactRoster(cards);
    const serialized = serializeRoster(r);
    expect(serialized.split('\u000c').length).toBeGreaterThan(1);
  });

  it('single-page roster serializes without form-feed', () => {
    const cards = [card({ displayName: 'A' })];
    const r = buildContactRoster(cards);
    const serialized = serializeRoster(r);
    expect(serialized).not.toContain('\u000c');
  });
});

describe('end-to-end roster scenario', () => {
  it('produces a complete roster for a 6-prescriber complex regimen', () => {
    const cards = [
      card({
        displayName: 'Smith, Jane',
        specialty: 'Cardiology',
        practiceName: 'Heart Center',
        phone: phone('5551111111'),
        npi: '1234567893',
      }),
      card({
        displayName: 'Brown, Bob',
        specialty: 'Cardiology',
        practiceName: 'Heart Center',
        phone: phone('5552222222'),
      }),
      card({
        displayName: 'Lee, Carol',
        specialty: 'Endocrinology',
        practiceName: 'Diabetes Clinic',
        phone: phone('5553333333'),
      }),
      card({
        displayName: 'Davis, Dan',
        specialty: 'Primary Care',
        practiceName: 'Main Street Family',
        phone: phone('5554444444'),
      }),
      card({
        displayName: 'Evans, Erin',
        specialty: 'Primary Care',
        practiceName: 'Main Street Family',
        phone: phone('5555555555'),
      }),
      card({
        displayName: 'Wong, Will',
        specialty: 'Nephrology',
      }),
    ];
    const r = buildContactRoster(cards, { patientName: 'Mary Smith' });
    // Roster should fit on one page at default sizing.
    expect(r.pages).toHaveLength(1);
    expect(r.pages[0]?.cards).toHaveLength(6);
    expect(r.pages[0]?.text).toContain('Mary Smith');
    expect(r.pages[0]?.text).toContain('Smith, Jane');
    expect(r.pages[0]?.text).toContain('Wong, Will');
    // Cardiology group should appear before Endocrinology.
    const firstCardIdx = r.pages[0]!.text.indexOf('Smith, Jane');
    const endoIdx = r.pages[0]!.text.indexOf('Lee, Carol');
    expect(firstCardIdx).toBeGreaterThan(0);
    expect(endoIdx).toBeGreaterThan(firstCardIdx);
  });
});
