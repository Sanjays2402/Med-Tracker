import { describe, it, expect } from 'vitest';
import {
  suggestRefusalReason,
  suggestRefusalReasonsBatch,
  type RefusalReasonSuggestInput,
} from '../src/refusal-reason-suggest';
import type { NormalizedRefusal } from '../src/medication-refusal-log';
import type { Dose } from '@med/types';

const MED_ID = 'med-1';
const NOW = new Date(2026, 5, 21, 12, 0); // 2026-06-21 12:00 local

function dose(o: Partial<Dose> & { dueAt: string }): Dose {
  return {
    id: o.id ?? 'd-1',
    medicationId: o.medicationId ?? MED_ID,
    scheduleId: o.scheduleId ?? 's-1',
    dueAt: o.dueAt,
    takenAt: o.takenAt ?? null,
    status: o.status ?? 'missed',
  } as Dose;
}

function baseInput(o: Partial<RefusalReasonSuggestInput> = {}): RefusalReasonSuggestInput {
  return {
    dose: o.dose ?? dose({ dueAt: '2026-06-21T08:00:00.000' }),
    medication: o.medication ?? { id: MED_ID, supplyRemaining: 30 },
    now: o.now ?? NOW,
    ...(o.sleeping !== undefined ? { sleeping: o.sleeping } : {}),
    ...(o.npoWindows !== undefined ? { npoWindows: o.npoWindows } : {}),
    ...(o.prescriberPauses !== undefined ? { prescriberPauses: o.prescriberPauses } : {}),
    ...(o.recentRefusals !== undefined ? { recentRefusals: o.recentRefusals } : {}),
    ...(o.patternWindowDays !== undefined ? { patternWindowDays: o.patternWindowDays } : {}),
    ...(o.patternMinCount !== undefined ? { patternMinCount: o.patternMinCount } : {}),
  };
}

function refusal(o: Partial<NormalizedRefusal> & { reason: NormalizedRefusal['reason']; daysAgo?: number }): NormalizedRefusal {
  const ms = NOW.getTime() - (o.daysAgo ?? 0) * 86_400_000;
  const iso = new Date(ms).toISOString();
  const tol = o.reason === 'nausea' || o.reason === 'side-effect';
  return {
    id: o.id ?? `r-${Math.random()}`,
    medicationId: o.medicationId ?? MED_ID,
    dueAt: o.dueAt ?? iso,
    loggedAt: o.loggedAt ?? iso,
    reason: o.reason,
    excludedFromAdherence: o.excludedFromAdherence ?? false,
    tolerabilitySignal: o.tolerabilitySignal ?? tol,
  };
}

describe('suggestRefusalReason — NPO rule', () => {
  it('suggests npo when the scheduled date is inside an NPO window', () => {
    const r = suggestRefusalReason(
      baseInput({
        npoWindows: [{ startDate: '2026-06-20', endDate: '2026-06-22', reason: 'colonoscopy' }],
      }),
    );
    expect(r.suggested?.reason).toBe('npo');
    expect(r.suggested?.source).toBe('npo-window');
    expect(r.suggested?.confidence).toBeGreaterThan(0.9);
    expect(r.suggested?.explanation).toContain('colonoscopy');
  });

  it('does not suggest npo when the scheduled date is outside any window', () => {
    const r = suggestRefusalReason(
      baseInput({
        npoWindows: [{ startDate: '2026-06-22', endDate: '2026-06-23' }],
      }),
    );
    expect(r.suggested?.reason).not.toBe('npo');
  });

  it('treats single-day windows correctly (startDate=endDate)', () => {
    const r = suggestRefusalReason(
      baseInput({
        npoWindows: [{ startDate: '2026-06-21', endDate: '2026-06-21' }],
      }),
    );
    expect(r.suggested?.reason).toBe('npo');
  });

  it('handles multiple windows: any one matching is enough', () => {
    const r = suggestRefusalReason(
      baseInput({
        npoWindows: [
          { startDate: '2026-05-01', endDate: '2026-05-03' },
          { startDate: '2026-06-21', endDate: '2026-06-21' },
        ],
      }),
    );
    expect(r.suggested?.reason).toBe('npo');
  });
});

