/**
 * Lab-test window tracker for medications that require periodic monitoring.
 *
 * Several common medications require lab monitoring on a clinical
 * cadence: warfarin needs an INR every 2-4 weeks once stable, statins
 * need a baseline + 12-week LFT, lithium needs trough levels every 3-6
 * months. Missing a draw is a real safety problem (warfarin) and a
 * billing-quality problem (HEDIS / Star Ratings).
 *
 * This module turns a list of medication monitoring requirements plus
 * a list of completed lab results into a status report:
 *
 *   - per-(medication, labCode) status: 'overdue' | 'due-soon' | 'on-track'
 *     | 'no-history' | 'not-due-yet',
 *   - days until next draw,
 *   - "overdue by N days" when the cadence has elapsed,
 *   - per-medication rollup so the dashboard shows
 *     "Warfarin: INR overdue by 5 days",
 *   - regimen rollup for the caregiver dashboard counts.
 *
 * Pure / deterministic. No clinical-decision logic; cadence comes from
 * the caller via `MedicationMonitoringSpec`.
 */

import { addDays, startOfDay } from './date';

export type LabStatus =
  | 'overdue'
  | 'due-soon'
  | 'on-track'
  | 'no-history'
  | 'not-due-yet';

export interface LabRequirement {
  /** Short canonical lab code (e.g. 'INR', 'LFT', 'A1C', 'TSH', 'CMP'). */
  labCode: string;
  /** Display name shown in the UI ("INR", "Liver function panel"). */
  labName: string;
  /** Target cadence between draws in days (e.g. 28 for warfarin INR). */
  cadenceDays: number;
  /** Days before the next due date to flag as 'due-soon'. Default 7. */
  warnWithinDays?: number;
  /**
   * If true and the patient has no recorded result yet, the requirement
   * is reported as 'overdue' instead of 'no-history' once the
   * medication has been active for `baselineDueDays` (default the
   * cadence). Use this for baseline-required labs like the LFT before
   * starting a statin.
   */
  requireBaseline?: boolean;
  /**
   * Days from medication start by which a baseline must exist when
   * `requireBaseline` is true. Defaults to `cadenceDays`.
   */
  baselineDueDays?: number;
}

export interface MedicationMonitoringSpec {
  medicationId: string;
  medicationName: string;
  /** When the patient started the medication. ISO date. */
  startedAt: string | Date;
  /** All lab requirements for this medication. */
  requirements: LabRequirement[];
}

export interface LabResult {
  medicationId: string;
  labCode: string;
  /** When the lab was drawn (not when the result was reported). */
  drawnAt: string | Date;
}

export interface LabWindowInput {
  medications: MedicationMonitoringSpec[];
  results: LabResult[];
  /** Reference clock for due / overdue calculations. Default new Date(). */
  now?: Date;
}

export interface LabWindow {
  medicationId: string;
  medicationName: string;
  labCode: string;
  labName: string;
  status: LabStatus;
  /** Days until the next draw is due. Negative when overdue. */
  daysUntilDue: number;
  /** Date of the last recorded draw, or null when no history. */
  lastDrawnAt: string | null;
  /** When the next draw is due, ISO date. Null when no history and no baseline. */
  nextDueAt: string | null;
  /** Human-readable status line for the UI. */
  message: string;
}

export interface MedicationLabRollup {
  medicationId: string;
  medicationName: string;
  windows: LabWindow[];
  /** Worst status across windows (overdue > due-soon > no-history > on-track > not-due-yet). */
  worstStatus: LabStatus;
  /** Headline string for the dashboard row. */
  headline: string;
}

export interface LabWindowReport {
  perMedication: MedicationLabRollup[];
  /** Flat list of windows sorted by daysUntilDue ascending (most overdue first). */
  flat: LabWindow[];
  /** Counts across the regimen. */
  totals: Record<LabStatus, number>;
}

const STATUS_RANK: Record<LabStatus, number> = {
  overdue: 0,
  'due-soon': 1,
  'no-history': 2,
  'on-track': 3,
  'not-due-yet': 4,
};

const MS_DAY = 86_400_000;

