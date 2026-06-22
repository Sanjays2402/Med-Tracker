import { describe, it, expect } from 'vitest';
import {
  batchRoundtripResultsForSlackThreadWithQuietHours,
  summarizeQuietHoursDecision,
  postingRecommendation,
} from '../src/dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours';
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

// A UTC instant that is 02:00 LOCAL PT (UTC-7 in June; PDT). Wall
// clock 02:00 PT lands inside 22:00-07:00 PT.
const PT_0200_RUN_AT = new Date('2026-06-22T09:00:00Z');
// A UTC instant that is 14:00 LOCAL PT (06:00 PDT? no: 14:00 PDT = 21:00 UTC).
const PT_1400_RUN_AT = new Date('2026-06-22T21:00:00Z');

describe('batchRoundtripResultsForSlackThreadWithQuietHours — quiet-hours detection', () => {
  it('posts immediately when the run lands outside quiet hours', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHours(
      [CLEAN_RUN],
      { runAt: PT_1400_RUN_AT },
    );
    expect(out.decision.kind).toBe('post-now');
    if (out.decision.kind === 'post-now') {
      expect(out.decision.reason).toBe('outside-quiet-hours');
    }
  });

  it('defers when the run lands inside default quiet hours (22:00-07:00 PT)', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHours(
      [CLEAN_RUN],
      { runAt: PT_0200_RUN_AT },
    );
    expect(out.decision.kind).toBe('defer-until');
    if (out.decision.kind === 'defer-until') {
      expect(out.decision.reason).toBe('within-quiet-hours');
      expect(out.decision.windowLabel).toContain('22:00-07:00');
      expect(out.decision.windowLabel).toContain('America/Los_Angeles');
    }
  });

  it('honours a custom quiet-hours window', () => {
    // 14:00 PT lands inside a 10:00-16:00 PT window.
    const out = batchRoundtripResultsForSlackThreadWithQuietHours(
      [CLEAN_RUN],
      {
        runAt: PT_1400_RUN_AT,
        quietHours: { startHour: 10, endHour: 16, timezone: 'America/Los_Angeles' },
      },
    );
    expect(out.decision.kind).toBe('defer-until');
  });

  it('honours a custom timezone', () => {
    // 02:00 UTC inside a 22:00-07:00 UTC window.
    const at = new Date('2026-06-22T02:00:00Z');
    const out = batchRoundtripResultsForSlackThreadWithQuietHours(
      [CLEAN_RUN],
      {
        runAt: at,
        quietHours: { startHour: 22, endHour: 7, timezone: 'UTC' },
      },
    );
    expect(out.decision.kind).toBe('defer-until');
  });

  it('skipQuietHoursCheck=true forces post-now regardless of wall clock', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHours(
      [CLEAN_RUN],
      { runAt: PT_0200_RUN_AT, skipQuietHoursCheck: true },
    );
    expect(out.decision.kind).toBe('post-now');
    if (out.decision.kind === 'post-now') {
      expect(out.decision.reason).toBe('skip-flag');
    }
  });
});

describe('batchRoundtripResultsForSlackThreadWithQuietHours — policy variants', () => {
  it("policy='suppress-completely' suppresses the parent during quiet hours", () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHours(
      [ACTIONABLE_RUN],
      { runAt: PT_0200_RUN_AT, policy: 'suppress-completely' },
    );
    expect(out.decision.kind).toBe('suppress-completely');
    if (out.decision.kind === 'suppress-completely') {
      expect(out.decision.reason).toBe('within-quiet-hours');
    }
  });

  it("policy='defer-unless-actionable' posts immediately when actionable, inside quiet hours", () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHours(
      [ACTIONABLE_RUN],
      { runAt: PT_0200_RUN_AT, policy: 'defer-unless-actionable' },
    );
    expect(out.decision.kind).toBe('post-now');
    if (out.decision.kind === 'post-now') {
      expect(out.decision.reason).toBe('actionable-override');
    }
  });

  it("policy='defer-unless-actionable' defers a clean run inside quiet hours", () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHours(
      [CLEAN_RUN],
      { runAt: PT_0200_RUN_AT, policy: 'defer-unless-actionable' },
    );
    expect(out.decision.kind).toBe('defer-until');
  });

  it('default policy is defer-parent (cleans + actionables both defer)', () => {
    const cleanOut = batchRoundtripResultsForSlackThreadWithQuietHours(
      [CLEAN_RUN],
      { runAt: PT_0200_RUN_AT },
    );
    expect(cleanOut.decision.kind).toBe('defer-until');
    const actOut = batchRoundtripResultsForSlackThreadWithQuietHours(
      [ACTIONABLE_RUN],
      { runAt: PT_0200_RUN_AT },
    );
    expect(actOut.decision.kind).toBe('defer-until');
  });
});

