import { describe, it, expect } from 'vitest';
import {
  medAdherencePct,
  medAdherenceTone,
  findMedRow,
  buildMedAdherence,
  type MedAdherenceRowLike,
} from '../lib/med-adherence';

const ROWS: MedAdherenceRowLike[] = [
  { medicationId: 'a', medicationName: 'Lisinopril', taken: 28, scheduled: 30 },
  { medicationId: 'b', medicationName: 'Metformin', taken: 40, scheduled: 60 },
  { medicationId: 'c', medicationName: 'New med', taken: 0, scheduled: 0 },
];

describe('medAdherencePct', () => {
  it('computes a rounded integer percentage', () => {
    expect(medAdherencePct(28, 30)).toBe(93);
    expect(medAdherencePct(1, 3)).toBe(33);
  });
  it('is 0 when nothing was scheduled', () => {
    expect(medAdherencePct(0, 0)).toBe(0);
    expect(medAdherencePct(5, 0)).toBe(0);
  });
  it('clamps a double-logged dose to 100', () => {
    expect(medAdherencePct(11, 10)).toBe(100);
  });
  it('floors negatives to 0', () => {
    expect(medAdherencePct(-2, 10)).toBe(0);
  });
});

describe('medAdherenceTone', () => {
  it('matches the shared ramp', () => {
    expect(medAdherenceTone(95)).toBe('ok');
    expect(medAdherenceTone(90)).toBe('ok');
    expect(medAdherenceTone(89)).toBe('warn');
    expect(medAdherenceTone(70)).toBe('warn');
    expect(medAdherenceTone(69)).toBe('danger');
    expect(medAdherenceTone(0)).toBe('danger');
  });
});

describe('findMedRow', () => {
  it('returns the matching row', () => {
    expect(findMedRow(ROWS, 'b')?.medicationName).toBe('Metformin');
  });
  it('returns null when absent or list is nullish', () => {
    expect(findMedRow(ROWS, 'zzz')).toBeNull();
    expect(findMedRow(null, 'a')).toBeNull();
    expect(findMedRow(undefined, 'a')).toBeNull();
  });
});

describe('buildMedAdherence', () => {
  it('builds a full view for a med with scheduled doses', () => {
    const v = buildMedAdherence(findMedRow(ROWS, 'a'), 30);
    expect(v).toMatchObject({
      hasData: true,
      pct: 93,
      tone: 'ok',
      taken: 28,
      scheduled: 30,
      windowDays: 30,
      caption: '28 of 30 doses',
      windowLabel: 'last 30 days',
    });
  });

  it('tones a mid-adherence med as warn', () => {
    const v = buildMedAdherence(findMedRow(ROWS, 'b'), 60);
    expect(v.pct).toBe(67);
    expect(v.tone).toBe('danger'); // 67 < 70
    expect(v.windowLabel).toBe('last 60 days');
  });

  it('reports hasData=false for a med with nothing scheduled', () => {
    const v = buildMedAdherence(findMedRow(ROWS, 'c'), 30);
    expect(v.hasData).toBe(false);
    expect(v.pct).toBe(0);
    expect(v.caption).toBe('no doses scheduled');
  });

  it('reports hasData=false for a null row', () => {
    const v = buildMedAdherence(null, 30);
    expect(v.hasData).toBe(false);
    expect(v.scheduled).toBe(0);
    expect(v.caption).toBe('no doses scheduled');
  });

  it('clamps taken to the scheduled total', () => {
    const v = buildMedAdherence({ medicationId: 'x', medicationName: 'X', taken: 50, scheduled: 30 }, 30);
    expect(v.taken).toBe(30);
    expect(v.pct).toBe(100);
    expect(v.tone).toBe('ok');
  });

  it('defaults an invalid window to 30 days', () => {
    expect(buildMedAdherence(findMedRow(ROWS, 'a'), 0).windowDays).toBe(30);
    expect(buildMedAdherence(findMedRow(ROWS, 'a'), -5).windowDays).toBe(30);
    expect(buildMedAdherence(findMedRow(ROWS, 'a'), NaN).windowDays).toBe(30);
  });

  it('singularises a one-day window label', () => {
    expect(buildMedAdherence(findMedRow(ROWS, 'a'), 1).windowLabel).toBe('last 1 day');
  });

  it('preserves a partial taken count on a no-schedule row', () => {
    const v = buildMedAdherence({ medicationId: 'y', medicationName: 'Y', taken: 3, scheduled: 0 }, 30);
    expect(v.hasData).toBe(false);
    expect(v.taken).toBe(3);
    expect(v.scheduled).toBe(0);
  });
});
