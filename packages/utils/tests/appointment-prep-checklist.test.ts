import { describe, it, expect } from 'vitest';
import {
  buildAppointmentPrepChecklist,
  type AppointmentPrepInput,
} from '../src/appointment-prep-checklist';
import type { Medication } from '@med/types';
import type { AdverseEventRecord } from '../src/adverse-event-log';
import type { LabWindow } from '../src/lab-window-tracker';

function med(overrides: Partial<Medication> & { id: string; name: string }): Medication {
  return {
    id: overrides.id,
    userId: '00000000-0000-0000-0000-000000000001',
    drugId: overrides.drugId ?? 'd-1',
    name: overrides.name,
    strength: overrides.strength ?? '10 mg',
    form: overrides.form ?? 'tablet',
    startDate: overrides.startDate ?? '2026-01-01',
    endDate: overrides.endDate ?? null,
    active: overrides.active ?? true,
    supplyRemaining: overrides.supplyRemaining ?? 30,
    dosesPerRefill: overrides.dosesPerRefill ?? 30,
    ...(overrides.instructions !== undefined ? { instructions: overrides.instructions } : {}),
  } as Medication;
}

function adverse(overrides: Partial<AdverseEventRecord> & { description: string; onsetAt: string }): AdverseEventRecord {
  return {
    id: 'ev-' + overrides.onsetAt,
    description: overrides.description,
    tags: overrides.tags ?? ['rash'],
    onsetAt: overrides.onsetAt,
    reportedAt: overrides.reportedAt ?? overrides.onsetAt,
    severity: overrides.severity ?? 'minor',
    severityRationale: overrides.severityRationale ?? 'tag-default',
    proximities: overrides.proximities ?? [],
    suspectMedications: overrides.suspectMedications ?? [],
    escalate: overrides.escalate ?? false,
    summary: overrides.summary ?? '',
  };
}

function lab(overrides: Partial<LabWindow> & { medicationName: string; labCode: string; status: LabWindow['status'] }): LabWindow {
  return {
    medicationId: overrides.medicationId ?? 'm-x',
    medicationName: overrides.medicationName,
    labCode: overrides.labCode,
    labName: overrides.labName ?? overrides.labCode,
    status: overrides.status,
    daysUntilDue: overrides.daysUntilDue ?? 0,
    lastDrawnAt: overrides.lastDrawnAt ?? null,
    nextDueAt: overrides.nextDueAt ?? null,
    message: overrides.message ?? `${overrides.status} ${overrides.labCode}`,
  };
}

const BASE_INPUT: AppointmentPrepInput = {
  patientName: 'Test Patient',
  visit: { dateIso: '2026-07-10', clinician: 'Dr. Smith', reasonForVisit: 'follow-up' },
  lastVisitIso: '2026-06-01',
  medications: [
    med({ id: 'm-lisin', name: 'Lisinopril', strength: '10 mg', instructions: '1 tab po qd' }),
    med({ id: 'm-metf', name: 'Metformin', strength: '500 mg', instructions: '1 tab po bid' }),
    med({ id: 'm-old', name: 'Old Med', strength: '5 mg', active: false }),
  ],
};

