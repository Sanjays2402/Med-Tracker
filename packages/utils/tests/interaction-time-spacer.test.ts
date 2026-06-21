import { describe, it, expect } from 'vitest';
import {
  findTimingRules,
  detectSpacingConflicts,
  summarizeSpacingCheck,
  TIMING_RULES,
  type MedicationScheduleInput,
} from '../src/interaction-time-spacer';
import type { Drug, Schedule } from '@med/types';

function drug(id: string, generic: string, klass: string, extras: Partial<Drug> = {}): Drug {
  return {
    id,
    generic,
    brand: generic,
    class: klass,
    rxnormSample: 0,
    indications: [],
    dosages: [],
    routes: [],
    frequencies: [],
    interactions: [],
    warnings: [],
    pregnancyCategory: 'B',
    storage: '',
    sourceNote: '',
    ...extras,
  };
}

function schedule(times: string[], extras: Partial<Schedule> = {}): Schedule {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    medicationId: '00000000-0000-0000-0000-000000000001',
    kind: 'daily',
    times,
    daysOfWeek: undefined,
    intervalHours: undefined,
    cronExpression: undefined,
    startsAt: '2026-01-01T00:00:00Z',
    endsAt: null,
    enabled: true,
    ...extras,
  };
}

const LEVOTHYROXINE = drug('d-levo', 'levothyroxine', 'thyroid hormone');
const CALCIUM = drug('d-ca', 'calcium carbonate', 'mineral');
const FERROUS_SULFATE = drug('d-fe', 'ferrous sulfate', 'iron supplement');
const DOXYCYCLINE = drug('d-doxy', 'doxycycline', 'tetracycline');
const CIPROFLOXACIN = drug('d-cipro', 'ciprofloxacin', 'fluoroquinolone');
const ALENDRONATE = drug('d-alendro', 'alendronate', 'bisphosphonate');
const FOOD = drug('d-food', 'food marker', 'food');
const METFORMIN = drug('d-met', 'metformin', 'biguanide');
const LISINOPRIL = drug('d-lis', 'lisinopril', 'ace inhibitor');

describe('findTimingRules', () => {
  it('detects levothyroxine + calcium with 240 min gap', () => {
    const rules = findTimingRules(LEVOTHYROXINE, CALCIUM);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.rule).toBe('levothyroxine-cation');
    expect(rules[0]!.minGapMinutes).toBe(240);
    expect(rules[0]!.gapDirection).toBe('a-before-b');
    expect(rules[0]!.primaryDrugId).toBe('d-levo');
  });

  it('detects bisphosphonate + food rule with primary = bisphosphonate', () => {
    const rules = findTimingRules(ALENDRONATE, FOOD);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.rule).toBe('bisphosphonate-food');
    expect(rules[0]!.primaryDrugId).toBe('d-alendro');
  });

  it('detects doxycycline + iron (symmetric)', () => {
    const rules = findTimingRules(DOXYCYCLINE, FERROUS_SULFATE);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.rule).toBe('tetracycline-cation');
    expect(rules[0]!.gapDirection).toBe('symmetric');
    expect(rules[0]!.primaryDrugId).toBeUndefined();
  });

  it('detects fluoroquinolone + calcium with directional gap', () => {
    const rules = findTimingRules(CIPROFLOXACIN, CALCIUM);
    expect(rules[0]!.rule).toBe('fluoroquinolone-cation');
    expect(rules[0]!.gapDirection).toBe('a-before-b');
    expect(rules[0]!.primaryDrugId).toBe('d-cipro');
  });

  it('returns empty array when no rule matches', () => {
    expect(findTimingRules(METFORMIN, LISINOPRIL)).toEqual([]);
  });

  it('order is independent: A,B and B,A produce the same rules', () => {
    const ab = findTimingRules(LEVOTHYROXINE, CALCIUM);
    const ba = findTimingRules(CALCIUM, LEVOTHYROXINE);
    expect(ab.map((r) => r.rule)).toEqual(ba.map((r) => r.rule));
  });

  it('sorts by largest gap first when multiple rules match', () => {
    // levothyroxine + iron should fire the levothyroxine-cation rule
    // (240 min). Other rules don't apply.
    const rules = findTimingRules(LEVOTHYROXINE, FERROUS_SULFATE);
    expect(rules[0]!.minGapMinutes).toBe(240);
  });

  it('uses sorted drugIdA / drugIdB regardless of argument order', () => {
    const r = findTimingRules(LEVOTHYROXINE, CALCIUM)[0]!;
    expect([r.drugIdA, r.drugIdB]).toEqual(['d-ca', 'd-levo']);
  });
});

describe('TIMING_RULES export', () => {
  it('exposes a non-empty curated rule list', () => {
    expect(TIMING_RULES.length).toBeGreaterThan(0);
    for (const r of TIMING_RULES) {
      expect(r.minGapMinutes).toBeGreaterThan(0);
      expect(r.a.length).toBeGreaterThan(0);
      expect(r.b.length).toBeGreaterThan(0);
    }
  });
});

