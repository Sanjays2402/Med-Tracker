import {
  activeStepOn,
  doseOn,
  nextDoseChange,
  planDurationDays,
  planTimeline,
  validatePlan,
  TitrationPlanError,
  type TitrationPlan,
} from '@med/utils';

/**
 * TitrationService wraps the pure titration utilities so routes can request a
 * one-shot dose lookup, a horizon timeline, or a structured "what changes
 * next" answer without re-importing the underlying primitives. All inputs are
 * validated up front; callers get a typed error code suitable for mapping to
 * an HTTP response.
 */
export type TitrationFailure =
  | { code: 'invalid_plan'; message: string }
  | { code: 'invalid_range'; message: string };

export interface TitrationLookupResult {
  plan: TitrationPlan;
  asOf: string;
  active: ReturnType<typeof activeStepOn>;
  dose: ReturnType<typeof doseOn>;
  nextChange: ReturnType<typeof nextDoseChange>;
  planDurationDays: number | null;
}

export class TitrationService {
  validate(plan: TitrationPlan): TitrationFailure | null {
    try {
      validatePlan(plan);
      return null;
    } catch (e) {
      if (e instanceof TitrationPlanError) return { code: 'invalid_plan', message: e.message };
      throw e;
    }
  }

  lookup(plan: TitrationPlan, asOf: Date): TitrationLookupResult | TitrationFailure {
    const bad = this.validate(plan);
    if (bad) return bad;
    return {
      plan,
      asOf: asOf.toISOString(),
      active: activeStepOn(plan, asOf),
      dose: doseOn(plan, asOf),
      nextChange: nextDoseChange(plan, asOf),
      planDurationDays: planDurationDays(plan),
    };
  }

  timeline(
    plan: TitrationPlan,
    from: Date,
    to: Date,
  ): ReturnType<typeof planTimeline> | TitrationFailure {
    const bad = this.validate(plan);
    if (bad) return bad;
    if (to.getTime() < from.getTime()) {
      return { code: 'invalid_range', message: 'to must be on or after from' };
    }
    const span = (to.getTime() - from.getTime()) / 86_400_000;
    if (span > 366) {
      return { code: 'invalid_range', message: 'timeline window cannot exceed 366 days' };
    }
    return planTimeline(plan, from, to);
  }
}
