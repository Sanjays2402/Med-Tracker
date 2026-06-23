import { describe, it, expect } from 'vitest';
import {
  batchRoundtripResultsForSlackThreadWithQuietHoursAndSnooze,
  summarizeSnoozeDecision,
  isSnoozeActive,
  snoozeAwarePostingRecommendation,
} from '../src/dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-snooze';
import type { DoseRoundtripThreadBatcherRun } from '../src/dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher';
import type {
  DoseRoundtripValidateResult,
  DoseRoundtripDiff,
} from '../src/dose-export-csv-import-roundtrip-validator';

function makeDiff(id: string, risk: DoseRoundtripDiff['risk']): DoseRoundtripDiff {
  if (risk === 'note-only') {
    return { doseId: id, changes: [{ field: 'note', before: null, after: 'edited' }], risk };
  }
  if (risk === 'status-edit') {
    return { doseId: id, changes: [{ field: 'status', before: 'pending', after: 'taken' }], risk };
  }
  return {
    doseId: id,
    changes: [{ field: 'scheduleId', before: 'sched-1', after: 'sched-2' }],
    risk,
  };
}

function makeResult(overrides: Partial<DoseRoundtripValidateResult> = {}): DoseRoundtripValidateResult {
  return {
    parsedDoses: [],
    parseSkipped: [],
    diffs: [],
    addedIds: [],
    removedIds: [],
    unchangedCount: 0,
    ...overrides,
  };
}

function makeRun(
  runId: string,
  runLabel: string,
  result: DoseRoundtripValidateResult,
): DoseRoundtripThreadBatcherRun {
  return { runId, runLabel, result };
}

const CLEAN_RUN = makeRun('r-clean', 'clean', makeResult({ unchangedCount: 100 }));
const ACTIONABLE_RUN = makeRun(
  'r-act',
  'actionable',
  makeResult({ unchangedCount: 100, diffs: [makeDiff('d1', 'structural')] }),
);

// UTC instant that lands at 02:00 local PT (inside default quiet hours).
const PT_0200_RUN_AT = new Date('2026-06-22T09:00:00Z');
// UTC instant that lands at 14:00 local PT (outside default quiet hours).
const PT_1400_RUN_AT = new Date('2026-06-22T21:00:00Z');

describe('snooze — no snooze configured', () => {
  it('returns the quiet-hours decision unchanged when no snooze is set', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHoursAndSnooze(
      [CLEAN_RUN],
      { runAt: PT_0200_RUN_AT },
    );
    expect(out.decision.kind).toBe('defer-until');
    expect(out.snoozeUntilApplied).toBeNull();
    expect(out.snoozeOverrideApplied).toBe(false);
  });

  it('returns post-now unchanged when no snooze and outside quiet hours', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHoursAndSnooze(
      [CLEAN_RUN],
      { runAt: PT_1400_RUN_AT },
    );
    expect(out.decision.kind).toBe('post-now');
    if (out.decision.kind === 'post-now') {
      expect(out.decision.reason).toBe('outside-quiet-hours');
    }
    expect(out.snoozeUntilApplied).toBeNull();
    expect(out.snoozeOverrideApplied).toBe(false);
  });
});

describe('snooze — snoozeUntil override', () => {
  it('overrides defer-until to post-now during snooze window', () => {
    const snoozeUntil = new Date(PT_0200_RUN_AT.getTime() + 24 * 60 * 60 * 1000);
    const out = batchRoundtripResultsForSlackThreadWithQuietHoursAndSnooze(
      [ACTIONABLE_RUN],
      { runAt: PT_0200_RUN_AT, snoozeUntil },
    );
    expect(out.decision.kind).toBe('post-now');
    if (out.decision.kind === 'post-now') {
      expect(out.decision.reason).toBe('snooze-override');
      if (out.decision.reason === 'snooze-override') {
        expect(out.decision.snoozeUntil.toISOString()).toBe(snoozeUntil.toISOString());
        expect(out.decision.windowLabel).toContain('22:00-07:00');
      }
    }
    expect(out.snoozeOverrideApplied).toBe(true);
    expect(out.snoozeUntilApplied?.toISOString()).toBe(snoozeUntil.toISOString());
  });

  it('does not override when runAt is past snoozeUntil', () => {
    const snoozeUntil = new Date(PT_0200_RUN_AT.getTime() - 60 * 1000);
    const out = batchRoundtripResultsForSlackThreadWithQuietHoursAndSnooze(
      [CLEAN_RUN],
      { runAt: PT_0200_RUN_AT, snoozeUntil },
    );
    expect(out.decision.kind).toBe('defer-until');
    expect(out.snoozeOverrideApplied).toBe(false);
    expect(out.snoozeUntilApplied?.toISOString()).toBe(snoozeUntil.toISOString());
  });

  it('does not override post-now decisions even during snooze', () => {
    const snoozeUntil = new Date(PT_1400_RUN_AT.getTime() + 24 * 60 * 60 * 1000);
    const out = batchRoundtripResultsForSlackThreadWithQuietHoursAndSnooze(
      [CLEAN_RUN],
      { runAt: PT_1400_RUN_AT, snoozeUntil },
    );
    expect(out.decision.kind).toBe('post-now');
    if (out.decision.kind === 'post-now') {
      expect(out.decision.reason).toBe('outside-quiet-hours');
    }
    expect(out.snoozeOverrideApplied).toBe(false);
    expect(out.snoozeUntilApplied?.toISOString()).toBe(snoozeUntil.toISOString());
  });

  it('overrides suppress-completely to post-now during snooze', () => {
    const snoozeUntil = new Date(PT_0200_RUN_AT.getTime() + 6 * 60 * 60 * 1000);
    const out = batchRoundtripResultsForSlackThreadWithQuietHoursAndSnooze(
      [ACTIONABLE_RUN],
      {
        runAt: PT_0200_RUN_AT,
        policy: 'suppress-completely',
        snoozeUntil,
      },
    );
    expect(out.decision.kind).toBe('post-now');
    if (out.decision.kind === 'post-now') {
      expect(out.decision.reason).toBe('snooze-override');
    }
    expect(out.snoozeOverrideApplied).toBe(true);
  });
});

