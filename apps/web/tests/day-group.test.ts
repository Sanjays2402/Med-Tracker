import { describe, it, expect } from 'vitest';
import {
  localDayKey,
  dayDelta,
  relativeDayLabel,
  groupByDay,
} from '../lib/day-group';

// Fixed "now": Wednesday, 2026-06-24 15:00 local.
const NOW = new Date(2026, 5, 24, 15, 0, 0).getTime();

function at(daysAgo: number, hour = 9): number {
  const d = new Date(2026, 5, 24, hour, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d.getTime();
}

describe('localDayKey', () => {
  it('formats a local YYYY-MM-DD key', () => {
    expect(localDayKey(new Date(2026, 5, 24, 23, 30).getTime())).toBe('2026-06-24');
  });
  it('pads month and day', () => {
    expect(localDayKey(new Date(2026, 0, 5, 1, 0).getTime())).toBe('2026-01-05');
  });
  it('keys by local time, not UTC (late-night does not roll over)', () => {
    // 11:30pm local stays on the same local day regardless of UTC offset.
    const key = localDayKey(new Date(2026, 5, 24, 23, 30).getTime());
    expect(key).toBe('2026-06-24');
  });
});

describe('dayDelta', () => {
  it('is zero for same-day different clock times', () => {
    expect(dayDelta(at(0, 23), at(0, 1))).toBe(0);
  });
  it('counts whole calendar days', () => {
    expect(dayDelta(NOW, at(1))).toBe(1);
    expect(dayDelta(NOW, at(3))).toBe(3);
  });
  it('is negative for the future', () => {
    expect(dayDelta(NOW, at(-2))).toBe(-2);
  });
});

describe('relativeDayLabel', () => {
  it('labels today and yesterday', () => {
    expect(relativeDayLabel(at(0), NOW)).toBe('Today');
    expect(relativeDayLabel(at(1), NOW)).toBe('Yesterday');
  });
  it('labels tomorrow', () => {
    expect(relativeDayLabel(at(-1), NOW)).toBe('Tomorrow');
  });
  it('uses a weekday name within the past week', () => {
    // 3 days before Wed 2026-06-24 is Sun 2026-06-21.
    expect(relativeDayLabel(at(3), NOW)).toBe('Sun');
  });
  it('uses a short month-day for older dates', () => {
    expect(relativeDayLabel(at(30), NOW)).toBe('May 25');
  });
});

describe('groupByDay', () => {
  interface Item { id: string; ts: number }
  const items: Item[] = [
    { id: 'a', ts: at(0, 14) },
    { id: 'b', ts: at(0, 8) },
    { id: 'c', ts: at(1, 20) },
    { id: 'd', ts: at(5, 10) },
  ];

  it('buckets items by local day, newest first', () => {
    const groups = groupByDay(items, (i) => i.ts, NOW);
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday', groups[2]!.label]);
    expect(groups[0]!.daysAgo).toBe(0);
    expect(groups[1]!.daysAgo).toBe(1);
    expect(groups[2]!.daysAgo).toBe(5);
  });

  it('preserves incoming order within a day', () => {
    const groups = groupByDay(items, (i) => i.ts, NOW);
    expect(groups[0]!.items.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('accepts ISO strings as the time accessor', () => {
    const iso = [{ id: 'x', when: new Date(at(0)).toISOString() }];
    const groups = groupByDay(iso, (i) => i.when, NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.label).toBe('Today');
  });

  it('drops items with an unparseable time', () => {
    const bad = [{ id: 'x', when: 'nope' }, { id: 'y', when: new Date(at(0)).toISOString() }];
    const groups = groupByDay(bad, (i) => i.when, NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.items.map((i) => i.id)).toEqual(['y']);
  });

  it('returns an empty array for no items', () => {
    expect(groupByDay([], (i: { ts: number }) => i.ts, NOW)).toEqual([]);
  });

  it('assigns a stable sortable key per group', () => {
    const groups = groupByDay(items, (i) => i.ts, NOW);
    expect(groups[0]!.key).toBe('2026-06-24');
    expect(groups[1]!.key).toBe('2026-06-23');
  });
});
