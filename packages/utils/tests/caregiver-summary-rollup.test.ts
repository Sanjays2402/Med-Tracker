import { describe, it, expect } from 'vitest';
import {
  composeHouseholdRollup,
  type HouseholdRollupOptions,
} from '../src/caregiver-summary-rollup';
import type { DigestInput } from '../src/caregiver-digest';
import type { AdherenceMetrics, AdherenceSummary } from '../src/adherence-metrics';

function metrics(medicationId: string, pdc: number): AdherenceMetrics {
  return {
    medicationId,
    windowDays: 7,
    daysCovered: Math.round(pdc * 7),
    daysSupplied: Math.round(pdc * 7),
    pdc,
    mpr: pdc,
    mprCapped: Math.min(1, pdc),
    gaps: [],
  };
}

function summary(meds: AdherenceMetrics[], threshold = 0.8): AdherenceSummary {
  const avg = meds.length === 0 ? 0 : meds.reduce((a, m) => a + m.pdc, 0) / meds.length;
  const adherent = meds.filter((m) => m.pdc >= threshold).length;
  return {
    perMedication: meds,
    averagePdc: avg,
    averageMpr: avg,
    adherentCount: adherent,
    nonAdherentCount: meds.length - adherent,
    threshold,
  };
}

function digestInput(
  name: string,
  meds: Array<{ id: string; name: string; pdc: number }>,
  missedCount = 0,
  refills: DigestInput['refills'] = [],
): DigestInput {
  const adherence = summary(meds.map((m) => metrics(m.id, m.pdc)));
  const medicationNames = Object.fromEntries(meds.map((m) => [m.id, m.name]));
  return {
    patient: { name },
    weekStart: '2026-06-15',
    weekEnd: '2026-06-21',
    adherence,
    medicationNames,
    missedDoses: Array.from({ length: missedCount }, (_, i) => ({
      medicationId: meds[0]?.id ?? 'm-0',
      medicationName: meds[0]?.name ?? 'Unknown',
      scheduledFor: `2026-06-${15 + (i % 7)}T08:00:00.000Z`,
    })),
    refills,
  };
}

