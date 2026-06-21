import { describe, it, expect } from 'vitest';
import {
  validateRefusals,
  rollupRefusals,
  computeAdherenceWithRefusals,
  REFUSAL_EXCLUDED_REASONS,
  REFUSAL_TOLERABILITY_REASONS,
  type MedicationRefusalEntry,
  type NormalizedRefusal,
} from '../src/medication-refusal-log';

function entry(o: Partial<MedicationRefusalEntry> = {}): MedicationRefusalEntry {
  return {
    medicationId: 'm-x',
    dueAt: '2026-06-21T08:00:00Z',
    reason: 'sleeping',
    ...o,
  };
}

describe('REFUSAL_EXCLUDED_REASONS', () => {
  it('excludes NPO, prescriber-paused, out-of-supply', () => {
    expect(REFUSAL_EXCLUDED_REASONS.has('npo')).toBe(true);
    expect(REFUSAL_EXCLUDED_REASONS.has('prescriber-paused')).toBe(true);
    expect(REFUSAL_EXCLUDED_REASONS.has('out-of-supply')).toBe(true);
  });

  it('does NOT exclude sleeping (it is a real adherence problem)', () => {
    expect(REFUSAL_EXCLUDED_REASONS.has('sleeping')).toBe(false);
  });

  it('does NOT exclude tolerability reasons (those need surfacing)', () => {
    expect(REFUSAL_EXCLUDED_REASONS.has('nausea')).toBe(false);
    expect(REFUSAL_EXCLUDED_REASONS.has('side-effect')).toBe(false);
  });
});

describe('REFUSAL_TOLERABILITY_REASONS', () => {
  it('includes nausea and side-effect', () => {
    expect(REFUSAL_TOLERABILITY_REASONS.has('nausea')).toBe(true);
    expect(REFUSAL_TOLERABILITY_REASONS.has('side-effect')).toBe(true);
  });
});

describe('validateRefusals', () => {
  it('normalises a valid entry', () => {
    const { ok, errors } = validateRefusals([entry()]);
    expect(errors).toEqual([]);
    expect(ok).toHaveLength(1);
    const r = ok[0]!;
    expect(r.medicationId).toBe('m-x');
    expect(r.reason).toBe('sleeping');
    expect(r.excludedFromAdherence).toBe(false);
    expect(r.tolerabilitySignal).toBe(false);
    expect(r.loggedAt).toBe(r.dueAt);
  });

  it('marks NPO as excludedFromAdherence', () => {
    const { ok } = validateRefusals([entry({ reason: 'npo' })]);
    expect(ok[0]?.excludedFromAdherence).toBe(true);
    expect(ok[0]?.tolerabilitySignal).toBe(false);
  });

  it('marks nausea as tolerability signal', () => {
    const { ok } = validateRefusals([entry({ reason: 'nausea' })]);
    expect(ok[0]?.tolerabilitySignal).toBe(true);
    expect(ok[0]?.excludedFromAdherence).toBe(false);
  });

  it('rejects entries missing medicationId', () => {
    const { ok, errors } = validateRefusals([entry({ medicationId: '' })]);
    expect(ok).toHaveLength(0);
    expect(errors[0]?.code).toBe('missing-medication');
  });

  it('rejects unknown reasons', () => {
    const { ok, errors } = validateRefusals([
      entry({ reason: 'not-a-real-reason' as never }),
    ]);
    expect(ok).toHaveLength(0);
    expect(errors[0]?.code).toBe('invalid-reason');
    expect(errors[0]?.message).toContain('not-a-real-reason');
  });

  it('rejects reason=other with no note', () => {
    const { ok, errors } = validateRefusals([entry({ reason: 'other' })]);
    expect(ok).toHaveLength(0);
    expect(errors[0]?.code).toBe('other-requires-note');
  });

  it('accepts reason=other with a non-empty note', () => {
    const { ok } = validateRefusals([entry({ reason: 'other', note: 'unusual situation' })]);
    expect(ok).toHaveLength(1);
    expect(ok[0]?.note).toBe('unusual situation');
  });

  it('rejects invalid dueAt timestamps', () => {
    const { errors } = validateRefusals([entry({ dueAt: 'not-a-date' })]);
    expect(errors[0]?.code).toBe('invalid-dueAt');
  });

  it('rejects invalid loggedAt timestamps when provided', () => {
    const { errors } = validateRefusals([entry({ loggedAt: 'nope' })]);
    expect(errors[0]?.code).toBe('invalid-loggedAt');
  });

  it('uses doseId for deterministic id when present', () => {
    const { ok } = validateRefusals([entry({ doseId: 'd-123' })]);
    expect(ok[0]?.id).toBe('refusal_d-123');
  });

  it('derives stable id when neither id nor doseId provided', () => {
    const a = validateRefusals([entry()]).ok[0]!;
    const b = validateRefusals([entry()]).ok[0]!;
    expect(a.id).toBe(b.id);
    expect(a.id.startsWith('refusal_')).toBe(true);
  });

  it('preserves caller-supplied id over derived', () => {
    const { ok } = validateRefusals([entry({ id: 'custom-id-1' })]);
    expect(ok[0]?.id).toBe('custom-id-1');
  });

  it('processes a batch with mixed valid/invalid rows', () => {
    const { ok, errors } = validateRefusals([
      entry({ doseId: 'd1' }),
      entry({ medicationId: '' }),
      entry({ doseId: 'd2', reason: 'npo' }),
    ]);
    expect(ok.map((r) => r.doseId)).toEqual(['d1', 'd2']);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.index).toBe(1);
  });

  it('trims whitespace from medicationId, note, loggedBy', () => {
    const { ok } = validateRefusals([
      entry({ medicationId: '  m-y  ', note: '  hello  ', loggedBy: ' me ' }),
    ]);
    expect(ok[0]?.medicationId).toBe('m-y');
    expect(ok[0]?.loggedBy).toBe('me');
  });
});

