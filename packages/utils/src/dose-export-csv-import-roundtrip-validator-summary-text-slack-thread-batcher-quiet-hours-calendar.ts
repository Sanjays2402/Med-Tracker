/**
 * Dose export CSV import round-trip validator — summary-text Slack
 * thread batcher, quiet-hours CALENDAR overlay.
 *
 * `dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours`
 * applies a single quiet-hours window (e.g. 22:00-07:00 PT) uniformly
 * across EVERY day. Real on-call schedules don't work that way:
 *
 *   - weekends are usually quiet ALL DAY (no on-call during the
 *     weekend — anything that posts gets ignored until Monday
 *     anyway, so the parent post should be deferred to Monday
 *     morning regardless of weekend time);
 *   - some weekdays have a different baseline (e.g. Wednesday
 *     all-hands at 09:00 means the channel is busy with other
 *     things from 08:30-10:00; a deferred parent should land
 *     AFTER that window);
 *   - clinical-records on-call rotates by day, so a window that
 *     fits the Mon/Tue on-call's timezone may not fit the
 *     Wed/Thu on-call's.
 *
 * This module is the calendar-aware companion. It composes
 * batchRoundtripResultsForSlackThreadWithQuietHours and adds:
 *
 *   - per-day-of-week overrides (Mon/Tue/Wed/Thu/Fri/Sat/Sun)
 *     each with its own quiet-hours window OR a 'quiet-all-day'
 *     OR a 'no-quiet-hours' flag;
 *   - a default window applied to any day NOT explicitly overridden
 *     (defaults to the basic module's 22:00-07:00 PT);
 *   - the same policy + decision shape as the basic quiet-hours
 *     module (post-now / defer-until / suppress-completely);
 *   - a per-decision tag identifying WHICH day-of-week rule fired
 *     so the cron log can audit which override matched.
 *
 * The DAY-OF-WEEK is evaluated in the TIMEZONE of the matching
 * window (default America/Los_Angeles); a runAt of Friday 23:30 UTC
 * in a window with timezone=America/Los_Angeles evaluates against
 * Friday 16:30 PT (still Friday).
 *
 * Pure / deterministic. No I/O.
 *
 * Composes:
 *   - batchRoundtripResultsForSlackThreadWithQuietHours
 */

import type {
  DoseRoundtripThreadBatcherQuietHoursOptions,
  DoseRoundtripThreadBatcherQuietHoursPolicy,
  DoseRoundtripThreadBatcherQuietHoursResult,
  DoseRoundtripThreadBatcherQuietHoursWindow,
} from './dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours';
import { batchRoundtripResultsForSlackThreadWithQuietHours } from './dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours';
import type { DoseRoundtripThreadBatcherRun } from './dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher';

/** Canonical day-of-week names; lower-case + 3-letter for compactness. */
export type DoseRoundtripThreadBatcherQuietHoursDayOfWeek =
  | 'mon'
  | 'tue'
  | 'wed'
  | 'thu'
  | 'fri'
  | 'sat'
  | 'sun';

const DAY_INDEX_TO_KEY: Record<number, DoseRoundtripThreadBatcherQuietHoursDayOfWeek> = {
  0: 'sun',
  1: 'mon',
  2: 'tue',
  3: 'wed',
  4: 'thu',
  5: 'fri',
  6: 'sat',
};

/**
 * Per-day override. Either a basic quiet-hours window, or a flag
 * meaning the entire day is quiet, or a flag meaning quiet hours
 * are completely off for this day.
 */
export type DoseRoundtripThreadBatcherQuietHoursCalendarDayOverride =
  | { kind: 'window'; window: DoseRoundtripThreadBatcherQuietHoursWindow }
  | { kind: 'quiet-all-day'; timezone?: string }
  | { kind: 'no-quiet-hours' };

export interface DoseRoundtripThreadBatcherQuietHoursCalendarOptions
  extends Omit<DoseRoundtripThreadBatcherQuietHoursOptions, 'quietHours'> {
  /**
   * Per-day-of-week overrides. Keys are 3-letter lowercase day names
   * (mon, tue, wed, ...). Missing days fall through to defaultWindow.
   */
  overrides?: Partial<
    Record<DoseRoundtripThreadBatcherQuietHoursDayOfWeek, DoseRoundtripThreadBatcherQuietHoursCalendarDayOverride>
  >;
  /**
   * Default window applied to any day NOT in overrides. Default
   * 22:00-07:00 America/Los_Angeles (matches the basic module).
   */
  defaultWindow?: DoseRoundtripThreadBatcherQuietHoursWindow;
}

