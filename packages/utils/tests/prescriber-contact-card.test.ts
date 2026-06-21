import { describe, it, expect } from 'vitest';
import {
  buildPrescriberContactCard,
  buildContactCardsForDirectory,
  renderWalletCard,
  renderVcard,
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

const FULL: PrescriberContactInput = {
  prescriber: prescriber(),
  phone: '212-555-0100',
  fax: '212-555-0101',
  email: 'office@example.com',
  addressLine: '123 Park Ave Suite 200',
  city: 'New York',
  state: 'NY',
  postalCode: '10017',
  practiceName: 'Midtown Cardiology Associates',
  schedulingUrl: 'https://book.example.com/jsmith',
};

describe('buildPrescriberContactCard — phone normalisation', () => {
  it('normalises a 10-digit US phone to digits + pretty form', () => {
    const card = buildPrescriberContactCard(FULL);
    expect(card.phone?.digits).toBe('2125550100');
    expect(card.phone?.pretty).toBe('(212) 555-0100');
    expect(card.phone?.valid).toBe(true);
  });

  it('strips formatting characters from phone input', () => {
    const card = buildPrescriberContactCard({
      prescriber: prescriber(),
      phone: '(800) 555-1212',
    });
    expect(card.phone?.digits).toBe('8005551212');
    expect(card.phone?.pretty).toBe('(800) 555-1212');
  });

  it('handles a +1 prefixed phone as valid 11-digit', () => {
    const card = buildPrescriberContactCard({
      prescriber: prescriber(),
      phone: '+1 (212) 555-0100',
    });
    expect(card.phone?.digits).toBe('12125550100');
    expect(card.phone?.valid).toBe(true);
    expect(card.phone?.pretty).toBe('+1 (212) 555-0100');
  });

  it('flags a too-short phone as invalid and surfaces a warning', () => {
    const card = buildPrescriberContactCard({
      prescriber: prescriber(),
      phone: '555-12',
    });
    expect(card.phone?.valid).toBe(false);
    expect(card.warnings).toContain('phone number is not 10 digits');
  });

  it('skips empty / whitespace phone fields entirely', () => {
    const card = buildPrescriberContactCard({
      prescriber: prescriber(),
      phone: '   ',
      fax: '',
    });
    expect(card.phone).toBeUndefined();
    expect(card.fax).toBeUndefined();
  });

  it('normalises fax + pager + after-hours phone independently', () => {
    const card = buildPrescriberContactCard({
      prescriber: prescriber(),
      phone: '212-555-0100',
      fax: '2125550101',
      pager: '8005550199',
      afterHoursPhone: '212.555.9999',
    });
    expect(card.fax?.digits).toBe('2125550101');
    expect(card.pager?.digits).toBe('8005550199');
    expect(card.afterHoursPhone?.digits).toBe('2125559999');
    expect(card.afterHoursPhone?.pretty).toBe('(212) 555-9999');
  });
});

describe('buildPrescriberContactCard — email validation', () => {
  it('accepts a well-formed email and lowercases it', () => {
    const card = buildPrescriberContactCard({
      ...FULL,
      email: 'Office@Example.COM',
    });
    expect(card.email).toBe('office@example.com');
    expect(card.warnings).not.toContain('email format looks invalid');
  });

  it('warns on a malformed email but still surfaces no email field', () => {
    const card = buildPrescriberContactCard({
      ...FULL,
      email: 'not-an-email',
    });
    expect(card.email).toBeUndefined();
    expect(card.warnings).toContain('email format looks invalid');
  });

  it('drops empty email silently with no warning', () => {
    const card = buildPrescriberContactCard({
      ...FULL,
      email: '',
    });
    expect(card.email).toBeUndefined();
    expect(card.warnings).not.toContain('email format looks invalid');
  });
});

describe('buildPrescriberContactCard — address assembly', () => {
  it('combines street + city + state + zip into one display line', () => {
    const card = buildPrescriberContactCard(FULL);
    expect(card.address).toBe('123 Park Ave Suite 200, New York, NY 10017');
  });

  it('handles city + zip without state', () => {
    const card = buildPrescriberContactCard({
      ...FULL,
      addressLine: '1 Main St',
      state: undefined,
    });
    expect(card.address).toBe('1 Main St, New York 10017');
  });

  it('omits address entirely when all parts blank', () => {
    const card = buildPrescriberContactCard({
      prescriber: prescriber(),
      phone: '212-555-0100',
    });
    expect(card.address).toBeUndefined();
  });
});

describe('buildPrescriberContactCard — warnings', () => {
  it('flags NPI failed Luhn when prescriber.npiValid is false', () => {
    const card = buildPrescriberContactCard({
      prescriber: prescriber({ npi: '1234567890', npiValid: false }),
      phone: '212-555-0100',
    });
    expect(card.warnings).toContain('NPI failed Luhn validation');
  });

  it('flags missing contact method when nothing reachable on file', () => {
    const card = buildPrescriberContactCard({ prescriber: prescriber() });
    expect(card.warnings).toContain('no contact method on file');
  });

  it('does NOT flag missing contact when warnOnMissingContact=false', () => {
    const card = buildPrescriberContactCard(
      { prescriber: prescriber() },
      { warnOnMissingContact: false },
    );
    expect(card.warnings).not.toContain('no contact method on file');
  });

  it('returns an empty warnings array for a complete card', () => {
    const card = buildPrescriberContactCard(FULL);
    expect(card.warnings).toEqual([]);
  });
});

describe('buildPrescriberContactCard — specialty display', () => {
  it('title-cases the canonical lowercased specialty', () => {
    const card = buildPrescriberContactCard({
      prescriber: prescriber({ specialty: 'internal medicine' }),
      phone: '212-555-0100',
    });
    expect(card.specialty).toBe('Internal Medicine');
  });

  it('omits specialty when prescriber.specialty is undefined', () => {
    const card = buildPrescriberContactCard({
      prescriber: prescriber({ specialty: undefined }),
      phone: '212-555-0100',
    });
    expect(card.specialty).toBeUndefined();
  });
});

describe('renderWalletCard', () => {
  it('produces an 8-line max plain-text block', () => {
    const card = buildPrescriberContactCard(FULL);
    const block = renderWalletCard(card);
    const lines = block.split('\n');
    expect(lines.length).toBeLessThanOrEqual(8);
    expect(lines[0]).toBe('Smith, Jane A.');
    expect(lines).toContain('Cardiology');
    expect(lines).toContain('Tel (212) 555-0100');
  });

  it('truncates lines wider than 32 characters with an ellipsis', () => {
    const card = buildPrescriberContactCard({
      ...FULL,
      practiceName: 'A Really Long Practice Name That Exceeds The Card Width',
    });
    const block = renderWalletCard(card);
    for (const line of block.split('\n')) {
      expect(line.length).toBeLessThanOrEqual(32);
    }
    expect(block).toMatch(/…/);
  });

  it('omits empty sections cleanly', () => {
    const card = buildPrescriberContactCard({
      prescriber: prescriber({ specialty: undefined }),
      phone: '212-555-0100',
    });
    const block = renderWalletCard(card);
    expect(block).not.toMatch(/^undefined/);
    expect(block.split('\n')).toContain('Smith, Jane A.');
    expect(block.split('\n')).toContain('Tel (212) 555-0100');
  });

  it('includes NPI line when present', () => {
    const card = buildPrescriberContactCard(FULL);
    const block = renderWalletCard(card);
    expect(block).toContain('NPI 1234567893');
  });
});

describe('renderVcard', () => {
  it('emits a BEGIN/END envelope and version 4.0', () => {
    const card = buildPrescriberContactCard(FULL);
    const v = renderVcard(card);
    expect(v.startsWith('BEGIN:VCARD\r\nVERSION:4.0\r\n')).toBe(true);
    expect(v.endsWith('END:VCARD')).toBe(true);
  });

  it('splits the display name into structured N family;given', () => {
    const card = buildPrescriberContactCard(FULL);
    const v = renderVcard(card);
    expect(v).toContain('FN:Smith\\, Jane A.');
    expect(v).toContain('N:Smith;Jane A.;;;');
  });

  it('emits tel: URIs with the digits-only form prefixed by +', () => {
    const card = buildPrescriberContactCard(FULL);
    const v = renderVcard(card);
    expect(v).toContain('TEL;TYPE=work,voice;VALUE=uri:tel:+12125550100');
    expect(v).toContain('TEL;TYPE=work,fax;VALUE=uri:tel:+12125550101');
  });

  it('escapes commas and semicolons in fielded values', () => {
    const card = buildPrescriberContactCard({
      ...FULL,
      practiceName: 'Smith; Jones, & Co',
    });
    const v = renderVcard(card);
    expect(v).toContain('ORG:Smith\\; Jones\\, & Co');
  });

  it('annotates unverified NPI in the NOTE field', () => {
    const card = buildPrescriberContactCard({
      prescriber: prescriber({ npi: '1234567890', npiValid: false }),
      phone: '212-555-0100',
    });
    const v = renderVcard(card);
    expect(v).toContain('NOTE:NPI 1234567890 (unverified)');
  });

  it('omits NPI line when prescriber has no NPI', () => {
    const card = buildPrescriberContactCard({
      prescriber: prescriber({ npi: undefined, npiValid: false, id: 'name:smith|j' }),
      phone: '212-555-0100',
    });
    const v = renderVcard(card);
    expect(v).not.toMatch(/^NOTE:NPI/m);
  });
});

describe('buildContactCardsForDirectory', () => {
  it('builds one card per prescriber with sparse contact lookup', () => {
    const prescribers = [
      prescriber({ id: 'npi:1234567893', displayName: 'Smith, Jane' }),
      prescriber({ id: 'name:doe|j', npi: undefined, npiValid: false, displayName: 'Doe, John' }),
    ];
    const contacts = {
      'npi:1234567893': {
        phone: '212-555-0100',
        practiceName: 'Midtown Cardio',
      },
    };
    const cards = buildContactCardsForDirectory(prescribers, contacts);
    expect(cards).toHaveLength(2);
    expect(cards[0]?.phone?.digits).toBe('2125550100');
    // Second prescriber has no contact entry — accrues warning.
    expect(cards[1]?.warnings).toContain('no contact method on file');
  });
});