describe('rollupRefusals', () => {
  const NOW = new Date(2026, 5, 21); // 2026-06-21
  function n(o: Partial<NormalizedRefusal>): NormalizedRefusal {
    return {
      id: o.id ?? `r-${Math.random()}`,
      medicationId: o.medicationId ?? 'm1',
      dueAt: o.dueAt ?? '2026-06-15T08:00:00',
      loggedAt: o.loggedAt ?? o.dueAt ?? '2026-06-15T08:00:00',
      reason: o.reason ?? 'declined',
      excludedFromAdherence: o.excludedFromAdherence ?? false,
      tolerabilitySignal: o.tolerabilitySignal ?? false,
      ...(o.medicationName ? { medicationName: o.medicationName } : {}),
    };
  }

  it('counts total and recent per medication', () => {
    const refusals = [
      n({ medicationId: 'a', loggedAt: '2026-06-15T08:00:00' }),
      n({ medicationId: 'a', loggedAt: '2026-06-10T08:00:00' }),
      n({ medicationId: 'a', loggedAt: '2026-01-01T08:00:00' }), // outside 30d window
      n({ medicationId: 'b', loggedAt: '2026-06-12T08:00:00' }),
    ];
    const r = rollupRefusals(refusals, { now: NOW });
    const a = r.perMedication.find((m) => m.medicationId === 'a')!;
    expect(a.total).toBe(3);
    expect(a.recent).toBe(2);
    const b = r.perMedication.find((m) => m.medicationId === 'b')!;
    expect(b.total).toBe(1);
    expect(b.recent).toBe(1);
  });

  it('tracks reason breakdown only for the recent window', () => {
    const refusals = [
      n({ medicationId: 'a', loggedAt: '2026-06-15T08:00:00', reason: 'nausea', tolerabilitySignal: true }),
      n({ medicationId: 'a', loggedAt: '2026-06-10T08:00:00', reason: 'declined' }),
      n({ medicationId: 'a', loggedAt: '2026-01-01T08:00:00', reason: 'sleeping' }), // not recent
    ];
    const r = rollupRefusals(refusals, { now: NOW });
    expect(r.perMedication[0]?.recentByReason).toEqual({ nausea: 1, declined: 1 });
    expect(r.perMedication[0]?.recentByReason.sleeping).toBeUndefined();
  });

  it('flags de-prescribing candidates by tolerability share', () => {
    const refusals = [
      n({ medicationId: 'a', loggedAt: '2026-06-15T08:00:00', reason: 'nausea', tolerabilitySignal: true }),
      n({ medicationId: 'a', loggedAt: '2026-06-10T08:00:00', reason: 'nausea', tolerabilitySignal: true }),
      n({ medicationId: 'a', loggedAt: '2026-06-05T08:00:00', reason: 'side-effect', tolerabilitySignal: true }),
      n({ medicationId: 'a', loggedAt: '2026-06-01T08:00:00', reason: 'sleeping' }),
      n({ medicationId: 'b', loggedAt: '2026-06-15T08:00:00', reason: 'declined' }),
      n({ medicationId: 'b', loggedAt: '2026-06-12T08:00:00', reason: 'declined' }),
      n({ medicationId: 'b', loggedAt: '2026-06-10T08:00:00', reason: 'declined' }),
    ];
    const r = rollupRefusals(refusals, { now: NOW });
    expect(r.deprescribingCandidates.map((m) => m.medicationId)).toEqual(['a']);
    const a = r.deprescribingCandidates[0]!;
    expect(a.recentTolerabilityCount).toBe(3);
    expect(a.recentTolerabilityShare).toBeCloseTo(0.75, 5);
  });

  it('respects custom candidate thresholds', () => {
    const refusals = [
      n({ medicationId: 'a', loggedAt: '2026-06-15T08:00:00', reason: 'nausea', tolerabilitySignal: true }),
      n({ medicationId: 'a', loggedAt: '2026-06-10T08:00:00', reason: 'declined' }),
    ];
    const r = rollupRefusals(refusals, {
      now: NOW,
      candidateMinRefusals: 2,
      candidateMinTolerabilityShare: 0.4,
    });
    expect(r.deprescribingCandidates.map((m) => m.medicationId)).toEqual(['a']);
  });

  it('respects custom recentWindowDays', () => {
    const refusals = [
      n({ medicationId: 'a', loggedAt: '2026-06-15T08:00:00' }),
      n({ medicationId: 'a', loggedAt: '2026-05-15T08:00:00' }),
    ];
    const wide = rollupRefusals(refusals, { now: NOW, recentWindowDays: 90 });
    expect(wide.perMedication[0]?.recent).toBe(2);
    const narrow = rollupRefusals(refusals, { now: NOW, recentWindowDays: 20 });
    expect(narrow.perMedication[0]?.recent).toBe(1);
  });

  it('sorts perMedication by recent count desc, then name asc', () => {
    const refusals = [
      n({ medicationId: 'b', medicationName: 'Bisoprolol', loggedAt: '2026-06-15T08:00:00' }),
      n({ medicationId: 'a', medicationName: 'Apixaban', loggedAt: '2026-06-15T08:00:00' }),
      n({ medicationId: 'c', medicationName: 'Captopril', loggedAt: '2026-06-15T08:00:00' }),
      n({ medicationId: 'c', medicationName: 'Captopril', loggedAt: '2026-06-14T08:00:00' }),
    ];
    const r = rollupRefusals(refusals, { now: NOW });
    expect(r.perMedication.map((m) => m.medicationId)).toEqual(['c', 'a', 'b']);
  });

  it('tracks totalRecent and totalRecentExcluded', () => {
    const refusals = [
      n({ medicationId: 'a', loggedAt: '2026-06-15T08:00:00', reason: 'npo', excludedFromAdherence: true }),
      n({ medicationId: 'b', loggedAt: '2026-06-14T08:00:00', reason: 'sleeping' }),
    ];
    const r = rollupRefusals(refusals, { now: NOW });
    expect(r.totalRecent).toBe(2);
    expect(r.totalRecentExcluded).toBe(1);
  });

  it('reports lastRefusedAt per medication', () => {
    const refusals = [
      n({ medicationId: 'a', loggedAt: '2026-06-10T08:00:00' }),
      n({ medicationId: 'a', loggedAt: '2026-06-15T08:00:00' }),
      n({ medicationId: 'a', loggedAt: '2026-06-01T08:00:00' }),
    ];
    const r = rollupRefusals(refusals, { now: NOW });
    expect(r.perMedication[0]?.lastRefusedAt).toBe('2026-06-15T08:00:00');
  });

  it('handles empty list', () => {
    const r = rollupRefusals([], { now: NOW });
    expect(r.perMedication).toHaveLength(0);
    expect(r.totalRecent).toBe(0);
    expect(r.deprescribingCandidates).toHaveLength(0);
  });
});

