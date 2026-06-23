/**
 * Dose export CSV import round-trip validator — summary-text Slack
 * thread batcher quiet-hours, COVERAGE REPORT companion.
 *
 * `dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours`
 * produces a single quiet-hours decision per run + a one-line
 * cron-log summary (`summarizeQuietHoursDecision`). Operations
 * teams running the nightly cron want STRUCTURED telemetry that
 * the analytics pipeline can ingest:
 *
 *   - how many deferrals were issued in the last N runs?
 *   - how many suppressions?
 *   - how often did the actionable-override post during quiet
 *     hours?
 *   - which channels are misconfigured (always defer, never post)?
 *
 * A one-line text summary can't answer those questions. The
 * monitoring pipeline needs JSON.
 *
 * This module is the coverage-report companion. Given an array of
 * QuietHours decision results (one per run, typically aggregated
 * across N runs of the nightly cron), it produces a structured
 * coverage report:
 *
 *   {
 *     totalRuns,
 *     postedNowCount,          // includes outside-quiet-hours + actionable-override + skip-flag
 *     deferredCount,
 *     suppressedCount,
 *     // post-now reasons broken out:
 *     postedNowOutsideQuietHoursCount,
 *     postedNowActionableOverrideCount,
 *     postedNowSkipFlagCount,
 *     // suppression / deferral telemetry:
 *     uniqueWindowLabels: string[],
 *     deferralLatenciesMs: { min, max, mean },  // null when no deferrals
 *     // misconfiguration flags:
 *     channelIsAlwaysDeferring: boolean,        // every run deferred
 *     channelIsAlwaysSuppressing: boolean,      // every run suppressed
 *     channelIsAlwaysPostingNow: boolean,       // never deferred or suppressed
 *   }
 *
 * Pure / deterministic given the input runs.
 *
 * Composes:
 *   - batchRoundtripResultsForSlackThreadWithQuietHours decision shape
 */

import type {
  DoseRoundtripThreadBatcherQuietHoursDecision,
  DoseRoundtripThreadBatcherQuietHoursResult,
} from './dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours';

/**
 * Per-run input. Wraps each decision with the runAt timestamp so the
 * coverage report can compute deferral latencies (deferUntil - runAt).
 */
export interface DoseRoundtripQuietHoursCoverageReportRun {
  /** Wall-clock instant the run started. */
  runAt: Date;
  /** The decision shape from the quiet-hours module. */
  decision: DoseRoundtripThreadBatcherQuietHoursDecision;
}

export interface DoseRoundtripQuietHoursCoverageReportLatencyStats {
  /** Minimum deferral latency in ms (deferUntil - runAt). */
  minMs: number;
  /** Maximum deferral latency in ms. */
  maxMs: number;
  /** Mean deferral latency in ms (rounded). */
  meanMs: number;
}

export interface DoseRoundtripQuietHoursCoverageReport {
  /** Total runs in the coverage window. */
  totalRuns: number;

  /** Posted (any reason) count. */
  postedNowCount: number;
  /** Deferred-until count. */
  deferredCount: number;
  /** Suppressed completely count. */
  suppressedCount: number;

  /** Breakdown: outside-quiet-hours posts. */
  postedNowOutsideQuietHoursCount: number;
  /** Breakdown: actionable-override posts during quiet hours. */
  postedNowActionableOverrideCount: number;
  /** Breakdown: posts because skipQuietHoursCheck was true. */
  postedNowSkipFlagCount: number;

  /**
   * Distinct window labels observed across deferrals + suppressions.
   * Sorted alphabetically. Useful for spotting channels that
   * accidentally configured two different quiet-hours windows.
   */
  uniqueWindowLabels: string[];

  /**
   * Latency stats for the deferred runs only. Null when no deferrals
   * happened in the window.
   */
  deferralLatenciesMs: DoseRoundtripQuietHoursCoverageReportLatencyStats | null;

  /**
   * Misconfiguration flag: every run deferred. Common when a channel
   * accidentally got a 24h quiet-hours window applied.
   */
  channelIsAlwaysDeferring: boolean;
  /** Misconfiguration flag: every run suppressed. */
  channelIsAlwaysSuppressing: boolean;
  /** Misconfiguration flag: no run was ever deferred or suppressed. */
  channelIsAlwaysPostingNow: boolean;

  /**
   * True when the run set is empty. Most downstream consumers want
   * to short-circuit and skip rendering the report when this is true.
   */
  isEmpty: boolean;
}

function pushIfDefined(arr: string[], v: string | undefined): void {
  if (typeof v === 'string' && v.length > 0) arr.push(v);
}

/**
 * Build the structured coverage report from a list of quiet-hours
 * runs.
 *
 * Pure / deterministic.
 */
