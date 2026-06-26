import { describe, it, expect } from 'vitest';
import {
  RUNOUT_BANDS,
  RUNOUT_BAND_META,
  runoutBand,
  groupByRunout,
  summarizeRunout,
  type RunoutBand,
} from '../lib/runout-group';
import type { Medication } from '../lib/types';

function med(over: Partial<Medication> & { id: string; name: string }): Medication {
  return { schedule: '08:00 daily', ...over };
}

// estimatedDaysLeft = floor(remainingDoses / dosesPerDay(schedule)).
const out = med({ id: 'm_out', name: 'Aspirin', remainingDoses: 0 }); // 0 -> overdue
const soon = med({ id: 'm_soon', name: 'Lisinopril', remainingDoses: 5 }); // 5 -> week
const month = med({ id: 'm_month', name: 'Metformin', remainingDoses: 20 }); // 20 -> month
const healthy = med({ id: 'm_healthy', name: 'Vitamin D', remainingDoses: 90 }); // 90 -> healthy
const unknown = med({ id: 'm_unknown', name: 'Zinc' }); // no remainingDoses -> unknown
const twiceDaily = med({ id: 'm_twice', name: 'Insulin', schedule: '08:00, 20:00 daily', remainingDoses: 10 }); // floor(10/2)=5 -> week

describe('RUNOUT_BANDS', () => {
  it('orders most-urgent-first with unknown last', () => {
    expect(RUNOUT_BANDS).toEqual<RunoutBand[]>(['overdue', 'week', 'month', 'healthy', 'unknown']);
  });
  it('has metadata for every band', () => {
    for (const band of RUNOUT_BANDS) {
      expect(RUNOUT_BAND_META[band].band).toBe(band);
      expect(RUNOUT_BAND_META[band].label.length).toBeGreaterThan(0);
    }
  });
});

describe('runoutBand', () => {
  it('classifies by estimated days left', () => {
    expect(runoutBand(out)).toBe('overdue');
    expect(runoutBand(soon)).toBe('week');
    expect(runoutBand(month)).toBe('month');
    expect(runoutBand(healthy)).toBe('healthy');
  });
  it('files meds without supply data under unknown', () => {
    expect(runoutBand(unknown)).toBe('unknown');
  });
  it('accounts for multi-dose-per-day schedules', () => {
    // 10 doses at 2/day = 5 days left -> week, not month.
    expect(runoutBand(twiceDaily)).toBe('week');
  });
  it('treats the 7-day and 30-day edges inclusively', () => {
    expect(runoutBand(med({ id: 'e7', name: 'E7', remainingDoses: 7 }))).toBe('week');
    expect(runoutBand(med({ id: 'e8', name: 'E8', remainingDoses: 8 }))).toBe('month');
    expect(runoutBand(med({ id: 'e30', name: 'E30', remainingDoses: 30 }))).toBe('month');
    expect(runoutBand(med({ id: 'e31', name: 'E31', remainingDoses: 31 }))).toBe('healthy');
  });
});

describe('groupByRunout', () => {
  it('buckets meds and omits empty bands', () => {
    const groups = groupByRunout([healthy, out, unknown]);
    expect(groups.map((g) => g.meta.band)).toEqual(['overdue', 'healthy', 'unknown']);
    // week + month bands are absent (no rows).
  });
  it('orders bands most-urgent-first regardless of input order', () => {
    const groups = groupByRunout([healthy, month, soon, out]);
    expect(groups.map((g) => g.meta.band)).toEqual(['overdue', 'week', 'month', 'healthy']);
  });
  it('sorts rows within a band by ascending days left', () => {
    const a = med({ id: 'a', name: 'A', remainingDoses: 25 }); // 25
    const b = med({ id: 'b', name: 'B', remainingDoses: 12 }); // 12
    const c = med({ id: 'c', name: 'C', remainingDoses: 18 }); // 18
    const groups = groupByRunout([a, b, c]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.meds.map((m) => m.id)).toEqual(['b', 'c', 'a']);
  });
  it('does not mutate the input array', () => {
    const input = [healthy, out];
    const copy = [...input];
    groupByRunout(input);
    expect(input).toEqual(copy);
  });
  it('returns an empty array for no meds', () => {
    expect(groupByRunout([])).toEqual([]);
  });
});

describe('summarizeRunout', () => {
  it('counts overdue + week as the urgent total', () => {
    const s = summarizeRunout([out, soon, month, healthy, unknown]);
    expect(s.urgentCount).toBe(2); // out (overdue) + soon (week)
    expect(s.bandCount).toBe(5);
  });
  it('is zero-urgent when everything is healthy or unknown', () => {
    const s = summarizeRunout([healthy, unknown]);
    expect(s.urgentCount).toBe(0);
    expect(s.bandCount).toBe(2);
  });
});
