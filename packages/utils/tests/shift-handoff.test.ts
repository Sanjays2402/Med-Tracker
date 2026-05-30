import { describe, it, expect } from 'vitest';
import { buildShiftHandoff, type HandoffInput } from '../src/shift-handoff';

const NOW = '2026-06-10T18:00:00.000Z';

function baseInput(overrides: Partial<HandoffInput> = {}): HandoffInput {
  return {
    patientName: 'Mom',
    outgoingCaregiver: 'Day Aide',
    incomingCaregiver: 'Night Aide',
    now: NOW,
    upcoming: [],
    history: [],
    prnUsage: [],
    alerts: [],
    ...overrides,
  };
}

describe('buildShiftHandoff', () => {
  it('produces a valid empty report when nothing is provided', () => {
    const r = buildShiftHandoff(baseInput());
    expect(r.upcoming).toEqual([]);
    expect(r.recentMissedOrLate).toEqual([]);
    expect(r.prnSummary).toEqual([]);
    expect(r.openAlerts).toEqual([]);
    expect(r.text).toMatch(/Shift handoff for Mom/);
    expect(r.text).toMatch(/Upcoming doses \(next 12h\): 0/);
  });

  it('filters upcoming doses to the lookahead window', () => {
    const r = buildShiftHandoff(
      baseInput({
        upcoming: [
          { doseId: 'd1', medicationId: 'm1', medicationName: 'Metformin', scheduledFor: '2026-06-10T18:30:00.000Z', strength: '500 mg' },
          { doseId: 'd2', medicationId: 'm1', medicationName: 'Metformin', scheduledFor: '2026-06-11T07:00:00.000Z', strength: '500 mg' }, // 13h ahead, outside default 12h
          { doseId: 'd3', medicationId: 'm2', medicationName: 'Lisinopril', scheduledFor: '2026-06-10T17:00:00.000Z', strength: '10 mg' }, // in the past
        ],
      })
    );
    expect(r.upcoming.map((d) => d.doseId)).toEqual(['d1']);
  });

  it('sorts upcoming by scheduledFor ascending', () => {
    const r = buildShiftHandoff(
      baseInput({
        upcoming: [
          { doseId: 'd2', medicationId: 'm1', medicationName: 'A', scheduledFor: '2026-06-10T22:00:00.000Z', strength: 's' },
          { doseId: 'd1', medicationId: 'm1', medicationName: 'A', scheduledFor: '2026-06-10T20:00:00.000Z', strength: 's' },
        ],
      })
    );
    expect(r.upcoming.map((d) => d.doseId)).toEqual(['d1', 'd2']);
  });

  it('dedups upcoming by doseId', () => {
    const r = buildShiftHandoff(
      baseInput({
        upcoming: [
          { doseId: 'd1', medicationId: 'm1', medicationName: 'A', scheduledFor: '2026-06-10T20:00:00.000Z', strength: 's' },
          { doseId: 'd1', medicationId: 'm1', medicationName: 'A', scheduledFor: '2026-06-10T20:00:00.000Z', strength: 's' },
        ],
      })
    );
    expect(r.upcoming).toHaveLength(1);
  });

  it('only includes recent missed/late/skipped, not taken', () => {
    const r = buildShiftHandoff(
      baseInput({
        history: [
          { doseId: 'h1', medicationId: 'm1', medicationName: 'A', scheduledFor: '2026-06-10T15:00:00.000Z', status: 'taken' },
          { doseId: 'h2', medicationId: 'm1', medicationName: 'A', scheduledFor: '2026-06-10T16:00:00.000Z', status: 'missed' },
          { doseId: 'h3', medicationId: 'm2', medicationName: 'B', scheduledFor: '2026-06-10T17:30:00.000Z', status: 'late' },
          { doseId: 'h4', medicationId: 'm1', medicationName: 'A', scheduledFor: '2026-06-08T15:00:00.000Z', status: 'missed' }, // outside recency
        ],
      })
    );
    expect(r.recentMissedOrLate.map((h) => h.doseId)).toEqual(['h2', 'h3']);
  });

  it('computes PRN summary against daily cap and flags at-cap', () => {
    const r = buildShiftHandoff(
      baseInput({
        prnUsage: [
          { medicationId: 'm-prn', medicationName: 'Tramadol', takenAt: '2026-06-10T08:00:00.000Z', dailyCap: 4 },
          { medicationId: 'm-prn', medicationName: 'Tramadol', takenAt: '2026-06-10T12:00:00.000Z', dailyCap: 4 },
          { medicationId: 'm-prn', medicationName: 'Tramadol', takenAt: '2026-06-10T16:00:00.000Z', dailyCap: 4 },
          { medicationId: 'm-prn', medicationName: 'Tramadol', takenAt: '2026-06-10T17:30:00.000Z', dailyCap: 4 },
          { medicationId: 'm-prn2', medicationName: 'Zofran', takenAt: '2026-06-10T10:00:00.000Z', dailyCap: 3 },
        ],
      })
    );
    const tram = r.prnSummary.find((p) => p.medicationId === 'm-prn')!;
    expect(tram.usedLast24h).toBe(4);
    expect(tram.remaining).toBe(0);
    expect(tram.atCap).toBe(true);
    expect(r.text).toMatch(/AT CAP/);
  });

  it('excludes PRN events outside the 24h window', () => {
    const r = buildShiftHandoff(
      baseInput({
        prnUsage: [
          { medicationId: 'm-prn', medicationName: 'Tramadol', takenAt: '2026-06-09T17:00:00.000Z', dailyCap: 4 }, // 25h ago
          { medicationId: 'm-prn', medicationName: 'Tramadol', takenAt: '2026-06-10T17:00:00.000Z', dailyCap: 4 },
        ],
      })
    );
    expect(r.prnSummary[0]!.usedLast24h).toBe(1);
  });

  it('excludes acknowledged alerts and sorts by severity then time', () => {
    const r = buildShiftHandoff(
      baseInput({
        alerts: [
          { id: 'a1', kind: 'refill', severity: 'warning', message: 'Lisinopril runs out in 2 days', raisedAt: '2026-06-10T10:00:00.000Z' },
          { id: 'a2', kind: 'interaction', severity: 'critical', message: 'NSAID added with warfarin', raisedAt: '2026-06-10T11:00:00.000Z' },
          { id: 'a3', kind: 'cold-chain', severity: 'info', message: 'Insulin pen 5 days remaining', raisedAt: '2026-06-10T09:00:00.000Z' },
          { id: 'a4', kind: 'refill', severity: 'warning', message: 'old', raisedAt: '2026-06-10T08:00:00.000Z', acknowledged: true },
        ],
      })
    );
    expect(r.openAlerts.map((a) => a.id)).toEqual(['a2', 'a1', 'a3']);
  });

  it('dedups alerts by id', () => {
    const r = buildShiftHandoff(
      baseInput({
        alerts: [
          { id: 'a1', kind: 'refill', severity: 'warning', message: 'x', raisedAt: '2026-06-10T10:00:00.000Z' },
          { id: 'a1', kind: 'refill', severity: 'warning', message: 'x', raisedAt: '2026-06-10T10:00:00.000Z' },
        ],
      })
    );
    expect(r.openAlerts).toHaveLength(1);
  });

  it('honors custom lookahead and recency windows', () => {
    const r = buildShiftHandoff(
      baseInput({
        lookaheadHours: 1,
        recencyHours: 1,
        upcoming: [
          { doseId: 'd1', medicationId: 'm1', medicationName: 'A', scheduledFor: '2026-06-10T18:30:00.000Z', strength: 's' },
          { doseId: 'd2', medicationId: 'm1', medicationName: 'A', scheduledFor: '2026-06-10T20:00:00.000Z', strength: 's' },
        ],
        history: [
          { doseId: 'h1', medicationId: 'm1', medicationName: 'A', scheduledFor: '2026-06-10T17:30:00.000Z', status: 'missed' },
          { doseId: 'h2', medicationId: 'm1', medicationName: 'A', scheduledFor: '2026-06-10T15:00:00.000Z', status: 'missed' },
        ],
      })
    );
    expect(r.upcoming.map((d) => d.doseId)).toEqual(['d1']);
    expect(r.recentMissedOrLate.map((h) => h.doseId)).toEqual(['h1']);
  });

  it('regenerating with same now produces identical text', () => {
    const input = baseInput({
      upcoming: [
        { doseId: 'd1', medicationId: 'm1', medicationName: 'A', scheduledFor: '2026-06-10T20:00:00.000Z', strength: 's' },
      ],
      alerts: [
        { id: 'a1', kind: 'refill', severity: 'warning', message: 'x', raisedAt: '2026-06-10T10:00:00.000Z' },
      ],
    });
    const a = buildShiftHandoff(input);
    const b = buildShiftHandoff(input);
    expect(a.text).toBe(b.text);
  });

  it('rejects invalid now', () => {
    expect(() => buildShiftHandoff(baseInput({ now: 'nope' }))).toThrow(/now is not a valid datetime/);
  });
});
