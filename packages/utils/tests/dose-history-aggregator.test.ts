import { describe, it, expect } from 'vitest';
import {
  aggregateDoseHistory,
  type DoseHistoryEntry,
} from '../src/dose-history-aggregator';

const day = (offset: number, hour: number): string => {
  // Construct as local-time to match the codebase's local-time date helpers
  // (avoid `new Date('YYYY-MM-DD')` which parses as UTC midnight).
  const d = new Date(2026, 5, 15, hour, 0, 0, 0); // June = month 5
  d.setDate(d.getDate() + offset);
  return d.toISOString();
};

const taken = (dueOffset: number, dueHour: number, takenHour: number): DoseHistoryEntry => ({
  dueAt: day(dueOffset, dueHour),
  takenAt: day(dueOffset, takenHour),
});
const missed = (dueOffset: number, dueHour: number): DoseHistoryEntry => ({
  dueAt: day(dueOffset, dueHour),
  takenAt: null,
});
const skipped = (dueOffset: number, dueHour: number): DoseHistoryEntry => ({
  dueAt: day(dueOffset, dueHour),
  takenAt: null,
  skipped: true,
});

// Reference "now" for tests: late on Sun Jun 21 local so doses through Sun are past.
const NOW = new Date(2026, 5, 21, 23, 59, 0, 0);

describe('aggregateDoseHistory daily', () => {
  it('groups doses by day with correct status classifications', () => {
    const out = aggregateDoseHistory(
      [
        taken(0, 8, 8), // on time
        taken(0, 20, 22), // 2h drift -> late
        taken(1, 8, 8),
        missed(1, 20),
        taken(2, 8, 8),
        skipped(2, 20),
      ],
      {
        bucket: 'day',
        from: new Date(2026, 5, 15),
        to: new Date(2026, 5, 17),
        now: NOW,
      },
    );
    expect(out.buckets).toHaveLength(3);
    expect(out.buckets[0]!.taken).toBe(1);
    expect(out.buckets[0]!.late).toBe(1);
    expect(out.buckets[0]!.total).toBe(2);
    expect(out.buckets[1]!.taken).toBe(1);
    expect(out.buckets[1]!.missed).toBe(1);
    expect(out.buckets[2]!.taken).toBe(1);
    expect(out.buckets[2]!.skipped).toBe(1);
  });

  it('computes per-bucket adherence excluding skipped doses', () => {
    const out = aggregateDoseHistory(
      [
        taken(0, 8, 8),
        skipped(0, 12), // does not affect adherence denominator
        missed(0, 20),
      ],
      {
        bucket: 'day',
        from: new Date(2026, 5, 15),
        to: new Date(2026, 5, 15),
        now: NOW,
      },
    );
    expect(out.buckets[0]!.adherence).toBe(0.5);
    expect(out.buckets[0]!.skipped).toBe(1);
  });

  it('marks future doses as upcoming, not missed', () => {
    const out = aggregateDoseHistory(
      [
        { dueAt: day(0, 8), takenAt: day(0, 8) },
        { dueAt: day(7, 8), takenAt: null }, // future relative to NOW
      ],
      {
        bucket: 'day',
        from: new Date(2026, 5, 15),
        to: new Date(2026, 5, 30),
        now: NOW,
      },
    );
    const upcoming = out.buckets.find((b) => b.upcoming > 0);
    expect(upcoming).toBeTruthy();
    expect(out.total.upcoming).toBe(1);
    expect(out.total.missed).toBe(0);
  });

  it('treats explicit on-time drift threshold', () => {
    // Default is 60 min; tightening to 0 still treats exact matches as on-time.
    const out = aggregateDoseHistory(
      [
        { dueAt: day(0, 8), takenAt: day(0, 8) }, // exact
        { dueAt: day(0, 12), takenAt: day(0, 12) }, // exact
      ],
      {
        bucket: 'day',
        from: new Date(2026, 5, 15),
        to: new Date(2026, 5, 15),
        onTimeMinutes: 0,
        now: NOW,
      },
    );
    expect(out.buckets[0]!.taken).toBe(2);
  });

  it('returns empty buckets covering the whole window', () => {
    const out = aggregateDoseHistory([], {
      bucket: 'day',
      from: new Date(2026, 5, 15),
      to: new Date(2026, 5, 17),
      now: NOW,
    });
    expect(out.buckets).toHaveLength(3);
    expect(out.total.total).toBe(0);
    expect(out.overallAdherence).toBe(0);
  });
});

describe('aggregateDoseHistory weekly', () => {
  it('rolls up multiple days into one week bucket', () => {
    const out = aggregateDoseHistory(
      [
        taken(0, 8, 8),
        taken(1, 8, 8),
        taken(2, 8, 8),
        missed(3, 8),
        taken(4, 8, 8),
        // Day 7 falls into next week.
        taken(7, 8, 8),
      ],
      {
        bucket: 'week',
        from: new Date(2026, 5, 15), // Monday
        to: new Date(2026, 5, 25),
        now: NOW,
      },
    );
    expect(out.buckets).toHaveLength(2);
    expect(out.buckets[0]!.taken).toBe(4);
    expect(out.buckets[0]!.missed).toBe(1);
    expect(out.buckets[1]!.taken).toBe(1);
  });
});

describe('aggregateDoseHistory monthly', () => {
  it('uses YYYY-MM keys', () => {
    const out = aggregateDoseHistory(
      [
        taken(0, 8, 8),
        taken(20, 8, 8),
      ],
      {
        bucket: 'month',
        from: new Date(2026, 5, 1),
        to: new Date(2026, 6, 31),
        now: NOW,
      },
    );
    expect(out.buckets.map((b) => b.key)).toEqual(['2026-06', '2026-07']);
  });
});

describe('aggregateDoseHistory totals', () => {
  it('summarises across all buckets', () => {
    const out = aggregateDoseHistory(
      [
        taken(0, 8, 8),
        taken(0, 20, 22),
        missed(1, 8),
        skipped(2, 8),
      ],
      {
        bucket: 'day',
        from: new Date(2026, 5, 15),
        to: new Date(2026, 5, 17),
        now: NOW,
      },
    );
    expect(out.total).toEqual({
      taken: 1,
      late: 1,
      missed: 1,
      skipped: 1,
      upcoming: 0,
      total: 4,
    });
    expect(out.overallAdherence).toBe(0.667);
  });
});
