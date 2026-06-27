import { describe, it, expect } from 'vitest';
import {
  cellOffsetDays,
  cellDate,
  cellDateISO,
  cellDateLabel,
  stripCellTitle,
} from '../lib/strip-dates';

// Fixed clock: Friday 2026-06-26 (local). Use a local-noon instant so the
// midnight snap stays on the same calendar day in any timezone.
const NOW = new Date(2026, 5, 26, 12, 0, 0).getTime();

describe('cellOffsetDays', () => {
  it('maps the last cell to today (offset 0) and the first to the oldest', () => {
    expect(cellOffsetDays(13, 14)).toBe(0);
    expect(cellOffsetDays(0, 14)).toBe(13);
    expect(cellOffsetDays(12, 14)).toBe(1);
  });
  it('clamps out-of-range indices into the window', () => {
    expect(cellOffsetDays(-5, 14)).toBe(13); // clamps to first cell
    expect(cellOffsetDays(99, 14)).toBe(0); // clamps to last (today)
  });
  it('handles a single-cell strip', () => {
    expect(cellOffsetDays(0, 1)).toBe(0);
  });
});

describe('cellDate', () => {
  it('returns local midnight for the cell', () => {
    const d = cellDate(13, 14, NOW);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5); // June
    expect(d.getDate()).toBe(26); // today
  });
  it('walks back one day per cell', () => {
    expect(cellDate(12, 14, NOW).getDate()).toBe(25); // yesterday
    expect(cellDate(0, 14, NOW).getDate()).toBe(13); // 13 days back
  });
});

describe('cellDateISO', () => {
  it('produces a stable YYYY-MM-DD key', () => {
    expect(cellDateISO(13, 14, NOW)).toBe('2026-06-26');
    expect(cellDateISO(12, 14, NOW)).toBe('2026-06-25');
    expect(cellDateISO(0, 14, NOW)).toBe('2026-06-13');
  });
  it('zero-pads month and day', () => {
    const jan = new Date(2026, 0, 3, 12).getTime();
    expect(cellDateISO(13, 14, jan)).toBe('2026-01-03');
  });
});

describe('cellDateLabel', () => {
  it('reads Today / Yesterday at the near edge', () => {
    expect(cellDateLabel(13, 14, NOW)).toBe('Today');
    expect(cellDateLabel(12, 14, NOW)).toBe('Yesterday');
  });
  it('reads "Weekday, Mon D" further back', () => {
    // 13 days before Fri Jun 26 is Sat Jun 13.
    expect(cellDateLabel(0, 14, NOW)).toBe('Sat, Jun 13');
  });
});

describe('stripCellTitle', () => {
  it('names today and states the current-window average honestly', () => {
    expect(stripCellTitle({ index: 13, cells: 14, pct: 87, segment: 'current', now: NOW }))
      .toBe('Today, Jun 26 — current-window average 87%');
  });
  it('names yesterday', () => {
    expect(stripCellTitle({ index: 12, cells: 14, pct: 87, segment: 'current', now: NOW }))
      .toBe('Yesterday, Jun 25 — current-window average 87%');
  });
  it('uses the prior-window wording for older cells', () => {
    expect(stripCellTitle({ index: 0, cells: 14, pct: 80, segment: 'prior', now: NOW }))
      .toBe('Sat, Jun 13 — prior-window average 80%');
  });
  it('rounds a fractional percent and tolerates junk', () => {
    expect(stripCellTitle({ index: 13, cells: 14, pct: 86.6, segment: 'current', now: NOW }))
      .toContain('average 87%');
    expect(stripCellTitle({ index: 13, cells: 14, pct: Number.NaN, segment: 'current', now: NOW }))
      .toContain('average 0%');
  });
  it('never names a future day (clamps to today)', () => {
    expect(stripCellTitle({ index: 50, cells: 14, pct: 50, segment: 'current', now: NOW }))
      .toContain('Today, Jun 26');
  });
});