describe('buildAppointmentPrepChecklist', () => {
  it('filters out inactive medications', () => {
    const c = buildAppointmentPrepChecklist(BASE_INPUT);
    expect(c.medications.map((m) => m.name)).toEqual(['Lisinopril', 'Metformin']);
  });

  it('sorts medications alphabetically by name', () => {
    const c = buildAppointmentPrepChecklist({
      ...BASE_INPUT,
      medications: [
        med({ id: 'a', name: 'Zoloft' }),
        med({ id: 'b', name: 'Aspirin' }),
        med({ id: 'c', name: 'Metoprolol' }),
      ],
    });
    expect(c.medications.map((m) => m.name)).toEqual(['Aspirin', 'Metoprolol', 'Zoloft']);
  });

  it('uses instructions as the sig when present, falls back to form', () => {
    const c = buildAppointmentPrepChecklist({
      ...BASE_INPUT,
      medications: [
        med({ id: 'm-lisin', name: 'Lisinopril', instructions: '1 tab po qd' }),
        med({ id: 'm-no-sig', name: 'NoSig', form: 'capsule', instructions: undefined }),
      ],
    });
    expect(c.medications[0]?.sig).toBe('1 tab po qd');
    expect(c.medications[1]?.sig).toBe('1 capsule');
  });

  it('only surfaces adverse events strictly after last visit', () => {
    const c = buildAppointmentPrepChecklist({
      ...BASE_INPUT,
      adverseEvents: [
        adverse({ description: 'pre-visit rash', onsetAt: '2026-05-15T10:00:00Z' }),
        adverse({ description: 'post-visit rash', onsetAt: '2026-06-15T10:00:00Z' }),
        adverse({ description: 'recent dizziness', onsetAt: '2026-07-01T10:00:00Z' }),
      ],
    });
    const descs = c.adverseEvents.map((a) => a.description);
    expect(descs).toContain('post-visit rash');
    expect(descs).toContain('recent dizziness');
    expect(descs).not.toContain('pre-visit rash');
  });

  it('sorts adverse events by severity descending then onset descending', () => {
    const c = buildAppointmentPrepChecklist({
      ...BASE_INPUT,
      adverseEvents: [
        adverse({ description: 'minor1', onsetAt: '2026-06-20T08:00:00Z', severity: 'minor' }),
        adverse({ description: 'major1', onsetAt: '2026-06-15T08:00:00Z', severity: 'major' }),
        adverse({ description: 'minor2', onsetAt: '2026-06-25T08:00:00Z', severity: 'minor' }),
        adverse({ description: 'lethal', onsetAt: '2026-06-10T08:00:00Z', severity: 'life-threatening' }),
      ],
    });
    expect(c.adverseEvents.map((a) => a.description)).toEqual(['lethal', 'major1', 'minor2', 'minor1']);
  });

  it('shows all adverse events when no lastVisitIso is given', () => {
    const c = buildAppointmentPrepChecklist({
      ...BASE_INPUT,
      lastVisitIso: undefined,
      adverseEvents: [
        adverse({ description: 'old', onsetAt: '2020-01-01T08:00:00Z' }),
        adverse({ description: 'new', onsetAt: '2026-06-25T08:00:00Z' }),
      ],
    });
    expect(c.adverseEvents.map((a) => a.description).sort()).toEqual(['new', 'old']);
  });

  it('caps adverse events at adverseEventLimit', () => {
    const events = Array.from({ length: 12 }, (_, i) =>
      adverse({ description: `ev-${i}`, onsetAt: `2026-06-${10 + i}T08:00:00Z`, severity: 'minor' }),
    );
    const c = buildAppointmentPrepChecklist({ ...BASE_INPUT, adverseEvents: events }, { adverseEventLimit: 3 });
    expect(c.adverseEvents).toHaveLength(3);
  });

  it('only flags overdue and due-soon labs and sorts overdue first', () => {
    const c = buildAppointmentPrepChecklist({
      ...BASE_INPUT,
      labs: [
        lab({ medicationName: 'Warfarin', labCode: 'INR', status: 'overdue', daysUntilDue: -5 }),
        lab({ medicationName: 'Statin', labCode: 'LFT', status: 'on-track', daysUntilDue: 30 }),
        lab({ medicationName: 'TSH', labCode: 'TSH', status: 'due-soon', daysUntilDue: 5 }),
        lab({ medicationName: 'Lithium', labCode: 'LITHIUM', status: 'no-history', daysUntilDue: 0 }),
      ],
    });
    expect(c.labs.map((l) => l.labCode)).toEqual(['INR', 'TSH']);
    expect(c.hasOverdueLabs).toBe(true);
  });

  it('filters refills outside the horizon and sorts by days-left ascending', () => {
    const c = buildAppointmentPrepChecklist(
      {
        ...BASE_INPUT,
        refillsNeeded: [
          { medicationId: 'a', medicationName: 'AlphaMed', daysOfSupplyLeft: 60 },
          { medicationId: 'b', medicationName: 'BetaMed', daysOfSupplyLeft: 5 },
          { medicationId: 'c', medicationName: 'OutMed', daysOfSupplyLeft: 0 },
          { medicationId: 'd', medicationName: 'MidMed', daysOfSupplyLeft: 20 },
        ],
      },
      { refillHorizonDays: 30 },
    );
    expect(c.refillsNeeded.map((r) => r.medicationName)).toEqual(['OutMed', 'BetaMed', 'MidMed']);
    expect(c.hasUrgentRefills).toBe(true);
  });

  it('does not flag urgent refills when no refill is <=7 days left', () => {
    const c = buildAppointmentPrepChecklist({
      ...BASE_INPUT,
      refillsNeeded: [
        { medicationId: 'a', medicationName: 'AlphaMed', daysOfSupplyLeft: 25 },
      ],
    });
    expect(c.hasUrgentRefills).toBe(false);
  });

  it('preserves question order (chronological queueing)', () => {
    const c = buildAppointmentPrepChecklist({
      ...BASE_INPUT,
      questions: [
        { medicationId: 'm-lisin', text: 'q1', queuedAt: '2026-06-10T08:00:00Z' },
        { medicationId: null, text: 'q2', queuedAt: '2026-06-15T08:00:00Z' },
        { medicationId: 'm-metf', text: 'q3', queuedAt: '2026-06-20T08:00:00Z' },
      ],
    });
    expect(c.questions.map((q) => q.text)).toEqual(['q1', 'q2', 'q3']);
  });

  it('caps questions at questionLimit', () => {
    const qs = Array.from({ length: 15 }, (_, i) => ({
      medicationId: null,
      text: `q-${i}`,
      queuedAt: '2026-06-10T08:00:00Z',
    }));
    const c = buildAppointmentPrepChecklist({ ...BASE_INPUT, questions: qs }, { questionLimit: 4 });
    expect(c.questions).toHaveLength(4);
  });

  it('reports the worst severity across surfaced adverse events', () => {
    const c = buildAppointmentPrepChecklist({
      ...BASE_INPUT,
      adverseEvents: [
        adverse({ description: 'minor', onsetAt: '2026-06-15T08:00:00Z', severity: 'minor' }),
        adverse({ description: 'major', onsetAt: '2026-06-20T08:00:00Z', severity: 'major' }),
        adverse({ description: 'moderate', onsetAt: '2026-06-25T08:00:00Z', severity: 'moderate' }),
      ],
    });
    expect(c.highestSeverity).toBe('major');
  });

  it('returns null highestSeverity when no adverse events are surfaced', () => {
    const c = buildAppointmentPrepChecklist(BASE_INPUT);
    expect(c.highestSeverity).toBeNull();
  });

  it('counts every surfaced item into totalItemCount', () => {
    const c = buildAppointmentPrepChecklist({
      ...BASE_INPUT,
      adverseEvents: [adverse({ description: 'x', onsetAt: '2026-06-25T08:00:00Z' })],
      labs: [lab({ medicationName: 'Warfarin', labCode: 'INR', status: 'overdue', daysUntilDue: -1 })],
      refillsNeeded: [{ medicationId: 'a', medicationName: 'Refill', daysOfSupplyLeft: 5 }],
      questions: [{ medicationId: null, text: 'q', queuedAt: '2026-06-25T08:00:00Z' }],
      vitals: [{ kind: 'bp', label: 'BP cuff log' }],
    });
    // 2 active meds + 1 adverse + 1 lab + 1 refill + 1 question + 1 vital = 7
    expect(c.totalItemCount).toBe(7);
  });

  it('renders a multi-section text block', () => {
    const c = buildAppointmentPrepChecklist({
      ...BASE_INPUT,
      questions: [{ medicationId: null, text: 'Should we reduce dose?', queuedAt: '2026-06-15T08:00:00Z' }],
      vitals: [{ kind: 'glucose', label: 'Glucose meter readings', note: 'fasting' }],
    });
    expect(c.text).toContain('Appointment prep for Test Patient');
    expect(c.text).toContain('Visit: 2026-07-10 with Dr. Smith');
    expect(c.text).toContain('Reason: follow-up');
    expect(c.text).toContain('Since last visit: 2026-06-01');
    expect(c.text).toContain('Current medications (2)');
    expect(c.text).toContain('- Lisinopril 10 mg');
    expect(c.text).toContain('Questions to ask');
    expect(c.text).toContain('Should we reduce dose?');
    expect(c.text).toContain('Glucose meter readings (fasting)');
  });

  it('omits empty sections from text', () => {
    const c = buildAppointmentPrepChecklist(BASE_INPUT);
    expect(c.text).not.toContain('Questions to ask');
    expect(c.text).not.toContain('Bring to visit');
    expect(c.text).not.toContain('Refills needed');
  });

  it('treats refills > horizon as not-needed-yet', () => {
    const c = buildAppointmentPrepChecklist(
      {
        ...BASE_INPUT,
        refillsNeeded: [
          { medicationId: 'a', medicationName: 'FarAway', daysOfSupplyLeft: 90 },
        ],
      },
      { refillHorizonDays: 30 },
    );
    expect(c.refillsNeeded).toHaveLength(0);
  });

  it('treats OUT refills (daysOfSupplyLeft <= 0) as visible', () => {
    const c = buildAppointmentPrepChecklist({
      ...BASE_INPUT,
      refillsNeeded: [
        { medicationId: 'a', medicationName: 'Outage', daysOfSupplyLeft: -3 },
      ],
    });
    expect(c.refillsNeeded).toHaveLength(1);
    expect(c.text).toContain('Outage: OUT');
  });

  it('is deterministic given identical inputs', () => {
    const c1 = buildAppointmentPrepChecklist(BASE_INPUT);
    const c2 = buildAppointmentPrepChecklist(BASE_INPUT);
    expect(c1).toEqual(c2);
  });
});