export function buildQuietHoursCoverageReport(
  runs: DoseRoundtripQuietHoursCoverageReportRun[],
): DoseRoundtripQuietHoursCoverageReport {
  const totalRuns = runs.length;
  let postedNowCount = 0;
  let deferredCount = 0;
  let suppressedCount = 0;
  let postedNowOutsideQuietHoursCount = 0;
  let postedNowActionableOverrideCount = 0;
  let postedNowSkipFlagCount = 0;
  const windowLabels: string[] = [];
  const latencies: number[] = [];

  for (const run of runs) {
    const d = run.decision;
    if (d.kind === 'post-now') {
      postedNowCount += 1;
      if (d.reason === 'outside-quiet-hours') {
        postedNowOutsideQuietHoursCount += 1;
      } else if (d.reason === 'actionable-override') {
        postedNowActionableOverrideCount += 1;
      } else if (d.reason === 'skip-flag') {
        postedNowSkipFlagCount += 1;
      }
    } else if (d.kind === 'defer-until') {
      deferredCount += 1;
      pushIfDefined(windowLabels, d.windowLabel);
      const latency = d.deferUntil.getTime() - run.runAt.getTime();
      if (Number.isFinite(latency) && latency >= 0) {
        latencies.push(latency);
      }
    } else if (d.kind === 'suppress-completely') {
      suppressedCount += 1;
      pushIfDefined(windowLabels, d.windowLabel);
    }
  }

  const uniqueWindowLabels = [...new Set(windowLabels)].sort();

  let deferralLatenciesMs: DoseRoundtripQuietHoursCoverageReportLatencyStats | null = null;
  if (latencies.length > 0) {
    const minMs = Math.min(...latencies);
    const maxMs = Math.max(...latencies);
    const sum = latencies.reduce((acc, n) => acc + n, 0);
    const meanMs = Math.round(sum / latencies.length);
    deferralLatenciesMs = { minMs, maxMs, meanMs };
  }

  const channelIsAlwaysDeferring = totalRuns > 0 && deferredCount === totalRuns;
  const channelIsAlwaysSuppressing = totalRuns > 0 && suppressedCount === totalRuns;
  const channelIsAlwaysPostingNow = totalRuns > 0 && postedNowCount === totalRuns;
  const isEmpty = totalRuns === 0;

  return {
    totalRuns,
    postedNowCount,
    deferredCount,
    suppressedCount,
    postedNowOutsideQuietHoursCount,
    postedNowActionableOverrideCount,
    postedNowSkipFlagCount,
    uniqueWindowLabels,
    deferralLatenciesMs,
    channelIsAlwaysDeferring,
    channelIsAlwaysSuppressing,
    channelIsAlwaysPostingNow,
    isEmpty,
  };
}

/**
 * Convenience: lift a list of full quiet-hours RESULTS (decision +
 * bundle) into the report-input shape. Most callers persist the
 * full results, not just the decisions, so this is the typical
 * entry point.
 */
export function buildQuietHoursCoverageReportFromResults(
  results: Array<{
    runAt: Date;
    result: DoseRoundtripThreadBatcherQuietHoursResult;
  }>,
): DoseRoundtripQuietHoursCoverageReport {
  const runs: DoseRoundtripQuietHoursCoverageReportRun[] = results.map((r) => ({
    runAt: r.runAt,
    decision: r.result.decision,
  }));
  return buildQuietHoursCoverageReport(runs);
}

/**
 * Convenience: a one-line summary for the cron log paired with the
 * structured report.
 *
 *   "Quiet hours coverage: 30 runs, 18 posted, 10 deferred, 2 suppressed (mean defer 6h 42m)."
 */
export function summarizeQuietHoursCoverageReport(
  report: DoseRoundtripQuietHoursCoverageReport,
): string {
  if (report.isEmpty) {
    return 'Quiet hours coverage: 0 runs.';
  }
  const t = report.totalRuns;
  const p = report.postedNowCount;
  const d = report.deferredCount;
  const s = report.suppressedCount;
  let tail = '';
  if (report.deferralLatenciesMs) {
    const meanMin = Math.round(report.deferralLatenciesMs.meanMs / 60000);
    const h = Math.floor(meanMin / 60);
    const m = meanMin % 60;
    tail = ` (mean defer ${h}h ${m}m)`;
  }
  return (
    `Quiet hours coverage: ${t} ${t === 1 ? 'run' : 'runs'}, ` +
    `${p} posted, ${d} deferred, ${s} suppressed${tail}.`
  );
}

/**
 * Convenience: a misconfiguration flag string for the cron log /
 * dashboard. Returns null when nothing looks misconfigured.
 *
 *   "Quiet hours misconfig: channel is ALWAYS deferring (likely 24h window)."
 *   null
 */
export function detectQuietHoursMisconfiguration(
  report: DoseRoundtripQuietHoursCoverageReport,
): string | null {
  if (report.isEmpty) return null;
  // Multi-window-labels check first: when present, it's usually the
  // underlying cause of "always deferring" / "always suppressing"
  // and the actionable info for the operator.
  if (report.uniqueWindowLabels.length > 1) {
    return (
      `Quiet hours misconfig: ${report.uniqueWindowLabels.length} different ` +
      `window labels observed (${report.uniqueWindowLabels.join(', ')}); ` +
      `expected exactly one per channel.`
    );
  }
  if (report.channelIsAlwaysDeferring) {
    return 'Quiet hours misconfig: channel is ALWAYS deferring (likely 24h window or misaligned timezone).';
  }
  if (report.channelIsAlwaysSuppressing) {
    return 'Quiet hours misconfig: channel is ALWAYS suppressing (suppress-completely policy with 24h window?).';
  }
  if (report.channelIsAlwaysPostingNow && report.totalRuns >= 7) {
    // 7-day window with zero deferrals -> the quiet-hours config
    // likely isn't doing anything; flag for review.
    return 'Quiet hours misconfig: channel never defers or suppresses across 7+ runs (window may be inactive).';
  }
  return null;
}
