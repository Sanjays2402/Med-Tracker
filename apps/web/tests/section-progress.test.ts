import { describe, it, expect } from 'vitest';
import { sectionProgress, sectionProgressLabel, sectionFillTone } from '../lib/section-progress';
import { countDoses, type PartOfDayDose } from '../lib/part-of-day';

/** Build a dose with a given status (time is irrelevant for these counts). */
function dose(status: PartOfDayDose['status']): PartOfDayDose {
  return { scheduledAt: new Date().toISOString(), status };
}

function counts(...statuses: PartOfDayDose['status'][]) {
  return countDoses(statuses.map(dose));
}

describe('sectionProgress', () => {
  it('is invisible and empty for a section with no doses', () => {
    const p = sectionProgress(counts());
    expect(p.visible).toBe(false);
    expect(p).toMatchObject({
      total: 0,
      taken: 0,
      takenFraction: 0,
      skippedFraction: 0,
      takenPct: 0,
      complete: false,
      settled: false,
      tone: 'neutral',
    });
  });

  it('computes the taken fraction and percent', () => {
    const p = sectionProgress(counts('taken', 'pending', 'pending', 'pending'));
    expect(p.visible).toBe(true);
    expect(p.taken).toBe(1);
    expect(p.total).toBe(4);
    expect(p.takenFraction).toBeCloseTo(0.25, 5);
    expect(p.takenPct).toBe(25);
    expect(p.complete).toBe(false);
    expect(p.settled).toBe(false);
    expect(p.tone).toBe('accent');
  });

  it('marks a fully-taken section complete with an ok tone', () => {
    const p = sectionProgress(counts('taken', 'taken'));
    expect(p.complete).toBe(true);
    expect(p.settled).toBe(true);
    expect(p.takenFraction).toBe(1);
    expect(p.takenPct).toBe(100);
    expect(p.tone).toBe('ok');
  });

  it('leaves an untouched section neutral', () => {
    const p = sectionProgress(counts('pending', 'pending'));
    expect(p.taken).toBe(0);
    expect(p.tone).toBe('neutral');
    expect(p.takenFraction).toBe(0);
  });

  it('draws a skipped sliver in the space left after taken', () => {
    const p = sectionProgress(counts('taken', 'taken', 'skipped', 'pending'));
    expect(p.taken).toBe(2);
    expect(p.skipped).toBe(1);
    expect(p.takenFraction).toBeCloseTo(0.5, 5);
    expect(p.skippedFraction).toBeCloseTo(0.25, 5);
    // The two segments fit the track.
    expect(p.takenFraction + p.skippedFraction).toBeLessThanOrEqual(1);
  });

  it('caps the segments so taken + skipped never overflow the track', () => {
    // 1 taken + 1 skipped over a total of 2 = full track, no overflow.
    const p = sectionProgress(counts('taken', 'skipped'));
    expect(p.takenFraction).toBeCloseTo(0.5, 5);
    expect(p.skippedFraction).toBeCloseTo(0.5, 5);
    expect(p.takenFraction + p.skippedFraction).toBe(1);
  });

  it('is settled when nothing is pending even if not all taken', () => {
    const p = sectionProgress(counts('taken', 'skipped', 'missed'));
    expect(p.settled).toBe(true);
    expect(p.complete).toBe(false);
    expect(p.pending).toBe(0);
  });

  it('clamps junk counts into range', () => {
    // taken claims more than total; floor + min keep it sane.
    const p = sectionProgress({ total: 2, taken: 5, skipped: 0, pending: 0, done: true });
    expect(p.taken).toBe(2);
    expect(p.takenFraction).toBe(1);
    expect(p.takenPct).toBe(100);
  });
});

describe('sectionProgressLabel', () => {
  it('returns null for an empty section', () => {
    expect(sectionProgressLabel(counts())).toBeNull();
  });

  it('reads "all N doses taken" when complete', () => {
    expect(sectionProgressLabel(counts('taken', 'taken'))).toBe('all 2 doses taken');
  });

  it('reads the singular "dose taken" for one complete dose', () => {
    expect(sectionProgressLabel(counts('taken'))).toBe('dose taken');
  });

  it('reads "no doses taken yet" when none taken', () => {
    expect(sectionProgressLabel(counts('pending', 'pending'))).toBe('no doses taken yet');
  });

  it('reads "M of N doses taken" while in progress', () => {
    expect(sectionProgressLabel(counts('taken', 'pending', 'pending'))).toBe('1 of 3 doses taken');
  });
});

describe('sectionFillTone', () => {
  it('returns null for an empty section', () => {
    expect(sectionFillTone(counts())).toBeNull();
  });

  it('reads danger for a barely-started section (<34%)', () => {
    // 1 of 3 taken = 33% -> danger
    expect(sectionFillTone(counts('taken', 'pending', 'pending'))).toBe('danger');
  });

  it('reads danger for a section with nothing taken', () => {
    expect(sectionFillTone(counts('pending', 'pending'))).toBe('danger');
  });

  it('reads warn for a section that is underway (34-66%)', () => {
    // 1 of 2 taken = 50% -> warn
    expect(sectionFillTone(counts('taken', 'pending'))).toBe('warn');
  });

  it('reads ok for a section that is nearly done (>=67%)', () => {
    // 2 of 3 taken = 67% -> ok
    expect(sectionFillTone(counts('taken', 'taken', 'pending'))).toBe('ok');
  });

  it('reads ok for a fully complete section', () => {
    expect(sectionFillTone(counts('taken', 'taken'))).toBe('ok');
  });

  it('agrees with the takenPct band at the 34% boundary', () => {
    // 2 of 5 taken = 40% -> warn (>= 34, < 67)
    expect(sectionFillTone(counts('taken', 'taken', 'pending', 'pending', 'pending'))).toBe('warn');
  });
});