export interface DoseRoundtripThreadBatcherQuietHoursCalendarResult
  extends DoseRoundtripThreadBatcherQuietHoursResult {
  /**
   * Day-of-week that matched the runAt timestamp (in the resolved
   * window's timezone). Always present.
   */
  matchedDayOfWeek: DoseRoundtripThreadBatcherQuietHoursDayOfWeek;
  /**
   * Audit tag identifying which override rule fired:
   *   'override:window'   -> a per-day window override matched
   *   'override:all-day'  -> the day was marked quiet-all-day
   *   'override:none'     -> the day was marked no-quiet-hours
   *   'default'           -> no override; default window applied
   */
  matchedRule:
    | 'override:window'
    | 'override:all-day'
    | 'override:none'
    | 'default';
}

const DEFAULT_WINDOW: DoseRoundtripThreadBatcherQuietHoursWindow = {
  startHour: 22,
  endHour: 7,
  timezone: 'America/Los_Angeles',
};

const DEFAULT_TIMEZONE = 'America/Los_Angeles';
const QUIET_ALL_DAY_WINDOW: DoseRoundtripThreadBatcherQuietHoursWindow = {
  startHour: 0,
  endHour: 24,
  timezone: DEFAULT_TIMEZONE,
};

function dayOfWeekInTimezone(d: Date, timezone: string): DoseRoundtripThreadBatcherQuietHoursDayOfWeek {
  // Use a long weekday format so we get an unambiguous english name.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  });
  const part = fmt.formatToParts(d).find((p) => p.type === 'weekday');
  const raw = part?.value ?? '';
  // Intl short weekday returns 'Mon', 'Tue', ...; map to lowercase.
  const lc = raw.toLowerCase();
  if (lc === 'mon' || lc === 'tue' || lc === 'wed' || lc === 'thu' || lc === 'fri' || lc === 'sat' || lc === 'sun') {
    return lc as DoseRoundtripThreadBatcherQuietHoursDayOfWeek;
  }
  // Defensive fallback: use the JS Date.getDay() (UTC-resolved) day.
  const jsDay = d.getUTCDay();
  return DAY_INDEX_TO_KEY[jsDay] ?? 'mon';
}

interface ResolvedRule {
  rule:
    | 'override:window'
    | 'override:all-day'
    | 'override:none'
    | 'default';
  window: DoseRoundtripThreadBatcherQuietHoursWindow | null;
  /** When 'no-quiet-hours' fires the caller should skip the quiet-hours check entirely. */
  skipQuietHoursCheck: boolean;
}

function resolveRule(
  dayOfWeek: DoseRoundtripThreadBatcherQuietHoursDayOfWeek,
  options: DoseRoundtripThreadBatcherQuietHoursCalendarOptions,
): ResolvedRule {
  const override = options.overrides?.[dayOfWeek];
  if (override !== undefined) {
    if (override.kind === 'no-quiet-hours') {
      return {
        rule: 'override:none',
        window: null,
        skipQuietHoursCheck: true,
      };
    }
    if (override.kind === 'quiet-all-day') {
      const tz = override.timezone ?? options.defaultWindow?.timezone ?? DEFAULT_TIMEZONE;
      return {
        rule: 'override:all-day',
        window: { ...QUIET_ALL_DAY_WINDOW, timezone: tz },
        skipQuietHoursCheck: false,
      };
    }
    return {
      rule: 'override:window',
      window: override.window,
      skipQuietHoursCheck: false,
    };
  }
  return {
    rule: 'default',
    window: options.defaultWindow ?? DEFAULT_WINDOW,
    skipQuietHoursCheck: false,
  };
}

/**
 * Build the thread-batcher bundle AND a calendar-aware quiet-hours
 * decision.
 *
 * Steps:
 *   1. Resolve day-of-week for runAt in the relevant timezone.
 *   2. Look up the matching override; fall back to defaultWindow.
 *   3. Delegate to batchRoundtripResultsForSlackThreadWithQuietHours
 *      with the resolved window.
 *   4. Annotate the returned result with matchedDayOfWeek + matchedRule.
 *
 * Pure / deterministic given (runAt, overrides, defaultWindow, runs).
 */
