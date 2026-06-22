import { describe, it, expect } from 'vitest';
import {
  buildEmergencyCard,
  buildEmergencyCards,
  findCardsWithoutEmergencyPhone,
  renderEmergencyCardText,
  renderEmergencyCardHtml,
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

describe('buildEmergencyCard — on-call selection', () => {
  it('uses afterHoursPhone as the on-call number when present', () => {
    const card = buildPrescriberContactCard(makeInput());
    const emer = buildEmergencyCard(card);
    expect(emer.onCallSource).toBe('after-hours');
    expect(emer.onCall?.pretty).toBe('(212) 555-0911');
    expect(emer.warnings).not.toContain(
      'No dedicated after-hours number on file; daytime number used as fallback.',
    );
  });

  it('falls back to daytime phone when no afterHoursPhone', () => {
    const card = buildPrescriberContactCard(makeInput({ afterHoursPhone: undefined }));
    const emer = buildEmergencyCard(card);
    expect(emer.onCallSource).toBe('daytime');
    expect(emer.onCall?.pretty).toBe('(212) 555-0100');
    expect(emer.warnings).toContain(
      'No dedicated after-hours number on file; daytime number used as fallback.',
    );
  });

  it('returns onCall=null when neither phone is on file', () => {
    const card = buildPrescriberContactCard(
      makeInput({ afterHoursPhone: undefined, phone: undefined }),
    );
    const emer = buildEmergencyCard(card);
    expect(emer.onCall).toBeNull();
    expect(emer.onCallSource).toBe('none');
    expect(emer.warnings).toContain('No emergency phone number on file.');
  });

  it('does NOT include daytime fallback in the structured card when daytime IS the on-call number', () => {
    const card = buildPrescriberContactCard(makeInput({ afterHoursPhone: undefined }));
    const emer = buildEmergencyCard(card);
    expect(emer.daytime).toBeUndefined();
  });

  it('keeps daytime as a fallback line when after-hours is the on-call', () => {
    const card = buildPrescriberContactCard(makeInput());
    const emer = buildEmergencyCard(card);
    expect(emer.daytime?.pretty).toBe('(212) 555-0100');
  });
});

describe('buildEmergencyCard — warnings', () => {
  it('emits a specialty-unknown warning when no specialty', () => {
    const card = buildPrescriberContactCard(
      makeInput({ prescriber: prescriber({ specialty: undefined }) }),
    );
    const emer = buildEmergencyCard(card);
    expect(emer.warnings).toContain('Specialty unknown — confirm with the patient.');
    expect(emer.specialty).toBeUndefined();
  });

  it('title-cases the specialty from the source card', () => {
    const card = buildPrescriberContactCard(makeInput());
    const emer = buildEmergencyCard(card);
    expect(emer.specialty).toBe('Cardiology');
  });

  it('returns no warnings when after-hours + specialty + name all present', () => {
    const card = buildPrescriberContactCard(makeInput());
    const emer = buildEmergencyCard(card);
    expect(emer.warnings).toEqual([]);
  });
});

describe('renderEmergencyCardText — layout', () => {
  it('puts EMERGENCY CONTACT as the first line and on-call as the third', () => {
    const card = buildPrescriberContactCard(makeInput());
    const text = renderEmergencyCardText(buildEmergencyCard(card));
    const lines = text.split('\n');
    expect(lines[0]!.trim()).toBe('EMERGENCY CONTACT');
    expect(lines[1]).toMatch(/^=+$/);
    expect(lines[2]).toContain('(212) 555-0911');
    expect(lines[3]).toContain('On-call');
  });

  it('shows the daytime line below the name + specialty when both exist', () => {
    const card = buildPrescriberContactCard(makeInput());
    const text = renderEmergencyCardText(buildEmergencyCard(card));
    const lines = text.split('\n');
    expect(lines.some((l) => l.startsWith('Smith, Jane'))).toBe(true);
    expect(lines.some((l) => l.includes('Cardiology'))).toBe(true);
    expect(lines.some((l) => l.includes('Tel (212) 555-0100'))).toBe(true);
  });

  it('shows NO PHONE ON FILE when no on-call number', () => {
    const card = buildPrescriberContactCard(
      makeInput({ afterHoursPhone: undefined, phone: undefined }),
    );
    const text = renderEmergencyCardText(buildEmergencyCard(card));
    expect(text).toContain('NO PHONE ON FILE');
    expect(text).toContain('Ask patient for contact');
  });

  it('shows the daytime line label as fallback when no after-hours', () => {
    const card = buildPrescriberContactCard(makeInput({ afterHoursPhone: undefined }));
    const text = renderEmergencyCardText(buildEmergencyCard(card));
    expect(text).toContain('Daytime line (fallback)');
  });

  it('truncates a long display name to the card width with ellipsis', () => {
    const card = buildPrescriberContactCard(
      makeInput({
        prescriber: prescriber({
          displayName: 'Smith-Jones-Anderson-Whittaker-The-Third, Janie A.',
        }),
      }),
    );
    const text = renderEmergencyCardText(buildEmergencyCard(card));
    const lines = text.split('\n');
    const nameLine = lines.find((l) => l.startsWith('Smith'));
    expect(nameLine!.length).toBeLessThanOrEqual(32);
    expect(nameLine!).toContain('\u2026');
  });

  it('caps total line count at 8', () => {
    const card = buildPrescriberContactCard(makeInput());
    const text = renderEmergencyCardText(buildEmergencyCard(card));
    expect(text.split('\n').length).toBeLessThanOrEqual(8);
  });

  it('keeps the on-call line centered within the card width', () => {
    const card = buildPrescriberContactCard(makeInput());
    const text = renderEmergencyCardText(buildEmergencyCard(card));
    const lines = text.split('\n');
    const onCallLine = lines[2]!;
    expect(onCallLine.length).toBe(32);
    expect(onCallLine.trim()).toBe('(212) 555-0911');
  });
});

describe('renderEmergencyCardHtml', () => {
  it('marks the on-call number as a tel: link', () => {
    const card = buildPrescriberContactCard(makeInput());
    const html = renderEmergencyCardHtml(buildEmergencyCard(card));
    expect(html).toContain('tel:+12125550911');
    expect(html).toContain('(212) 555-0911');
  });

  it('uses a 32px hero font for the on-call number', () => {
    const card = buildPrescriberContactCard(makeInput());
    const html = renderEmergencyCardHtml(buildEmergencyCard(card));
    expect(html).toContain('font-size:32px');
  });

  it('labels the on-call source as ON-CALL when after-hours number present', () => {
    const card = buildPrescriberContactCard(makeInput());
    const html = renderEmergencyCardHtml(buildEmergencyCard(card));
    expect(html).toContain('ON-CALL');
    expect(html).not.toContain('DAYTIME (FALLBACK)');
  });

  it('labels the on-call source as DAYTIME (FALLBACK) when no after-hours', () => {
    const card = buildPrescriberContactCard(makeInput({ afterHoursPhone: undefined }));
    const html = renderEmergencyCardHtml(buildEmergencyCard(card));
    expect(html).toContain('DAYTIME (FALLBACK)');
  });

  it('renders NO PHONE ON FILE when no phone available', () => {
    const card = buildPrescriberContactCard(
      makeInput({ afterHoursPhone: undefined, phone: undefined }),
    );
    const html = renderEmergencyCardHtml(buildEmergencyCard(card));
    expect(html).toContain('NO PHONE ON FILE');
    expect(html).toContain('Ask patient for contact info.');
  });

  it('escapes user-controlled fields (display name)', () => {
    const card = buildPrescriberContactCard(
      makeInput({
        prescriber: prescriber({ displayName: '<script>alert(1)</script>' }),
      }),
    );
    const html = renderEmergencyCardHtml(buildEmergencyCard(card));
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('renders warnings block when warnings exist', () => {
    const card = buildPrescriberContactCard(
      makeInput({ afterHoursPhone: undefined, prescriber: prescriber({ specialty: undefined }) }),
    );
    const html = renderEmergencyCardHtml(buildEmergencyCard(card));
    expect(html).toContain('Specialty unknown');
    expect(html).toContain('daytime number used as fallback');
  });

  it('omits warnings block when no warnings', () => {
    const card = buildPrescriberContactCard(makeInput());
    const html = renderEmergencyCardHtml(buildEmergencyCard(card));
    // The warnings block uses #fef3c7 background
    expect(html).not.toContain('background:#fef3c7');
  });

  it('shows the daytime fallback line in HTML when after-hours is on-call', () => {
    const card = buildPrescriberContactCard(makeInput());
    const html = renderEmergencyCardHtml(buildEmergencyCard(card));
    expect(html).toContain('Daytime (212) 555-0100');
  });
});

describe('buildEmergencyCards + findCardsWithoutEmergencyPhone', () => {
  it('builds emergency cards for an input list preserving order', () => {
    const inputs = [
      makeInput({ prescriber: prescriber({ displayName: 'A, A' }) }),
      makeInput({ prescriber: prescriber({ displayName: 'B, B' }) }),
    ];
    const cards = inputs.map((i) => buildPrescriberContactCard(i));
    const emer = buildEmergencyCards(cards);
    expect(emer.map((c) => c.displayName)).toEqual(['A, A', 'B, B']);
  });

  it('findCardsWithoutEmergencyPhone returns cards with no on-call', () => {
    const inputs = [
      makeInput({
        prescriber: prescriber({ displayName: 'WithPhone, A' }),
      }),
      makeInput({
        prescriber: prescriber({ displayName: 'NoPhone, B' }),
        phone: undefined,
        afterHoursPhone: undefined,
      }),
    ];
    const emer = buildEmergencyCards(inputs.map((i) => buildPrescriberContactCard(i)));
    const missing = findCardsWithoutEmergencyPhone(emer);
    expect(missing).toHaveLength(1);
    expect(missing[0]!.displayName).toBe('NoPhone, B');
  });

  it('returns empty array when every card has a phone', () => {
    const cards = [
      buildPrescriberContactCard(makeInput()),
      buildPrescriberContactCard(makeInput({ afterHoursPhone: undefined })),
    ];
    const missing = findCardsWithoutEmergencyPhone(buildEmergencyCards(cards));
    expect(missing).toEqual([]);
  });
});

describe('source field preserved', () => {
  it('keeps a reference to the original PrescriberContactCard', () => {
    const card = buildPrescriberContactCard(makeInput());
    const emer = buildEmergencyCard(card);
    expect(emer.source).toBe(card);
    expect(emer.source.npi).toBe('1234567893');
  });
});
