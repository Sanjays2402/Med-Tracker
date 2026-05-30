import { describe, it, expect } from 'vitest';
import { rankCostAlternatives, type CurrentMedication, type AlternativeCandidate } from '../src/cost-alternatives';

const lipitor: CurrentMedication = {
  medicationId: 'med-lipitor',
  name: 'Lipitor 20mg',
  classId: 'statin',
  strength: 20,
  dosesPerDay: 1,
  copayCents: 4500, // $45 / 30 day fill
  daysSupply: 30,
  tier: 'preferred-brand',
};

const atorvastatinGeneric: AlternativeCandidate = {
  medicationId: 'med-atorva',
  name: 'Atorvastatin 20mg',
  classId: 'statin',
  strength: 20,
  equivalenceRatio: 1.0,
  copayCents: 500,
  daysSupply: 30,
  tier: 'generic',
};

const rosuvastatin: AlternativeCandidate = {
  medicationId: 'med-rosuva',
  name: 'Rosuvastatin 10mg',
  classId: 'statin',
  strength: 10,
  // 10mg rosuva ~ 20mg atorva equivalence.
  equivalenceRatio: 2.0,
  copayCents: 800,
  daysSupply: 30,
  tier: 'generic',
};

const aceInhibitor: AlternativeCandidate = {
  medicationId: 'med-lisinopril',
  name: 'Lisinopril 10mg',
  classId: 'ace-inhibitor',
  strength: 10,
  equivalenceRatio: 1.0,
  copayCents: 400,
  daysSupply: 30,
  tier: 'generic',
};

describe('rankCostAlternatives', () => {
  it('recommends generic substitution when savings exceed threshold', () => {
    const plan = rankCostAlternatives({
      current: [lipitor],
      catalog: [atorvastatinGeneric, aceInhibitor],
    });
    expect(plan.recommendations).toHaveLength(1);
    expect(plan.recommendations[0].candidateId).toBe('med-atorva');
    expect(plan.recommendations[0].monthlySavingsCents).toBe(4000);
    expect(plan.totalMonthlySavingsCents).toBe(4000);
    expect(plan.recommendations[0].reason).toMatch(/Switch saves \$40\.00/);
  });

  it('skips alternatives outside the same class', () => {
    const plan = rankCostAlternatives({
      current: [lipitor],
      catalog: [aceInhibitor],
    });
    expect(plan.recommendations).toEqual([]);
    expect(plan.unchanged[0].reason).toMatch(/no qualifying alternative/);
  });

  it('honors contraindicated medication ids', () => {
    const plan = rankCostAlternatives({
      current: [lipitor],
      catalog: [atorvastatinGeneric],
      contraindicatedIds: ['med-atorva'],
    });
    expect(plan.recommendations).toEqual([]);
  });

  it('honors contraindicated classes', () => {
    const plan = rankCostAlternatives({
      current: [lipitor],
      catalog: [atorvastatinGeneric],
      contraindicatedClasses: ['statin'],
    });
    expect(plan.recommendations).toEqual([]);
    expect(plan.unchanged[0].reason).toMatch(/class contraindicated/);
  });

  it('matches equivalent dose across strengths via equivalenceRatio', () => {
    const plan = rankCostAlternatives({
      current: [lipitor],
      catalog: [rosuvastatin],
    });
    expect(plan.recommendations).toHaveLength(1);
    expect(plan.recommendations[0].candidateId).toBe('med-rosuva');
  });

  it('picks the larger-savings candidate and orders by savings desc', () => {
    const expensiveLipitor: CurrentMedication = {
      ...lipitor,
      medicationId: 'med-lipitor-90',
      name: 'Lipitor 20mg (90d)',
      copayCents: 12000,
      daysSupply: 90,
    };
    const plan = rankCostAlternatives({
      current: [lipitor, expensiveLipitor],
      catalog: [atorvastatinGeneric, rosuvastatin],
    });
    // Both qualify; expensiveLipitor monthly = 12000*30/90 = 4000, candidate atorva monthly = 500.
    // lipitor monthly = 4500, candidate atorva monthly = 500. Savings 4000 vs 3500.
    expect(plan.recommendations.map((r) => r.forMedicationName)).toEqual(['Lipitor 20mg', 'Lipitor 20mg (90d)']);
  });

  it('respects minMonthlySavingsCents threshold', () => {
    const plan = rankCostAlternatives({
      current: [lipitor],
      catalog: [atorvastatinGeneric],
      minMonthlySavingsCents: 100_000,
    });
    expect(plan.recommendations).toEqual([]);
  });

  it('scales monthly cost by dosesPerDay', () => {
    const twiceDaily: CurrentMedication = { ...lipitor, dosesPerDay: 2 };
    const plan = rankCostAlternatives({
      current: [twiceDaily],
      catalog: [atorvastatinGeneric],
    });
    // Current: 4500 * 2 = 9000. Candidate: 500 * 2 = 1000. Savings = 8000.
    expect(plan.recommendations[0].monthlySavingsCents).toBe(8000);
  });

  it('computes 90-day savings independently of 30-day projection', () => {
    const plan = rankCostAlternatives({
      current: [lipitor],
      catalog: [atorvastatinGeneric],
    });
    expect(plan.recommendations[0].ninetyDaySavingsCents).toBe(12000);
  });
});