describe('computeAdherenceWithRefusals', () => {
  function n(o: Partial<NormalizedRefusal>): NormalizedRefusal {
    return {
      id: 'r-x',
      medicationId: 'm1',
      dueAt: '2026-06-15T08:00:00',
      loggedAt: '2026-06-15T08:00:00',
      reason: 'sleeping',
      excludedFromAdherence: false,
      tolerabilitySignal: false,
      ...o,
    };
  }

  it('strict == honest when no excluded refusals', () => {
    const r = computeAdherenceWithRefusals({
      scheduledCount: 30,
      takenCount: 24,
      refusals: [n({ reason: 'declined' }), n({ reason: 'sleeping' })],
    });
    expect(r.strictAdherence).toBeCloseTo(24 / 30, 5);
    expect(r.honestAdherence).toBeCloseTo(24 / 30, 5);
    expect(r.excludedCount).toBe(0);
  });

  it('honest is higher when excluded refusals shrink the denominator', () => {
    const r = computeAdherenceWithRefusals({
      scheduledCount: 30,
      takenCount: 24,
      refusals: [
        n({ reason: 'npo', excludedFromAdherence: true }),
        n({ reason: 'npo', excludedFromAdherence: true }),
        n({ reason: 'prescriber-paused', excludedFromAdherence: true }),
      ],
    });
    expect(r.strictAdherence).toBeCloseTo(24 / 30, 5);
    expect(r.honestAdherence).toBeCloseTo(24 / 27, 5);
    expect(r.excludedCount).toBe(3);
    expect(r.honestDenominator).toBe(27);
  });

  it('caps excluded at scheduledCount so denominator cannot go negative', () => {
    const r = computeAdherenceWithRefusals({
      scheduledCount: 2,
      takenCount: 1,
      refusals: [
        n({ excludedFromAdherence: true }),
        n({ excludedFromAdherence: true }),
        n({ excludedFromAdherence: true }), // beyond scheduled count
      ],
    });
    expect(r.excludedCount).toBe(2);
    expect(r.honestDenominator).toBe(0);
    expect(r.honestAdherence).toBe(1); // collapsed denom -> patient had no opportunity
  });

  it('returns honestAdherence = 1 when every dose was excluded', () => {
    const r = computeAdherenceWithRefusals({
      scheduledCount: 5,
      takenCount: 0,
      refusals: Array.from({ length: 5 }, () => n({ excludedFromAdherence: true })),
    });
    expect(r.honestAdherence).toBe(1);
    expect(r.strictAdherence).toBe(0);
  });

  it('handles scheduledCount=0 cleanly', () => {
    const r = computeAdherenceWithRefusals({
      scheduledCount: 0,
      takenCount: 0,
      refusals: [],
    });
    expect(r.strictAdherence).toBe(0);
    expect(r.honestAdherence).toBe(1); // honest denom collapse -> 1
  });

  it('caps strict + honest at 1.0 (over-reporting taken)', () => {
    const r = computeAdherenceWithRefusals({
      scheduledCount: 10,
      takenCount: 15,
      refusals: [],
    });
    expect(r.strictAdherence).toBe(1);
    expect(r.honestAdherence).toBe(1);
  });
});