describe('detectSpacingConflicts', () => {
  const FROM = new Date(2026, 0, 1);
  const TO = new Date(2026, 0, 1, 23, 59, 59);

  function input(medicationId: string, d: Drug, times: string[]): MedicationScheduleInput {
    return {
      medicationId,
      drug: d,
      schedules: [schedule(times)],
    };
  }

  it('returns empty when no pairs have timing rules', () => {
    const conflicts = detectSpacingConflicts(
      [input('m-met', METFORMIN, ['08:00']), input('m-lis', LISINOPRIL, ['08:00'])],
      { from: FROM, to: TO },
    );
    expect(conflicts).toEqual([]);
  });

  it('flags simultaneous levothyroxine + calcium as major', () => {
    const conflicts = detectSpacingConflicts(
      [input('m-levo', LEVOTHYROXINE, ['08:00']), input('m-ca', CALCIUM, ['08:00'])],
      { from: FROM, to: TO },
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.severity).toBe('major');
    expect(conflicts[0]!.observedGapMinutes).toBe(0);
    expect(conflicts[0]!.requiredGapMinutes).toBe(240);
    expect(conflicts[0]!.rule).toBe('levothyroxine-cation');
  });

  it('flags 3-hour gap as minor (within 75% of the 4h requirement)', () => {
    const conflicts = detectSpacingConflicts(
      [input('m-levo', LEVOTHYROXINE, ['08:00']), input('m-ca', CALCIUM, ['11:00'])],
      { from: FROM, to: TO },
    );
    // 180 min gap, 240 required; ratio 0.75 -> minor (>= 0.75 ratio).
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.severity).toBe('minor');
    expect(conflicts[0]!.observedGapMinutes).toBe(180);
  });

  it('does NOT flag a >4h gap', () => {
    const conflicts = detectSpacingConflicts(
      [input('m-levo', LEVOTHYROXINE, ['08:00']), input('m-ca', CALCIUM, ['13:00'])],
      { from: FROM, to: TO },
    );
    // 300 min > 240 min -> safe.
    expect(conflicts).toEqual([]);
  });

  it('finds the nearest pairing across multiple dose times', () => {
    // Levothyroxine at 08:00. Calcium at 09:00 (60 min) and 14:00 (360 min).
    // The 09:00 calcium is the conflict; the 14:00 is fine.
    const conflicts = detectSpacingConflicts(
      [
        input('m-levo', LEVOTHYROXINE, ['08:00']),
        input('m-ca', CALCIUM, ['09:00', '14:00']),
      ],
      { from: FROM, to: TO },
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.observedGapMinutes).toBe(60);
  });

  it('dedupes when both directional scans flag the same dose pair', () => {
    const conflicts = detectSpacingConflicts(
      [input('m-levo', LEVOTHYROXINE, ['08:00']), input('m-ca', CALCIUM, ['08:00'])],
      { from: FROM, to: TO },
    );
    expect(conflicts).toHaveLength(1);
  });

  it('walks multiple days inside the window', () => {
    const conflicts = detectSpacingConflicts(
      [input('m-levo', LEVOTHYROXINE, ['08:00']), input('m-ca', CALCIUM, ['08:00'])],
      { from: FROM, to: new Date(2026, 0, 3, 23, 59, 59) },
    );
    // Three days, one conflict each.
    expect(conflicts).toHaveLength(3);
  });

  it('skips disabled schedules', () => {
    const conflicts = detectSpacingConflicts(
      [
        {
          medicationId: 'm-levo',
          drug: LEVOTHYROXINE,
          schedules: [schedule(['08:00'], { enabled: false })],
        },
        input('m-ca', CALCIUM, ['08:00']),
      ],
      { from: FROM, to: TO },
    );
    expect(conflicts).toEqual([]);
  });

  it('sorts conflicts by doseAt then by medicationId', () => {
    const conflicts = detectSpacingConflicts(
      [
        input('m-levo', LEVOTHYROXINE, ['08:00', '20:00']),
        input('m-ca', CALCIUM, ['08:00', '20:00']),
      ],
      { from: FROM, to: TO },
    );
    expect(conflicts).toHaveLength(2);
    expect(conflicts[0]!.doseAt < conflicts[1]!.doseAt).toBe(true);
  });

  it('respects custom minorRatio threshold', () => {
    // 60 minute gap, 240 required, ratio 0.25 -> normally major.
    // With minorRatio=0.20, ratio (0.25) >= 0.20 -> minor.
    const conflicts = detectSpacingConflicts(
      [input('m-levo', LEVOTHYROXINE, ['08:00']), input('m-ca', CALCIUM, ['09:00'])],
      { from: FROM, to: TO, minorRatio: 0.2 },
    );
    expect(conflicts[0]!.severity).toBe('minor');
  });

  it('handles tetracycline + iron (symmetric, 120 min)', () => {
    const conflicts = detectSpacingConflicts(
      [input('m-doxy', DOXYCYCLINE, ['08:00']), input('m-fe', FERROUS_SULFATE, ['08:30'])],
      { from: FROM, to: TO },
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.rule).toBe('tetracycline-cation');
    expect(conflicts[0]!.requiredGapMinutes).toBe(120);
  });
});

describe('summarizeSpacingCheck', () => {
  it('reports clean state', () => {
    expect(summarizeSpacingCheck([])).toMatch(/no spacing conflicts/);
  });

  it('reports counts of major and minor', () => {
    const conflicts = detectSpacingConflicts(
      [
        { medicationId: 'm-levo', drug: LEVOTHYROXINE, schedules: [schedule(['08:00', '20:00'])] },
        { medicationId: 'm-ca', drug: CALCIUM, schedules: [schedule(['09:00', '20:00'])] },
      ],
      { from: new Date(2026, 0, 1), to: new Date(2026, 0, 1, 23, 59, 59) },
    );
    // 08:00 levo + 09:00 ca = 60 min (major). 20:00 levo + 20:00 ca = 0 (major). Total 2 major.
    expect(conflicts.length).toBe(2);
    const msg = summarizeSpacingCheck(conflicts);
    expect(msg).toMatch(/2 major/);
  });
});
