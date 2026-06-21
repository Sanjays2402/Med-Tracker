import { describe, it, expect } from 'vitest';
import {
  buildCaregiverHandoffSummary,
  type HandoffSummaryInput,
  type HandoffDoseEvent,
  type HandoffPrnEvent,
  type HandoffAdverseEvent,
} from '../src/caregiver-handoff-summary';

const BASE: HandoffSummaryInput = {
  patientName: 'Jane Doe',
  outgoingCaregiver: 'Alice',
  incomingCaregiver: 'Bob',
  windowStart: '2026-06-20T08:00:00Z',
  windowEnd: '2026-06-20T20:00:00Z',
  activeMedicationCount: 5,
};

function dose(
  id: string,
  status: HandoffDoseEvent['status'],
  due: string,
  acted?: string,
): HandoffDoseEvent {
  return {
    doseId: id,
    medicationId: 'm-' + id,
    medicationName: 'Med ' + id,
    dueAt: due,
    status,
    ...(acted !== undefined ? { actedAt: acted } : {}),
  };
}

function prn(
  medicationId: string,
  takenAt: string,
  reason?: string,
): HandoffPrnEvent {
  return {
    medicationId,
    medicationName: 'PRN-' + medicationId,
    takenAt,
    ...(reason !== undefined ? { reason } : {}),
  };
}

function adverse(
  description: string,
  severity: HandoffAdverseEvent['severity'],
  onsetAt: string,
): HandoffAdverseEvent {
  return { description, severity, onsetAt };
}

