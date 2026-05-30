import { describe, it, expect } from 'vitest';
import { forecastStreakSurvival } from '../src/streak-forecast';
import type { DoseLike } from '../src/streak';

function mkDoses(now: Date, days: number, hitFn: (i: number) => boolean): DoseLike[] {
  const out: DoseLike[] = [];
  for (let i = days; i >= 1; i--) {
    const due = new Date(now.getTime() - i * 86_400_000);
    out.push({ dueAt: due.toISOString(), takenAt: hitFn(i) ? due.toISOString() : null });
  }
  return out;
}

const NOW = new Date('2026-05-15T12:00:00Z');

describe('forecastStreakSurvival', () => {
  it('returns survival ~1 for perfect adherence history', () => {
    const doses = mkDoses(NOW, 60, () => true);
    const f = forecastStreakSurvival({ doses, horizonDays: 14, now: NOW });
    expect(f.overallHitRate).toBeGreaterThan(0.9);
    expect(f.horizonSurvival).toBeGreaterThan(0.3);
    expect(f.horizonUpper).toBeGreaterThan(0.7);
    expect(f.projection).toHaveLength(14);
  });

  it('returns low survival for poor adherence history', () => {
    const doses = mkDoses(NOW, 60, (i) => i % 5 === 0);
    const f = forecastStreakSurvival({ doses, horizonDays: 14, now: NOW });
    expect(f.overallHitRate).toBeLessThan(0.5);
    expect(f.horizonSurvival).toBeLessThan(0.1);
    expect(f.medianBreakDay).not.toBeNull();
    expect(f.medianBreakDay!).toBeLessThanOrEqual(7);
  });

  it('survival is monotonically non-increasing across the horizon', () => {
    const doses = mkDoses(NOW, 90, (i) => i % 3 !== 0);
    const f = forecastStreakSurvival({ doses, horizonDays: 21, now: NOW });
    for (let i = 1; i < f.projection.length; i++) {
      expect(f.projection[i]!.survivalProbability).toBeLessThanOrEqual(
        f.projection[i - 1]!.survivalProbability + 1e-9,
      );
    }
  });

  it('confidence bands bracket the point estimate', () => {
    const doses = mkDoses(NOW, 60, (i) => i % 2 === 0);
    const f = forecastStreakSurvival({ doses, horizonDays: 7, now: NOW });
    for (const p of f.projection) {
      expect(p.lowerBound).toBeLessThanOrEqual(p.survivalProbability + 1e-9);
      expect(p.upperBound).toBeGreaterThanOrEqual(p.survivalProbability - 1e-9);
      expect(p.lowerBound).toBeGreaterThanOrEqual(0);
      expect(p.upperBound).toBeLessThanOrEqual(1);
    }
  });

  it('weights recent history more than distant history', () => {
    // Old half perfect, recent half terrible. Forecast should be pessimistic.
    const doses = mkDoses(NOW, 120, (i) => i > 60);
    const f = forecastStreakSurvival({ doses, horizonDays: 7, now: NOW, recencyHalfLifeDays: 14 });
    expect(f.overallHitRate).toBeLessThan(0.4);
  });

  it('produces 7 weekday hit rates in [0,1]', () => {
    const doses = mkDoses(NOW, 90, (i) => i % 2 === 0);
    const f = forecastStreakSurvival({ doses, horizonDays: 14, now: NOW });
    expect(f.weekdayHitRates).toHaveLength(7);
    for (const r of f.weekdayHitRates) {
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
    }
  });

  it('handles empty history with a weak-prior summary', () => {
    const f = forecastStreakSurvival({ doses: [], horizonDays: 7, now: NOW });
    expect(f.summary).toMatch(/no dose history/i);
    expect(f.projection).toHaveLength(7);
  });
});
