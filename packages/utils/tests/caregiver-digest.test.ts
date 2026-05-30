import { describe, it, expect } from 'vitest';
import { composeCaregiverDigest, type DigestInput } from '../src/caregiver-digest';
import type { AdherenceSummary } from '../src/adherence-metrics';

const adherence: AdherenceSummary = {
  perMedication: [
    { medicationId: 'a', windowDays: 7, daysCovered: 7, daysSupplied: 7, pdc: 1, mpr: 1, mprCapped: 1, gaps: [] },
    { medicationId: 'b', windowDays: 7, daysCovered: 4, daysSupplied: 4, pdc: 0.571, mpr: 0.571, mprCapped: 0.571, gaps: [{ start: '2026-01-05', end: '2026-01-07', days: 3 }] },
  ],
  averagePdc: 0.786,
  averageMpr: 0.786,
  adherentCount: 1,
  nonAdherentCount: 1,
  threshold: 0.8,
};

const baseInput: DigestInput = {
  patient: { name: 'Jane Doe', display: 'Mom' },
  weekStart: '2026-01-01',
  weekEnd: '2026-01-07',
  adherence,
  medicationNames: { a: 'Atorvastatin', b: 'Metformin' },
  missedDoses: [],
};

describe('composeCaregiverDigest', () => {
  it('builds a subject with patient display and rounded percent', () => {
    const out = composeCaregiverDigest(baseInput);
    expect(out.subject).toBe('Med-Tracker weekly update for Mom: 79% adherence');
  });

  it('reports the configured threshold in the body', () => {
    const out = composeCaregiverDigest(baseInput);
    expect(out.text).toContain('Medications below 80%: 1');
    expect(out.text).toContain('Overall adherence (PDC): 79%');
  });

  it('lists per-medication lines sorted by lowest PDC first', () => {
    const out = composeCaregiverDigest(baseInput);
    const idxA = out.text.indexOf('Atorvastatin');
    const idxB = out.text.indexOf('Metformin');
    expect(idxB).toBeLessThan(idxA);
    expect(out.text).toContain(' 57%  Metformin (1 gap)');
    expect(out.text).toContain('100%  Atorvastatin');
  });

  it('caps missed dose listing at 10 with an overflow line', () => {
    const many = Array.from({ length: 14 }, (_, i) => ({
      medicationId: 'b',
      medicationName: 'Metformin',
      scheduledFor: `2026-01-0${(i % 7) + 1} 08:00`,
    }));
    const out = composeCaregiverDigest({ ...baseInput, missedDoses: many });
    expect(out.text).toContain('Recent missed doses:');
    expect(out.text).toContain('...and 4 more');
    expect(out.stats.missedCount).toBe(14);
  });

  it('only lists refills due within 7 days', () => {
    const out = composeCaregiverDigest({
      ...baseInput,
      refills: [
        { medicationId: 'a', supplyRemaining: 30, dailyUsage: 1, daysOfSupply: 30, runOutDate: null, refillByDate: null, status: 'ok', reason: '' } as any,
        { medicationId: 'b', supplyRemaining: 3, dailyUsage: 1, daysOfSupply: 3, runOutDate: null, refillByDate: null, status: 'low', reason: '' } as any,
      ],
    });
    expect(out.stats.refillsDueSoon).toBe(1);
    expect(out.text).toContain('Refills due within 7 days: 1');
    expect(out.text).toContain('Metformin: 3 days remaining');
    expect(out.text).not.toContain('Atorvastatin: 30 days');
  });

  it('falls back to patient.name when display is missing', () => {
    const out = composeCaregiverDigest({ ...baseInput, patient: { name: 'Jane Doe' } });
    expect(out.subject).toContain('Jane Doe');
  });

  it('omits sections that have no content', () => {
    const out = composeCaregiverDigest({ ...baseInput, missedDoses: [] });
    expect(out.text).not.toContain('Recent missed doses:');
    expect(out.text).not.toContain('Upcoming refills:');
  });

  it('always closes with an unsubscribe hint', () => {
    const out = composeCaregiverDigest(baseInput);
    expect(out.text).toContain('revoke your share');
  });
});
