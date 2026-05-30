import { describe, it, expect } from 'vitest';
import { ReportService } from '../src/services/ReportService';

const svc = new ReportService();

describe('ReportService', () => {
  const refills = [
    { medicationId: 'a', filledAt: '2026-01-01T00:00:00.000Z', daySupply: 90 },
    { medicationId: 'b', filledAt: '2026-01-01T00:00:00.000Z', daySupply: 20 },
  ];
  const window = { start: new Date('2026-01-01T00:00:00.000Z'), end: new Date('2026-03-31T00:00:00.000Z') };

  it('adherence returns per-medication metrics', () => {
    const r = svc.adherence({ medicationIds: ['a', 'b'], refills, window });
    expect(r).toHaveLength(2);
    expect(r.find((m) => m.medicationId === 'a')!.pdc).toBe(1);
    expect(r.find((m) => m.medicationId === 'b')!.pdc).toBeLessThan(0.5);
  });

  it('adherenceSummary uses default 0.80 threshold', () => {
    const s = svc.adherenceSummary({ medicationIds: ['a', 'b'], refills, window });
    expect(s.threshold).toBe(0.8);
    expect(s.adherentCount).toBe(1);
    expect(s.nonAdherentCount).toBe(1);
  });

  it('monthly builds window from year/month', () => {
    const s = svc.monthly({ medicationIds: ['a'], refills, year: 2026, month: 2 });
    // Feb 2026 fully covered by 90-day fill starting Jan 1
    expect(s.averagePdc).toBe(1);
  });

  it('monthly with no coverage reports zero', () => {
    const s = svc.monthly({ medicationIds: ['x'], refills: [], year: 2026, month: 6 });
    expect(s.averagePdc).toBe(0);
    expect(s.nonAdherentCount).toBe(1);
  });
});
