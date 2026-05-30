import { describe, it, expect } from 'vitest';
import type { Dose } from '@med/types';
import { computeRiskFeatures, rankRisk, scoreRisk } from '../src/adherence-risk';

function dose(over: Partial<Dose> & { dueAt: string; status: Dose['status'] }): Dose {
  return {
    id: over.id ?? 'd-' + over.dueAt,
    medicationId: over.medicationId ?? 'm1',
    scheduleId: over.scheduleId ?? 's1',
    dueAt: over.dueAt,
    takenAt: over.takenAt ?? null,
    status: over.status,
    note: over.note,
  } as Dose;
}

function isoDaysAgo(days: number, hour = 9): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

describe('computeRiskFeatures', () => {
  it('reports zero stats for empty history', () => {
    const f = computeRiskFeatures([]);
    expect(f.totalDoses).toBe(0);
    expect(f.recentMissRate).toBe(0);
    expect(f.emaFailureRate).toBe(0);
  });

  it('weights recent misses higher than old ones', () => {
    const recent = [
      dose({ dueAt: isoDaysAgo(0), status: 'missed' }),
      dose({ dueAt: isoDaysAgo(1), status: 'missed' }),
      dose({ dueAt: isoDaysAgo(2), status: 'taken' }),
      dose({ dueAt: isoDaysAgo(25), status: 'taken' }),
      dose({ dueAt: isoDaysAgo(26), status: 'taken' }),
    ];
    const old = [
      dose({ dueAt: isoDaysAgo(0), status: 'taken' }),
      dose({ dueAt: isoDaysAgo(1), status: 'taken' }),
      dose({ dueAt: isoDaysAgo(2), status: 'taken' }),
      dose({ dueAt: isoDaysAgo(25), status: 'missed' }),
      dose({ dueAt: isoDaysAgo(26), status: 'missed' }),
    ];
    expect(computeRiskFeatures(recent).emaFailureRate).toBeGreaterThan(
      computeRiskFeatures(old).emaFailureRate,
    );
  });

  it('detects time-of-day bucket misses when nextDueAt provided', () => {
    const morning = isoDaysAgo(1, 9);
    const evening = isoDaysAgo(1, 21);
    const doses = [
      dose({ id: '1', dueAt: morning, status: 'missed' }),
      dose({ id: '2', dueAt: isoDaysAgo(2, 9), status: 'missed' }),
      dose({ id: '3', dueAt: isoDaysAgo(3, 9), status: 'missed' }),
      dose({ id: '4', dueAt: evening, status: 'taken' }),
      dose({ id: '5', dueAt: isoDaysAgo(2, 21), status: 'taken' }),
    ];
    const next = new Date();
    next.setHours(9, 0, 0, 0);
    const f = computeRiskFeatures(doses, { nextDueAt: next });
    expect(f.timeBucketMissRate).toBe(1);
  });

  it('counts consecutive trailing misses', () => {
    const doses = [
      dose({ id: '1', dueAt: isoDaysAgo(5), status: 'taken' }),
      dose({ id: '2', dueAt: isoDaysAgo(4), status: 'taken' }),
      dose({ id: '3', dueAt: isoDaysAgo(2), status: 'missed' }),
      dose({ id: '4', dueAt: isoDaysAgo(1), status: 'skipped' }),
    ];
    expect(computeRiskFeatures(doses).consecutiveMisses).toBe(2);
  });
});

describe('scoreRisk', () => {
  it('returns low risk and insufficient-history note for tiny samples', () => {
    const r = scoreRisk('m1', [dose({ dueAt: isoDaysAgo(1), status: 'taken' })]);
    expect(r.level).toBe('low');
    expect(r.score).toBe(0);
    expect(r.reasons).toContain('insufficient history');
  });

  it('flags a streak of misses as high risk', () => {
    const doses = Array.from({ length: 10 }).map((_, i) =>
      dose({ id: 'd' + i, dueAt: isoDaysAgo(i + 1), status: i < 4 ? 'missed' : 'taken' }),
    );
    const r = scoreRisk('m1', doses);
    expect(r.level).toBe('high');
    expect(r.score).toBeGreaterThan(0.4);
  });

  it('rates a fully adherent history as low risk', () => {
    const doses = Array.from({ length: 20 }).map((_, i) =>
      dose({ id: 'd' + i, dueAt: isoDaysAgo(i + 1), status: 'taken' }),
    );
    const r = scoreRisk('m1', doses);
    expect(r.level).toBe('low');
    expect(r.score).toBeLessThan(0.1);
    expect(r.reasons).toContain('adherence stable');
  });

  it('clamps the score to 0..1', () => {
    const doses = Array.from({ length: 20 }).map((_, i) =>
      dose({ id: 'd' + i, dueAt: isoDaysAgo(i + 1), status: 'missed' }),
    );
    const r = scoreRisk('m1', doses);
    expect(r.score).toBeLessThanOrEqual(1);
    expect(r.score).toBeGreaterThan(0.5);
  });
});

describe('rankRisk', () => {
  it('orders highest risk first', () => {
    const good = Array.from({ length: 10 }).map((_, i) =>
      dose({ id: 'g' + i, dueAt: isoDaysAgo(i + 1), status: 'taken' }),
    );
    const bad = Array.from({ length: 10 }).map((_, i) =>
      dose({ id: 'b' + i, dueAt: isoDaysAgo(i + 1), status: i < 5 ? 'missed' : 'taken' }),
    );
    const out = rankRisk([
      { medicationId: 'good', doses: good },
      { medicationId: 'bad', doses: bad },
    ]);
    expect(out[0].medicationId).toBe('bad');
  });
});