describe('batchRoundtripResultsForSlackThreadWithQuietHours — fallbackText tagging', () => {
  it('appends the deferral tag to the parent fallbackText when deferring', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHours(
      [CLEAN_RUN],
      { runAt: PT_0200_RUN_AT },
    );
    expect(out.bundle.parent.fallbackText).toContain('deferred from');
    expect(out.bundle.parent.fallbackText).toContain('22:00-07:00');
  });

  it('appends an actionable-override tag when the actionable override fires', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHours(
      [ACTIONABLE_RUN],
      { runAt: PT_0200_RUN_AT, policy: 'defer-unless-actionable' },
    );
    expect(out.bundle.parent.fallbackText).toContain('actionable override');
  });

  it('does NOT tag the fallback when post-now outside quiet hours', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHours(
      [CLEAN_RUN],
      { runAt: PT_1400_RUN_AT },
    );
    expect(out.bundle.parent.fallbackText).not.toContain('deferred');
    expect(out.bundle.parent.fallbackText).not.toContain('actionable override');
  });

  it('does NOT tag the fallback when suppressed', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHours(
      [ACTIONABLE_RUN],
      { runAt: PT_0200_RUN_AT, policy: 'suppress-completely' },
    );
    expect(out.bundle.parent.fallbackText).not.toContain('deferred');
    expect(out.bundle.parent.fallbackText).not.toContain('actionable override');
  });

  it('respects a custom deferralTagTemplate', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHours(
      [CLEAN_RUN],
      {
        runAt: PT_0200_RUN_AT,
        deferralTagTemplate: '[QH defer: {windowLabel}]',
      },
    );
    expect(out.bundle.parent.fallbackText).toContain('[QH defer: 22:00-07:00');
  });
});

describe('batchRoundtripResultsForSlackThreadWithQuietHours — deferUntil computation', () => {
  it('deferUntil lands AFTER runAt', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHours(
      [CLEAN_RUN],
      { runAt: PT_0200_RUN_AT },
    );
    if (out.decision.kind === 'defer-until') {
      expect(out.decision.deferUntil.getTime()).toBeGreaterThan(PT_0200_RUN_AT.getTime());
    }
  });

  it('deferUntil lands at a top-of-hour boundary in the window timezone', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHours(
      [CLEAN_RUN],
      { runAt: PT_0200_RUN_AT },
    );
    if (out.decision.kind === 'defer-until') {
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Los_Angeles',
        hour12: false,
        minute: '2-digit',
      });
      const m = fmt.formatToParts(out.decision.deferUntil).find((p) => p.type === 'minute');
      const minute = parseInt(m!.value.replace(/\D/g, ''), 10);
      expect(minute).toBe(0);
    }
  });

  it('a run AT exactly 07:00 PT is OUTSIDE quiet hours (exclusive end)', () => {
    // 07:00 PDT = 14:00 UTC
    const at0700 = new Date('2026-06-22T14:00:00Z');
    const out = batchRoundtripResultsForSlackThreadWithQuietHours(
      [CLEAN_RUN],
      { runAt: at0700 },
    );
    expect(out.decision.kind).toBe('post-now');
  });

  it('a run AT exactly 22:00 PT is INSIDE quiet hours (inclusive start)', () => {
    // 22:00 PDT = 05:00 next-day UTC
    const at2200 = new Date('2026-06-23T05:00:00Z');
    const out = batchRoundtripResultsForSlackThreadWithQuietHours(
      [CLEAN_RUN],
      { runAt: at2200 },
    );
    expect(out.decision.kind).toBe('defer-until');
  });

  it('supports a single-day quiet-hours window (start < end)', () => {
    // 13:00 PT, window 12:00-15:00 PT, should be inside.
    const at1300 = new Date('2026-06-22T20:00:00Z'); // 13:00 PDT = 20:00 UTC
    const out = batchRoundtripResultsForSlackThreadWithQuietHours(
      [CLEAN_RUN],
      {
        runAt: at1300,
        quietHours: { startHour: 12, endHour: 15, timezone: 'America/Los_Angeles' },
      },
    );
    expect(out.decision.kind).toBe('defer-until');
  });
});

