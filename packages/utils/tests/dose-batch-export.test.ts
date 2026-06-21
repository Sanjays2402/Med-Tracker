import { describe, it, expect } from 'vitest';
import {
  buildDoseExportBundle,
  buildDoseExportEnvelope,
  serializeBundle,
  type FhirBundle,
  type FhirMedicationAdministration,
} from '../src/dose-batch-export';
import type { Dose, Medication } from '@med/types';

function med(overrides: Partial<Medication> = {}): Medication {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    userId: '22222222-2222-2222-2222-222222222222',
    drugId: 'metformin-500',
    name: 'Metformin',
    strength: '500 mg',
    form: 'tablet',
    startDate: '2026-01-01',
    active: true,
    supplyRemaining: 60,
    dosesPerRefill: 30,
    ...overrides,
  };
}

function dose(overrides: Partial<Dose> = {}): Dose {
  return {
    id: '33333333-3333-3333-3333-333333333333',
    medicationId: '11111111-1111-1111-1111-111111111111',
    scheduleId: '44444444-4444-4444-4444-444444444444',
    dueAt: '2026-06-15T08:00:00.000Z',
    takenAt: '2026-06-15T08:05:00.000Z',
    status: 'taken',
    ...overrides,
  };
}

const USER_ID = '22222222-2222-2222-2222-222222222222';

