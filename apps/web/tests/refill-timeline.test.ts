import { describe, it, expect } from 'vitest';
import { daysFromNow, buildTimeline, type TimelineRefillInput } from '../lib/refill-timeline';

// Fixed reference: 2026-06-25 12:00 local.
const NOW = new Date(2026, 5, 25, 12, 0, 0, 0).getTime();

function at(daysOut: number): string {
  return new Date(NOW + daysOut * 86_400_000).toISOString();
}

const refills: TimelineRefillInput[] = [
  { id: 'overdue', medicationName: 'Amoxicillin', refillBy: at(-2), status: 'needed' },
  { id: 'soon', medicationName: 'Atorvastatin', refillBy: at(3), status: 'needed' },
  { id: 'later', medicationName: 'Lisinopril', refillBy: at(11), status: 'requested' },
  { id: 'ready', medicationName: 'Metformin', refillBy: at(21), status: 'ready' },
];

describe('daysFromNow', () => {
  it('returns whole days for future and past dates', () => {
    expect(daysFromNow(at(3), NOW)).toBe(3);
    expect(daysFromNow(at(-2), NOW)).toBe(-2);
    expect(daysFromNow(at(0), NOW)).toBe(0);
  });
  it('returns 0 for an unparseable date', () => {
    expect(daysFromNow('not-a-date', NOW)).toBe(0);
  });
});

describe('buildTimeline — positions', () => {
  const model = buildTimeline(refills, NOW, { windowDays: 30, overdueGutterDays: 3 });

  it('places today after the overdue gutter', () => {
    // gutter 3 / span 33 = 0.0909...
    expect(model.todayPosition).toBeCloseTo(3 / 33, 5);
  });
  it('positions are monotonic left-to-right by date', () => {
    const ps = model.marks.map((m) => m.position);
    const sorted = [...ps].sort((a, b) => a - b);
    expect(ps).toEqual(sorted);
  });
  it('clamps a far-future refill to the right edge', () => {
    const far = buildTimeline(
      [{ id: 'x', medicationName: 'X', refillBy: at(900), status: 'needed' }],
      NOW,
      { windowDays: 30 },
    );
    expect(far.marks[0]!.position).toBe(1);
  });
  it('clamps a long-overdue refill to the left edge', () => {
    const old = buildTimeline(
      [{ id: 'x', medicationName: 'X', refillBy: at(-90), status: 'needed' }],
      NOW,
      { windowDays: 30, overdueGutterDays: 3 },
    );
    expect(old.marks[0]!.position).toBe(0);
  });
});

describe('buildTimeline — tone + overdue', () => {
  const model = buildTimeline(refills, NOW);

  it('flags overdue refills', () => {
    expect(model.hasOverdue).toBe(true);
    expect(model.marks.find((m) => m.id === 'overdue')!.overdue).toBe(true);
  });
  it('tones by urgency and status', () => {
    const byId = Object.fromEntries(model.marks.map((m) => [m.id, m.tone]));
    expect(byId.overdue).toBe('overdue');
    expect(byId.soon).toBe('soon');   // 3 days out
    expect(byId.later).toBe('later'); // 11 days out
    expect(byId.ready).toBe('done');  // ready status wins regardless of date
  });
  it('reports no overdue when all future', () => {
    const m = buildTimeline([refills[1]!, refills[2]!], NOW);
    expect(m.hasOverdue).toBe(false);
  });
});

describe('buildTimeline — lanes', () => {
  it('keeps well-separated marks on lane 0', () => {
    const model = buildTimeline(refills, NOW, { laneGap: 0.06 });
    expect(model.marks.every((m) => m.lane === 0)).toBe(true);
  });
  it('stacks near-coincident marks onto separate lanes', () => {
    const clustered: TimelineRefillInput[] = [
      { id: 'a', medicationName: 'A', refillBy: at(5), status: 'needed' },
      { id: 'b', medicationName: 'B', refillBy: at(5), status: 'needed' },
      { id: 'c', medicationName: 'C', refillBy: at(5), status: 'needed' },
    ];
    const model = buildTimeline(clustered, NOW, { laneGap: 0.06 });
    expect(new Set(model.marks.map((m) => m.lane)).size).toBe(3);
  });
});

describe('buildTimeline — ticks', () => {
  it('emits gridline ticks every tickEveryDays across the window', () => {
    const model = buildTimeline([], NOW, { windowDays: 30, tickEveryDays: 7 });
    expect(model.ticks.map((t) => t.dayOffset)).toEqual([0, 7, 14, 21, 28]);
    expect(model.ticks.every((t) => t.position >= 0 && t.position <= 1)).toBe(true);
  });
});