export function batchRoundtripResultsForSlackThreadWithQuietHoursCalendar(
  runs: DoseRoundtripThreadBatcherRun[],
  options: DoseRoundtripThreadBatcherQuietHoursCalendarOptions = {},
): DoseRoundtripThreadBatcherQuietHoursCalendarResult {
  const runAt = options.runAt ?? new Date();
  const probeTimezone =
    options.defaultWindow?.timezone ?? DEFAULT_TIMEZONE;
  const dayOfWeek = dayOfWeekInTimezone(runAt, probeTimezone);
  const resolved = resolveRule(dayOfWeek, options);

  // Build the sub-options for the basic quiet-hours module.
  const subOptions: DoseRoundtripThreadBatcherQuietHoursOptions = {
    ...options,
  };
  if (resolved.window !== null) {
    subOptions.quietHours = resolved.window;
  }
  if (resolved.skipQuietHoursCheck) {
    subOptions.skipQuietHoursCheck = true;
  }

  const base = batchRoundtripResultsForSlackThreadWithQuietHours(runs, subOptions);

  return {
    ...base,
    matchedDayOfWeek: dayOfWeek,
    matchedRule: resolved.rule,
  };
}

/** Helper exported for documentation / testing. */
export function resolveQuietHoursRuleForDay(
  dayOfWeek: DoseRoundtripThreadBatcherQuietHoursDayOfWeek,
  options: DoseRoundtripThreadBatcherQuietHoursCalendarOptions,
): {
  rule: 'override:window' | 'override:all-day' | 'override:none' | 'default';
  window: DoseRoundtripThreadBatcherQuietHoursWindow | null;
} {
  const r = resolveRule(dayOfWeek, options);
  return { rule: r.rule, window: r.window };
}

/**
 * Convenience: a one-line summary of the calendar decision for the
 * cron log.
 *
 *   "Slack thread quiet hours (calendar): sat -> override:all-day -> suppressed."
 *   "Slack thread quiet hours (calendar): wed -> default -> posted immediately."
 *   "Slack thread quiet hours (calendar): mon -> override:window -> deferred until 2026-06-22T15:00:00Z."
 */
export function summarizeQuietHoursCalendarDecision(
  result: DoseRoundtripThreadBatcherQuietHoursCalendarResult,
): string {
  const tail = (() => {
    const d = result.decision;
    if (d.kind === 'post-now') {
      if (d.reason === 'outside-quiet-hours') return 'posted immediately (outside quiet hours).';
      if (d.reason === 'actionable-override')
        return 'posted with actionable override during quiet hours.';
      return 'posted immediately (quiet-hours check skipped).';
    }
    if (d.kind === 'defer-until') {
      return `deferred until ${d.deferUntil.toISOString()} (within ${d.windowLabel}).`;
    }
    return `suppressed (within ${d.windowLabel}).`;
  })();
  return `Slack thread quiet hours (calendar): ${result.matchedDayOfWeek} -> ${result.matchedRule} -> ${tail}`;
}

/**
 * Convenience: build a typical "weekends quiet all day, weekdays
 * 22:00-07:00 PT" calendar in one shot. Most clinical on-call
 * channels start with this configuration before customising
 * per-team.
 */
export function buildWeekendsAllDayWeekdaysOvernightCalendar(
  policy: DoseRoundtripThreadBatcherQuietHoursPolicy = 'defer-parent',
  timezone: string = DEFAULT_TIMEZONE,
): {
  overrides: NonNullable<DoseRoundtripThreadBatcherQuietHoursCalendarOptions['overrides']>;
  defaultWindow: DoseRoundtripThreadBatcherQuietHoursWindow;
  policy: DoseRoundtripThreadBatcherQuietHoursPolicy;
} {
  return {
    overrides: {
      sat: { kind: 'quiet-all-day', timezone },
      sun: { kind: 'quiet-all-day', timezone },
    },
    defaultWindow: { startHour: 22, endHour: 7, timezone },
    policy,
  };
}
