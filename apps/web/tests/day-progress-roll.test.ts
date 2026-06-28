import { describe, it, expect } from 'vitest';
import { dayProgressRoll, dayPercentPrefix, dayPercentChip, dayStatusChip } from '../lib/day-progress-roll';
import { groupByPartOfDay, type PartOfDayDose } from '../lib/part-of-day';

// Build a dose at a given local hour with a status.
function dose(hour: number, status: PartOfDayDose['status']): PartOfDayDose {
  const hh = String(hour).padStart(2, '0');
  // Local time (no Z) so the part-of-day bucket follows getHours() as the page does.
  return { scheduledAt: `2026-06-26T${hh}:00:00`, status };
}

describe('dayProgressRoll', () => {
  it('is null for an empty day', () => {
    expect(dayProgressRoll(groupByPartOfDay([]))).toBeNull();
  });

  it('summarises a mixed day across sections', () => {
    // Morning: 1 of 2 taken. Afternoon: both taken. Evening: none started.
    const groups = groupByPartOfDay([
      dose(8, 'taken'),
      dose(9, 'pending'),
      dose(13, 'taken'),
      dose(14, 'taken'),
      dose(19, 'pending'),
    ]);
    const roll = dayProgressRoll(groups);
    expect(roll).not.toBeNull();
    expect(roll!.total).toBe(5);
    expect(roll!.taken).toBe(3);
    expect(roll!.allComplete).toBe(false);
    expect(roll!.parts.map((p) => p.label)).toEqual(['Morning', 'Afternoon', 'Evening']);
    expect(roll!.summary).toBe('1 of 2 morning, all afternoon taken, evening not started');
  });

  it('collapses to a single line when the whole day is taken', () => {
    const groups = groupByPartOfDay([dose(8, 'taken'), dose(13, 'taken'), dose(22, 'taken')]);
    const roll = dayProgressRoll(groups);
    expect(roll!.allComplete).toBe(true);
    expect(roll!.summary).toBe('All 3 doses taken');
  });

  it('uses a singular noun for a one-dose completed day', () => {
    const roll = dayProgressRoll(groupByPartOfDay([dose(8, 'taken')]));
    expect(roll!.summary).toBe('All 1 dose taken');
  });

  it('omits empty sections from the breakdown', () => {
    // Only a night dose; the other three sections are empty and unmentioned.
    const roll = dayProgressRoll(groupByPartOfDay([dose(22, 'pending')]));
    expect(roll!.parts).toHaveLength(1);
    expect(roll!.parts[0]!.label).toBe('Night');
    expect(roll!.summary).toBe('night not started');
  });

  it('counts skipped doses as not-taken in the roll', () => {
    // Morning has 1 taken + 1 skipped of 2: not complete, taken === 1.
    const roll = dayProgressRoll(groupByPartOfDay([dose(8, 'taken'), dose(9, 'skipped')]));
    expect(roll!.taken).toBe(1);
    expect(roll!.allComplete).toBe(false);
    expect(roll!.summary).toBe('1 of 2 morning');
  });

  it('reports per-section taken/total/complete flags', () => {
    const roll = dayProgressRoll(
      groupByPartOfDay([dose(8, 'taken'), dose(9, 'taken'), dose(13, 'pending')]),
    );
    const morning = roll!.parts.find((p) => p.label === 'Morning')!;
    const afternoon = roll!.parts.find((p) => p.label === 'Afternoon')!;
    expect(morning).toMatchObject({ total: 2, taken: 2, complete: true });
    expect(afternoon).toMatchObject({ total: 1, taken: 0, complete: false });
  });

  it('reports whole-percent of the day taken', () => {
    // 3 of 5 taken -> 60%.
    const roll = dayProgressRoll(
      groupByPartOfDay([
        dose(8, 'taken'),
        dose(9, 'pending'),
        dose(13, 'taken'),
        dose(14, 'taken'),
        dose(19, 'pending'),
      ]),
    );
    expect(roll!.percent).toBe(60);
  });

  it('rounds the percent to whole numbers', () => {
    // 1 of 3 taken -> 33%.
    const roll = dayProgressRoll(
      groupByPartOfDay([dose(8, 'taken'), dose(9, 'pending'), dose(13, 'pending')]),
    );
    expect(roll!.percent).toBe(33);
  });

  it('reports 100 percent for a fully-taken day', () => {
    const roll = dayProgressRoll(groupByPartOfDay([dose(8, 'taken'), dose(13, 'taken')]));
    expect(roll!.percent).toBe(100);
  });
});

