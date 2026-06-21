import { describe, it, expect } from 'vitest';
import {
  parseSig,
  normalizeSig,
  describeParsedSig,
} from '../src/dose-instruction-parser';

describe('normalizeSig', () => {
  it('lowercases, strips terminal punctuation, collapses spaces', () => {
    expect(normalizeSig('1 TAB PO,  QID.')).toBe('1 tab po qid');
    expect(normalizeSig('  by   MOUTH  ')).toBe('by mouth');
  });

  it('handles empty input', () => {
    expect(normalizeSig('')).toBe('');
    expect(normalizeSig('   ')).toBe('');
  });
});

describe('parseSig', () => {
  it('parses the canonical "1 tab po qid prn pain"', () => {
    const p = parseSig('1 tab po qid prn pain');
    expect(p.amountPerDose).toBe(1);
    expect(p.amountUnit).toBe('tab');
    expect(p.route).toBe('po');
    expect(p.dosesPerDay).toBe(4);
    expect(p.asNeeded).toBe(true);
    expect(p.reason).toBe('pain');
    expect(p.scheduleSuggestion?.kind).toBe('asNeeded');
    expect(p.confidence).toBeGreaterThanOrEqual(0.9);
    expect(p.unparsed).toEqual([]);
  });

  it('parses "2 capsules by mouth twice daily with food"', () => {
    const p = parseSig('2 capsules by mouth twice daily with food');
    expect(p.amountPerDose).toBe(2);
    expect(p.amountUnit).toBe('cap');
    expect(p.route).toBe('po');
    expect(p.dosesPerDay).toBe(2);
    expect(p.food).toBe('with-food');
    expect(p.scheduleSuggestion?.kind).toBe('daily');
    expect(p.scheduleSuggestion?.times).toEqual(['08:00', '20:00']);
  });

  it('parses interval dosing q4h', () => {
    const p = parseSig('1 tab po q4h');
    expect(p.intervalHours).toBe(4);
    expect(p.dosesPerDay).toBe(6);
    expect(p.scheduleSuggestion?.kind).toBe('interval');
    expect(p.scheduleSuggestion?.intervalHours).toBe(4);
  });

  it('parses qhs as bedtime daily', () => {
    const p = parseSig('1 tab po qhs');
    expect(p.timing).toContain('bedtime');
    expect(p.scheduleSuggestion?.kind).toBe('daily');
    expect(p.scheduleSuggestion?.times).toEqual(['22:00']);
    expect(p.dosesPerDay).toBe(1);
  });

  it('parses qam as morning', () => {
    const p = parseSig('1 tab qam');
    expect(p.timing).toContain('morning');
    expect(p.scheduleSuggestion?.times).toEqual(['08:00']);
  });

  it('parses subcutaneous insulin units', () => {
    const p = parseSig('30 units sc qhs');
    expect(p.amountPerDose).toBe(30);
    expect(p.amountUnit).toBe('unit');
    expect(p.route).toBe('sc');
    expect(p.timing).toContain('bedtime');
  });

  it('handles tid alongside before-meal timing', () => {
    const p = parseSig('1 tab po tid ac');
    expect(p.dosesPerDay).toBe(3);
    expect(p.food).toBe('before-meal');
    expect(p.timing).toContain('before-meal');
  });

  it('treats prn without frequency as as-needed schedule', () => {
    const p = parseSig('1 tab po prn nausea');
    expect(p.asNeeded).toBe(true);
    expect(p.reason).toBe('nausea');
    expect(p.scheduleSuggestion?.kind).toBe('asNeeded');
    expect(p.dosesPerDay).toBeNull();
  });

  it('marks low confidence on garbled input', () => {
    const p = parseSig('squiggle blorp foo');
    expect(p.confidence).toBeLessThan(0.5);
    expect(p.unparsed.length).toBeGreaterThan(0);
    expect(p.scheduleSuggestion).toBeNull();
  });

  it('parses word numbers like "one tablet"', () => {
    const p = parseSig('one tablet po daily');
    expect(p.amountPerDose).toBe(1);
    expect(p.amountUnit).toBe('tab');
    expect(p.dosesPerDay).toBe(1);
  });

  it('parses "half tablet" as 0.5', () => {
    const p = parseSig('half tablet po bid');
    expect(p.amountPerDose).toBe(0.5);
    expect(p.dosesPerDay).toBe(2);
  });

  it('parses inhaled puffs', () => {
    const p = parseSig('2 puffs inhaled bid');
    expect(p.amountPerDose).toBe(2);
    expect(p.amountUnit).toBe('puff');
    expect(p.route).toBe('inhaled');
    expect(p.dosesPerDay).toBe(2);
  });

  it('parses ophthalmic drops', () => {
    const p = parseSig('1 drop in the eye bid');
    expect(p.amountPerDose).toBe(1);
    expect(p.amountUnit).toBe('drop');
    expect(p.route).toBe('ophthalmic');
  });

  it('parses topical cream as needed', () => {
    const p = parseSig('apply topically prn rash');
    expect(p.route).toBe('topical');
    expect(p.asNeeded).toBe(true);
    expect(p.reason).toBe('rash');
  });

  it('handles "with meals" identically to "with food"', () => {
    const p = parseSig('1 tab po tid with meals');
    expect(p.food).toBe('with-food');
  });

  it('marks "without food" / "on an empty stomach"', () => {
    const p1 = parseSig('1 tab po qd without food');
    expect(p1.food).toBe('without-food');
    const p2 = parseSig('1 tab po qd on an empty stomach');
    expect(p2.food).toBe('without-food');
  });

  it('lowers confidence when route is missing', () => {
    const a = parseSig('1 tab qd');
    const b = parseSig('1 tab po qd');
    expect(a.confidence).toBeLessThan(b.confidence);
  });

  it('lowers confidence when dose amount is missing', () => {
    const a = parseSig('po qd');
    const b = parseSig('1 tab po qd');
    expect(a.confidence).toBeLessThan(b.confidence);
  });

  it('preserves the raw input verbatim', () => {
    const p = parseSig('  1 TAB PO,  QID. ');
    expect(p.raw).toBe('  1 TAB PO,  QID. ');
    expect(p.normalized).toBe('1 tab po qid');
  });

  it('returns a zero-confidence empty result on empty input', () => {
    const p = parseSig('');
    expect(p.confidence).toBe(0);
    expect(p.scheduleSuggestion).toBeNull();
    expect(p.amountPerDose).toBeNull();
  });

  it('does not flag noise words like "take" as unparsed', () => {
    const p = parseSig('take 1 tab po bid');
    expect(p.unparsed).toEqual([]);
  });

  it('parses q12h interval to dosesPerDay=2', () => {
    const p = parseSig('1 tab po q12h');
    expect(p.intervalHours).toBe(12);
    expect(p.dosesPerDay).toBe(2);
  });

  it('overrides default frequency times when timing tags match dose count', () => {
    // "tid in the morning and at noon and bedtime" picks the timing
    // tags' times instead of the default tid grid.
    const p = parseSig('1 tab po tid in the morning at noon bedtime');
    expect(p.scheduleSuggestion?.kind).toBe('daily');
    expect(p.scheduleSuggestion?.times).toEqual(['08:00', '12:00', '22:00']);
  });

  it('extracts reason "for nausea"', () => {
    const p = parseSig('1 tab po q6h prn for nausea');
    expect(p.reason).toBe('nausea');
    expect(p.asNeeded).toBe(true);
  });

  it('preserves frequency tokens consumed (no false unparsed)', () => {
    const p = parseSig('1 tab po every day');
    expect(p.dosesPerDay).toBe(1);
    expect(p.unparsed).toEqual([]);
  });

  it('rejects bare-number unit ambiguity but still records amount', () => {
    const p = parseSig('5 po qd');
    expect(p.amountPerDose).toBe(5);
    expect(p.amountUnit).toBeNull();
  });
});

describe('describeParsedSig', () => {
  it('renders a clean round-trip description', () => {
    const p = parseSig('1 tab po qid prn pain');
    const s = describeParsedSig(p);
    expect(s).toMatch(/1 tab/);
    expect(s).toMatch(/by mouth/);
    expect(s).toMatch(/as needed/);
    expect(s).toMatch(/for pain/);
  });

  it('handles empty parse', () => {
    const s = describeParsedSig(parseSig(''));
    expect(s).toBe('Empty instruction.');
  });

  it('renders interval dosing', () => {
    const s = describeParsedSig(parseSig('1 tab po q4h'));
    expect(s).toMatch(/every 4 hours/);
  });

  it('renders frequency labels for common dosesPerDay', () => {
    expect(describeParsedSig(parseSig('1 tab po qd'))).toMatch(/once a day/);
    expect(describeParsedSig(parseSig('1 tab po bid'))).toMatch(/twice a day/);
    expect(describeParsedSig(parseSig('1 tab po tid'))).toMatch(/three times a day/);
  });
});