function asDate(v: string | Date): Date {
  return v instanceof Date ? new Date(v) : new Date(v);
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((startOfDay(a).getTime() - startOfDay(b).getTime()) / MS_DAY);
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function statusLabel(status: LabStatus): string {
  switch (status) {
    case 'overdue': return 'overdue';
    case 'due-soon': return 'due soon';
    case 'on-track': return 'on track';
    case 'no-history': return 'no history';
    case 'not-due-yet': return 'not due yet';
  }
}

function buildWindow(
  spec: MedicationMonitoringSpec,
  req: LabRequirement,
  results: LabResult[],
  now: Date,
): LabWindow {
  const warnWithin = req.warnWithinDays ?? 7;
  const startedAt = startOfDay(asDate(spec.startedAt));
  const today = startOfDay(now);

  const lastResult = results
    .filter((r) => r.medicationId === spec.medicationId && r.labCode === req.labCode)
    .map((r) => asDate(r.drawnAt))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  if (!lastResult) {
    // No history yet. Decide between 'no-history', 'not-due-yet', and
    // (when requireBaseline) 'overdue' once the baseline grace expires.
    const baselineDue = req.requireBaseline
      ? addDays(startedAt, req.baselineDueDays ?? req.cadenceDays)
      : null;
    if (baselineDue !== null) {
      const daysUntilDue = daysBetween(baselineDue, today);
      if (daysUntilDue < 0) {
        return {
          medicationId: spec.medicationId,
          medicationName: spec.medicationName,
          labCode: req.labCode,
          labName: req.labName,
          status: 'overdue',
          daysUntilDue,
          lastDrawnAt: null,
          nextDueAt: toIso(baselineDue),
          message: `${req.labName} baseline overdue by ${-daysUntilDue} day${-daysUntilDue === 1 ? '' : 's'}.`,
        };
      }
      if (daysUntilDue <= warnWithin) {
        return {
          medicationId: spec.medicationId,
          medicationName: spec.medicationName,
          labCode: req.labCode,
          labName: req.labName,
          status: 'due-soon',
          daysUntilDue,
          lastDrawnAt: null,
          nextDueAt: toIso(baselineDue),
          message: `${req.labName} baseline due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}.`,
        };
      }
      return {
        medicationId: spec.medicationId,
        medicationName: spec.medicationName,
        labCode: req.labCode,
        labName: req.labName,
        status: 'not-due-yet',
        daysUntilDue,
        lastDrawnAt: null,
        nextDueAt: toIso(baselineDue),
        message: `${req.labName} baseline due in ${daysUntilDue} days.`,
      };
    }
    return {
      medicationId: spec.medicationId,
      medicationName: spec.medicationName,
      labCode: req.labCode,
      labName: req.labName,
      status: 'no-history',
      daysUntilDue: 0,
      lastDrawnAt: null,
      nextDueAt: null,
      message: `${req.labName}: no prior result on file.`,
    };
  }

  const nextDue = addDays(startOfDay(lastResult), req.cadenceDays);
  const daysUntilDue = daysBetween(nextDue, today);

  let status: LabStatus;
  let message: string;
  if (daysUntilDue < 0) {
    status = 'overdue';
    message = `${req.labName} overdue by ${-daysUntilDue} day${-daysUntilDue === 1 ? '' : 's'}.`;
  } else if (daysUntilDue <= warnWithin) {
    status = 'due-soon';
    message = `${req.labName} due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}.`;
  } else {
    status = 'on-track';
    message = `${req.labName} on track (next due in ${daysUntilDue} days).`;
  }

  return {
    medicationId: spec.medicationId,
    medicationName: spec.medicationName,
    labCode: req.labCode,
    labName: req.labName,
    status,
    daysUntilDue,
    lastDrawnAt: toIso(lastResult),
    nextDueAt: toIso(nextDue),
    message,
  };
}

function rollupForMedication(
  spec: MedicationMonitoringSpec,
  windows: LabWindow[],
): MedicationLabRollup {
  if (windows.length === 0) {
    return {
      medicationId: spec.medicationId,
      medicationName: spec.medicationName,
      windows: [],
      worstStatus: 'on-track',
      headline: `${spec.medicationName}: no monitoring required.`,
    };
  }
  const worstStatus = windows
    .map((w) => w.status)
    .sort((a, b) => STATUS_RANK[a] - STATUS_RANK[b])[0]!;

  let headline: string;
  if (worstStatus === 'overdue') {
    const worst = windows
      .filter((w) => w.status === 'overdue')
      .sort((a, b) => a.daysUntilDue - b.daysUntilDue)[0]!;
    headline = `${spec.medicationName}: ${worst.labName} overdue by ${-worst.daysUntilDue} day${-worst.daysUntilDue === 1 ? '' : 's'}.`;
  } else if (worstStatus === 'due-soon') {
    const soon = windows
      .filter((w) => w.status === 'due-soon')
      .sort((a, b) => a.daysUntilDue - b.daysUntilDue)[0]!;
    headline = `${spec.medicationName}: ${soon.labName} due in ${soon.daysUntilDue} day${soon.daysUntilDue === 1 ? '' : 's'}.`;
  } else if (worstStatus === 'no-history') {
    const missing = windows.filter((w) => w.status === 'no-history').map((w) => w.labName).join(', ');
    headline = `${spec.medicationName}: no prior result for ${missing}.`;
  } else {
    headline = `${spec.medicationName}: monitoring ${statusLabel(worstStatus)}.`;
  }

  return {
    medicationId: spec.medicationId,
    medicationName: spec.medicationName,
    windows,
    worstStatus,
    headline,
  };
}

/**
 * Build the full lab-window report across the regimen.
 *
 * Sorts the flat window list by daysUntilDue ascending so the most
 * overdue items surface first. Per-medication rollups are returned in
 * the same order as the input `medications` array for stable UI
 * rendering.
 */
export function buildLabWindowReport(input: LabWindowInput): LabWindowReport {
  const now = input.now ?? new Date();
  const perMedication: MedicationLabRollup[] = [];
  const flat: LabWindow[] = [];
  const totals: Record<LabStatus, number> = {
    overdue: 0,
    'due-soon': 0,
    'on-track': 0,
    'no-history': 0,
    'not-due-yet': 0,
  };

  for (const spec of input.medications) {
    const windows = spec.requirements.map((req) =>
      buildWindow(spec, req, input.results, now),
    );
    perMedication.push(rollupForMedication(spec, windows));
    for (const w of windows) {
      flat.push(w);
      totals[w.status] += 1;
    }
  }

  flat.sort((a, b) => a.daysUntilDue - b.daysUntilDue);

  return { perMedication, flat, totals };
}

/**
 * Convenience: just the overdue windows (e.g. for an alert badge).
 */
export function overdueLabWindows(report: LabWindowReport): LabWindow[] {
  return report.flat.filter((w) => w.status === 'overdue');
}

/**
 * Convenience: just the due-soon windows for the calendar nudge.
 */
export function dueSoonLabWindows(report: LabWindowReport): LabWindow[] {
  return report.flat.filter((w) => w.status === 'due-soon');
}