describe('snooze — snoozeForMs convenience', () => {
  it('derives snoozeUntil from runAt + snoozeForMs', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHoursAndSnooze(
      [ACTIONABLE_RUN],
      { runAt: PT_0200_RUN_AT, snoozeForMs: 60 * 60 * 1000 },
    );
    expect(out.decision.kind).toBe('post-now');
    expect(out.snoozeUntilApplied?.toISOString()).toBe(
      new Date(PT_0200_RUN_AT.getTime() + 60 * 60 * 1000).toISOString(),
    );
    expect(out.snoozeOverrideApplied).toBe(true);
  });

  it('prefers snoozeUntil when both are provided', () => {
    const snoozeUntil = new Date(PT_0200_RUN_AT.getTime() + 2 * 60 * 60 * 1000);
    const out = batchRoundtripResultsForSlackThreadWithQuietHoursAndSnooze(
      [ACTIONABLE_RUN],
      {
        runAt: PT_0200_RUN_AT,
        snoozeUntil,
        snoozeForMs: 10 * 60 * 1000, // would have been 10 min, ignored
      },
    );
    expect(out.snoozeUntilApplied?.toISOString()).toBe(snoozeUntil.toISOString());
  });

  it('throws on non-finite snoozeForMs', () => {
    expect(() =>
      batchRoundtripResultsForSlackThreadWithQuietHoursAndSnooze([CLEAN_RUN], {
        runAt: PT_0200_RUN_AT,
        snoozeForMs: Number.POSITIVE_INFINITY,
      }),
    ).toThrow('snoozeForMs');
    expect(() =>
      batchRoundtripResultsForSlackThreadWithQuietHoursAndSnooze([CLEAN_RUN], {
        runAt: PT_0200_RUN_AT,
        snoozeForMs: Number.NaN,
      }),
    ).toThrow('snoozeForMs');
  });
});

describe('snooze — fallback tag', () => {
  it('tags the parent fallback with snooze-override information', () => {
    const snoozeUntil = new Date(PT_0200_RUN_AT.getTime() + 6 * 60 * 60 * 1000);
    const out = batchRoundtripResultsForSlackThreadWithQuietHoursAndSnooze(
      [ACTIONABLE_RUN],
      { runAt: PT_0200_RUN_AT, snoozeUntil },
    );
    expect(out.bundle.parent.fallbackText).toContain('snooze override');
    expect(out.bundle.parent.fallbackText).toContain('22:00-07:00');
    expect(out.bundle.parent.fallbackText).toContain(snoozeUntil.toISOString());
  });

  it('respects a custom snooze override tag template', () => {
    const snoozeUntil = new Date(PT_0200_RUN_AT.getTime() + 6 * 60 * 60 * 1000);
    const out = batchRoundtripResultsForSlackThreadWithQuietHoursAndSnooze(
      [ACTIONABLE_RUN],
      {
        runAt: PT_0200_RUN_AT,
        snoozeUntil,
        snoozeOverrideTagTemplate: '[SNOOZE until {snoozeUntil}]',
      },
    );
    expect(out.bundle.parent.fallbackText).toContain('[SNOOZE until');
    expect(out.bundle.parent.fallbackText).toContain(snoozeUntil.toISOString());
  });

  it('does NOT tag the fallback when override does not fire', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHoursAndSnooze(
      [CLEAN_RUN],
      { runAt: PT_0200_RUN_AT }, // no snooze
    );
    expect(out.bundle.parent.fallbackText).not.toContain('snooze override');
  });
});

