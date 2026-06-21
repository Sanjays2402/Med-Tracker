import { describe, it, expect } from 'vitest';
import {
  buildPrescriberDirectory,
  isValidNpi,
  prescriberForMedication,
  topPrescribers,
} from '../src/prescriber-directory';

// Known-valid NPIs (real check-digits, computed by the spec algorithm).
// 1234567893 is the canonical example in CMS docs.
const VALID_A = '1234567893';
// Generate a second valid NPI deterministically by trying digits 0-9 on a base.
function makeValidNpi(prefix9: string): string {
  for (let d = 0; d < 10; d++) {
    const candidate = `${prefix9}${d}`;
    if (isValidNpi(candidate)) return candidate;
  }
  throw new Error('no valid NPI for prefix ' + prefix9);
}
const VALID_B = makeValidNpi('167854566');
const INVALID_NPI = '1234567890'; // wrong check digit

describe('isValidNpi', () => {
  it('accepts a known-valid NPI', () => {
    expect(isValidNpi(VALID_A)).toBe(true);
  });
  it('rejects an NPI with wrong checksum', () => {
    expect(isValidNpi(INVALID_NPI)).toBe(false);
  });
  it('rejects non-10-digit strings', () => {
    expect(isValidNpi('123')).toBe(false);
    expect(isValidNpi('12345678901')).toBe(false);
    expect(isValidNpi('abc4567893')).toBe(false);
  });
  it('rejects empty string', () => {
    expect(isValidNpi('')).toBe(false);
  });
});

describe('buildPrescriberDirectory', () => {
  it('collapses three formats of the same NPI into one entry', () => {
    const out = buildPrescriberDirectory([
      { name: 'Jane Smith, MD', npi: VALID_A, source: 'manual', medicationIds: ['m1'] },
      { name: 'Smith, Jane A', npi: VALID_A, source: 'pharmacy', medicationIds: ['m2'] },
      { name: 'Dr. Jane Smith', npi: VALID_A, source: 'ehr', medicationIds: ['m3'] },
    ]);
    expect(out.prescribers).toHaveLength(1);
    const p = out.prescribers[0]!;
    expect(p.npi).toBe(VALID_A);
    expect(p.npiValid).toBe(true);
    expect(p.sources).toEqual(['ehr', 'manual', 'pharmacy']);
    expect(p.medicationIds).toEqual(['m1', 'm2', 'm3']);
    expect(p.recordCount).toBe(3);
    // The most common display variant wins; the others land in aliases.
    expect(p.aliases.length).toBeGreaterThan(0);
  });

  it('rejects empty names', () => {
    const out = buildPrescriberDirectory([
      { name: '' },
      { name: '   ' },
      { name: 'MD, PhD' }, // pure suffixes -> nothing left
      { name: 'Jane Smith, MD', npi: VALID_A },
    ]);
    expect(out.prescribers).toHaveLength(1);
    expect(out.rejected).toHaveLength(3);
    expect(out.rejected[0]?.reason).toBe('empty-or-unparseable-name');
  });

  it('absorbs an NPI-less record into an NPI bucket when names match', () => {
    const out = buildPrescriberDirectory([
      { name: 'Jane Smith, MD', npi: VALID_A, medicationIds: ['m1'] },
      { name: 'Smith, Jane', medicationIds: ['m2'] }, // no NPI but same person
    ]);
    expect(out.prescribers).toHaveLength(1);
    expect(out.prescribers[0]?.medicationIds).toEqual(['m1', 'm2']);
    expect(out.prescribers[0]?.recordCount).toBe(2);
  });

  it('keeps NPI-less records separate when collapseByName=false', () => {
    const out = buildPrescriberDirectory(
      [
        { name: 'Jane Smith, MD', npi: VALID_A, medicationIds: ['m1'] },
        { name: 'Smith, Jane', medicationIds: ['m2'] },
      ],
      { collapseByName: false },
    );
    expect(out.prescribers).toHaveLength(2);
  });

  it('does NOT absorb when specialties disagree', () => {
    const out = buildPrescriberDirectory([
      { name: 'Jane Smith', npi: VALID_A, specialty: 'cardiology', medicationIds: ['m1'] },
      { name: 'Jane Smith', specialty: 'dermatology', medicationIds: ['m2'] },
    ]);
    // Same canonical name but different specialty: stays separate.
    expect(out.prescribers).toHaveLength(2);
  });

  it('absorbs when specialty matches', () => {
    const out = buildPrescriberDirectory([
      { name: 'Jane Smith', npi: VALID_A, specialty: 'Cardiology', medicationIds: ['m1'] },
      { name: 'Smith, Jane', specialty: 'cardiology', medicationIds: ['m2'] },
    ]);
    expect(out.prescribers).toHaveLength(1);
    expect(out.prescribers[0]?.specialty).toBe('cardiology');
  });

  it('flags invalid NPI but still dedupes by it', () => {
    const out = buildPrescriberDirectory([
      { name: 'Jane Smith', npi: INVALID_NPI, medicationIds: ['m1'] },
      { name: 'Jane Smith', npi: INVALID_NPI, medicationIds: ['m2'] },
    ]);
    expect(out.prescribers).toHaveLength(1);
    expect(out.prescribers[0]?.npiValid).toBe(false);
    expect(out.prescribers[0]?.medicationIds).toEqual(['m1', 'm2']);
  });

  it('separates two distinct doctors with different NPIs', () => {
    const out = buildPrescriberDirectory([
      { name: 'Jane Smith', npi: VALID_A, medicationIds: ['m1'] },
      { name: 'John Doe', npi: VALID_B, medicationIds: ['m2'] },
    ]);
    expect(out.prescribers).toHaveLength(2);
  });

  it('strips honorifics + degree suffixes from display names', () => {
    const out = buildPrescriberDirectory([
      { name: 'Dr. Jane M. Smith, M.D., FACC', npi: VALID_A, medicationIds: ['m1'] },
    ]);
    expect(out.prescribers[0]?.displayName).toBe('Smith, Jane M.');
    expect(out.prescribers[0]?.canonicalKey).toBe('smith|j');
  });

  it('handles single-word names (e.g. service prescribers)', () => {
    const out = buildPrescriberDirectory([
      { name: 'HospitalPharmacy', medicationIds: ['m1'] },
    ]);
    expect(out.prescribers).toHaveLength(1);
    expect(out.prescribers[0]?.displayName).toBe('Hospitalpharmacy');
  });

  it('builds byMedication mapping correctly', () => {
    const out = buildPrescriberDirectory([
      { name: 'Smith, Jane', npi: VALID_A, medicationIds: ['m1', 'm2'] },
      { name: 'Doe, John', npi: VALID_B, medicationIds: ['m3'] },
    ]);
    expect(out.byMedication['m1']).toBe(`npi:${VALID_A}`);
    expect(out.byMedication['m3']).toBe(`npi:${VALID_B}`);
  });

  it('sorts output by display name', () => {
    const out = buildPrescriberDirectory([
      { name: 'Zoe Williams', npi: makeValidNpi('167854573') },
      { name: 'Jane Smith', npi: VALID_A },
      { name: 'Alice Brown', npi: makeValidNpi('167854574') },
    ]);
    expect(out.prescribers.map((p) => p.displayName)).toEqual([
      'Brown, Alice',
      'Smith, Jane',
      'Williams, Zoe',
    ]);
  });

  it('handles record with only honorific tokens gracefully', () => {
    const out = buildPrescriberDirectory([{ name: 'Dr. ' }]);
    expect(out.rejected).toHaveLength(1);
  });

  it('most-common display variant becomes canonical, others go to aliases', () => {
    const out = buildPrescriberDirectory([
      { name: 'Jane Smith', npi: VALID_A },
      { name: 'Jane Smith', npi: VALID_A },
      { name: 'Smith, Jane', npi: VALID_A },
    ]);
    const p = out.prescribers[0]!;
    expect(p.displayName).toBe('Smith, Jane'); // "Jane Smith" parses to "Smith, Jane" canonical
    // Aliases are any OTHER variants observed.
    expect(p.recordCount).toBe(3);
  });

  it('strips parenthesised specialty hints from the name', () => {
    const out = buildPrescriberDirectory([
      { name: 'Jane Smith (cardiology)', npi: VALID_A },
      { name: 'Jane Smith', npi: VALID_A },
    ]);
    expect(out.prescribers).toHaveLength(1);
  });
});

