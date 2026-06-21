import { describe, it, expect } from 'vitest';
import {
  summarizeRegimen,
  summaryToParagraph,
  type RegimenInput,
} from '../src/regimen-summary';
import type { Drug, Medication, Schedule } from '@med/types';

function med(
  id: string,
  name: string,
  drugId: string,
  extras: Partial<Medication> = {},
): Medication {
  return {
    id,
    userId: '00000000-0000-0000-0000-000000000000',
    drugId,
    name,
    strength: '10 mg',
    form: 'tablet',
    startDate: '2026-01-01',
    active: true,
    supplyRemaining: 30,
    dosesPerRefill: 30,
    ...extras,
  };
}

function schedule(
  id: string,
  medicationId: string,
  kind: Schedule['kind'],
  extras: Partial<Schedule> = {},
): Schedule {
  return {
    id,
    medicationId,
    kind,
    times: [],
    startsAt: '2026-01-01T00:00:00Z',
    enabled: true,
    ...extras,
  };
}

function drug(id: string, generic: string, klass: string): Drug {
  return {
    id,
    generic,
    brand: generic,
    class: klass,
    rxnormSample: 0,
    indications: [],
    dosages: [],
    routes: [],
    frequencies: [],
    interactions: [],
    warnings: [],
    pregnancyCategory: 'B',
    storage: '',
    sourceNote: '',
  };
}