describe('summarizeSnoozeDecision', () => {
  it('reports applied snooze with the snoozeUntil instant', () => {
    const snoozeUntil = new Date(PT_0200_RUN_AT.getTime() + 6 * 60 * 60 * 1000);
    const out = batchRoundtripResultsForSlackThreadWithQuietHoursAndSnooze(
      [ACTIONABLE_RUN],
      { runAt: PT_0200_RUN_AT, snoozeUntil },
    );
    const s = summarizeSnoozeDecision(out);
    expect(s).toContain('override applied');
    expect(s).toContain(snoozeUntil.toISOString());
  });

  it('reports no override when no snooze is configured', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHoursAndSnooze(
      [CLEAN_RUN],
      { runAt: PT_0200_RUN_AT },
    );
    expect(summarizeSnoozeDecision(out)).toContain('no snooze configured');
  });

  it('reports no override when snooze has expired', () => {
    const snoozeUntil = new Date(PT_0200_RUN_AT.getTime() - 60 * 1000);
    const out = batchRoundtripResultsForSlackThreadWithQuietHoursAndSnooze(
      [CLEAN_RUN],
      { runAt: PT_0200_RUN_AT, snoozeUntil },
    );
    expect(summarizeSnoozeDecision(out)).toContain('snooze expired');
  });

  it('reports no override when decision was already post-now', () => {
    const snoozeUntil = new Date(PT_1400_RUN_AT.getTime() + 6 * 60 * 60 * 1000);
    const out = batchRoundtripResultsForSlackThreadWithQuietHoursAndSnooze(
      [CLEAN_RUN],
      { runAt: PT_1400_RUN_AT, snoozeUntil },
    );
    expect(summarizeSnoozeDecision(out)).toContain('decision already post-now');
  });
});

describe('isSnoozeActive', () => {
  it('returns true when snooze is configured and not expired', () => {
    const snoozeUntil = new Date(PT_0200_RUN_AT.getTime() + 60 * 60 * 1000);
    const out = batchRoundtripResultsForSlackThreadWithQuietHoursAndSnooze(
      [CLEAN_RUN],
      { runAt: PT_0200_RUN_AT, snoozeUntil },
    );
    expect(isSnoozeActive(out, PT_0200_RUN_AT)).toBe(true);
  });

  it('returns false when snooze is expired', () => {
    const snoozeUntil = new Date(PT_0200_RUN_AT.getTime() - 60 * 1000);
    const out = batchRoundtripResultsForSlackThreadWithQuietHoursAndSnooze(
      [CLEAN_RUN],
      { runAt: PT_0200_RUN_AT, snoozeUntil },
    );
    expect(isSnoozeActive(out, PT_0200_RUN_AT)).toBe(false);
  });

  it('returns false when no snooze is configured', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHoursAndSnooze(
      [CLEAN_RUN],
      { runAt: PT_0200_RUN_AT },
    );
    expect(isSnoozeActive(out, PT_0200_RUN_AT)).toBe(false);
  });
});

describe('snoozeAwarePostingRecommendation', () => {
  it('returns shouldPostNow:true for post-now decisions including snooze-override', () => {
    const snoozeUntil = new Date(PT_0200_RUN_AT.getTime() + 6 * 60 * 60 * 1000);
    const out = batchRoundtripResultsForSlackThreadWithQuietHoursAndSnooze(
      [ACTIONABLE_RUN],
      { runAt: PT_0200_RUN_AT, snoozeUntil },
    );
    const rec = snoozeAwarePostingRecommendation(out);
    expect(rec.shouldPostNow).toBe(true);
    expect(rec.postAt).toBeInstanceOf(Date);
  });

  it('returns the defer-until instant when the decision is to defer', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHoursAndSnooze(
      [CLEAN_RUN],
      { runAt: PT_0200_RUN_AT },
    );
    const rec = snoozeAwarePostingRecommendation(out);
    expect(rec.shouldPostNow).toBe(false);
    expect(rec.postAt).toBeInstanceOf(Date);
  });

  it('returns null postAt for suppress-completely', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHoursAndSnooze(
      [CLEAN_RUN],
      { runAt: PT_0200_RUN_AT, policy: 'suppress-completely' },
    );
    const rec = snoozeAwarePostingRecommendation(out);
    expect(rec.shouldPostNow).toBe(false);
    expect(rec.postAt).toBeNull();
  });
});

describe('snooze — determinism', () => {
  it('is deterministic for identical inputs', () => {
    const snoozeUntil = new Date(PT_0200_RUN_AT.getTime() + 6 * 60 * 60 * 1000);
    const opts = { runAt: PT_0200_RUN_AT, snoozeUntil };
    const a = batchRoundtripResultsForSlackThreadWithQuietHoursAndSnooze(
      [ACTIONABLE_RUN],
      opts,
    );
    const b = batchRoundtripResultsForSlackThreadWithQuietHoursAndSnooze(
      [ACTIONABLE_RUN],
      opts,
    );
    expect(a.decision.kind).toBe(b.decision.kind);
    expect(a.snoozeOverrideApplied).toBe(b.snoozeOverrideApplied);
    expect(a.bundle.parent.fallbackText).toBe(b.bundle.parent.fallbackText);
  });
});