describe('dayPercentPrefix', () => {
  it('prefixes the percent while the day is in progress', () => {
    expect(dayPercentPrefix({ percent: 60, allComplete: false })).toBe('60% done · ');
    expect(dayPercentPrefix({ percent: 0, allComplete: false })).toBe('0% done · ');
  });

  it('is empty for a fully-complete day (the All-taken line stands alone)', () => {
    expect(dayPercentPrefix({ percent: 100, allComplete: true })).toBe('');
  });

  it('clamps out-of-range percents into 0..100', () => {
    expect(dayPercentPrefix({ percent: 140, allComplete: false })).toBe('100% done · ');
    expect(dayPercentPrefix({ percent: -5, allComplete: false })).toBe('0% done · ');
  });

  it('composes onto the live roll output', () => {
    const roll = dayProgressRoll(
      groupByPartOfDay([dose(8, 'taken'), dose(9, 'pending'), dose(13, 'pending')]),
    );
    expect(dayPercentPrefix(roll!) + roll!.summary).toBe(
      '33% done · 1 of 2 morning, afternoon not started',
    );
  });
});

describe('dayPercentChip', () => {
  it('is null for an empty / missing day', () => {
    expect(dayPercentChip(null)).toBeNull();
    expect(dayPercentChip(dayProgressRoll(groupByPartOfDay([])))).toBeNull();
  });

  it('reads the percent and tones it by progress', () => {
    // 1 of 3 -> 33% -> danger (barely started).
    const low = dayProgressRoll(
      groupByPartOfDay([dose(8, 'taken'), dose(9, 'pending'), dose(13, 'pending')]),
    );
    expect(dayPercentChip(low)).toEqual({ percent: 33, label: '33% done', tone: 'danger' });

    // 2 of 3 -> 67% -> ok (nearly there).
    const high = dayProgressRoll(
      groupByPartOfDay([dose(8, 'taken'), dose(9, 'taken'), dose(13, 'pending')]),
    );
    expect(dayPercentChip(high)).toEqual({ percent: 67, label: '67% done', tone: 'ok' });
  });

  it('reads "All done" with an ok tone for a finished day', () => {
    const roll = dayProgressRoll(groupByPartOfDay([dose(8, 'taken'), dose(13, 'taken')]));
    expect(dayPercentChip(roll)).toEqual({ percent: 100, label: 'All done', tone: 'ok' });
  });

  it('tones a half-done day amber', () => {
    // 2 of 4 -> 50% -> warn.
    const roll = dayProgressRoll(
      groupByPartOfDay([dose(8, 'taken'), dose(9, 'taken'), dose(13, 'pending'), dose(14, 'pending')]),
    );
    expect(dayPercentChip(roll)).toMatchObject({ percent: 50, tone: 'warn' });
  });
});

describe('dayStatusChip', () => {
  it('reads a muted "Nothing due today" for an empty / missing day', () => {
    expect(dayStatusChip(null)).toEqual({
      percent: 0,
      label: 'Nothing due today',
      tone: 'neutral',
      empty: true,
    });
    expect(dayStatusChip(dayProgressRoll(groupByPartOfDay([])))).toEqual({
      percent: 0,
      label: 'Nothing due today',
      tone: 'neutral',
      empty: true,
    });
  });

  it('reads the percent and tones it by progress (matching dayPercentChip)', () => {
    // 1 of 3 -> 33% -> danger.
    const low = dayProgressRoll(
      groupByPartOfDay([dose(8, 'taken'), dose(9, 'pending'), dose(13, 'pending')]),
    );
    expect(dayStatusChip(low)).toEqual({ percent: 33, label: '33% done', tone: 'danger', empty: false });

    // 2 of 3 -> 67% -> ok.
    const high = dayProgressRoll(
      groupByPartOfDay([dose(8, 'taken'), dose(9, 'taken'), dose(13, 'pending')]),
    );
    expect(dayStatusChip(high)).toEqual({ percent: 67, label: '67% done', tone: 'ok', empty: false });
  });

  it('reads "All done" with an ok tone for a finished day', () => {
    const roll = dayProgressRoll(groupByPartOfDay([dose(8, 'taken'), dose(13, 'taken')]));
    expect(dayStatusChip(roll)).toEqual({ percent: 100, label: 'All done', tone: 'ok', empty: false });
  });

  it('never returns null, unlike dayPercentChip', () => {
    expect(dayStatusChip(null)).not.toBeNull();
    expect(dayPercentChip(null)).toBeNull();
  });

  it('agrees with dayPercentChip on percent/label/tone for a non-empty day', () => {
    const roll = dayProgressRoll(
      groupByPartOfDay([dose(8, 'taken'), dose(9, 'taken'), dose(13, 'pending'), dose(14, 'pending')]),
    );
    const status = dayStatusChip(roll);
    const chip = dayPercentChip(roll)!;
    expect({ percent: status.percent, label: status.label, tone: status.tone }).toEqual(chip);
    expect(status.empty).toBe(false);
  });
});
