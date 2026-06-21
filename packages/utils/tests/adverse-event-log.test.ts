import { describe, it, expect } from 'vitest';
import {
  logAdverseEvent,
  summarizeAdverseEvents,
  type AdverseEventInput,
  type AdverseDoseHistoryEntry,
} from '../src/adverse-event-log';

const ONSET = '2026-06-20T15:00:00Z';

const HISTORY: AdverseDoseHistoryEntry[] = [
  { medicationId: 'm-lisin', medicationName: 'Lisinopril', takenAt: '2026-06-20T08:00:00Z' },
  { medicationId: 'm-lisin', medicationName: 'Lisinopril', takenAt: '2026-06-19T08:00:00Z' },
  { medicationId: 'm-metf', medicationName: 'Metformin', takenAt: '2026-06-20T13:00:00Z' },
  { medicationId: 'm-amox', medicationName: 'Amoxicillin', takenAt: '2026-06-19T20:00:00Z' },
];

describe('logAdverseEvent', () => {
  it('rejects empty description', () => {
    expect(() =>
      logAdverseEvent({ description: '   ', tags: [], onsetAt: ONSET }, []),
    ).toThrow();
  });

  it('rejects patientSeverity outside 1..10', () => {
    const input: AdverseEventInput = {
      description: 'rash',
      tags: ['rash'],
      onsetAt: ONSET,
      patientSeverity: 11,
    };
    expect(() => logAdverseEvent(input, [])).toThrow();
  });

  it('rejects invalid onsetAt', () => {
    expect(() =>
      logAdverseEvent({ description: 'x', tags: [], onsetAt: 'not-iso' }, []),
    ).toThrow();
  });

  it('classifies anaphylaxis as life-threatening and escalates', () => {
    const r = logAdverseEvent(
      { description: 'lip swelling and trouble breathing', tags: ['anaphylaxis'], onsetAt: ONSET },
      HISTORY,
    );
    expect(r.severity).toBe('life-threatening');
    expect(r.escalate).toBe(true);
  });

  it('classifies rash as moderate by default', () => {
    const r = logAdverseEvent(
      { description: 'itchy rash on arm', tags: ['rash'], onsetAt: ONSET },
      HISTORY,
    );
    expect(r.severity).toBe('moderate');
  });

  it('lifts severity when patient-reported severity is high', () => {
    const r = logAdverseEvent(
      {
        description: 'mild rash',
        tags: ['rash'],
        onsetAt: ONSET,
        patientSeverity: 9,
      },
      HISTORY,
    );
    expect(r.severity).toBe('major');
    expect(r.severityRationale).toMatch(/9\/10/);
  });

  it('picks the highest-severity tag when multiple tags are given', () => {
    const r = logAdverseEvent(
      { description: 'multiple', tags: ['rash', 'chest-pain', 'nausea'], onsetAt: ONSET },
      HISTORY,
    );
    expect(r.severity).toBe('major'); // chest-pain wins
  });

  it('defaults to minor for an untagged event', () => {
    const r = logAdverseEvent({ description: 'feeling off', tags: [], onsetAt: ONSET }, []);
    expect(r.severity).toBe('minor');
    expect(r.severityRationale).toMatch(/untagged/i);
  });

  it('escalates major+suspect-medication to immediate-care', () => {
    // Major event with metformin within 2h proximity.
    const r = logAdverseEvent(
      { description: 'sudden chest pressure', tags: ['chest-pain'], onsetAt: ONSET },
      HISTORY,
    );
    expect(r.severity).toBe('major');
    expect(r.escalate).toBe(true);
    expect(r.suspectMedications).toContain('m-metf');
  });

  it('does NOT escalate major events with no recent dose in window', () => {
    // Only amoxicillin, dosed 19h ago.
    const r = logAdverseEvent(
      { description: 'sudden chest pressure', tags: ['chest-pain'], onsetAt: ONSET },
      [{ medicationId: 'm-amox', medicationName: 'Amoxicillin', takenAt: '2026-06-19T20:00:00Z' }],
    );
    expect(r.severity).toBe('major');
    expect(r.escalate).toBe(false);
    expect(r.suspectMedications).toEqual([]);
  });

  it('reports per-medication proximity sorted by closest dose first', () => {
    const r = logAdverseEvent(
      { description: 'nausea', tags: ['nausea'], onsetAt: ONSET },
      HISTORY,
    );
    // Closest dose to 15:00 UTC: metformin at 13:00 (2h), lisinopril at 08:00 (7h),
    // amoxicillin at 19:00 prev day (19h, outside default 12h window).
    expect(r.proximities[0]?.medicationId).toBe('m-metf');
    expect(r.proximities[0]?.hoursSinceLastDose).toBe(2);
    expect(r.proximities[0]?.withinWindow).toBe(true);
    expect(r.proximities[1]?.medicationId).toBe('m-lisin');
    expect(r.proximities[1]?.withinWindow).toBe(true);
    expect(r.proximities[2]?.medicationId).toBe('m-amox');
    expect(r.proximities[2]?.withinWindow).toBe(false);
  });

  it('handles never-dosed medications by reporting null lastDoseAt', () => {
    const r = logAdverseEvent(
      { description: 'headache', tags: ['headache'], onsetAt: ONSET },
      [{ medicationId: 'm-new', medicationName: 'NewMed', takenAt: '2026-06-21T10:00:00Z' }], // after onset
    );
    expect(r.proximities[0]?.lastDoseAt).toBeNull();
    expect(r.proximities[0]?.hoursSinceLastDose).toBeNull();
    expect(r.proximities[0]?.withinWindow).toBe(false);
  });

  it('respects the proximityWindowHours option', () => {
    const r = logAdverseEvent(
      { description: 'itch', tags: ['itching'], onsetAt: ONSET },
      HISTORY,
      { proximityWindowHours: 24 },
    );
    // Amoxicillin at 19h is now inside the window.
    const amox = r.proximities.find((p) => p.medicationId === 'm-amox');
    expect(amox?.withinWindow).toBe(true);
  });

  it('generates deterministic ids from onset + tags', () => {
    const a = logAdverseEvent({ description: 'a', tags: ['rash'], onsetAt: ONSET }, []);
    const b = logAdverseEvent({ description: 'b', tags: ['rash'], onsetAt: ONSET }, []);
    // Same onset + same tag set -> same id (so re-import is idempotent).
    expect(a.id).toBe(b.id);
  });

  it('id differs when tags differ', () => {
    const a = logAdverseEvent({ description: 'a', tags: ['rash'], onsetAt: ONSET }, []);
    const c = logAdverseEvent({ description: 'a', tags: ['nausea'], onsetAt: ONSET }, []);
    expect(a.id).not.toBe(c.id);
  });

  it('summary mentions severity, description, and suspect meds', () => {
    const r = logAdverseEvent(
      { description: 'pounding heart', tags: ['palpitations'], onsetAt: ONSET },
      HISTORY,
    );
    expect(r.summary).toMatch(/Moderate adverse event/);
    expect(r.summary).toMatch(/pounding heart/);
    expect(r.summary).toMatch(/Lisinopril|Metformin/);
  });

  it('summary says "no medications" when nothing is in window', () => {
    const r = logAdverseEvent(
      { description: 'mild headache', tags: ['headache'], onsetAt: ONSET },
      [],
    );
    expect(r.summary).toMatch(/No medications/);
  });

  it('respects custom patient-severity thresholds', () => {
    // Bump major threshold to 9 so a 7/10 nausea stays moderate.
    const r = logAdverseEvent(
      { description: 'nausea', tags: ['nausea'], onsetAt: ONSET, patientSeverity: 7 },
      HISTORY,
      { patientSeverityMajorThreshold: 9 },
    );
    expect(r.severity).toBe('minor'); // nausea is minor and 7 < 9
  });

  it('throws when threshold options are nonsensical', () => {
    expect(() =>
      logAdverseEvent(
        { description: 'x', tags: [], onsetAt: ONSET },
        [],
        { patientSeverityMajorThreshold: 9, patientSeverityLifeThreshold: 5 },
      ),
    ).toThrow();
  });
});