describe('composeHouseholdRollup', () => {
  it('returns "no patients" body when inputs are empty', () => {
    const r = composeHouseholdRollup([]);
    expect(r.stats.totalPatients).toBe(0);
    expect(r.text).toMatch(/No patients/);
  });

  it('composes a header per patient', () => {
    const inputs = [
      digestInput('Mom', [{ id: 'm-1', name: 'Lisinopril', pdc: 0.92 }], 1),
      digestInput('Dad', [{ id: 'm-2', name: 'Metformin', pdc: 0.73 }], 5),
    ];
    const r = composeHouseholdRollup(inputs);
    expect(r.stats.totalPatients).toBe(2);
    expect(r.text).toMatch(/Mom: 92%/);
    expect(r.text).toMatch(/Dad: 73%/);
  });

  it('computes the average PDC across patients', () => {
    const inputs = [
      digestInput('A', [{ id: 'm-1', name: 'X', pdc: 1.0 }]),
      digestInput('B', [{ id: 'm-2', name: 'Y', pdc: 0.5 }]),
    ];
    const r = composeHouseholdRollup(inputs);
    expect(r.stats.averagePdcPct).toBe(75);
  });

  it('sums missed doses across patients', () => {
    const inputs = [
      digestInput('A', [{ id: 'm-1', name: 'X', pdc: 0.9 }], 3),
      digestInput('B', [{ id: 'm-2', name: 'Y', pdc: 0.9 }], 7),
    ];
    const r = composeHouseholdRollup(inputs);
    expect(r.stats.totalMissed).toBe(10);
  });

  it('counts refills due within the horizon across patients', () => {
    const inputs = [
      digestInput('A', [{ id: 'm-1', name: 'X', pdc: 0.9 }], 0, [
        { medicationId: 'm-1', daysOfSupply: 3 } as any,
        { medicationId: 'm-1', daysOfSupply: 14 } as any,
      ]),
      digestInput('B', [{ id: 'm-2', name: 'Y', pdc: 0.9 }], 0, [
        { medicationId: 'm-2', daysOfSupply: 5 } as any,
      ]),
    ];
    const r = composeHouseholdRollup(inputs);
    expect(r.stats.totalRefillsDueSoon).toBe(2);
  });

  it('honors a custom refillHorizonDays', () => {
    const inputs = [
      digestInput('A', [{ id: 'm-1', name: 'X', pdc: 0.9 }], 0, [
        { medicationId: 'm-1', daysOfSupply: 3 } as any,
        { medicationId: 'm-1', daysOfSupply: 14 } as any,
      ]),
    ];
    const r = composeHouseholdRollup(inputs, { refillHorizonDays: 30 });
    expect(r.stats.totalRefillsDueSoon).toBe(2);
  });

  it('flags patients with medications below the attention threshold', () => {
    const inputs = [
      digestInput('Mom', [
        { id: 'm-1', name: 'Lisinopril', pdc: 0.95 },
        { id: 'm-2', name: 'Atorvastatin', pdc: 0.65 },
      ]),
      digestInput('Dad', [{ id: 'm-3', name: 'Metformin', pdc: 0.95 }]),
    ];
    const r = composeHouseholdRollup(inputs);
    expect(r.stats.patientsNeedingAttention).toBe(1);
    expect(r.perPatient[0]!.attentionMedications).toHaveLength(1);
    expect(r.perPatient[0]!.attentionMedications[0]!.name).toBe('Atorvastatin');
  });

  it('honors a custom attentionThreshold', () => {
    const inputs = [
      digestInput('Mom', [{ id: 'm-1', name: 'Lisinopril', pdc: 0.85 }]),
    ];
    const tight = composeHouseholdRollup(inputs, { attentionThreshold: 0.9 });
    expect(tight.perPatient[0]!.attentionMedications).toHaveLength(1);
    const loose = composeHouseholdRollup(inputs, { attentionThreshold: 0.7 });
    expect(loose.perPatient[0]!.attentionMedications).toHaveLength(0);
  });

  it('sorts attentionMedications by PDC ascending', () => {
    const inputs = [
      digestInput('Mom', [
        { id: 'm-1', name: 'A', pdc: 0.7 },
        { id: 'm-2', name: 'B', pdc: 0.5 },
        { id: 'm-3', name: 'C', pdc: 0.6 },
      ]),
    ];
    const r = composeHouseholdRollup(inputs);
    expect(r.perPatient[0]!.attentionMedications.map((m) => m.name)).toEqual(['B', 'C', 'A']);
  });

  it('truncates attention list to perPatientMissedLimit', () => {
    const inputs = [
      digestInput('Mom', [
        { id: 'm-1', name: 'A', pdc: 0.5 },
        { id: 'm-2', name: 'B', pdc: 0.6 },
        { id: 'm-3', name: 'C', pdc: 0.7 },
        { id: 'm-4', name: 'D', pdc: 0.4 },
        { id: 'm-5', name: 'E', pdc: 0.3 },
      ]),
    ];
    const r = composeHouseholdRollup(inputs, { perPatientMissedLimit: 2 });
    expect(r.text).toMatch(/and 3 more/);
  });

  it('uses display name when provided', () => {
    const inputs: DigestInput[] = [
      {
        patient: { name: 'Mary Smith', display: 'Mom' },
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
        adherence: summary([metrics('m-1', 0.9)]),
        medicationNames: { 'm-1': 'X' },
        missedDoses: [],
      },
    ];
    const r = composeHouseholdRollup(inputs);
    expect(r.perPatient[0]!.display).toBe('Mom');
    expect(r.text).toMatch(/Mom: 90%/);
  });

  it('falls back to patient name when display is missing', () => {
    const inputs = [
      digestInput('Bob', [{ id: 'm-1', name: 'X', pdc: 0.9 }]),
    ];
    const r = composeHouseholdRollup(inputs);
    expect(r.perPatient[0]!.display).toBe('Bob');
  });

  it('produces a subject mentioning attention count when patients need it', () => {
    const inputs = [
      digestInput('Mom', [
        { id: 'm-1', name: 'Lisinopril', pdc: 0.65 },
      ]),
      digestInput('Dad', [
        { id: 'm-2', name: 'Atorvastatin', pdc: 0.95 },
      ]),
    ];
    const r = composeHouseholdRollup(inputs, {}, 'Jane');
    expect(r.subject).toMatch(/for Jane/);
    expect(r.subject).toMatch(/1 needs attention/);
  });

  it('omits attention text from the subject when none needed', () => {
    const inputs = [
      digestInput('Dad', [{ id: 'm-2', name: 'Atorvastatin', pdc: 0.95 }]),
    ];
    const r = composeHouseholdRollup(inputs);
    expect(r.subject).not.toMatch(/attention/);
  });

  it('mentions household totals in the body', () => {
    const inputs = [
      digestInput('A', [{ id: 'm-1', name: 'X', pdc: 0.9 }], 2, [
        { medicationId: 'm-1', daysOfSupply: 3 } as any,
      ]),
    ];
    const r = composeHouseholdRollup(inputs);
    expect(r.text).toMatch(/2 missed/);
    expect(r.text).toMatch(/1 upcoming refill/);
  });

  it('pluralizes singular vs plural for refill counts in the body', () => {
    const oneRefill = composeHouseholdRollup([
      digestInput('A', [{ id: 'm-1', name: 'X', pdc: 0.9 }], 0, [
        { medicationId: 'm-1', daysOfSupply: 3 } as any,
      ]),
    ]);
    expect(oneRefill.text).toMatch(/1 refill /);
    const twoRefills = composeHouseholdRollup([
      digestInput('A', [{ id: 'm-1', name: 'X', pdc: 0.9 }], 0, [
        { medicationId: 'm-1', daysOfSupply: 3 } as any,
        { medicationId: 'm-1', daysOfSupply: 5 } as any,
      ]),
    ]);
    expect(twoRefills.text).toMatch(/2 refills /);
  });
});
