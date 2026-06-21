import { describe, it, expect } from 'vitest';
import {
  diffRegimen,
  renderDiffLines,
  type RegimenSnapshot,
} from '../src/regimen-change-diff';
import type { Medication, Schedule } from '@med/types';

function med(overrides: Partial<Medication>): Medication {
  return {
    id: overrides.id ?? 'm-1',
    userId: 'u-1',
    drugId: 'd-1',
    name: overrides.name ?? 'Lisinopril',
    strength: overrides.strength ?? '10mg',
    form: overrides.form ?? 'tablet',
    instructions: overrides.instructions,
    startDate: '2026-01-01',
    endDate: overrides.endDate ?? null,
    active: overrides.active ?? true,
    supplyRemaining: overrides.supplyRemaining ?? 30,
    dosesPerRefill: overrides.dosesPerRefill ?? 30,
  };
}

function sched(overrides: Partial<Schedule>): Schedule {
  return {
    id: overrides.id ?? 's-1',
    medicationId: overrides.medicationId ?? 'm-1',
    kind: overrides.kind ?? 'daily',
    times: overrides.times ?? ['08:00'],
    daysOfWeek: overrides.daysOfWeek,
    intervalHours: overrides.intervalHours,
    cronExpression: overrides.cronExpression,
    startsAt: '2026-01-01T00:00:00.000Z',
    endsAt: overrides.endsAt ?? null,
    enabled: overrides.enabled ?? true,
  };
}