describe('summarizeRegimen', () => {
  it('returns an empty summary when no medications are present', () => {
    const r = summarizeRegimen({ medications: [], schedules: [] });
    expect(r.activeMedications).toBe(0);
    expect(r.scheduledDosesPerDay).toBe(0);
    expect(r.distinctClasses).toBe(0);
    expect(r.sentences[0]).toMatch(/0 active medications/);
  });

  it('counts scheduled vs PRN medications correctly', () => {
    const input: RegimenInput = {
      medications: [
        med('m1', 'Metformin', 'd-metformin'),
        med('m2', 'Lorazepam', 'd-lorazepam'),
        med('m3', 'Lisinopril', 'd-lisinopril'),
      ],
      schedules: [
        schedule('s1', 'm1', 'daily', { times: ['08:00', '20:00'] }),
        schedule('s2', 'm2', 'asNeeded'),
        schedule('s3', 'm3', 'daily', { times: ['09:00'] }),
      ],
    };
    const r = summarizeRegimen(input);
    expect(r.scheduledMedications).toBe(2);
    expect(r.prnMedications).toBe(1);
    expect(r.scheduledDosesPerDay).toBe(3);
  });

  it('computes per-day doses for weekly schedules as a weighted fraction', () => {
    const input: RegimenInput = {
      medications: [med('m1', 'Alendronate', 'd-alendronate')],
      schedules: [
        // Once weekly on Sunday morning.
        schedule('s1', 'm1', 'weekly', {
          times: ['08:00'],
          daysOfWeek: [0],
        }),
      ],
    };
    const r = summarizeRegimen(input);
    expect(r.scheduledDosesPerDay).toBeCloseTo(1 / 7, 2);
  });

  it('computes per-day doses for interval schedules', () => {
    const input: RegimenInput = {
      medications: [med('m1', 'Acetaminophen', 'd-apap')],
      schedules: [
        schedule('s1', 'm1', 'interval', { intervalHours: 6 }),
      ],
    };
    const r = summarizeRegimen(input);
    expect(r.scheduledDosesPerDay).toBe(4);
  });

  it('bucketizes scheduled times into the right time-of-day windows', () => {
    const input: RegimenInput = {
      medications: [med('m1', 'X', 'd-x')],
      schedules: [
        schedule('s1', 'm1', 'daily', {
          times: ['07:00', '12:30', '15:00', '19:00', '23:30'],
        }),
      ],
    };
    const r = summarizeRegimen(input);
    expect(r.timeBuckets.morning).toBe(1);
    expect(r.timeBuckets.midday).toBe(1);
    expect(r.timeBuckets.afternoon).toBe(1);
    expect(r.timeBuckets.evening).toBe(1);
    expect(r.timeBuckets.overnight).toBe(1);
  });

  it('rolls up top classes using the drug catalog and produces ordered output', () => {
    const drugs = [
      drug('d-lisinopril', 'lisinopril', 'ace-inhibitor'),
      drug('d-losartan', 'losartan', 'arb'),
      drug('d-amlodipine', 'amlodipine', 'calcium-channel-blocker'),
      drug('d-hctz', 'hydrochlorothiazide', 'thiazide'),
      drug('d-metoprolol', 'metoprolol', 'beta-blocker'),
      drug('d-statin1', 'atorvastatin', 'statin'),
      drug('d-statin2', 'rosuvastatin', 'statin'),
    ];
    const meds = [
      med('m1', 'Lisinopril', 'd-lisinopril'),
      med('m2', 'Losartan', 'd-losartan'),
      med('m3', 'Amlodipine', 'd-amlodipine'),
      med('m4', 'HCTZ', 'd-hctz'),
      med('m5', 'Metoprolol', 'd-metoprolol'),
      med('m6', 'Atorvastatin', 'd-statin1'),
      med('m7', 'Rosuvastatin', 'd-statin2'),
    ];
    const schedules = meds.map((m, i) =>
      schedule(`s${i}`, m.id, 'daily', { times: ['08:00'] }),
    );
    const r = summarizeRegimen({ medications: meds, schedules, drugs });
    expect(r.topClasses[0]!.classId).toBe('statin');
    expect(r.topClasses[0]!.medCount).toBe(2);
    expect(r.topClasses[0]!.leadMedication).toBe('Atorvastatin');
    expect(r.topClasses[0]!.otherMedications).toEqual(['Rosuvastatin']);
    expect(r.distinctClasses).toBe(6);
  });

  it('honors activeOnly = false to count inactive meds', () => {
    const input: RegimenInput = {
      medications: [
        med('m1', 'A', 'd-a'),
        med('m2', 'B', 'd-b', { active: false }),
      ],
      schedules: [
        schedule('s1', 'm1', 'daily', { times: ['08:00'] }),
        schedule('s2', 'm2', 'daily', { times: ['08:00'] }),
      ],
    };
    const onlyActive = summarizeRegimen(input);
    expect(onlyActive.activeMedications).toBe(1);
    const includeInactive = summarizeRegimen(input, { activeOnly: false });
    expect(includeInactive.activeMedications).toBe(2);
  });

  it('honors topClassesLimit', () => {
    const drugs = [
      drug('d1', 'a', 'class-a'),
      drug('d2', 'b', 'class-b'),
      drug('d3', 'c', 'class-c'),
    ];
    const meds = [
      med('m1', 'a', 'd1'),
      med('m2', 'b', 'd2'),
      med('m3', 'c', 'd3'),
    ];
    const schedules = meds.map((m, i) =>
      schedule(`s${i}`, m.id, 'daily', { times: ['08:00'] }),
    );
    const r = summarizeRegimen(
      { medications: meds, schedules, drugs },
      { topClassesLimit: 2 },
    );
    expect(r.topClasses).toHaveLength(2);
  });

  it('skips disabled schedules', () => {
    const input: RegimenInput = {
      medications: [med('m1', 'X', 'd-x')],
      schedules: [
        schedule('s1', 'm1', 'daily', { times: ['08:00'], enabled: false }),
      ],
    };
    const r = summarizeRegimen(input);
    expect(r.scheduledMedications).toBe(0);
    expect(r.scheduledDosesPerDay).toBe(0);
  });

  it('peaks bucket sentence picks the busiest window', () => {
    const input: RegimenInput = {
      medications: [med('m1', 'X', 'd-x')],
      schedules: [
        schedule('s1', 'm1', 'daily', {
          times: ['08:00', '08:30', '09:00'],
        }),
      ],
    };
    const r = summarizeRegimen(input);
    expect(r.sentences.some((s) => /morning/.test(s))).toBe(true);
  });

  it('produces a stable single-paragraph version', () => {
    const input: RegimenInput = {
      medications: [med('m1', 'Metformin', 'd-metformin')],
      schedules: [
        schedule('s1', 'm1', 'daily', { times: ['08:00', '20:00'] }),
      ],
    };
    const r = summarizeRegimen(input);
    const para = summaryToParagraph(r);
    expect(para).toContain('1 active medication');
    expect(para).toContain('per day');
    expect(para.split(' ').length).toBeGreaterThan(5);
  });

  it('groups meds in the same class with stable alphabetical lead', () => {
    const drugs = [
      drug('d1', 'rosuvastatin', 'statin'),
      drug('d2', 'atorvastatin', 'statin'),
    ];
    const meds = [
      med('m1', 'Rosuvastatin', 'd1'),
      med('m2', 'Atorvastatin', 'd2'),
    ];
    const schedules = meds.map((m, i) =>
      schedule(`s${i}`, m.id, 'daily', { times: ['08:00'] }),
    );
    const r = summarizeRegimen({ medications: meds, schedules, drugs });
    // Alphabetical lead regardless of insertion order.
    expect(r.topClasses[0]!.leadMedication).toBe('Atorvastatin');
    expect(r.topClasses[0]!.otherMedications).toEqual(['Rosuvastatin']);
  });

  it('treats overnight times (22:00-05:00) as overnight bucket including the wrap', () => {
    const input: RegimenInput = {
      medications: [med('m1', 'X', 'd-x')],
      schedules: [
        schedule('s1', 'm1', 'daily', {
          times: ['22:00', '03:00', '04:30'],
        }),
      ],
    };
    const r = summarizeRegimen(input);
    expect(r.timeBuckets.overnight).toBe(3);
  });

  it('falls back to drugId when no drug catalog is provided', () => {
    const input: RegimenInput = {
      medications: [
        med('m1', 'A', 'd-a'),
        med('m2', 'B', 'd-a'),
      ],
      schedules: [
        schedule('s1', 'm1', 'daily', { times: ['08:00'] }),
        schedule('s2', 'm2', 'daily', { times: ['09:00'] }),
      ],
    };
    const r = summarizeRegimen(input);
    expect(r.distinctClasses).toBe(1);
    expect(r.topClasses[0]!.classId).toBe('d-a');
    expect(r.topClasses[0]!.medCount).toBe(2);
  });

  it('handles a medication with both scheduled and PRN schedules', () => {
    // Some regimens have a base scheduled dose plus PRN for breakthrough.
    const input: RegimenInput = {
      medications: [med('m1', 'Morphine', 'd-morphine')],
      schedules: [
        schedule('s1', 'm1', 'interval', { intervalHours: 12 }),
        schedule('s2', 'm1', 'asNeeded'),
      ],
    };
    const r = summarizeRegimen(input);
    expect(r.scheduledMedications).toBe(1);
    expect(r.prnMedications).toBe(1);
    expect(r.scheduledDosesPerDay).toBe(2);
  });

  it('does not count PRN doses toward scheduledDosesPerDay', () => {
    const input: RegimenInput = {
      medications: [
        med('m1', 'PRN-only', 'd-x'),
        med('m2', 'Scheduled', 'd-y'),
      ],
      schedules: [
        schedule('s1', 'm1', 'asNeeded'),
        schedule('s2', 'm2', 'daily', { times: ['08:00', '20:00'] }),
      ],
    };
    const r = summarizeRegimen(input);
    expect(r.scheduledDosesPerDay).toBe(2);
  });
});