describe('summarizeAdverseEvents', () => {
  const events = [
    logAdverseEvent({ description: 'rash', tags: ['rash'], onsetAt: ONSET }, HISTORY),
    logAdverseEvent({ description: 'chest', tags: ['chest-pain'], onsetAt: ONSET }, HISTORY),
    logAdverseEvent({ description: 'rash', tags: ['rash'], onsetAt: '2026-06-21T10:00:00Z' }, HISTORY),
  ];

  it('counts by severity', () => {
    const sum = summarizeAdverseEvents(events);
    expect(sum.total).toBe(3);
    expect(sum.bySeverity.moderate).toBe(2); // 2 rash
    expect(sum.bySeverity.major).toBe(1);    // 1 chest-pain
  });

  it('counts escalations', () => {
    const sum = summarizeAdverseEvents(events);
    expect(sum.escalations).toBeGreaterThanOrEqual(1); // chest-pain with metformin in window
  });

  it('rolls up by suspect medication, sorted descending', () => {
    const sum = summarizeAdverseEvents(events);
    const medfCount = sum.byMedication.find((m) => m.medicationId === 'm-metf')?.count;
    expect(medfCount).toBeGreaterThan(0);
    // Sorted desc.
    for (let i = 1; i < sum.byMedication.length; i++) {
      expect(sum.byMedication[i]!.count).toBeLessThanOrEqual(sum.byMedication[i - 1]!.count);
    }
  });

  it('returns zeros across all severity buckets for an empty list', () => {
    const sum = summarizeAdverseEvents([]);
    expect(sum.total).toBe(0);
    expect(sum.bySeverity.minor).toBe(0);
    expect(sum.bySeverity['life-threatening']).toBe(0);
    expect(sum.byMedication).toEqual([]);
  });
});
