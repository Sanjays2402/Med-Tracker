import { describe, it, expect } from 'vitest';
import type { Schedule } from '@med/types';
import { resolveConflicts } from '../src/schedule-resolver';
import { detectScheduleConflicts, type ScheduledMedication } from '../src/schedule-conflicts';

function sched(id: string, medicationId: string, times: string[]): Schedule {
  return {
    id,
    medicationId,
    kind: 'daily',
    times,
    startsAt: '2026-01-01T00:00:00.000Z',
    enabled: true,
  } as Schedule;
}

const FROM = new Date(2026, 5, 1, 0, 0, 0);
const TO = new Date(2026, 5, 1, 23, 59, 59);

describe('resolveConflicts', () => {
  it('returns no proposals when there are no conflicts', () => {
    const meds: ScheduledMedication[] = [
      { medicationId: 'a', schedule: sched('s1', 'a', ['08:00']) },
      { medicationId: 'b', schedule: sched('s2', 'b', ['14:00']) },
    ];
    expect(resolveConflicts(meds, { from: FROM, to: TO, clusterThreshold: 2 })).toEqual([]);
  });

  it('splits a cluster by shifting at least one dose', () => {
    const meds: ScheduledMedication[] = [
      { medicationId: 'a', schedule: sched('s1', 'a', ['08:00']) },
      { medicationId: 'b', schedule: sched('s2', 'b', ['08:00']) },
      { medicationId: 'c', schedule: sched('s3', 'c', ['08:05']) },
      { medicationId: 'd', schedule: sched('s4', 'd', ['08:10']) },
    ];
    const proposals = resolveConflicts(meds, {
      from: FROM,
      to: TO,
      clusterThreshold: 4,
      clusterWindowMinutes: 15,
    });
    expect(proposals.length).toBeGreaterThan(0);
    expect(Math.abs(proposals[0].shiftMinutes)).toBeGreaterThan(0);
  });

  it('honors locked schedule ids', () => {
    const meds: ScheduledMedication[] = [
      { medicationId: 'a', schedule: sched('locked', 'a', ['08:00']) },
      { medicationId: 'b', schedule: sched('s2', 'b', ['08:00']) },
    ];
    const proposals = resolveConflicts(meds, {
      from: FROM,
      to: TO,
      duplicateWindowMinutes: 5,
      spacingRules: [{ medicationA: 'a', medicationB: 'b', minMinutes: 60, reason: 'absorption' }],
      lockedScheduleIds: ['locked'],
    });
    for (const p of proposals) {
      expect(p.scheduleId).not.toBe('locked');
    }
  });

  it('separates two meds with a spacing rule', () => {
    const meds: ScheduledMedication[] = [
      { medicationId: 'thyroid', schedule: sched('s1', 'thyroid', ['08:00']) },
      { medicationId: 'calcium', schedule: sched('s2', 'calcium', ['08:00']) },
    ];
    const opts = {
      from: FROM,
      to: TO,
      spacingRules: [{ medicationA: 'thyroid', medicationB: 'calcium', minMinutes: 60, reason: 'absorption' }],
    };
    const before = detectScheduleConflicts(meds, opts).length;
    expect(before).toBeGreaterThan(0);

    const proposals = resolveConflicts(meds, opts);
    expect(proposals.length).toBeGreaterThan(0);

    const updated = meds.map((m) => {
      const p = proposals.find((x) => x.scheduleId === m.schedule.id);
      if (!p) return m;
      const times = [...m.schedule.times];
      times[p.timeIndex] = p.proposedTime;
      return { medicationId: m.medicationId, schedule: { ...m.schedule, times } };
    });
    const after = detectScheduleConflicts(updated, opts).length;
    expect(after).toBeLessThan(before);
  });

  it('returns proposals with bounded shift minutes', () => {
    const meds: ScheduledMedication[] = [
      { medicationId: 'a', schedule: sched('s1', 'a', ['08:00']) },
      { medicationId: 'b', schedule: sched('s2', 'b', ['08:00']) },
      { medicationId: 'c', schedule: sched('s3', 'c', ['08:00']) },
      { medicationId: 'd', schedule: sched('s4', 'd', ['08:00']) },
    ];
    const proposals = resolveConflicts(meds, {
      from: FROM,
      to: TO,
      clusterThreshold: 4,
      maxShiftMinutes: 45,
    });
    for (const p of proposals) {
      expect(Math.abs(p.shiftMinutes)).toBeLessThanOrEqual(45);
    }
  });
});
