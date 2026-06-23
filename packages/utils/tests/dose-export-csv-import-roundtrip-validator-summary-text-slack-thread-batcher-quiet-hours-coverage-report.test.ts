import { describe, it, expect } from 'vitest';
import {
  buildQuietHoursCoverageReport,
  buildQuietHoursCoverageReportFromResults,
  summarizeQuietHoursCoverageReport,
  detectQuietHoursMisconfiguration,
  type DoseRoundtripQuietHoursCoverageReportRun,
} from '../src/dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-coverage-report';
import type {
  DoseRoundtripThreadBatcherQuietHoursDecision,
  DoseRoundtripThreadBatcherQuietHoursResult,
} from '../src/dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours';

function makePostedNow(
  runAt: Date,
  reason: 'outside-quiet-hours' | 'actionable-override' | 'skip-flag' = 'outside-quiet-hours',
): DoseRoundtripQuietHoursCoverageReportRun {
  return {
    runAt,
    decision: { kind: 'post-now', reason } as DoseRoundtripThreadBatcherQuietHoursDecision,
  };
}

function makeDeferred(
  runAt: Date,
  deferUntil: Date,
  windowLabel = '22:00-07:00 America/Los_Angeles',
): DoseRoundtripQuietHoursCoverageReportRun {
  return {
    runAt,
    decision: {
      kind: 'defer-until',
      reason: 'within-quiet-hours',
      deferUntil,
      windowLabel,
    },
  };
}

function makeSuppressed(
  runAt: Date,
  windowLabel = '22:00-07:00 America/Los_Angeles',
): DoseRoundtripQuietHoursCoverageReportRun {
  return {
    runAt,
    decision: {
      kind: 'suppress-completely',
      reason: 'within-quiet-hours',
      windowLabel,
    },
  };
}

describe('buildQuietHoursCoverageReport — empty input', () => {
  it('returns isEmpty=true and zeros across the board', () => {
    const r = buildQuietHoursCoverageReport([]);
    expect(r.isEmpty).toBe(true);
    expect(r.totalRuns).toBe(0);
    expect(r.postedNowCount).toBe(0);
    expect(r.deferredCount).toBe(0);
    expect(r.suppressedCount).toBe(0);
    expect(r.deferralLatenciesMs).toBeNull();
    expect(r.uniqueWindowLabels).toEqual([]);
    expect(r.channelIsAlwaysDeferring).toBe(false);
    expect(r.channelIsAlwaysSuppressing).toBe(false);
    expect(r.channelIsAlwaysPostingNow).toBe(false);
  });
});

describe('buildQuietHoursCoverageReport — counting', () => {
  const t = new Date('2026-06-22T12:00:00Z');
  const t2 = new Date('2026-06-22T13:00:00Z');

  it('counts posted, deferred, suppressed correctly', () => {
    const r = buildQuietHoursCoverageReport([
      makePostedNow(t),
      makePostedNow(t),
      makeDeferred(t, t2),
      makeSuppressed(t),
    ]);
    expect(r.totalRuns).toBe(4);
    expect(r.postedNowCount).toBe(2);
    expect(r.deferredCount).toBe(1);
    expect(r.suppressedCount).toBe(1);
    expect(r.isEmpty).toBe(false);
  });

  it('breaks down posted-now reasons', () => {
    const r = buildQuietHoursCoverageReport([
      makePostedNow(t, 'outside-quiet-hours'),
      makePostedNow(t, 'outside-quiet-hours'),
      makePostedNow(t, 'actionable-override'),
      makePostedNow(t, 'skip-flag'),
    ]);
    expect(r.postedNowOutsideQuietHoursCount).toBe(2);
    expect(r.postedNowActionableOverrideCount).toBe(1);
    expect(r.postedNowSkipFlagCount).toBe(1);
    expect(r.postedNowCount).toBe(4);
  });

  it('post-now reason breakdown sums to postedNowCount', () => {
    const r = buildQuietHoursCoverageReport([
      makePostedNow(t, 'outside-quiet-hours'),
      makePostedNow(t, 'actionable-override'),
      makePostedNow(t, 'skip-flag'),
    ]);
    expect(
      r.postedNowOutsideQuietHoursCount +
        r.postedNowActionableOverrideCount +
        r.postedNowSkipFlagCount,
    ).toBe(r.postedNowCount);
  });
});

describe('buildQuietHoursCoverageReport — window labels', () => {
  const t = new Date('2026-06-22T12:00:00Z');
  const t2 = new Date('2026-06-22T13:00:00Z');

  it('collects unique window labels from deferrals + suppressions', () => {
    const r = buildQuietHoursCoverageReport([
      makeDeferred(t, t2, 'A'),
      makeSuppressed(t, 'B'),
      makeDeferred(t, t2, 'A'),
    ]);
    expect(r.uniqueWindowLabels).toEqual(['A', 'B']);
  });

  it('sorts window labels alphabetically', () => {
    const r = buildQuietHoursCoverageReport([
      makeDeferred(t, t2, 'zzz'),
      makeDeferred(t, t2, 'aaa'),
      makeDeferred(t, t2, 'mmm'),
    ]);
    expect(r.uniqueWindowLabels).toEqual(['aaa', 'mmm', 'zzz']);
  });

  it('ignores post-now decisions for window label collection', () => {
    const r = buildQuietHoursCoverageReport([
      makePostedNow(t),
      makeDeferred(t, t2, 'X'),
    ]);
    expect(r.uniqueWindowLabels).toEqual(['X']);
  });
});

