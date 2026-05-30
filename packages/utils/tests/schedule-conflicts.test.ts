import { describe, it, expect } from 'vitest';
import { detectScheduleConflicts, type ScheduledMedication } from '../src/schedule-conflicts';

function dailySchedule(id: string, medId: string, times: string[]): ScheduledMedication {
  return {
    medicationId: medId,
    schedule: {
      id,
      medicationId: medId,
      kind: 'daily',
      times,
      startsAt: '2026-01-01T00:00:00.000Z',
      enabled: true,
    } as any,
  };
}

const window = { from: new Date('2026-01-01T00:00:00.000Z'), to: new Date('2026-01-01T23:59:59.000Z') };

describe('detectScheduleConflicts', () => {
  it('returns no conflicts for a single morning dose', () => {
    const out = detectScheduleConflicts([dailySchedule('s1', 'm1', ['08:00'])], window);
    expect(out).toEqual([]);
  });

  it('flags a cluster when many doses bunch within the window', () => {
    const meds = [
      dailySchedule('s1', 'm1', ['08:00']),
      dailySchedule('s2', 'm2', ['08:05']),
      dailySchedule('s3', 'm3', ['08:10']),
      dailySchedule('s4', 'm4', ['08:12']),
    ];
    const out = detectScheduleConflicts(meds, window);
    const clusters = out.filter((c) => c.kind === 'cluster');
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.medicationIds.sort()).toEqual(['m1', 'm2', 'm3', 'm4']);
  });

  it('does not flag a cluster below the threshold', () => {
    const meds = [
      dailySchedule('s1', 'm1', ['08:00']),
      dailySchedule('s2', 'm2', ['08:10']),
      dailySchedule('s3', 'm3', ['08:14']),
    ];
    const out = detectScheduleConflicts(meds, window);
    expect(out.filter((c) => c.kind === 'cluster')).toHaveLength(0);
  });

  it('detects duplicate doses across two schedules for one med', () => {
    const meds = [
      dailySchedule('s1', 'm1', ['09:00']),
      dailySchedule('s2', 'm1', ['09:02']),
    ];
    const out = detectScheduleConflicts(meds, window);
    expect(out.filter((c) => c.kind === 'duplicate')).toHaveLength(1);
    expect(out[0]!.severity).toBe('critical');
  });

  it('ignores duplicate-flagging for the same schedule listed twice', () => {
    // Same schedule cannot collide with itself; engine compares scheduleId.
    const meds = [dailySchedule('s1', 'm1', ['09:00', '09:03'])];
    const out = detectScheduleConflicts(meds, window);
    expect(out.filter((c) => c.kind === 'duplicate')).toHaveLength(0);
  });

  it('flags spacing rule violations between two medications', () => {
    const meds = [
      dailySchedule('s1', 'levothyroxine', ['08:00']),
      dailySchedule('s2', 'calcium', ['08:30']),
    ];
    const out = detectScheduleConflicts(meds, {
      ...window,
      spacingRules: [
        { medicationA: 'levothyroxine', medicationB: 'calcium', minMinutes: 240, reason: 'Separate by 4 hours.' },
      ],
    });
    const spacing = out.filter((c) => c.kind === 'spacing');
    expect(spacing).toHaveLength(1);
    expect(spacing[0]!.message).toContain('Separate by 4 hours');
  });

  it('respects spacing rules in either ordering of A and B', () => {
    const meds = [
      dailySchedule('s1', 'B', ['08:00']),
      dailySchedule('s2', 'A', ['09:00']),
    ];
    const out = detectScheduleConflicts(meds, {
      ...window,
      spacingRules: [{ medicationA: 'A', medicationB: 'B', minMinutes: 120 }],
    });
    expect(out.some((c) => c.kind === 'spacing')).toBe(true);
  });

  it('does not flag spacing when the gap is met', () => {
    const meds = [
      dailySchedule('s1', 'A', ['08:00']),
      dailySchedule('s2', 'B', ['14:00']),
    ];
    const out = detectScheduleConflicts(meds, {
      ...window,
      spacingRules: [{ medicationA: 'A', medicationB: 'B', minMinutes: 240 }],
    });
    expect(out.filter((c) => c.kind === 'spacing')).toHaveLength(0);
  });

  it('sorts results by time and severity', () => {
    const meds = [
      dailySchedule('s1', 'A', ['08:00']),
      dailySchedule('s2', 'B', ['08:30']),
      dailySchedule('s3', 'A', ['08:01']),
    ];
    const out = detectScheduleConflicts(meds, {
      ...window,
      spacingRules: [{ medicationA: 'A', medicationB: 'B', minMinutes: 60 }],
    });
    // duplicate (critical) at 08:00 comes before spacing at 08:00 sort tiebreak.
    expect(out[0]!.kind).toBe('duplicate');
    for (let i = 1; i < out.length; i++) {
      expect(out[i - 1]!.at <= out[i]!.at).toBe(true);
    }
  });
});