describe('suggestRefusalReason — prescriber pause rule', () => {
  it('suggests prescriber-paused when the medication has an active pause', () => {
    const r = suggestRefusalReason(
      baseInput({
        prescriberPauses: [
          { medicationId: MED_ID, startDate: '2026-06-20', endDate: '2026-06-25', reason: 'hold for INR check' },
        ],
      }),
    );
    expect(r.suggested?.reason).toBe('prescriber-paused');
    expect(r.suggested?.explanation).toContain('hold for INR check');
  });

  it('ignores pauses on other medications', () => {
    const r = suggestRefusalReason(
      baseInput({
        prescriberPauses: [
          { medicationId: 'other-med', startDate: '2026-06-20', endDate: '2026-06-25' },
        ],
      }),
    );
    expect(r.suggested?.reason).not.toBe('prescriber-paused');
  });

  it('ignores pauses outside the dose date range', () => {
    const r = suggestRefusalReason(
      baseInput({
        prescriberPauses: [
          { medicationId: MED_ID, startDate: '2026-07-01', endDate: '2026-07-05' },
        ],
      }),
    );
    expect(r.suggested?.reason).not.toBe('prescriber-paused');
  });
});

describe('suggestRefusalReason — out-of-supply rule', () => {
  it('suggests out-of-supply when supplyRemaining is 0', () => {
    const r = suggestRefusalReason(
      baseInput({ medication: { id: MED_ID, supplyRemaining: 0 } }),
    );
    expect(r.suggested?.reason).toBe('out-of-supply');
  });

  it('suggests out-of-supply when supplyRemaining is negative (data drift)', () => {
    const r = suggestRefusalReason(
      baseInput({ medication: { id: MED_ID, supplyRemaining: -3 } }),
    );
    expect(r.suggested?.reason).toBe('out-of-supply');
  });

  it('does not suggest out-of-supply when supply is non-zero', () => {
    const r = suggestRefusalReason(
      baseInput({ medication: { id: MED_ID, supplyRemaining: 7 } }),
    );
    expect(r.suggested?.reason).not.toBe('out-of-supply');
  });
});

describe('suggestRefusalReason — sleeping rule', () => {
  it('suggests sleeping when the dose time-of-day is inside the sleep window', () => {
    const r = suggestRefusalReason(
      baseInput({
        dose: dose({ dueAt: '2026-06-21T03:00:00.000' }), // 03:00 local
        sleeping: { start: '22:00', end: '07:00' },
      }),
    );
    expect(r.suggested?.reason).toBe('sleeping');
    expect(r.suggested?.source).toBe('sleeping-window');
  });

  it('handles overnight (wrap) sleep windows', () => {
    const r = suggestRefusalReason(
      baseInput({
        dose: dose({ dueAt: '2026-06-21T23:30:00.000' }),
        sleeping: { start: '22:00', end: '07:00' },
      }),
    );
    expect(r.suggested?.reason).toBe('sleeping');
  });

  it('does not suggest sleeping when the dose is outside the sleep window', () => {
    const r = suggestRefusalReason(
      baseInput({
        dose: dose({ dueAt: '2026-06-21T12:00:00.000' }),
        sleeping: { start: '22:00', end: '07:00' },
      }),
    );
    expect(r.suggested?.reason).not.toBe('sleeping');
  });

  it('suppresses the sleeping suggestion for overnight medications', () => {
    const r = suggestRefusalReason(
      baseInput({
        dose: dose({ dueAt: '2026-06-21T03:00:00.000' }),
        sleeping: { start: '22:00', end: '07:00' },
        medication: { id: MED_ID, supplyRemaining: 30, isOvernightMed: true },
      }),
    );
    expect(r.suggested?.reason).not.toBe('sleeping');
  });
});

