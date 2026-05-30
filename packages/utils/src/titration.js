"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TitrationPlanError = void 0;
exports.validatePlan = validatePlan;
exports.activeStepOn = activeStepOn;
exports.doseOn = doseOn;
exports.planTimeline = planTimeline;
exports.nextDoseChange = nextDoseChange;
exports.planDurationDays = planDurationDays;
const date_1 = require("./date");
class TitrationPlanError extends Error {
    constructor(message) {
        super(message);
        this.name = 'TitrationPlanError';
    }
}
exports.TitrationPlanError = TitrationPlanError;
/**
 * Validate a plan, throwing a TitrationPlanError on any structural issue.
 * Only the final step may have a null duration. All other durations must be
 * positive integers, and at least one step is required.
 */
function validatePlan(plan) {
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
        }
        else {
            if (!Number.isInteger(s.durationDays) || s.durationDays <= 0) {
                throw new TitrationPlanError(`step ${i} duration must be a positive integer`);
            }
        }
    }
}
function parseDateOnly(value) {
    if (value instanceof Date)
        return (0, date_1.startOfDay)(value);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (m) {
        return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }
    return (0, date_1.startOfDay)(new Date(value));
}
function planStart(plan) {
    return parseDateOnly(plan.startDate);
}
/**
 * Return the active step for the given date, or null when the date falls
 * before the plan starts or after the plan ends (last step has a finite
 * duration that has elapsed).
 */
function activeStepOn(plan, date) {
    validatePlan(plan);
    const day = (0, date_1.startOfDay)(date);
    const begin = planStart(plan);
    if (day.getTime() < begin.getTime())
        return null;
    let cursor = begin;
    for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i];
        if (step.durationDays === null) {
            return {
                index: i,
                step,
                beginsOn: cursor,
                endsOn: null,
                dayInStep: (0, date_1.diffDays)(day, cursor),
            };
        }
        const stepEnd = (0, date_1.addDays)(cursor, step.durationDays - 1);
        if (day.getTime() <= stepEnd.getTime()) {
            return {
                index: i,
                step,
                beginsOn: cursor,
                endsOn: stepEnd,
                dayInStep: (0, date_1.diffDays)(day, cursor),
            };
        }
        cursor = (0, date_1.addDays)(stepEnd, 1);
    }
    return null;
}
/**
 * Resolve the per-administration dose on a given date. Returns null when the
 * plan is not in effect (before start or after a finite final step).
 */
function doseOn(plan, date) {
    const step = activeStepOn(plan, date);
    if (!step)
        return null;
    return { dose: step.step.dose, unit: step.step.unit };
}
/**
 * Expand the plan to a per-day timeline between `from` and `to` inclusive.
 * Days outside the plan are omitted; callers can compare lengths to the
 * window to detect coverage gaps.
 */
function planTimeline(plan, from, to) {
    validatePlan(plan);
    const out = [];
    const start = (0, date_1.startOfDay)(from);
    const end = (0, date_1.startOfDay)(to);
    if (end.getTime() < start.getTime())
        return out;
    for (let d = start; d.getTime() <= end.getTime(); d = (0, date_1.addDays)(d, 1)) {
        const step = activeStepOn(plan, d);
        if (!step)
            continue;
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
function nextDoseChange(plan, after) {
    validatePlan(plan);
    const begin = planStart(plan);
    let cursor = begin;
    for (let i = 0; i < plan.steps.length - 1; i++) {
        const step = plan.steps[i];
        if (step.durationDays === null)
            return null;
        const stepEnd = (0, date_1.addDays)(cursor, step.durationDays - 1);
        const nextBegin = (0, date_1.addDays)(stepEnd, 1);
        if (nextBegin.getTime() > (0, date_1.startOfDay)(after).getTime()) {
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
function planDurationDays(plan) {
    validatePlan(plan);
    let total = 0;
    for (const s of plan.steps) {
        if (s.durationDays === null)
            return null;
        total += s.durationDays;
    }
    return total;
}
