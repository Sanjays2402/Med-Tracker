import { describe, it, expect } from 'vitest';
import { correlateSideEffects } from '../src/side-effect-correlation';

function isoDay(d: number, hour = 8): string {
  return new Date(Date.UTC(2026, 0, d, hour, 0, 0)).toISOString();
}

describe('correlateSideEffects', () => {
  it('returns empty findings when there are no doses or symptoms', () => {
    const r = correlateSideEffects({ doses: [], symptoms: [], medicationStarts: {} });
    expect(r.findings).toEqual([]);
  });

  it('flags medications below minimum dose count', () => {
    const r = correlateSideEffects({
      doses: [
        { medicationId: 'A', takenAt: isoDay(1) },
        { medicationId: 'A', takenAt: isoDay(2) },
      ],
      symptoms: [
        { symptom: 'nausea', reportedAt: isoDay(1, 10) },
        { symptom: 'nausea', reportedAt: isoDay(2, 10) },
        { symptom: 'nausea', reportedAt: isoDay(3, 10) },
      ],
      medicationStarts: { A: isoDay(1) },
      minDoses: 5,
    });
    expect(r.ignoredMedications).toContain('A');
    expect(r.findings).toEqual([]);
  });

  it('flags symptoms below minimum report count', () => {
    const doses = Array.from({ length: 10 }, (_, i) => ({ medicationId: 'A', takenAt: isoDay(i + 1) }));
    const r = correlateSideEffects({
      doses,
      symptoms: [{ symptom: 'rash', reportedAt: isoDay(2) }],
      medicationStarts: { A: isoDay(1) },
    });
    expect(r.ignoredSymptoms).toContain('rash');
  });

  it('produces a strong onset score when reports cluster after doses', () => {
    // Med A taken 10 days at 08:00; symptom always at 10:00 (2h after dose, inside 6h window).
    const doses = Array.from({ length: 10 }, (_, i) => ({ medicationId: 'A', takenAt: isoDay(i + 1, 8) }));
    const symptoms = Array.from({ length: 10 }, (_, i) => ({ symptom: 'nausea', reportedAt: isoDay(i + 1, 10) }));
    const r = correlateSideEffects({ doses, symptoms, medicationStarts: { A: isoDay(1) } });
    const f = r.findings.find((x) => x.medicationId === 'A' && x.symptom === 'nausea')!;
    expect(f).toBeDefined();
    expect(f.inWindowReports).toBe(10);
    expect(f.score).toBeGreaterThan(0.3);
    expect(f.reason).toMatch(/dose windows/);
  });

  it('produces a strong introduction score when symptom only appears post-start', () => {
    // Doses start day 11. Symptoms appear days 12-20.
    const doses = Array.from({ length: 10 }, (_, i) => ({ medicationId: 'A', takenAt: isoDay(11 + i, 8) }));
    // Predose observation: also add a baseline event for day 1 to set obsStart.
    const symptoms = [
      { symptom: 'nausea', reportedAt: isoDay(1, 9) }, // single pre-start, but needed to set obs window
    ];
    for (let i = 0; i < 8; i++) symptoms.push({ symptom: 'nausea', reportedAt: isoDay(12 + i, 14) });
    const r = correlateSideEffects({
      doses,
      symptoms,
      medicationStarts: { A: isoDay(11) },
    });
    const f = r.findings.find((x) => x.medicationId === 'A' && x.symptom === 'nausea')!;
    expect(f).toBeDefined();
    expect(f.postPerDay).toBeGreaterThan(f.baselinePerDay);
    expect(f.score).toBeGreaterThan(0);
  });

  it('yields a near-zero score when symptom is unrelated to dose timing', () => {
    // Doses at 08:00; symptoms at 02:00 (8h before next dose, outside 6h window).
    const doses = Array.from({ length: 10 }, (_, i) => ({ medicationId: 'A', takenAt: isoDay(i + 1, 8) }));
    const symptoms = Array.from({ length: 10 }, (_, i) => ({ symptom: 'headache', reportedAt: isoDay(i + 1, 2) }));
    const r = correlateSideEffects({ doses, symptoms, medicationStarts: { A: isoDay(1) } });
    const f = r.findings.find((x) => x.medicationId === 'A' && x.symptom === 'headache')!;
    expect(f.inWindowReports).toBe(0);
    expect(f.score).toBeLessThan(0.4);
  });

  it('orders findings by score descending', () => {
    const doses = [
      ...Array.from({ length: 10 }, (_, i) => ({ medicationId: 'A', takenAt: isoDay(i + 1, 8) })),
      ...Array.from({ length: 10 }, (_, i) => ({ medicationId: 'B', takenAt: isoDay(i + 1, 20) })),
    ];
    const symptoms = [
      ...Array.from({ length: 10 }, (_, i) => ({ symptom: 'nausea', reportedAt: isoDay(i + 1, 10) })), // tight with A
      ...Array.from({ length: 5 }, (_, i) => ({ symptom: 'nausea', reportedAt: isoDay(i + 1, 22) })), // some with B
    ];
    const r = correlateSideEffects({ doses, symptoms, medicationStarts: { A: isoDay(1), B: isoDay(1) } });
    expect(r.findings.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < r.findings.length; i++) {
      expect(r.findings[i - 1]!.score).toBeGreaterThanOrEqual(r.findings[i]!.score);
    }
  });

  it('ignores invalid ISO timestamps without throwing', () => {
    const doses = [
      ...Array.from({ length: 6 }, (_, i) => ({ medicationId: 'A', takenAt: isoDay(i + 1) })),
      { medicationId: 'A', takenAt: 'not-a-date' },
    ];
    const symptoms = [
      ...Array.from({ length: 4 }, (_, i) => ({ symptom: 'nausea', reportedAt: isoDay(i + 1, 10) })),
      { symptom: 'nausea', reportedAt: 'also-bad' },
    ];
    const r = correlateSideEffects({ doses, symptoms, medicationStarts: { A: isoDay(1) } });
    expect(r.findings.length).toBe(1);
  });
});