describe('suggestRefusalReason — recent pattern rule', () => {
  it('suggests the most-frequent recent refusal reason for this med', () => {
    const r = suggestRefusalReason(
      baseInput({
        recentRefusals: [
          refusal({ reason: 'nausea', daysAgo: 2 }),
          refusal({ reason: 'nausea', daysAgo: 5 }),
          refusal({ reason: 'nausea', daysAgo: 10 }),
          refusal({ reason: 'declined', daysAgo: 4 }),
        ],
      }),
    );
    expect(r.suggested?.reason).toBe('nausea');
    expect(r.suggested?.source).toBe('recent-pattern');
  });

  it('does not fire when the pattern has < patternMinCount occurrences', () => {
    const r = suggestRefusalReason(
      baseInput({
        recentRefusals: [
          refusal({ reason: 'nausea', daysAgo: 2 }),
        ],
      }),
    );
    expect(r.suggested).toBeNull();
  });

  it('ignores refusals outside the pattern window', () => {
    const r = suggestRefusalReason(
      baseInput({
        patternWindowDays: 14,
        recentRefusals: [
          refusal({ reason: 'nausea', daysAgo: 20 }),
          refusal({ reason: 'nausea', daysAgo: 30 }),
        ],
      }),
    );
    expect(r.suggested).toBeNull();
  });

  it('ignores refusals on other medications', () => {
    const r = suggestRefusalReason(
      baseInput({
        recentRefusals: [
          refusal({ reason: 'nausea', daysAgo: 1, medicationId: 'other-med' }),
          refusal({ reason: 'nausea', daysAgo: 2, medicationId: 'other-med' }),
        ],
      }),
    );
    expect(r.suggested).toBeNull();
  });

  it('prefers tolerability tie-break (nausea over side-effect over declined)', () => {
    const r = suggestRefusalReason(
      baseInput({
        recentRefusals: [
          refusal({ reason: 'declined', daysAgo: 1 }),
          refusal({ reason: 'declined', daysAgo: 2 }),
          refusal({ reason: 'nausea', daysAgo: 3 }),
          refusal({ reason: 'nausea', daysAgo: 4 }),
        ],
      }),
    );
    // Both have count 2 — nausea wins the tie-break.
    expect(r.suggested?.reason).toBe('nausea');
  });

  it('confidence scales with the same-reason count up to a cap', () => {
    const small = suggestRefusalReason(
      baseInput({
        recentRefusals: [
          refusal({ reason: 'side-effect', daysAgo: 1 }),
          refusal({ reason: 'side-effect', daysAgo: 2 }),
        ],
      }),
    );
    const big = suggestRefusalReason(
      baseInput({
        recentRefusals: Array.from({ length: 10 }, (_, i) =>
          refusal({ reason: 'side-effect', daysAgo: i }),
        ),
      }),
    );
    expect((big.suggested?.confidence ?? 0)).toBeGreaterThan((small.suggested?.confidence ?? 0));
    expect((big.suggested?.confidence ?? 1)).toBeLessThanOrEqual(0.65);
  });
});

