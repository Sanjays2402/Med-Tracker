import { describe, it, expect } from 'vitest';
import {
  classifyBp,
  classifyPulse,
  classifyReading,
  summarizeBp,
  type BpReading,
} from '../src/bp-log';

describe('classifyBp', () => {
  it('returns normal for low-normal readings', () => {
    expect(classifyBp({ takenAt: '2026-06-20T08:00:00Z', systolic: 110, diastolic: 70 })).toBe('normal');
  });

  it('returns elevated for SBP 120-129 DBP < 80', () => {
    expect(classifyBp({ takenAt: '2026-06-20T08:00:00Z', systolic: 125, diastolic: 78 })).toBe('elevated');
  });

  it('returns stage-1 for SBP 130-139 OR DBP 80-89', () => {
    expect(classifyBp({ takenAt: '2026-06-20T08:00:00Z', systolic: 135, diastolic: 78 })).toBe('stage-1');
    expect(classifyBp({ takenAt: '2026-06-20T08:00:00Z', systolic: 118, diastolic: 85 })).toBe('stage-1');
  });

  it('returns stage-2 for SBP >= 140 OR DBP >= 90', () => {
    expect(classifyBp({ takenAt: '2026-06-20T08:00:00Z', systolic: 145, diastolic: 88 })).toBe('stage-2');
    expect(classifyBp({ takenAt: '2026-06-20T08:00:00Z', systolic: 120, diastolic: 92 })).toBe('stage-2');
  });

  it('returns crisis for SBP > 180 OR DBP > 120', () => {
    expect(classifyBp({ takenAt: '2026-06-20T08:00:00Z', systolic: 185, diastolic: 100 })).toBe('crisis');
    expect(classifyBp({ takenAt: '2026-06-20T08:00:00Z', systolic: 140, diastolic: 125 })).toBe('crisis');
  });

  it('returns low for SBP < 90 OR DBP < 60', () => {
    expect(classifyBp({ takenAt: '2026-06-20T08:00:00Z', systolic: 85, diastolic: 55 })).toBe('low');
    expect(classifyBp({ takenAt: '2026-06-20T08:00:00Z', systolic: 110, diastolic: 55 })).toBe('low');
  });

  it('picks the higher of split categories', () => {
    // SBP normal (118) but DBP stage-2 (95) -> stage-2.
    expect(classifyBp({ takenAt: '2026-06-20T08:00:00Z', systolic: 118, diastolic: 95 })).toBe('stage-2');
  });

  it('throws on non-positive inputs', () => {
    expect(() => classifyBp({ takenAt: '2026-06-20T08:00:00Z', systolic: 0, diastolic: 80 })).toThrow();
    expect(() => classifyBp({ takenAt: '2026-06-20T08:00:00Z', systolic: 120, diastolic: -1 })).toThrow();
  });
});

describe('classifyPulse', () => {
  it('flags bradycardia < 60', () => {
    expect(classifyPulse(50)).toBe('bradycardia');
  });
  it('flags tachycardia > 100', () => {
    expect(classifyPulse(105)).toBe('tachycardia');
  });
  it('returns normal in [60, 100]', () => {
    expect(classifyPulse(72)).toBe('normal');
    expect(classifyPulse(60)).toBe('normal');
    expect(classifyPulse(100)).toBe('normal');
  });
});

describe('classifyReading', () => {
  it('adds pulse classification when pulse present', () => {
    const r = classifyReading({
      takenAt: '2026-06-20T08:00:00Z', systolic: 120, diastolic: 75, pulse: 110,
    });
    expect(r.category).toBe('elevated');
    expect(r.pulseClassification).toBe('tachycardia');
  });

  it('omits pulse classification when no pulse', () => {
    const r = classifyReading({
      takenAt: '2026-06-20T08:00:00Z', systolic: 120, diastolic: 75,
    });
    expect(r.pulseClassification).toBeUndefined();
  });
});

describe('summarizeBp', () => {
  const baseDate = '2026-06-15';
  const at = (day: number, h = 8): string => {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + day);
    d.setHours(h, 0, 0, 0);
    return d.toISOString();
  };

  it('returns zero summary for empty input', () => {
    const s = summarizeBp([]);
    expect(s.readings).toBe(0);
    expect(s.message).toMatch(/No readings/);
  });

  it('computes means and medians across the window', () => {
    const r: BpReading[] = [
      { takenAt: at(0), systolic: 120, diastolic: 80, pulse: 70 },
      { takenAt: at(1), systolic: 130, diastolic: 85, pulse: 75 },
      { takenAt: at(2), systolic: 140, diastolic: 90, pulse: 80 },
    ];
    const s = summarizeBp(r, { now: new Date(at(2)) });
    expect(s.readings).toBe(3);
    expect(s.meanSystolic).toBe(130);
    expect(s.meanDiastolic).toBe(85);
    expect(s.medianSystolic).toBe(130);
    expect(s.medianDiastolic).toBe(85);
    expect(s.meanPulse).toBe(75);
    expect(s.worstCategory).toBe('stage-2');
  });

  it('builds correct distribution', () => {
    const r: BpReading[] = [
      { takenAt: at(0), systolic: 115, diastolic: 75 }, // normal
      { takenAt: at(1), systolic: 125, diastolic: 78 }, // elevated
      { takenAt: at(2), systolic: 135, diastolic: 85 }, // stage-1
      { takenAt: at(3), systolic: 145, diastolic: 92 }, // stage-2
    ];
    const s = summarizeBp(r, { now: new Date(at(3)) });
    expect(s.distribution.normal).toBe(1);
    expect(s.distribution.elevated).toBe(1);
    expect(s.distribution['stage-1']).toBe(1);
    expect(s.distribution['stage-2']).toBe(1);
    expect(s.distribution.crisis).toBe(0);
  });

  it('flags crisis in message', () => {
    const r: BpReading[] = [
      { takenAt: at(0), systolic: 120, diastolic: 80 },
      { takenAt: at(1), systolic: 200, diastolic: 95 },
    ];
    const s = summarizeBp(r, { now: new Date(at(1)) });
    expect(s.worstCategory).toBe('crisis');
    expect(s.message).toMatch(/contact a clinician/);
  });

  it('limits to the configured window', () => {
    const r: BpReading[] = [
      // 60 days back, outside the default 30-day window.
      { takenAt: at(-60), systolic: 200, diastolic: 110 },
      { takenAt: at(0), systolic: 118, diastolic: 75 },
    ];
    const s = summarizeBp(r, { windowDays: 30, now: new Date(at(0)) });
    expect(s.readings).toBe(1);
    expect(s.worstCategory).toBe('normal');
  });

  it('computes 7-day rolling at most recent reading', () => {
    const r: BpReading[] = [
      { takenAt: at(0), systolic: 120, diastolic: 80 },
      { takenAt: at(3), systolic: 130, diastolic: 85 },
      { takenAt: at(6), systolic: 140, diastolic: 90 },
    ];
    const s = summarizeBp(r, { now: new Date(at(6)) });
    expect(s.rolling7Systolic).toBe(130);
    expect(s.rolling7Diastolic).toBe(85);
  });
});
