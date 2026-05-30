import { describe, it, expect } from 'vitest';
import { TitrationService } from '../src/services/TitrationService';
import type { TitrationPlan } from '@med/utils';

const plan: TitrationPlan = {
  id: 'p1',
  medicationId: 'm1',
  startDate: '2026-06-01',
  steps: [
    { dose: 20, unit: 'mg', durationDays: 7 },
    { dose: 10, unit: 'mg', durationDays: 7 },
    { dose: 5, unit: 'mg', durationDays: null },
  ],
};

describe('TitrationService', () => {
  it('lookup returns dose and next change', () => {
    const svc = new TitrationService();
    const out = svc.lookup(plan, new Date('2026-06-03T00:00:00Z'));
    if ('code' in out) throw new Error('should succeed');
    expect(out.dose).toEqual({ dose: 20, unit: 'mg' });
    expect(out.nextChange?.toDose).toBe(10);
    expect(out.planDurationDays).toBeNull();
  });

  it('lookup rejects invalid plans', () => {
    const svc = new TitrationService();
    const bad = { ...plan, steps: [] } as TitrationPlan;
    const out = svc.lookup(bad, new Date());
    expect('code' in out && out.code).toBe('invalid_plan');
  });

  it('timeline rejects inverted ranges', () => {
    const svc = new TitrationService();
    const out = svc.timeline(plan, new Date('2026-06-10'), new Date('2026-06-01'));
    expect(Array.isArray(out)).toBe(false);
    expect((out as { code: string }).code).toBe('invalid_range');
  });

  it('timeline rejects windows over 366 days', () => {
    const svc = new TitrationService();
    const out = svc.timeline(plan, new Date('2026-06-01'), new Date('2027-07-01'));
    expect(Array.isArray(out)).toBe(false);
  });

  it('timeline emits per-day rows', () => {
    const svc = new TitrationService();
    const out = svc.timeline(plan, new Date(2026, 5, 6), new Date(2026, 5, 9));
    expect(Array.isArray(out)).toBe(true);
    expect((out as { dose: number }[]).map((r) => r.dose)).toEqual([20, 20, 10, 10]);
  });
});