describe('suggestRefusalReason — rule priority', () => {
  it('npo wins over prescriber pause when both fire on the same date', () => {
    const r = suggestRefusalReason(
      baseInput({
        npoWindows: [{ startDate: '2026-06-21', endDate: '2026-06-21' }],
        prescriberPauses: [
          { medicationId: MED_ID, startDate: '2026-06-21', endDate: '2026-06-21' },
        ],
      }),
    );
    expect(r.suggested?.reason).toBe('npo');
    expect(r.alternatives.map((a) => a.source)).toEqual(['npo-window', 'prescriber-pause']);
  });

  it('prescriber pause wins over out-of-supply', () => {
    const r = suggestRefusalReason(
      baseInput({
        prescriberPauses: [
          { medicationId: MED_ID, startDate: '2026-06-21', endDate: '2026-06-21' },
        ],
        medication: { id: MED_ID, supplyRemaining: 0 },
      }),
    );
    expect(r.suggested?.reason).toBe('prescriber-paused');
  });

  it('out-of-supply wins over sleeping', () => {
    const r = suggestRefusalReason(
      baseInput({
        dose: dose({ dueAt: '2026-06-21T03:00:00.000' }),
        sleeping: { start: '22:00', end: '07:00' },
        medication: { id: MED_ID, supplyRemaining: 0 },
      }),
    );
    expect(r.suggested?.reason).toBe('out-of-supply');
  });

  it('sleeping wins over pattern', () => {
    const r = suggestRefusalReason(
      baseInput({
        dose: dose({ dueAt: '2026-06-21T03:00:00.000' }),
        sleeping: { start: '22:00', end: '07:00' },
        recentRefusals: [
          refusal({ reason: 'nausea', daysAgo: 1 }),
          refusal({ reason: 'nausea', daysAgo: 2 }),
          refusal({ reason: 'nausea', daysAgo: 3 }),
        ],
      }),
    );
    expect(r.suggested?.reason).toBe('sleeping');
  });

  it('returns all firing rules in alternatives ordered by priority', () => {
    const r = suggestRefusalReason(
      baseInput({
        npoWindows: [{ startDate: '2026-06-21', endDate: '2026-06-21' }],
        prescriberPauses: [
          { medicationId: MED_ID, startDate: '2026-06-21', endDate: '2026-06-21' },
        ],
        medication: { id: MED_ID, supplyRemaining: 0 },
        sleeping: { start: '07:00', end: '09:00' },
        dose: dose({ dueAt: '2026-06-21T08:00:00.000' }),
        recentRefusals: [
          refusal({ reason: 'nausea', daysAgo: 1 }),
          refusal({ reason: 'nausea', daysAgo: 2 }),
        ],
      }),
    );
    expect(r.alternatives.map((a) => a.source)).toEqual([
      'npo-window',
      'prescriber-pause',
      'out-of-supply',
      'sleeping-window',
      'recent-pattern',
    ]);
  });
});

describe('suggestRefusalReason — edge cases', () => {
  it('returns null suggestion when no rule fires', () => {
    const r = suggestRefusalReason(baseInput());
    expect(r.suggested).toBeNull();
    expect(r.alternatives).toEqual([]);
  });

  it('handles an unparseable dueAt by returning null', () => {
    const r = suggestRefusalReason(baseInput({ dose: dose({ dueAt: 'not-a-date' }) }));
    expect(r.suggested).toBeNull();
  });

  it('treats undefined arrays as empty and does not throw', () => {
    const r = suggestRefusalReason({
      dose: dose({ dueAt: '2026-06-21T08:00:00.000' }),
      medication: { id: MED_ID, supplyRemaining: 30 },
    });
    expect(r.suggested).toBeNull();
  });
});

describe('suggestRefusalReasonsBatch', () => {
  it('returns a map of dose id -> suggestion', () => {
    const doses = [
      dose({ id: 'd-1', dueAt: '2026-06-21T08:00:00.000' }),
      dose({ id: 'd-2', dueAt: '2026-06-22T08:00:00.000' }),
    ];
    const map = suggestRefusalReasonsBatch(doses, {
      medication: { id: MED_ID, supplyRemaining: 0 },
      now: NOW,
    });
    expect(map.size).toBe(2);
    expect(map.get('d-1')?.reason).toBe('out-of-supply');
    expect(map.get('d-2')?.reason).toBe('out-of-supply');
  });

  it('omits doses with no suggestion from the map', () => {
    const doses = [
      dose({ id: 'd-1', dueAt: '2026-06-21T08:00:00.000' }),
      dose({ id: 'd-2', dueAt: '2026-06-22T08:00:00.000' }),
    ];
    const map = suggestRefusalReasonsBatch(doses, {
      medication: { id: MED_ID, supplyRemaining: 30 },
      now: NOW,
    });
    expect(map.size).toBe(0);
  });
});