describe('buildQuietHoursCoverageReport — deferral latencies', () => {
  const runAt = new Date('2026-06-22T12:00:00Z');

  it('computes min/max/mean across deferrals', () => {
    const oneHourLater = new Date('2026-06-22T13:00:00Z'); // 3,600,000 ms
    const twoHoursLater = new Date('2026-06-22T14:00:00Z'); // 7,200,000 ms
    const threeHoursLater = new Date('2026-06-22T15:00:00Z'); // 10,800,000 ms
    const r = buildQuietHoursCoverageReport([
      makeDeferred(runAt, oneHourLater),
      makeDeferred(runAt, twoHoursLater),
      makeDeferred(runAt, threeHoursLater),
    ]);
    expect(r.deferralLatenciesMs).not.toBeNull();
    expect(r.deferralLatenciesMs!.minMs).toBe(3600000);
    expect(r.deferralLatenciesMs!.maxMs).toBe(10800000);
    expect(r.deferralLatenciesMs!.meanMs).toBe(7200000);
  });

  it('returns null when no deferrals occurred', () => {
    const r = buildQuietHoursCoverageReport([
      makePostedNow(runAt),
      makeSuppressed(runAt),
    ]);
    expect(r.deferralLatenciesMs).toBeNull();
  });

  it('rounds mean to integer ms', () => {
    const a = new Date('2026-06-22T13:00:00Z'); // 1h
    const b = new Date('2026-06-22T13:00:00.500Z'); // 1h + 500ms
    const r = buildQuietHoursCoverageReport([
      makeDeferred(runAt, a),
      makeDeferred(runAt, b),
    ]);
    expect(r.deferralLatenciesMs!.meanMs).toBe(Math.round((3600000 + 3600500) / 2));
  });

  it('drops negative latencies (deferUntil before runAt)', () => {
    const r = buildQuietHoursCoverageReport([
      makeDeferred(runAt, new Date('2026-06-22T11:00:00Z')), // 1h BEFORE runAt
    ]);
    // Negative latency was dropped, so no valid latencies remain;
    // but the decision still counted as a deferral.
    expect(r.deferredCount).toBe(1);
    expect(r.deferralLatenciesMs).toBeNull();
  });
});

describe('buildQuietHoursCoverageReport — misconfiguration flags', () => {
  const t = new Date('2026-06-22T12:00:00Z');
  const t2 = new Date('2026-06-22T13:00:00Z');

  it('flags channelIsAlwaysDeferring when every run defers', () => {
    const r = buildQuietHoursCoverageReport([
      makeDeferred(t, t2),
      makeDeferred(t, t2),
      makeDeferred(t, t2),
    ]);
    expect(r.channelIsAlwaysDeferring).toBe(true);
    expect(r.channelIsAlwaysSuppressing).toBe(false);
    expect(r.channelIsAlwaysPostingNow).toBe(false);
  });

  it('flags channelIsAlwaysSuppressing when every run suppresses', () => {
    const r = buildQuietHoursCoverageReport([
      makeSuppressed(t),
      makeSuppressed(t),
    ]);
    expect(r.channelIsAlwaysSuppressing).toBe(true);
    expect(r.channelIsAlwaysDeferring).toBe(false);
    expect(r.channelIsAlwaysPostingNow).toBe(false);
  });

  it('flags channelIsAlwaysPostingNow when no run was ever deferred or suppressed', () => {
    const r = buildQuietHoursCoverageReport([
      makePostedNow(t),
      makePostedNow(t),
      makePostedNow(t),
    ]);
    expect(r.channelIsAlwaysPostingNow).toBe(true);
    expect(r.channelIsAlwaysDeferring).toBe(false);
    expect(r.channelIsAlwaysSuppressing).toBe(false);
  });

  it('flips none of the flags when there is a mix', () => {
    const r = buildQuietHoursCoverageReport([
      makePostedNow(t),
      makeDeferred(t, t2),
      makeSuppressed(t),
    ]);
    expect(r.channelIsAlwaysPostingNow).toBe(false);
    expect(r.channelIsAlwaysDeferring).toBe(false);
    expect(r.channelIsAlwaysSuppressing).toBe(false);
  });

  it('does NOT flag channelIsAlwaysPostingNow when totalRuns is 0', () => {
    const r = buildQuietHoursCoverageReport([]);
    expect(r.channelIsAlwaysPostingNow).toBe(false);
  });
});