describe('buildCaregiverHandoffSummary', () => {
  it('throws on invalid window', () => {
    expect(() =>
      buildCaregiverHandoffSummary({ ...BASE, windowStart: 'nope', windowEnd: '2026-06-20T20:00:00Z' }),
    ).toThrow();
    expect(() =>
      buildCaregiverHandoffSummary({ ...BASE, windowStart: '2026-06-20T20:00:00Z', windowEnd: '2026-06-20T08:00:00Z' }),
    ).toThrow();
  });

  it('computes adherence counts and percent', () => {
    const r = buildCaregiverHandoffSummary({
      ...BASE,
      doseEvents: [
        dose('1', 'taken', '2026-06-20T09:00:00Z'),
        dose('2', 'taken', '2026-06-20T12:00:00Z'),
        dose('3', 'missed', '2026-06-20T15:00:00Z'),
        dose('4', 'late', '2026-06-20T18:00:00Z'),
      ],
    });
    expect(r.adherence.taken).toBe(2);
    expect(r.adherence.missed).toBe(1);
    expect(r.adherence.late).toBe(1);
    expect(r.adherence.skipped).toBe(0);
    expect(r.adherence.totalEvents).toBe(4);
    expect(r.adherence.takenPercent).toBe(50);
  });

  it('reports null takenPercent when no doses in window', () => {
    const r = buildCaregiverHandoffSummary({ ...BASE, doseEvents: [] });
    expect(r.adherence.takenPercent).toBeNull();
    expect(r.adherence.totalEvents).toBe(0);
  });

  it('drops dose events outside the window', () => {
    const r = buildCaregiverHandoffSummary({
      ...BASE,
      doseEvents: [
        dose('1', 'taken', '2026-06-19T09:00:00Z'), // before window
        dose('2', 'taken', '2026-06-20T12:00:00Z'),
        dose('3', 'taken', '2026-06-21T08:00:00Z'), // after window
      ],
    });
    expect(r.adherence.taken).toBe(1);
  });

  it('uses actedAt for filtering when present, falling back to dueAt', () => {
    const r = buildCaregiverHandoffSummary({
      ...BASE,
      doseEvents: [
        // Due before window but acted in window -> include.
        dose('1', 'late', '2026-06-19T22:00:00Z', '2026-06-20T09:00:00Z'),
        // Due in window but no acted -> include via dueAt.
        dose('2', 'taken', '2026-06-20T12:00:00Z'),
      ],
    });
    expect(r.adherence.totalEvents).toBe(2);
  });

  it('rolls up PRN events by medication, descending by count', () => {
    const r = buildCaregiverHandoffSummary({
      ...BASE,
      prnEvents: [
        prn('pain', '2026-06-20T09:00:00Z', 'headache'),
        prn('pain', '2026-06-20T13:00:00Z', 'back pain'),
        prn('sleep', '2026-06-20T19:00:00Z'),
        prn('pain', '2026-06-20T17:00:00Z', 'headache'),
      ],
    });
    expect(r.prn.totalCount).toBe(4);
    expect(r.prn.byMedication[0]?.medicationId).toBe('pain');
    expect(r.prn.byMedication[0]?.count).toBe(3);
    expect(r.prn.byMedication[0]?.reasons).toEqual(['headache', 'back pain']);
    expect(r.prn.byMedication[1]?.medicationId).toBe('sleep');
  });

  it('drops PRN events outside the window', () => {
    const r = buildCaregiverHandoffSummary({
      ...BASE,
      prnEvents: [
        prn('p', '2026-06-19T09:00:00Z'),
        prn('p', '2026-06-20T13:00:00Z'),
      ],
    });
    expect(r.prn.totalCount).toBe(1);
  });

  it('surfaces adverse events sorted severity descending then onset descending', () => {
    const r = buildCaregiverHandoffSummary({
      ...BASE,
      adverseEvents: [
        adverse('mild itch', 'minor', '2026-06-20T09:00:00Z'),
        adverse('chest pain', 'major', '2026-06-20T13:00:00Z'),
        adverse('dizzy', 'minor', '2026-06-20T18:00:00Z'),
        adverse('rash', 'moderate', '2026-06-20T10:00:00Z'),
      ],
    });
    expect(r.adverseEvents.map((a) => a.description)).toEqual([
      'chest pain', 'rash', 'dizzy', 'mild itch',
    ]);
    expect(r.worstAdverseSeverity).toBe('major');
  });

  it('caps adverse events at adverseEventLimit', () => {
    const events = Array.from({ length: 8 }, (_, i) =>
      adverse(`ev-${i}`, 'minor', `2026-06-20T${(8 + i).toString().padStart(2, '0')}:00:00Z`),
    );
    const r = buildCaregiverHandoffSummary({ ...BASE, adverseEvents: events }, { adverseEventLimit: 3 });
    expect(r.adverseEvents).toHaveLength(3);
  });

  it('reports null worstAdverseSeverity when no events', () => {
    const r = buildCaregiverHandoffSummary(BASE);
    expect(r.worstAdverseSeverity).toBeNull();
  });

  it('sorts open tasks by priority then dueAt then title', () => {
    const r = buildCaregiverHandoffSummary({
      ...BASE,
      openTasks: [
        { id: 't-low', title: 'low pri', priority: 'low' },
        { id: 't-urg', title: 'call doctor', priority: 'urgent' },
        { id: 't-norm-2', title: 'pickup refill B', dueAt: '2026-06-20T18:00:00Z' },
        { id: 't-norm-1', title: 'pickup refill A', dueAt: '2026-06-20T14:00:00Z' },
      ],
    });
    expect(r.openTasks.map((t) => t.id)).toEqual([
      't-urg',
      't-norm-1',
      't-norm-2',
      't-low',
    ]);
  });

  it('caps open tasks at openTaskLimit', () => {
    const tasks = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, title: `t${i}` }));
    const r = buildCaregiverHandoffSummary({ ...BASE, openTasks: tasks }, { openTaskLimit: 3 });
    expect(r.openTasks).toHaveLength(3);
  });

  it('filters medication changes by window', () => {
    const r = buildCaregiverHandoffSummary({
      ...BASE,
      medicationChanges: [
        { change: 'added', medicationName: 'Metoprolol', changedAt: '2026-06-19T09:00:00Z' },
        { change: 'removed', medicationName: 'Amlodipine', changedAt: '2026-06-20T11:00:00Z' },
        { change: 'added', medicationName: 'Carvedilol', changedAt: '2026-06-20T15:00:00Z' },
      ],
    });
    expect(r.medicationChanges).toHaveLength(2);
  });

  it('narrative covers context, adherence, prn, and changes', () => {
    const r = buildCaregiverHandoffSummary({
      ...BASE,
      doseEvents: [
        dose('1', 'taken', '2026-06-20T09:00:00Z'),
        dose('2', 'missed', '2026-06-20T12:00:00Z'),
      ],
      prnEvents: [prn('pain', '2026-06-20T15:00:00Z')],
      medicationChanges: [
        { change: 'added', medicationName: 'Carvedilol', changedAt: '2026-06-20T16:00:00Z' },
      ],
    });
    expect(r.narrative).toContain('Jane Doe');
    expect(r.narrative).toContain('5 active medications');
    expect(r.narrative).toContain('Adherence 50%');
    expect(r.narrative).toContain('PRN usage');
    expect(r.narrative).toContain('Carvedilol');
  });

  it('narrative reports zero-dose window cleanly', () => {
    const r = buildCaregiverHandoffSummary(BASE);
    expect(r.narrative).toContain('No scheduled doses');
    expect(r.narrative).toContain('No PRN medications');
  });

  it('narrative includes top adverse event with severity tag', () => {
    const r = buildCaregiverHandoffSummary({
      ...BASE,
      adverseEvents: [
        adverse('chest pain', 'major', '2026-06-20T13:00:00Z'),
        adverse('rash', 'minor', '2026-06-20T10:00:00Z'),
      ],
    });
    expect(r.narrative).toContain('Adverse events: major - chest pain');
    expect(r.narrative).toContain('plus 1 more');
  });

  it('narrative names the incoming caregiver in the tasks line', () => {
    const r = buildCaregiverHandoffSummary({
      ...BASE,
      openTasks: [{ id: 't-1', title: 'call cardiology', priority: 'urgent' }],
    });
    expect(r.narrative).toContain('Open tasks for Bob');
    expect(r.narrative).toContain('call cardiology');
  });

  it('1 active medication shows the singular form', () => {
    const r = buildCaregiverHandoffSummary({ ...BASE, activeMedicationCount: 1 });
    expect(r.narrative).toContain('1 active medication between');
  });

  it('takenPercent integer rounds for the narrative', () => {
    const r = buildCaregiverHandoffSummary({
      ...BASE,
      doseEvents: [
        dose('1', 'taken', '2026-06-20T09:00:00Z'),
        dose('2', 'taken', '2026-06-20T10:00:00Z'),
        dose('3', 'missed', '2026-06-20T11:00:00Z'),
      ],
    });
    // 2/3 = 66.67% -> rounds to 67% in narrative.
    expect(r.narrative).toContain('Adherence 67%');
  });

  it('is deterministic across repeated calls', () => {
    const input: HandoffSummaryInput = {
      ...BASE,
      doseEvents: [dose('1', 'taken', '2026-06-20T09:00:00Z')],
      prnEvents: [prn('p', '2026-06-20T12:00:00Z', 'pain')],
      adverseEvents: [adverse('itch', 'minor', '2026-06-20T15:00:00Z')],
      openTasks: [{ id: 't1', title: 't1' }],
    };
    expect(buildCaregiverHandoffSummary(input)).toEqual(buildCaregiverHandoffSummary(input));
  });

  it('drops adverse events outside the window from the count AND severity headline', () => {
    const r = buildCaregiverHandoffSummary({
      ...BASE,
      adverseEvents: [
        adverse('huge', 'life-threatening', '2026-06-19T18:00:00Z'), // before window
        adverse('mild', 'minor', '2026-06-20T15:00:00Z'),
      ],
    });
    expect(r.adverseEvents).toHaveLength(1);
    expect(r.worstAdverseSeverity).toBe('minor');
  });

  it('joins three or more PRN reasons naturally in the rollup', () => {
    const r = buildCaregiverHandoffSummary({
      ...BASE,
      prnEvents: [
        prn('p', '2026-06-20T09:00:00Z', 'headache'),
        prn('p', '2026-06-20T11:00:00Z', 'back pain'),
        prn('p', '2026-06-20T13:00:00Z', 'arm pain'),
      ],
    });
    expect(r.prn.byMedication[0]?.reasons).toEqual(['headache', 'back pain', 'arm pain']);
  });

  it('counts only dose statuses, not PRN, in adherence', () => {
    const r = buildCaregiverHandoffSummary({
      ...BASE,
      doseEvents: [dose('1', 'taken', '2026-06-20T09:00:00Z')],
      prnEvents: [prn('p', '2026-06-20T10:00:00Z')],
    });
    expect(r.adherence.totalEvents).toBe(1);
    expect(r.prn.totalCount).toBe(1);
  });
});