describe('prescriberForMedication', () => {
  it('returns the canonical prescriber for a known medication', () => {
    const directory = buildPrescriberDirectory([
      { name: 'Jane Smith', npi: VALID_A, medicationIds: ['m1'] },
    ]);
    expect(prescriberForMedication(directory, 'm1')?.displayName).toBe('Smith, Jane');
  });
  it('returns undefined for an unknown medication', () => {
    const directory = buildPrescriberDirectory([
      { name: 'Jane Smith', npi: VALID_A, medicationIds: ['m1'] },
    ]);
    expect(prescriberForMedication(directory, 'm-missing')).toBeUndefined();
  });
});

describe('topPrescribers', () => {
  it('ranks prescribers by medication count', () => {
    const directory = buildPrescriberDirectory([
      { name: 'Jane Smith', npi: VALID_A, medicationIds: ['m1', 'm2', 'm3'] },
      { name: 'John Doe', npi: VALID_B, medicationIds: ['m4'] },
    ]);
    const top = topPrescribers(directory, 4, 5);
    expect(top[0]?.prescriber.displayName).toBe('Smith, Jane');
    expect(top[0]?.share).toBeCloseTo(0.75);
    expect(top[0]?.headline).toBe('Smith, Jane manages 3 of 4 medications.');
    expect(top[1]?.headline).toBe('Doe, John manages 1 of 4 medications.');
  });
  it('skips prescribers with zero medications', () => {
    const directory = buildPrescriberDirectory([
      { name: 'Jane Smith', npi: VALID_A, medicationIds: ['m1'] },
      { name: 'John Doe', npi: VALID_B }, // no meds
    ]);
    const top = topPrescribers(directory, 1);
    expect(top).toHaveLength(1);
  });
  it('caps at limit', () => {
    const directory = buildPrescriberDirectory([
      { name: 'A A', npi: makeValidNpi('167854566'), medicationIds: ['m1'] },
      { name: 'B B', npi: makeValidNpi('167854574'), medicationIds: ['m2'] },
      { name: 'C C', npi: makeValidNpi('167854582'), medicationIds: ['m3'] },
      { name: 'D D', npi: makeValidNpi('167854590'), medicationIds: ['m4'] },
    ]);
    const top = topPrescribers(directory, 4, 2);
    expect(top).toHaveLength(2);
  });
  it('singular when totalMedications=1', () => {
    const directory = buildPrescriberDirectory([
      { name: 'Jane Smith', npi: VALID_A, medicationIds: ['m1'] },
    ]);
    const top = topPrescribers(directory, 1);
    expect(top[0]?.headline).toBe('Smith, Jane manages 1 of 1 medication.');
  });
});