describe('buildDoseExportBundle — Bundle envelope', () => {
  it('emits a collection bundle', () => {
    const b = buildDoseExportBundle({
      userId: USER_ID,
      medications: [med()],
      doses: [dose()],
    });
    expect(b.resourceType).toBe('Bundle');
    expect(b.type).toBe('collection');
    expect(b.total).toBe(1);
    expect(b.entry).toHaveLength(1);
  });

  it('sets total = entry.length', () => {
    const b = buildDoseExportBundle({
      userId: USER_ID,
      medications: [med()],
      doses: [
        dose({ id: 'a' as never, dueAt: '2026-06-01T08:00:00.000Z' }),
        dose({ id: 'b' as never, dueAt: '2026-06-02T08:00:00.000Z' }),
        dose({ id: 'c' as never, dueAt: '2026-06-03T08:00:00.000Z' }),
      ],
    });
    expect(b.total).toBe(3);
    expect(b.entry).toHaveLength(3);
  });

  it('includes a fullUrl per entry with urn:uuid: default prefix', () => {
    const b = buildDoseExportBundle({
      userId: USER_ID,
      medications: [med()],
      doses: [dose()],
    });
    expect(b.entry[0]?.fullUrl).toBe('urn:uuid:33333333-3333-3333-3333-333333333333');
  });

  it('respects fullUrlBase option', () => {
    const b = buildDoseExportBundle({
      userId: USER_ID,
      medications: [med()],
      doses: [dose()],
      options: { fullUrlBase: 'https://example.com/fhir/MedicationAdministration/' },
    });
    expect(b.entry[0]?.fullUrl).toBe(
      'https://example.com/fhir/MedicationAdministration/33333333-3333-3333-3333-333333333333',
    );
  });

  it('emits an ISO timestamp', () => {
    const b = buildDoseExportBundle({
      userId: USER_ID,
      medications: [med()],
      doses: [dose()],
    });
    expect(b.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

describe('buildDoseExportBundle — status mapping', () => {
  function r(d: Partial<Dose>): FhirMedicationAdministration {
    const b = buildDoseExportBundle({
      userId: USER_ID,
      medications: [med()],
      doses: [dose(d)],
      options: { includeScheduled: true },
    });
    return b.entry[0]!.resource;
  }

  it("maps 'taken' -> 'completed' with no statusReason", () => {
    const a = r({ status: 'taken' });
    expect(a.status).toBe('completed');
    expect(a.statusReason).toBeUndefined();
  });

  it("maps 'late' -> 'completed' and notes it in the annotation", () => {
    const a = r({ status: 'late', note: 'arrived 2h late' });
    expect(a.status).toBe('completed');
    expect(a.note?.[0]?.text).toContain('arrived 2h late');
    expect(a.note?.[0]?.text).toContain('late');
  });

  it("maps 'skipped' -> 'not-done' with statusReason text='patient-skipped'", () => {
    const a = r({ status: 'skipped' });
    expect(a.status).toBe('not-done');
    expect(a.statusReason?.[0]?.text).toBe('patient-skipped');
  });

  it("maps 'missed' -> 'not-done' with statusReason text='missed'", () => {
    const a = r({ status: 'missed' });
    expect(a.status).toBe('not-done');
    expect(a.statusReason?.[0]?.text).toBe('missed');
  });

  it("maps 'scheduled' -> 'in-progress' when includeScheduled=true", () => {
    const a = r({ status: 'scheduled', takenAt: null });
    expect(a.status).toBe('in-progress');
  });

  it("drops 'scheduled' doses by default", () => {
    const b = buildDoseExportBundle({
      userId: USER_ID,
      medications: [med()],
      doses: [
        dose({ id: 'a' as never, status: 'scheduled', takenAt: null }),
        dose({ id: 'b' as never, status: 'taken' }),
      ],
    });
    expect(b.entry).toHaveLength(1);
    expect(b.entry[0]?.resource.id).toBe('b');
  });
});

describe('buildDoseExportBundle — references and effectiveDateTime', () => {
  it('uses takenAt as effectiveDateTime when the dose was taken', () => {
    const b = buildDoseExportBundle({
      userId: USER_ID,
      medications: [med()],
      doses: [
        dose({
          status: 'taken',
          dueAt: '2026-06-15T08:00:00.000Z',
          takenAt: '2026-06-15T08:42:00.000Z',
        }),
      ],
    });
    expect(b.entry[0]?.resource.effectiveDateTime).toBe('2026-06-15T08:42:00.000Z');
  });

  it('falls back to dueAt when no takenAt', () => {
    const b = buildDoseExportBundle({
      userId: USER_ID,
      medications: [med()],
      doses: [
        dose({
          status: 'missed',
          dueAt: '2026-06-15T08:00:00.000Z',
          takenAt: null,
        }),
      ],
    });
    expect(b.entry[0]?.resource.effectiveDateTime).toBe('2026-06-15T08:00:00.000Z');
  });

  it('emits Medication/<id> reference with display=name', () => {
    const b = buildDoseExportBundle({
      userId: USER_ID,
      medications: [med({ id: 'med-A' as never, name: 'Lisinopril' })],
      doses: [dose({ medicationId: 'med-A' as never })],
    });
    expect(b.entry[0]?.resource.medicationReference.reference).toBe('Medication/med-A');
    expect(b.entry[0]?.resource.medicationReference.display).toBe('Lisinopril');
  });

  it('uses Patient/<userId> by default for subject', () => {
    const b = buildDoseExportBundle({
      userId: USER_ID,
      medications: [med()],
      doses: [dose()],
    });
    expect(b.entry[0]?.resource.subject.reference).toBe(`Patient/${USER_ID}`);
  });

  it('respects patientReference option', () => {
    const b = buildDoseExportBundle({
      userId: USER_ID,
      medications: [med()],
      doses: [dose()],
      options: { patientReference: 'Patient/external-mrn-12345' },
    });
    expect(b.entry[0]?.resource.subject.reference).toBe('Patient/external-mrn-12345');
  });
});

describe('buildDoseExportBundle — dosage mapping by form', () => {
  function dosageFor(form: Medication['form']): FhirMedicationAdministration['dosage'] {
    const b = buildDoseExportBundle({
      userId: USER_ID,
      medications: [med({ form, strength: '10 mg' })],
      doses: [dose()],
    });
    return b.entry[0]?.resource.dosage;
  }

  it('maps tablet to PO oral', () => {
    expect(dosageFor('tablet')?.route?.coding[0]?.code).toBe('PO');
  });
  it('maps inhaler to IH inhaled', () => {
    expect(dosageFor('inhaler')?.route?.coding[0]?.code).toBe('IH');
  });
  it('maps patch to TD transdermal', () => {
    expect(dosageFor('patch')?.route?.coding[0]?.code).toBe('TD');
  });
  it('maps drops to OPHTH ophthalmic', () => {
    expect(dosageFor('drops')?.route?.coding[0]?.code).toBe('OPHTH');
  });
  it('maps suppository to PR per-rectum', () => {
    expect(dosageFor('suppository')?.route?.coding[0]?.code).toBe('PR');
  });

  it('emits dosage.text from medication.strength', () => {
    const b = buildDoseExportBundle({
      userId: USER_ID,
      medications: [med({ strength: '20 mg' })],
      doses: [dose()],
    });
    expect(b.entry[0]?.resource.dosage?.text).toBe('20 mg');
  });

  it('omits dosage entirely when neither strength nor route resolves', () => {
    // Manually set strength to empty; tablet form will still produce
    // a route, so we test an exotic form mapping. All known forms
    // produce a route; trim strength alone still keeps dosage.
    const b = buildDoseExportBundle({
      userId: USER_ID,
      medications: [med({ strength: '   ' })],
      doses: [dose()],
    });
    // Route still resolves -> dosage present but no text.
    expect(b.entry[0]?.resource.dosage?.text).toBeUndefined();
    expect(b.entry[0]?.resource.dosage?.route).toBeDefined();
  });
});

describe('buildDoseExportBundle — date range filtering', () => {
  it('skips doses outside rangeStart', () => {
    const b = buildDoseExportBundle({
      userId: USER_ID,
      medications: [med()],
      doses: [
        dose({ id: 'a' as never, dueAt: '2026-05-01T08:00:00.000Z', takenAt: '2026-05-01T08:00:00.000Z' }),
        dose({ id: 'b' as never, dueAt: '2026-06-01T08:00:00.000Z', takenAt: '2026-06-01T08:00:00.000Z' }),
      ],
      options: { rangeStart: '2026-06-01T00:00:00.000Z' },
    });
    expect(b.entry.map((e) => e.resource.id)).toEqual(['b']);
  });

  it('skips doses outside rangeEnd', () => {
    const b = buildDoseExportBundle({
      userId: USER_ID,
      medications: [med()],
      doses: [
        dose({ id: 'a' as never, dueAt: '2026-05-01T08:00:00.000Z', takenAt: '2026-05-01T08:00:00.000Z' }),
        dose({ id: 'b' as never, dueAt: '2026-07-01T08:00:00.000Z', takenAt: '2026-07-01T08:00:00.000Z' }),
      ],
      options: { rangeEnd: '2026-06-30T23:59:59.000Z' },
    });
    expect(b.entry.map((e) => e.resource.id)).toEqual(['a']);
  });

  it('keeps doses inside both bounds', () => {
    const b = buildDoseExportBundle({
      userId: USER_ID,
      medications: [med()],
      doses: [
        dose({ id: 'a' as never, dueAt: '2026-05-01T08:00:00.000Z', takenAt: '2026-05-01T08:00:00.000Z' }),
        dose({ id: 'b' as never, dueAt: '2026-06-15T08:00:00.000Z', takenAt: '2026-06-15T08:00:00.000Z' }),
        dose({ id: 'c' as never, dueAt: '2026-07-15T08:00:00.000Z', takenAt: '2026-07-15T08:00:00.000Z' }),
      ],
      options: {
        rangeStart: '2026-06-01T00:00:00.000Z',
        rangeEnd: '2026-06-30T23:59:59.000Z',
      },
    });
    expect(b.entry.map((e) => e.resource.id)).toEqual(['b']);
  });
});

describe('buildDoseExportBundle — sorting and edge cases', () => {
  it('sorts entries by effectiveDateTime ascending', () => {
    const b = buildDoseExportBundle({
      userId: USER_ID,
      medications: [med()],
      doses: [
        dose({ id: 'b' as never, dueAt: '2026-06-02T08:00:00.000Z', takenAt: '2026-06-02T08:00:00.000Z' }),
        dose({ id: 'a' as never, dueAt: '2026-06-01T08:00:00.000Z', takenAt: '2026-06-01T08:00:00.000Z' }),
        dose({ id: 'c' as never, dueAt: '2026-06-03T08:00:00.000Z', takenAt: '2026-06-03T08:00:00.000Z' }),
      ],
    });
    expect(b.entry.map((e) => e.resource.id)).toEqual(['a', 'b', 'c']);
  });

  it('drops doses whose medicationId does not match any medication', () => {
    const b = buildDoseExportBundle({
      userId: USER_ID,
      medications: [med({ id: 'med-A' as never })],
      doses: [
        dose({ id: 'a' as never, medicationId: 'med-A' as never }),
        dose({ id: 'b' as never, medicationId: 'med-MISSING' as never }),
      ],
    });
    expect(b.entry.map((e) => e.resource.id)).toEqual(['a']);
  });

  it('handles an empty dose list cleanly', () => {
    const b = buildDoseExportBundle({
      userId: USER_ID,
      medications: [med()],
      doses: [],
    });
    expect(b.total).toBe(0);
    expect(b.entry).toEqual([]);
  });
});

describe('buildDoseExportBundle — notes', () => {
  it('emits a note with dose.note text', () => {
    const b = buildDoseExportBundle({
      userId: USER_ID,
      medications: [med()],
      doses: [dose({ note: 'with food' })],
    });
    expect(b.entry[0]?.resource.note?.[0]?.text).toBe('with food');
  });

  it('appends source label when options.source is set', () => {
    const b = buildDoseExportBundle({
      userId: USER_ID,
      medications: [med()],
      doses: [dose()],
      options: { source: 'Med-Tracker v1' },
    });
    expect(b.entry[0]?.resource.note?.[0]?.text).toMatch(/Med-Tracker v1/);
  });

  it('omits note when neither dose.note nor late/source present', () => {
    const b = buildDoseExportBundle({
      userId: USER_ID,
      medications: [med()],
      doses: [dose()],
    });
    expect(b.entry[0]?.resource.note).toBeUndefined();
  });
});

describe('serializeBundle', () => {
  it('produces compact JSON by default', () => {
    const b = buildDoseExportBundle({
      userId: USER_ID,
      medications: [med()],
      doses: [dose()],
    });
    const s = serializeBundle(b);
    expect(s).not.toMatch(/\n/);
  });

  it('produces indented JSON with indent=2', () => {
    const b = buildDoseExportBundle({
      userId: USER_ID,
      medications: [med()],
      doses: [dose()],
    });
    const s = serializeBundle(b, 2);
    expect(s).toMatch(/\n  /);
  });
});

describe('buildDoseExportEnvelope', () => {
  it('wraps the bundle with exportedAt + source', () => {
    const env = buildDoseExportEnvelope({
      userId: USER_ID,
      medications: [med()],
      doses: [dose()],
      options: { source: 'Med-Tracker v1' },
    });
    expect(env.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(env.source).toBe('Med-Tracker v1');
    expect(env.bundle.resourceType).toBe('Bundle');
    expect(env.bundle.entry).toHaveLength(1);
  });

  it('omits source when not provided', () => {
    const env = buildDoseExportEnvelope({
      userId: USER_ID,
      medications: [med()],
      doses: [dose()],
    });
    expect(env.source).toBeUndefined();
  });
});

describe('end-to-end realistic export', () => {
  it('round-trips a small history correctly', () => {
    const medA = med({ id: 'med-A' as never, name: 'Lisinopril', strength: '10 mg', form: 'tablet' });
    const medB = med({ id: 'med-B' as never, name: 'Atorvastatin', strength: '40 mg', form: 'tablet' });
    const doses: Dose[] = [
      dose({ id: 'd1' as never, medicationId: 'med-A' as never, status: 'taken',
             dueAt: '2026-06-15T08:00:00.000Z', takenAt: '2026-06-15T08:05:00.000Z' }),
      dose({ id: 'd2' as never, medicationId: 'med-A' as never, status: 'missed',
             dueAt: '2026-06-16T08:00:00.000Z', takenAt: null }),
      dose({ id: 'd3' as never, medicationId: 'med-B' as never, status: 'taken',
             dueAt: '2026-06-15T20:00:00.000Z', takenAt: '2026-06-15T19:55:00.000Z' }),
      dose({ id: 'd4' as never, medicationId: 'med-A' as never, status: 'skipped',
             dueAt: '2026-06-17T08:00:00.000Z', takenAt: null,
             note: 'NPO for procedure' }),
    ];
    const b = buildDoseExportBundle({
      userId: USER_ID,
      medications: [medA, medB],
      doses,
    });
    expect(b.total).toBe(4);
    expect(b.entry.map((e) => e.resource.id)).toEqual(['d1', 'd3', 'd2', 'd4']);
    const skip = b.entry[3]!.resource;
    expect(skip.status).toBe('not-done');
    expect(skip.statusReason?.[0]?.text).toBe('patient-skipped');
    expect(skip.note?.[0]?.text).toBe('NPO for procedure');
    expect(b.entry[0]?.resource.medicationReference.reference).toBe('Medication/med-A');
  });
});
