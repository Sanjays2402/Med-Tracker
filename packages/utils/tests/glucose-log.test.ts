import { describe, it, expect } from 'vitest';
import {
  classifyGlucose,
  estimateA1c,
  summarizeGlucose,
  type GlucoseReading,
} from '../src/glucose-log';

describe('classifyGlucose default targets', () => {
  it('in-range pre-meal returns in-range', () => {
    expect(
      classifyGlucose({ takenAt: '2026-06-20T07:00:00Z', value: 100, context: 'pre-meal' }),
    ).toBe('in-range');
  });

  it('above pre-meal high returns high', () => {
    expect(
      classifyGlucose({ takenAt: '2026-06-20T07:00:00Z', value: 140, context: 'fasting' }),
    ).toBe('high');
  });

  it('post-meal stays in-range up to 180', () => {
    expect(
      classifyGlucose({ takenAt: '2026-06-20T13:00:00Z', value: 170, context: 'post-meal' }),
    ).toBe('in-range');
    expect(
      classifyGlucose({ takenAt: '2026-06-20T13:00:00Z', value: 190, context: 'post-meal' }),
    ).toBe('high');
  });

  it('flags hypoglycemia below 70', () => {
    expect(
      classifyGlucose({ takenAt: '2026-06-20T07:00:00Z', value: 65, context: 'pre-meal' }),
    ).toBe('hypo');
  });

  it('flags severe hypoglycemia below 54', () => {
    expect(
      classifyGlucose({ takenAt: '2026-06-20T07:00:00Z', value: 50, context: 'pre-meal' }),
    ).toBe('severe-hypo');
  });

  it('flags severe hyperglycemia >= 250', () => {
    expect(
      classifyGlucose({ takenAt: '2026-06-20T13:00:00Z', value: 280, context: 'post-meal' }),
    ).toBe('severe-hyper');
  });

  it('rejects non-positive values', () => {
    expect(() =>
      classifyGlucose({ takenAt: '2026-06-20T13:00:00Z', value: 0, context: 'pre-meal' }),
    ).toThrow();
  });
});

describe('classifyGlucose mmol/L units', () => {
  it('converts mmol/L correctly (7 mmol/L = 126 mg/dL)', () => {
    expect(
      classifyGlucose(
        { takenAt: '2026-06-20T07:00:00Z', value: 7, context: 'fasting' },
        { units: 'mmol/L' },
      ),
    ).toBe('in-range');
    expect(
      classifyGlucose(
        { takenAt: '2026-06-20T07:00:00Z', value: 8, context: 'fasting' },
        { units: 'mmol/L' },
      ),
    ).toBe('high'); // 144 mg/dL
  });
});

describe('classifyGlucose with custom targets', () => {
  it('respects tighter targets for pregnancy', () => {
    const r: GlucoseReading = { takenAt: '2026-06-20T13:00:00Z', value: 130, context: 'post-meal' };
    // Default 180 -> in-range; pregnancy 120 -> high.
    expect(classifyGlucose(r, { targets: { postMealHigh: 120 } })).toBe('high');
  });
});

describe('estimateA1c', () => {
  it('returns ADAG formula result', () => {
    // Mean 154 -> A1C ~ 7.0%.
    expect(estimateA1c(154)).toBeCloseTo(7.0, 1);
    // Mean 183 -> A1C ~ 8.0%.
    expect(estimateA1c(183)).toBeCloseTo(8.0, 1);
  });
});

describe('summarizeGlucose', () => {
  const at = (d: number, h = 8): string => {
    const date = new Date('2026-06-15T00:00:00');
    date.setDate(date.getDate() + d);
    date.setHours(h, 0, 0, 0);
    return date.toISOString();
  };

  it('returns zero summary on empty', () => {
    const s = summarizeGlucose([]);
    expect(s.readings).toBe(0);
    expect(s.message).toMatch(/No readings/);
  });

  it('counts in-range vs hypo/hyper correctly', () => {
    const s = summarizeGlucose(
      [
        { takenAt: at(0), value: 100, context: 'fasting' },
        { takenAt: at(0, 14), value: 150, context: 'post-meal' },
        { takenAt: at(1), value: 60, context: 'pre-meal' }, // hypo
        { takenAt: at(2), value: 200, context: 'pre-meal' }, // high
        { takenAt: at(3), value: 260, context: 'post-meal' }, // severe-hyper
      ],
      { now: new Date(at(3)) },
    );
    expect(s.readings).toBe(5);
    expect(s.inRange).toBe(2);
    expect(s.hypo).toBe(1);
    expect(s.high).toBe(2); // 200 + 260 both count toward high
    expect(s.severeHyper).toBe(1);
    expect(s.inRangePct).toBe(40);
  });

  it('flags severe hypo in message', () => {
    const s = summarizeGlucose(
      [{ takenAt: at(0), value: 45, context: 'random' }],
      { now: new Date(at(0)) },
    );
    expect(s.severeHypo).toBe(1);
    expect(s.message).toMatch(/severe hypoglycemia/);
  });

  it('includes estimatedA1c only with >= 14 readings', () => {
    // 5 readings -> no A1C.
    const few = summarizeGlucose(
      Array.from({ length: 5 }, (_, i) => ({
        takenAt: at(i),
        value: 130,
        context: 'fasting' as const,
      })),
      { now: new Date(at(4)) },
    );
    expect(few.estimatedA1cPercent).toBeUndefined();

    // 14 readings -> A1C present.
    const many = summarizeGlucose(
      Array.from({ length: 14 }, (_, i) => ({
        takenAt: at(i, i % 24),
        value: 154,
        context: 'fasting' as const,
      })),
      { now: new Date(at(13)) },
    );
    expect(many.estimatedA1cPercent).toBeCloseTo(7.0, 1);
  });

  it('honors window limits', () => {
    const s = summarizeGlucose(
      [
        { takenAt: at(-30), value: 50, context: 'random' }, // outside 14-day window
        { takenAt: at(0), value: 110, context: 'fasting' },
      ],
      { windowDays: 14, now: new Date(at(0)) },
    );
    expect(s.readings).toBe(1);
    expect(s.severeHypo).toBe(0);
  });

  it('breaks down by context', () => {
    const s = summarizeGlucose(
      [
        { takenAt: at(0), value: 100, context: 'fasting' },
        { takenAt: at(0, 7), value: 110, context: 'pre-meal' },
        { takenAt: at(0, 14), value: 150, context: 'post-meal' },
        { takenAt: at(0, 22), value: 120, context: 'bedtime' },
      ],
      { now: new Date(at(0, 22)) },
    );
    expect(s.byContext.fasting).toBe(1);
    expect(s.byContext['pre-meal']).toBe(1);
    expect(s.byContext['post-meal']).toBe(1);
    expect(s.byContext.bedtime).toBe(1);
  });
});