describe('end-to-end', () => {
  it('validate -> rollup -> adherence computes a credible \"honest\" PDC', () => {
    const entries = [
      entry({ medicationId: 'warfarin', reason: 'npo', dueAt: '2026-06-10T08:00:00' }),
      entry({ medicationId: 'warfarin', reason: 'npo', dueAt: '2026-06-11T08:00:00' }),
      entry({ medicationId: 'warfarin', reason: 'nausea', dueAt: '2026-06-12T08:00:00' }),
      entry({ medicationId: 'warfarin', reason: 'declined', dueAt: '2026-06-13T08:00:00' }),
    ];
    const { ok } = validateRefusals(entries);
    expect(ok).toHaveLength(4);

    const rollup = rollupRefusals(ok, { now: new Date(2026, 5, 21) });
    expect(rollup.totalRecent).toBe(4);
    expect(rollup.totalRecentExcluded).toBe(2); // 2 NPO

    const adherence = computeAdherenceWithRefusals({
      scheduledCount: 30,
      takenCount: 24,
      refusals: ok,
    });
    expect(adherence.excludedCount).toBe(2);
    expect(adherence.strictAdherence).toBeCloseTo(0.8, 5);
    expect(adherence.honestAdherence).toBeCloseTo(24 / 28, 5);
  });
});
