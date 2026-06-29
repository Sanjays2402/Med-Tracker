import { describe, it, expect } from 'vitest';
import {
  PART_OF_DAY_LABELS,
  partOfDayForHour,
  partOfDayForISO,
  countDoses,
  groupByPartOfDay,
  sectionCountLabel,
  sectionForOverdue,
  countOverdueByPartOfDay,
  overdueSectionCount,
  jumpToFirstLabel,
  worstLatenessByPartOfDay,
  type PartOfDay,
  type PartOfDayDose,
} from '../lib/part-of-day';

/** Build an ISO string for today at a given LOCAL hour (timezone-stable). */
function atHour(hour: number, status: PartOfDayDose['status'] = 'pending'): PartOfDayDose {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return { scheduledAt: d.toISOString(), status };
}

/** ISO string for today at a given LOCAL hour (for section-of-overdue tests). */
function isoAtHour(hour: number): string {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

describe('PART_OF_DAY_LABELS', () => {
  it('lists the four sections in display order', () => {
    expect(PART_OF_DAY_LABELS).toEqual<PartOfDay[]>(['Morning', 'Afternoon', 'Evening', 'Night']);
  });
});

describe('partOfDayForHour', () => {
  it('maps the boundaries correctly', () => {
    expect(partOfDayForHour(0)).toBe('Morning');
    expect(partOfDayForHour(11)).toBe('Morning');
    expect(partOfDayForHour(12)).toBe('Afternoon');
    expect(partOfDayForHour(16)).toBe('Afternoon');
    expect(partOfDayForHour(17)).toBe('Evening');
    expect(partOfDayForHour(20)).toBe('Evening');
    expect(partOfDayForHour(21)).toBe('Night');
    expect(partOfDayForHour(23)).toBe('Night');
  });
  it('floors a fractional hour and defaults junk to Morning', () => {
    expect(partOfDayForHour(12.9)).toBe('Afternoon');
    expect(partOfDayForHour(Number.NaN)).toBe('Morning');
  });
});

describe('partOfDayForISO', () => {
  it('uses the local hour of the timestamp', () => {
    expect(partOfDayForISO(atHour(9).scheduledAt)).toBe('Morning');
    expect(partOfDayForISO(atHour(14).scheduledAt)).toBe('Afternoon');
    expect(partOfDayForISO(atHour(19).scheduledAt)).toBe('Evening');
    expect(partOfDayForISO(atHour(22).scheduledAt)).toBe('Night');
  });
  it('defaults an unparseable date to Morning', () => {
    expect(partOfDayForISO('not-a-date')).toBe('Morning');
  });
});

describe('countDoses', () => {
  it('tallies by status', () => {
    const c = countDoses([
      atHour(8, 'taken'),
      atHour(9, 'taken'),
      atHour(10, 'skipped'),
      atHour(11, 'pending'),
    ]);
    expect(c).toEqual({ total: 4, taken: 2, skipped: 1, pending: 1, done: false });
  });
  it('is done when nothing is pending', () => {
    const c = countDoses([atHour(8, 'taken'), atHour(9, 'skipped'), atHour(10, 'missed')]);
    expect(c.done).toBe(true);
    expect(c.pending).toBe(0);
  });
  it('an empty section is not done', () => {
    expect(countDoses([])).toEqual({ total: 0, taken: 0, skipped: 0, pending: 0, done: false });
  });
});

describe('groupByPartOfDay', () => {
  it('returns all four labels in order even when some are empty', () => {
    const groups = groupByPartOfDay([atHour(9, 'taken')]);
    expect(groups.map((g) => g.label)).toEqual(['Morning', 'Afternoon', 'Evening', 'Night']);
    expect(groups[0]!.counts.total).toBe(1);
    expect(groups[1]!.counts.total).toBe(0);
  });
  it('buckets doses into the right section with counts', () => {
    const groups = groupByPartOfDay([
      atHour(8, 'taken'),
      atHour(10, 'pending'),
      atHour(13, 'taken'),
      atHour(22, 'skipped'),
    ]);
    const morning = groups.find((g) => g.label === 'Morning')!;
    expect(morning.doses).toHaveLength(2);
    expect(morning.counts).toMatchObject({ total: 2, taken: 1, pending: 1, done: false });
    const afternoon = groups.find((g) => g.label === 'Afternoon')!;
    expect(afternoon.counts).toMatchObject({ total: 1, taken: 1, done: true });
    const night = groups.find((g) => g.label === 'Night')!;
    expect(night.counts).toMatchObject({ total: 1, skipped: 1, done: true });
  });
  it('preserves input order within a section', () => {
    const a = atHour(8, 'taken');
    const b = atHour(9, 'pending');
    const groups = groupByPartOfDay([b, a]);
    expect(groups[0]!.doses).toEqual([b, a]);
  });
  it('does not mutate the input', () => {
    const input = [atHour(8), atHour(13)];
    const snapshot = [...input];
    groupByPartOfDay(input);
    expect(input).toEqual(snapshot);
  });
});

describe('sectionCountLabel', () => {
  it('returns null for an empty section', () => {
    expect(sectionCountLabel(countDoses([]))).toBeNull();
  });
  it('reads "all N taken" when complete', () => {
    expect(sectionCountLabel(countDoses([atHour(8, 'taken'), atHour(9, 'taken')]))).toBe('all 2 taken');
  });
  it('reads "taken" for a single complete dose', () => {
    expect(sectionCountLabel(countDoses([atHour(8, 'taken')]))).toBe('taken');
  });
  it('reads "M of N taken" while in progress', () => {
    expect(sectionCountLabel(countDoses([atHour(8, 'taken'), atHour(9, 'pending')]))).toBe('1 of 2 taken');
  });
  it('reads "0 of N taken" when none taken yet', () => {
    expect(sectionCountLabel(countDoses([atHour(8, 'pending'), atHour(9, 'pending')]))).toBe('0 of 2 taken');
  });
});

describe('sectionForOverdue', () => {
  it('returns null when nothing is overdue', () => {
    expect(sectionForOverdue(null)).toBeNull();
  });

  it('maps the earliest overdue timestamp to its section', () => {
    expect(sectionForOverdue(isoAtHour(8))).toBe('Morning');
    expect(sectionForOverdue(isoAtHour(14))).toBe('Afternoon');
    expect(sectionForOverdue(isoAtHour(19))).toBe('Evening');
    expect(sectionForOverdue(isoAtHour(22))).toBe('Night');
  });

  it('agrees with the bucket the page renders that dose under', () => {
    const iso = isoAtHour(15);
    // The section the flag points at is the same one groupByPartOfDay buckets
    // that dose into, so the dot never lands on the wrong header.
    expect(sectionForOverdue(iso)).toBe(partOfDayForISO(iso));
  });
});

describe('countOverdueByPartOfDay', () => {
  it('returns every section at zero for an empty overdue set', () => {
    expect(countOverdueByPartOfDay([])).toEqual({
      Morning: 0,
      Afternoon: 0,
      Evening: 0,
      Night: 0,
    });
  });

  it('tallies overdue doses into their section buckets', () => {
    const counts = countOverdueByPartOfDay([
      { scheduledAt: isoAtHour(8) },
      { scheduledAt: isoAtHour(9) },
      { scheduledAt: isoAtHour(14) },
      { scheduledAt: isoAtHour(22) },
    ]);
    expect(counts).toEqual({ Morning: 2, Afternoon: 1, Evening: 0, Night: 1 });
  });

  it('buckets match partOfDayForISO exactly', () => {
    const iso = isoAtHour(19);
    const counts = countOverdueByPartOfDay([{ scheduledAt: iso }]);
    expect(counts[partOfDayForISO(iso)]).toBe(1);
  });
});

describe('overdueSectionCount', () => {
  const counts: Record<PartOfDay, number> = { Morning: 3, Afternoon: 1, Evening: 0, Night: 0 };

  it('is null for a section that is not the flagged one', () => {
    expect(overdueSectionCount('Afternoon', 'Morning', counts)).toBeNull();
  });

  it('returns the count when the flagged section has more than one overdue', () => {
    expect(overdueSectionCount('Morning', 'Morning', counts)).toBe(3);
  });

  it('is null when the flagged section has only one overdue (bare dot)', () => {
    expect(overdueSectionCount('Afternoon', 'Afternoon', counts)).toBeNull();
  });

  it('is null when nothing is flagged', () => {
    expect(overdueSectionCount('Morning', null, counts)).toBeNull();
  });
});

describe('jumpToFirstLabel', () => {
  it('names the destination section when one is flagged', () => {
    expect(jumpToFirstLabel('Morning')).toBe('Jump to first · Morning');
    expect(jumpToFirstLabel('Evening')).toBe('Jump to first · Evening');
  });

  it('stays the bare label when nothing is overdue', () => {
    expect(jumpToFirstLabel(null)).toBe('Jump to first');
  });
});

describe('worstLatenessByPartOfDay', () => {
  it('keeps the largest lateness per section, every key present', () => {
    const out = worstLatenessByPartOfDay([
      { scheduledAt: isoAtHour(8), minutesLate: 30 },
      { scheduledAt: isoAtHour(9), minutesLate: 200 },
      { scheduledAt: isoAtHour(14), minutesLate: 45 },
    ]);
    expect(out.Morning).toBe(200);
    expect(out.Afternoon).toBe(45);
    expect(out.Evening).toBe(0);
    expect(out.Night).toBe(0);
  });

  it('returns all-zero for an empty overdue set', () => {
    expect(worstLatenessByPartOfDay([])).toEqual({ Morning: 0, Afternoon: 0, Evening: 0, Night: 0 });
  });

  it('clamps negative / non-finite lateness to 0', () => {
    const out = worstLatenessByPartOfDay([
      { scheduledAt: isoAtHour(22), minutesLate: -5 },
      { scheduledAt: isoAtHour(23), minutesLate: Number.NaN },
    ]);
    expect(out.Night).toBe(0);
  });
});