describe('diffRegimen', () => {
  it('returns "no changes" headline when snapshots are identical', () => {
    const snap: RegimenSnapshot = {
      medications: [med({ id: 'm-1' })],
      schedules: [sched({ id: 's-1', medicationId: 'm-1' })],
    };
    const d = diffRegimen(snap, snap);
    expect(d.changeCount).toBe(0);
    expect(d.headline).toMatch(/No regimen/);
    expect(d.unchanged).toHaveLength(1);
  });

  it('detects an added medication', () => {
    const before: RegimenSnapshot = { medications: [], schedules: [] };
    const after: RegimenSnapshot = {
      medications: [med({ id: 'm-1', name: 'Metformin' })],
      schedules: [sched({ id: 's-1', medicationId: 'm-1' })],
    };
    const d = diffRegimen(before, after);
    expect(d.added).toHaveLength(1);
    expect(d.added[0]!.name).toBe('Metformin');
    expect(d.headline).toMatch(/1 added/);
  });

  it('detects a removed medication when entry disappears entirely', () => {
    const before: RegimenSnapshot = {
      medications: [med({ id: 'm-1', name: 'Atorvastatin' })],
      schedules: [],
    };
    const after: RegimenSnapshot = { medications: [], schedules: [] };
    const d = diffRegimen(before, after);
    expect(d.removed).toHaveLength(1);
    expect(d.removed[0]!.reason).toBe('absent');
  });

  it('detects a removed medication when active flips to false', () => {
    const before: RegimenSnapshot = {
      medications: [med({ id: 'm-1', active: true })],
      schedules: [],
    };
    const after: RegimenSnapshot = {
      medications: [med({ id: 'm-1', active: false })],
      schedules: [],
    };
    const d = diffRegimen(before, after);
    expect(d.removed).toHaveLength(1);
    expect(d.removed[0]!.reason).toBe('inactive');
  });

  it('skips the "inactive -> removed" categorization when option is off', () => {
    const before: RegimenSnapshot = {
      medications: [med({ id: 'm-1', active: true })],
      schedules: [],
    };
    const after: RegimenSnapshot = {
      medications: [med({ id: 'm-1', active: false })],
      schedules: [],
    };
    const d = diffRegimen(before, after, { treatInactiveAsRemoved: false });
    expect(d.removed).toHaveLength(0);
  });

  it('detects a strength change', () => {
    const before: RegimenSnapshot = {
      medications: [med({ id: 'm-1', strength: '10mg' })],
      schedules: [],
    };
    const after: RegimenSnapshot = {
      medications: [med({ id: 'm-1', strength: '20mg' })],
      schedules: [],
    };
    const d = diffRegimen(before, after);
    expect(d.changed).toHaveLength(1);
    expect(d.changed[0]!.diffs).toHaveLength(1);
    expect(d.changed[0]!.diffs[0]!.field).toBe('strength');
    expect(d.changed[0]!.diffs[0]!.before).toBe('10mg');
    expect(d.changed[0]!.diffs[0]!.after).toBe('20mg');
  });

  it('detects a schedule change (new time added)', () => {
    const before: RegimenSnapshot = {
      medications: [med({ id: 'm-1' })],
      schedules: [sched({ id: 's-1', times: ['08:00'] })],
    };
    const after: RegimenSnapshot = {
      medications: [med({ id: 'm-1' })],
      schedules: [sched({ id: 's-1', times: ['08:00', '20:00'] })],
    };
    const d = diffRegimen(before, after);
    expect(d.changed).toHaveLength(1);
    expect(d.changed[0]!.diffs.length).toBeGreaterThan(0);
  });

  it('treats schedule order-independent times equally', () => {
    const before: RegimenSnapshot = {
      medications: [med({ id: 'm-1' })],
      schedules: [sched({ id: 's-1', times: ['08:00', '20:00'] })],
    };
    const after: RegimenSnapshot = {
      medications: [med({ id: 'm-1' })],
      schedules: [sched({ id: 's-1', times: ['20:00', '08:00'] })],
    };
    const d = diffRegimen(before, after);
    expect(d.changed).toHaveLength(0);
    expect(d.unchanged).toHaveLength(1);
  });

  it('detects a schedule kind change (daily -> interval)', () => {
    const before: RegimenSnapshot = {
      medications: [med({ id: 'm-1' })],
      schedules: [sched({ id: 's-1', kind: 'daily', times: ['08:00'] })],
    };
    const after: RegimenSnapshot = {
      medications: [med({ id: 'm-1' })],
      schedules: [sched({ id: 's-1', kind: 'interval', intervalHours: 8, times: [] })],
    };
    const d = diffRegimen(before, after);
    expect(d.changed).toHaveLength(1);
  });

  it('treats both schedule snapshots as schedules-removed + schedules-added on kind change', () => {
    const before: RegimenSnapshot = {
      medications: [med({ id: 'm-1' })],
      schedules: [sched({ id: 's-1', kind: 'daily', times: ['08:00'] })],
    };
    const after: RegimenSnapshot = {
      medications: [med({ id: 'm-1' })],
      schedules: [sched({ id: 's-1', kind: 'interval', intervalHours: 8, times: [] })],
    };
    const d = diffRegimen(before, after);
    const labels = d.changed[0]!.diffs.map((x) => x.label);
    expect(labels.some((l) => l.includes('added'))).toBe(true);
    expect(labels.some((l) => l.includes('removed'))).toBe(true);
  });

  it('detects instructions change', () => {
    const before: RegimenSnapshot = {
      medications: [med({ id: 'm-1', instructions: 'with food' })],
      schedules: [],
    };
    const after: RegimenSnapshot = {
      medications: [med({ id: 'm-1', instructions: 'on empty stomach' })],
      schedules: [],
    };
    const d = diffRegimen(before, after);
    expect(d.changed[0]!.diffs[0]!.field).toBe('instructions');
  });

  it('honors the fields allow-list', () => {
    const before: RegimenSnapshot = {
      medications: [med({ id: 'm-1', strength: '10mg', supplyRemaining: 30 })],
      schedules: [],
    };
    const after: RegimenSnapshot = {
      medications: [med({ id: 'm-1', strength: '20mg', supplyRemaining: 60 })],
      schedules: [],
    };
    const dStrengthOnly = diffRegimen(before, after, { fields: ['strength'] });
    expect(dStrengthOnly.changed[0]!.diffs).toHaveLength(1);
    expect(dStrengthOnly.changed[0]!.diffs[0]!.field).toBe('strength');
    const dSupplyOnly = diffRegimen(before, after, { fields: ['supplyRemaining'] });
    expect(dSupplyOnly.changed[0]!.diffs[0]!.field).toBe('supplyRemaining');
  });

  it('ignores medications that are inactive in both snapshots', () => {
    const before: RegimenSnapshot = {
      medications: [med({ id: 'm-1', active: false })],
      schedules: [],
    };
    const after: RegimenSnapshot = {
      medications: [med({ id: 'm-1', active: false })],
      schedules: [],
    };
    const d = diffRegimen(before, after);
    expect(d.unchanged).toHaveLength(0);
    expect(d.removed).toHaveLength(0);
    expect(d.changed).toHaveLength(0);
  });

  it('produces a headline summarizing all three buckets', () => {
    const before: RegimenSnapshot = {
      medications: [med({ id: 'm-1', strength: '10mg' }), med({ id: 'm-2', name: 'Old' })],
      schedules: [],
    };
    const after: RegimenSnapshot = {
      medications: [
        med({ id: 'm-1', strength: '20mg' }),
        med({ id: 'm-3', name: 'New' }),
      ],
      schedules: [],
    };
    const d = diffRegimen(before, after);
    expect(d.changeCount).toBe(3);
    expect(d.headline).toMatch(/1 added/);
    expect(d.headline).toMatch(/1 discontinued/);
    expect(d.headline).toMatch(/1 changed/);
  });
});

describe('renderDiffLines', () => {
  it('renders added / removed / changed lines in order', () => {
    const before: RegimenSnapshot = {
      medications: [
        med({ id: 'm-1', strength: '10mg' }),
        med({ id: 'm-2', name: 'OldDrug' }),
      ],
      schedules: [],
    };
    const after: RegimenSnapshot = {
      medications: [
        med({ id: 'm-1', strength: '20mg' }),
        med({ id: 'm-3', name: 'NewDrug' }),
      ],
      schedules: [],
    };
    const d = diffRegimen(before, after);
    const lines = renderDiffLines(d);
    expect(lines[0]).toMatch(/^\+ Added NewDrug/);
    expect(lines.find((l) => l.startsWith('- Discontinued OldDrug'))).toBeDefined();
    expect(lines.find((l) => l.startsWith('~ Lisinopril'))).toBeDefined();
  });

  it('marks inactive removals separately', () => {
    const before: RegimenSnapshot = {
      medications: [med({ id: 'm-1', active: true })],
      schedules: [],
    };
    const after: RegimenSnapshot = {
      medications: [med({ id: 'm-1', active: false })],
      schedules: [],
    };
    const d = diffRegimen(before, after);
    const lines = renderDiffLines(d);
    expect(lines[0]).toMatch(/marked inactive/);
  });
});
