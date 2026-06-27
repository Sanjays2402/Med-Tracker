import { describe, it, expect } from 'vitest';
import { dayProgressRoll } from '../lib/day-progress-roll';
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
});