describe('buildQuietHoursCoverageReportFromResults', () => {
  const runAt = new Date('2026-06-22T12:00:00Z');

  it('extracts decisions from quiet-hours results and builds a report', () => {
    const result: DoseRoundtripThreadBatcherQuietHoursResult = {
      decision: { kind: 'post-now', reason: 'outside-quiet-hours' },
      // bundle shape isn't used by the coverage report builder
      bundle: {} as DoseRoundtripThreadBatcherQuietHoursResult['bundle'],
    };
    const r = buildQuietHoursCoverageReportFromResults([
      { runAt, result },
      { runAt, result },
    ]);
    expect(r.totalRuns).toBe(2);
    expect(r.postedNowCount).toBe(2);
    expect(r.postedNowOutsideQuietHoursCount).toBe(2);
  });
});

describe('summarizeQuietHoursCoverageReport', () => {
  const t = new Date('2026-06-22T12:00:00Z');
  const t2 = new Date('2026-06-22T13:00:00Z');

  it('reports zero runs cleanly', () => {
    const r = buildQuietHoursCoverageReport([]);
    expect(summarizeQuietHoursCoverageReport(r)).toBe('Quiet hours coverage: 0 runs.');
  });

  it('reports run, posted, deferred, suppressed counts', () => {
    const r = buildQuietHoursCoverageReport([
      makePostedNow(t),
      makeDeferred(t, t2),
      makeSuppressed(t),
    ]);
    const summary = summarizeQuietHoursCoverageReport(r);
    expect(summary).toContain('3 runs');
    expect(summary).toContain('1 posted');
    expect(summary).toContain('1 deferred');
    expect(summary).toContain('1 suppressed');
  });

  it('appends mean defer latency when deferrals exist', () => {
    const r = buildQuietHoursCoverageReport([
      makeDeferred(t, new Date('2026-06-22T18:42:00Z')),
    ]);
    // 6h 42m
    const summary = summarizeQuietHoursCoverageReport(r);
    expect(summary).toContain('mean defer 6h 42m');
  });

  it('uses singular "run" for one run', () => {
    const r = buildQuietHoursCoverageReport([makePostedNow(t)]);
    expect(summarizeQuietHoursCoverageReport(r)).toContain('1 run,');
  });
});

describe('detectQuietHoursMisconfiguration', () => {
  const t = new Date('2026-06-22T12:00:00Z');
  const t2 = new Date('2026-06-22T13:00:00Z');

  it('returns null when nothing looks wrong', () => {
    const r = buildQuietHoursCoverageReport([
      makePostedNow(t),
      makeDeferred(t, t2),
      makeSuppressed(t),
    ]);
    expect(detectQuietHoursMisconfiguration(r)).toBeNull();
  });

  it('flags always-deferring', () => {
    const r = buildQuietHoursCoverageReport([
      makeDeferred(t, t2),
      makeDeferred(t, t2),
    ]);
    const msg = detectQuietHoursMisconfiguration(r);
    expect(msg).toContain('ALWAYS deferring');
  });

  it('flags always-suppressing', () => {
    const r = buildQuietHoursCoverageReport([
      makeSuppressed(t),
      makeSuppressed(t),
    ]);
    const msg = detectQuietHoursMisconfiguration(r);
    expect(msg).toContain('ALWAYS suppressing');
  });

  it('does NOT flag always-posting with fewer than 7 runs', () => {
    const r = buildQuietHoursCoverageReport([
      makePostedNow(t),
      makePostedNow(t),
      makePostedNow(t),
    ]);
    expect(detectQuietHoursMisconfiguration(r)).toBeNull();
  });

  it('flags always-posting with 7+ runs', () => {
    const r = buildQuietHoursCoverageReport(
      Array.from({ length: 7 }, () => makePostedNow(t)),
    );
    const msg = detectQuietHoursMisconfiguration(r);
    expect(msg).toContain('never defers or suppresses');
  });

  it('flags multiple distinct window labels', () => {
    const r = buildQuietHoursCoverageReport([
      makeDeferred(t, t2, 'WINDOW-A'),
      makeDeferred(t, t2, 'WINDOW-B'),
    ]);
    const msg = detectQuietHoursMisconfiguration(r);
    expect(msg).toContain('2 different');
    expect(msg).toContain('WINDOW-A');
    expect(msg).toContain('WINDOW-B');
  });

  it('returns null for empty report', () => {
    const r = buildQuietHoursCoverageReport([]);
    expect(detectQuietHoursMisconfiguration(r)).toBeNull();
  });
});

describe('determinism', () => {
  const t = new Date('2026-06-22T12:00:00Z');
  const t2 = new Date('2026-06-22T13:00:00Z');

  it('same input -> identical output', () => {
    const runs = [makePostedNow(t), makeDeferred(t, t2), makeSuppressed(t)];
    const a = buildQuietHoursCoverageReport(runs);
    const b = buildQuietHoursCoverageReport(runs);
    expect(a).toEqual(b);
  });
});
