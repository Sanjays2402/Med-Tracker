import { describe, it, expect } from 'vitest';
import {
  isOverdue,
  partitionOverdue,
  overdueHeadline,
  formatLateness,
  OVERDUE_GRACE_MS,
  type OverduePartitionInput,
} from '../lib/overdue';

const NOW = Date.parse('2026-06-25T12:00:00Z');

function dose(
  id: string,
  minutesFromNow: number,
  status: OverduePartitionInput['status'] = 'pending',
): OverduePartitionInput {
  return { id, scheduledAt: new Date(NOW + minutesFromNow * 60_000).toISOString(), status };
}

describe('isOverdue', () => {
  it('flags a pending dose past the grace window', () => {
    expect(isOverdue(dose('a', -20), NOW)).toBe(true);
  });
  it('does not flag a dose only a few minutes late (within grace)', () => {
    expect(isOverdue(dose('a', -10), NOW)).toBe(false);
  });
  it('does not flag future doses', () => {
    expect(isOverdue(dose('a', 30), NOW)).toBe(false);
  });
  it('ignores non-pending doses even if past due', () => {
    expect(isOverdue(dose('a', -120, 'taken'), NOW)).toBe(false);
    expect(isOverdue(dose('a', -120, 'skipped'), NOW)).toBe(false);
    expect(isOverdue(dose('a', -120, 'missed'), NOW)).toBe(false);
  });
  it('treats exactly grace boundary as not-yet-overdue', () => {
    const at = new Date(NOW - OVERDUE_GRACE_MS).toISOString();
    expect(isOverdue({ id: 'a', scheduledAt: at, status: 'pending' }, NOW)).toBe(false);
  });
  it('returns false for an unparseable date', () => {
    expect(isOverdue({ id: 'a', scheduledAt: 'not-a-date', status: 'pending' }, NOW)).toBe(false);
  });
});

describe('partitionOverdue', () => {
  const doses: OverduePartitionInput[] = [
    dose('future', 60),
    dose('late1', -90),
    dose('taken', -200, 'taken'),
    dose('late2', -30),
    dose('soon', -5),
  ];

  it('collects only the overdue pending doses', () => {
    const m = partitionOverdue(doses, NOW);
    expect(m.overdue.map((d) => d.id)).toEqual(['late1', 'late2']);
    expect(m.count).toBe(2);
  });

  it('sorts overdue earliest-scheduled first', () => {
    const m = partitionOverdue(doses, NOW);
    // late1 (-90) scheduled before late2 (-30)
    expect(m.firstOverdueId).toBe('late1');
  });

  it('computes minutesLate per dose', () => {
    const m = partitionOverdue(doses, NOW);
    const late1 = m.overdue.find((d) => d.id === 'late1')!;
    const late2 = m.overdue.find((d) => d.id === 'late2')!;
    expect(late1.minutesLate).toBe(90);
    expect(late2.minutesLate).toBe(30);
  });

  it('reports the worst lateness', () => {
    expect(partitionOverdue(doses, NOW).worstMinutesLate).toBe(90);
  });

  it('returns an empty model when nothing is overdue', () => {
    const m = partitionOverdue([dose('a', 30), dose('b', -5)], NOW);
    expect(m.count).toBe(0);
    expect(m.firstOverdueId).toBeNull();
    expect(m.worstMinutesLate).toBe(0);
    expect(m.overdue).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const copy = [...doses];
    partitionOverdue(doses, NOW);
    expect(doses).toEqual(copy);
  });
});

describe('overdueHeadline', () => {
  it('uses singular for one dose', () => {
    expect(overdueHeadline(1)).toBe('1 dose overdue');
  });
  it('uses plural for many', () => {
    expect(overdueHeadline(3)).toBe('3 doses overdue');
  });
  it('returns empty string for zero', () => {
    expect(overdueHeadline(0)).toBe('');
    expect(overdueHeadline(-2)).toBe('');
  });
});

describe('formatLateness', () => {
  it('says "just now" under a minute', () => {
    expect(formatLateness(0)).toBe('just now');
  });
  it('formats minutes under an hour', () => {
    expect(formatLateness(45)).toBe('45m');
  });
  it('formats whole hours', () => {
    expect(formatLateness(120)).toBe('2h');
  });
  it('formats hours + minutes', () => {
    expect(formatLateness(95)).toBe('1h 35m');
  });
});