describe('batchRoundtripResultsForSlackThreadWithQuietHours — bundle pass-through', () => {
  it('forwards the underlying thread-batcher bundle (parent + replies + coverage)', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHours(
      [CLEAN_RUN, ACTIONABLE_RUN],
      { runAt: PT_1400_RUN_AT },
    );
    expect(out.bundle.replies).toHaveLength(2);
    expect(out.bundle.coverage.runCount).toBe(2);
    expect(out.bundle.coverage.actionableRunCount).toBe(1);
  });

  it('forwards thread-batcher options like suppressCleanRuns', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHours(
      [CLEAN_RUN, ACTIONABLE_RUN],
      { runAt: PT_1400_RUN_AT, suppressCleanRuns: true },
    );
    expect(out.bundle.replies).toHaveLength(1);
    expect(out.bundle.coverage.suppressedRunCount).toBe(1);
  });

  it('builds a bundle even when the runs are empty', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHours(
      [],
      { runAt: PT_1400_RUN_AT },
    );
    expect(out.bundle.replies).toEqual([]);
    expect(out.bundle.coverage.runCount).toBe(0);
  });
});

describe('summarizeQuietHoursDecision', () => {
  it('post-now outside-quiet-hours phrasing', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHours(
      [CLEAN_RUN],
      { runAt: PT_1400_RUN_AT },
    );
    expect(summarizeQuietHoursDecision(out)).toContain('outside quiet hours');
  });

  it('post-now actionable-override phrasing', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHours(
      [ACTIONABLE_RUN],
      { runAt: PT_0200_RUN_AT, policy: 'defer-unless-actionable' },
    );
    expect(summarizeQuietHoursDecision(out)).toContain('actionable override');
  });

  it('post-now skip-flag phrasing', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHours(
      [CLEAN_RUN],
      { runAt: PT_0200_RUN_AT, skipQuietHoursCheck: true },
    );
    expect(summarizeQuietHoursDecision(out)).toContain('skipped');
  });

  it('defer-until phrasing includes ISO timestamp and window label', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHours(
      [CLEAN_RUN],
      { runAt: PT_0200_RUN_AT },
    );
    const line = summarizeQuietHoursDecision(out);
    expect(line).toContain('deferred until');
    expect(line).toContain('22:00-07:00');
    expect(line).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });

  it('suppress phrasing', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHours(
      [ACTIONABLE_RUN],
      { runAt: PT_0200_RUN_AT, policy: 'suppress-completely' },
    );
    expect(summarizeQuietHoursDecision(out)).toContain('suppressed');
  });
});

describe('postingRecommendation', () => {
  it('post-now -> shouldPostNow=true with a postAt instant', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHours(
      [CLEAN_RUN],
      { runAt: PT_1400_RUN_AT },
    );
    const r = postingRecommendation(out);
    expect(r.shouldPostNow).toBe(true);
    expect(r.postAt).toBeInstanceOf(Date);
  });

  it('defer-until -> shouldPostNow=false with postAt = deferUntil', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHours(
      [CLEAN_RUN],
      { runAt: PT_0200_RUN_AT },
    );
    const r = postingRecommendation(out);
    expect(r.shouldPostNow).toBe(false);
    if (out.decision.kind === 'defer-until') {
      expect(r.postAt?.getTime()).toBe(out.decision.deferUntil.getTime());
    }
  });

  it('suppress-completely -> shouldPostNow=false with postAt=null', () => {
    const out = batchRoundtripResultsForSlackThreadWithQuietHours(
      [ACTIONABLE_RUN],
      { runAt: PT_0200_RUN_AT, policy: 'suppress-completely' },
    );
    const r = postingRecommendation(out);
    expect(r.shouldPostNow).toBe(false);
    expect(r.postAt).toBeNull();
  });
});

describe('determinism', () => {
  it('produces a deterministic decision for stable inputs', () => {
    const a = batchRoundtripResultsForSlackThreadWithQuietHours(
      [CLEAN_RUN],
      { runAt: PT_0200_RUN_AT },
    );
    const b = batchRoundtripResultsForSlackThreadWithQuietHours(
      [CLEAN_RUN],
      { runAt: PT_0200_RUN_AT },
    );
    expect(a.decision).toEqual(b.decision);
    expect(a.bundle.parent.fallbackText).toBe(b.bundle.parent.fallbackText);
  });
});
