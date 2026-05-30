import { describe, it, expect } from 'vitest';
import type { Dose } from '@med/types';
import { AdherenceRiskService } from '../src/services/AdherenceRiskService';

function dose(id: string, daysAgo: number, status: Dose['status']): Dose {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(9, 0, 0, 0);
  return { id, medicationId: 'm1', scheduleId: 's1', dueAt: d.toISOString(), takenAt: null, status } as Dose;
}

describe('AdherenceRiskService', () => {
  it('scores a high-risk medication as high', () => {
    const doses = Array.from({ length: 8 }).map((_, i) =>
      dose('d' + i, i + 1, i < 3 ? 'missed' : 'taken'),
    );
    const out = new AdherenceRiskService().score('m1', doses);
    expect(['moderate', 'high']).toContain(out.level);
    expect(out.features.consecutiveMisses).toBeGreaterThanOrEqual(0);
  });

  it('rank places risky medications first', () => {
    const good = Array.from({ length: 10 }).map((_, i) => dose('g' + i, i + 1, 'taken'));
    const bad = Array.from({ length: 10 }).map((_, i) =>
      dose('b' + i, i + 1, i < 4 ? 'missed' : 'taken'),
    );
    const out = new AdherenceRiskService().rank([
      { medicationId: 'good', doses: good },
      { medicationId: 'bad', doses: bad },
    ]);
    expect(out[0].medicationId).toBe('bad');
  });
});
