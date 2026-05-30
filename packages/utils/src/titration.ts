import { startOfDay, addDays, diffDays } from './date';

/**
 * Dose titration planning.
 *
 * A titration plan steps a medication's dose up (ramp) or down (taper) over
 * time according to a sequence of steps. Each step declares a dose amount, a
 * unit, and how many days that step lasts before the next one begins. Plans
 * are pure data and deterministic: given the same input, the same dose is
 * returned for any date.
 *
 * Examples:
 *   - SSRI taper: 20 mg for 7 days, then 10 mg for 7 days, then 5 mg for 7
 *     days, then stop.
 *   - Steroid ramp: 5 mg for 3 days, 10 mg for 3 days, 20 mg ongoing.
 *
 * The model intentionally avoids dose-per-day vs dose-per-administration:
 * callers pair a plan with a schedule (frequency) separately. A plan answers
 * the question "what is the per-administration dose on date X".
 */

export interface TitrationStep {
  /** Dose amount per administration during this step. */
  dose: number;
  /** Unit label, for example "mg", "mcg", "tablet". Display only. */
  unit: string;
  /**
   * Number of days the step lasts. The final step can be `null` to mean
   * indefinite (maintenance dose with no defined end).
   */
  durationDays: number | null;
  /** Optional clinician note shown to the patient when this step begins. */
  note?: string;
}

export interface TitrationPlan {
  id: string;
  medicationId: string;
  /** First day the plan is in effect. Local-calendar date, time ignored. */
  startDate: string | Date;
  steps: TitrationStep[];
}

export interface ActiveStep {
  index: number;
  step: TitrationStep;
  /** First day this step is in effect (inclusive). */
  beginsOn: Date;
  /** Last day this step is in effect (inclusive), or null for maintenance. */
  endsOn: Date | null;
  /** 0-based day within the step on the queried date. */
  dayInStep: number;
}

export class TitrationPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TitrationPlanError';
  }
}

/**
 * Validate a plan, throwing a TitrationPlanError on any structural issue.
 * Only the final step may have a null duration. All other durations must be
 * positive integers, and at least one step is required.
 */
export function validatePlan(plan: TitrationPlan): void {
  if (!plan.steps || plan.steps.length === 0) {
    throw new TitrationPlanError('plan must have at least one step');
  }
  for (let i = 0; i < plan.steps.length; i++) {
    const s = plan.steps[i];
    if (!Number.isFinite(s.dose) || s.dose < 0) {
      throw new TitrationPlanError(`step ${i} dose must be a non-negative number`);
    }
    if (!s.unit || typeof s.unit !== 'string') {
      throw new TitrationPlanError(`step ${i} unit is required`);
    }
    if (s.durationDays === null) {
      if (i !== plan.steps.length - 1) {
        throw new TitrationPlanError(`only the final step may be indefinite`);
      }
    } else {
      if (!Number.isInteger(s.durationDays) || s.durationDays <= 0) {
        throw new TitrationPlanError(`step ${i} duration must be a positive integer`);
      }
    }
  }
}

function parseDateOnly(value: string | Date): Date {
  if (value instanceof Date) return startOfDay(value);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  return startOfDay(new Date(value));
}

function planStart(plan: TitrationPlan): Date {
  return parseDateOnly(plan.startDate);
}

/**
 * Return the active step for the given date, or null when the date falls
 * before the plan starts or after the plan ends (last step has a finite
 * duration that has elapsed).
 */
export function activeStepOn(plan: TitrationPlan, date: Date): ActiveStep | null {
  validatePlan(plan);
  const day = startOfDay(date);
  const begin = planStart(plan);
  if (day.getTime() < begin.getTime()) return null;
  let cursor = begin;
  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    if (step.durationDays === null) {
      return {
        index: i,
        step,
        beginsOn: cursor,
        endsOn: null,
        dayInStep: diffDays(day, cursor),
      };
    }
    const stepEnd = addDays(cursor, step.durationDays - 1);
    if (day.getTime() <= stepEnd.getTime()) {
      return {
        index: i,
        step,
        beginsOn: cursor,
        endsOn: stepEnd,
        dayInStep: diffDays(day, cursor),
      };
    }
    cursor = addDays(stepEnd, 1);
  }
  return null;
}

/**
 * Resolve the per-administration dose on a given date. Returns null when the
 * plan is not in effect (before start or after a finite final step).
 */
export function doseOn(plan: TitrationPlan, date: Date): { dose: number; unit: string } | null {
  const step = activeStepOn(plan, date);
  if (!step) return null;
  return { dose: step.step.dose, unit: step.step.unit };
}

/**
 * Expand the plan to a per-day timeline between `from` and `to` inclusive.
 * Days outside the plan are omitted; callers can compare lengths to the
 * window to detect coverage gaps.
 */
export function planTimeline(
  plan: TitrationPlan,
  from: Date,
  to: Date,
): { date: string; dose: number; unit: string; stepIndex: number }[] {
  validatePlan(plan);
  const out: { date: string; dose: number; unit: string; stepIndex: number }[] = [];
  const start = startOfDay(from);
  const end = startOfDay(to);
  if (end.getTime() < start.getTime()) return out;
  for (let d = start; d.getTime() <= end.getTime(); d = addDays(d, 1)) {
    const step = activeStepOn(plan, d);
    if (!step) continue;
    out.push({
      date: d.toISOString().slice(0, 10),
      dose: step.step.dose,
      unit: step.step.unit,
      stepIndex: step.index,
    });
  }
  return out;
}

/**
 * The next dose change after the given date, or null when no further changes
 * are scheduled. Useful for notifying the patient "your dose changes
 * tomorrow".
 */
export function nextDoseChange(
  plan: TitrationPlan,
  after: Date,
): { date: Date; fromDose: number; toDose: number; unit: string; note?: string } | null {
  validatePlan(plan);
  const begin = planStart(plan);
  let cursor = begin;
  for (let i = 0; i < plan.steps.length - 1; i++) {
    const step = plan.steps[i];
    if (step.durationDays === null) return null;
    const stepEnd = addDays(cursor, step.durationDays - 1);
    const nextBegin = addDays(stepEnd, 1);
    if (nextBegin.getTime() > startOfDay(after).getTime()) {
      const next = plan.steps[i + 1];
      return {
        date: nextBegin,
        fromDose: step.dose,
        toDose: next.dose,
        unit: next.unit,
        note: next.note,
      };
    }
    cursor = nextBegin;
  }
  return null;
}

/** Total number of days the plan covers, or null when the final step is open-ended. */
export function planDurationDays(plan: TitrationPlan): number | null {
  validatePlan(plan);
  let total = 0;
  for (const s of plan.steps) {
    if (s.durationDays === null) return null;
    total += s.durationDays;
  }
  return total;
}
