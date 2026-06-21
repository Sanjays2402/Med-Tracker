/**
 * Annual refill cost projector for the whole regimen.
 *
 * For chronic regimens, "how much will I spend on meds this year?" is a
 * top question for both patients and caregiver dashboards. The
 * existing cost utilities answer per-medication "switch saves $X/mo"
 * (cost-alternatives) or per-tier cheapest-pick (insurance-tier-pick).
 * This module composes them into the calendar-year picture:
 *
 *   - copay per fill,
 *   - refill cadence in days (driven by daysSupply),
 *   - number of fills in the projection window (default 12 months
 *     from today, but any [from, to] window is supported),
 *   - optional plan-change cut-over: before `planChangeDate` use the
 *     old plan's copay; on and after, use the new plan's copay,
 *   - per-medication AND regimen total, in cents to avoid float drift.
 *
 * The projector returns a `RefillCostProjection` per medication and a
 * `RegimenCostProjection` summary. The summary also exposes the
 * marginal saving from a plan change so the UI can render
 * "Switching plans on Jan 1 saves $246 over the next 12 months."
 *
 * Pure / deterministic. No I/O.
 */

import { addDays } from './date';

/**
 * A single medication's refill profile.
 *
 * `firstFillAt` anchors the cadence: subsequent fills are spaced by
 * `daysSupply`. If omitted, the projector assumes the next fill is on
 * the window start.
 */
export interface MedicationCostProfile {
  medicationId: string;
  name: string;
  /** Copay per fill in cents (current plan). */
  copayCents: number;
  /** Days the fill is intended to cover. */
  daysSupply: number;
  /** When the most recent fill happened. ISO date or Date. */
  firstFillAt?: string | Date;
  /** True if the medication should be excluded (paused, discontinued). */
  inactive?: boolean;
}

/** Optional plan change applied at a calendar cut-over date. */
export interface PlanChange {
  /** Date the new plan takes effect (inclusive). */
  effectiveAt: string | Date;
  /**
   * New per-medication copays in cents, keyed by medicationId. Any
   * medication NOT in this map continues to use its current copay
   * (e.g. unchanged on the new formulary).
   */
  copayOverridesCents: Record<string, number>;
}

export interface RefillCostInput {
  medications: MedicationCostProfile[];
  /** Window start (inclusive). Default new Date(). */
  from?: Date;
  /** Window end (inclusive). Default `from` + 365 days. */
  to?: Date;
  /** Optional plan-change cut-over. */
  planChange?: PlanChange;
}

export interface FillEvent {
  /** ISO date (YYYY-MM-DD) of the projected fill. */
  filledOn: string;
  /** Copay in cents charged for this fill (post any plan change). */
  copayCents: number;
}

export interface RefillCostProjection {
  medicationId: string;
  name: string;
  /** Number of projected fills inside the window. */
  fillCount: number;
  /** Days between fills (== daysSupply, exposed for the UI). */
  cadenceDays: number;
  /** Total spent on this medication in cents over the window. */
  totalCents: number;
  /** Pre-plan-change spend in cents (0 when no plan change). */
  preChangeCents: number;
  /** Post-plan-change spend in cents (== totalCents when no plan change). */
  postChangeCents: number;
  /** Per-fill schedule, including the copay applied to each. */
  fills: FillEvent[];
}

export interface RegimenCostProjection {
  windowStart: string;
  windowEnd: string;
  perMedication: RefillCostProjection[];
  /** Sum across all medications, cents. */
  totalCents: number;
  /** What the regimen WOULD have cost without the plan change. */
  totalCentsWithoutPlanChange: number;
  /** Savings from the plan change (negative = the new plan is worse). */
  planChangeSavingsCents: number;
  /** Number of medications skipped because inactive=true. */
  inactiveCount: number;
}

const MS_DAY = 86_400_000;

function asDate(v: string | Date | undefined, fallback: Date): Date {
  if (!v) return fallback;
  const d = v instanceof Date ? new Date(v) : new Date(v);
  if (Number.isNaN(d.getTime())) return fallback;
  return d;
}

function toIsoDate(d: Date): string {
  // YYYY-MM-DD slice avoids timezone-shifted output.
  return d.toISOString().slice(0, 10);
}

function copayFor(
  med: MedicationCostProfile,
  fillDate: Date,
  planChange: PlanChange | undefined,
  planChangeMs: number | null,
): number {
  if (planChange && planChangeMs !== null && fillDate.getTime() >= planChangeMs) {
    const override = planChange.copayOverridesCents[med.medicationId];
    if (override !== undefined) return override;
  }
  return med.copayCents;
}

function projectMedication(
  med: MedicationCostProfile,
  from: Date,
  to: Date,
  planChange: PlanChange | undefined,
  planChangeMs: number | null,
): RefillCostProjection {
  const out: RefillCostProjection = {
    medicationId: med.medicationId,
    name: med.name,
    fillCount: 0,
    cadenceDays: med.daysSupply,
    totalCents: 0,
    preChangeCents: 0,
    postChangeCents: 0,
    fills: [],
  };

  if (med.daysSupply <= 0) return out;
  if (med.copayCents < 0) return out;

  // Anchor: if firstFillAt is in the past, walk forward by daysSupply
  // until we are at or after `from`. If firstFillAt is in the future,
  // use it directly. If absent, assume the next fill is on `from`.
  const anchor = asDate(med.firstFillAt, from);
  let cursor: Date;
  if (anchor.getTime() >= from.getTime()) {
    cursor = new Date(anchor);
  } else {
    const elapsedDays = Math.floor((from.getTime() - anchor.getTime()) / MS_DAY);
    const stepsBehind = Math.floor(elapsedDays / med.daysSupply);
    const stepsToCatchUp = stepsBehind + 1;
    cursor = addDays(anchor, stepsToCatchUp * med.daysSupply);
    if (cursor.getTime() < from.getTime()) {
      cursor = addDays(cursor, med.daysSupply);
    }
  }

  while (cursor.getTime() <= to.getTime()) {
    const copay = copayFor(med, cursor, planChange, planChangeMs);
    out.fills.push({ filledOn: toIsoDate(cursor), copayCents: copay });
    out.fillCount += 1;
    out.totalCents += copay;
    if (planChangeMs !== null && cursor.getTime() < planChangeMs) {
      out.preChangeCents += copay;
    } else {
      out.postChangeCents += copay;
    }
    cursor = addDays(cursor, med.daysSupply);
  }

  return out;
}

/**
 * Project refill costs across the regimen for a calendar window.
 *
 * `from` defaults to today (start of day), `to` defaults to `from`
 * plus 365 days. Inactive medications are skipped but counted in
 * `inactiveCount`.
 */
export function projectRefillCosts(input: RefillCostInput): RegimenCostProjection {
  const now = new Date();
  const from = input.from ?? new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const to = input.to ?? addDays(from, 365);
  if (to.getTime() < from.getTime()) {
    throw new Error('projectRefillCosts: `to` must be on or after `from`');
  }
  const planChange = input.planChange;
  const planChangeMs = planChange ? asDate(planChange.effectiveAt, from).getTime() : null;

  const active = input.medications.filter((m) => !m.inactive);
  const inactiveCount = input.medications.length - active.length;
  const perMedication = active.map((m) =>
    projectMedication(m, from, to, planChange, planChangeMs),
  );

  const totalCents = perMedication.reduce((s, p) => s + p.totalCents, 0);

  // Phantom run without the plan change so we can compute savings cleanly.
  let totalCentsWithoutPlanChange = totalCents;
  if (planChange) {
    const withoutPlan = active.map((m) =>
      projectMedication(m, from, to, undefined, null),
    );
    totalCentsWithoutPlanChange = withoutPlan.reduce((s, p) => s + p.totalCents, 0);
  }

  return {
    windowStart: toIsoDate(from),
    windowEnd: toIsoDate(to),
    perMedication,
    totalCents,
    totalCentsWithoutPlanChange,
    planChangeSavingsCents: totalCentsWithoutPlanChange - totalCents,
    inactiveCount,
  };
}

/** Convert cents to a US-dollar display string like "$1,234.56". */
export function formatCentsUsd(cents: number): string {
  const dollars = cents / 100;
  return dollars.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Human-readable one-line summary for the dashboard banner:
 *   "Projected $4,128 over 12 months across 6 medications (saves $246 with plan change)."
 */
export function summarizeRegimenCost(projection: RegimenCostProjection): string {
  const months = Math.round(
    ((Date.parse(projection.windowEnd) - Date.parse(projection.windowStart)) / MS_DAY) / 30,
  );
  const monthsLabel = months <= 0 ? 'this window' : `${months} month${months === 1 ? '' : 's'}`;
  const medCount = projection.perMedication.length;
  const head = `Projected ${formatCentsUsd(projection.totalCents)} over ${monthsLabel} across ${medCount} medication${medCount === 1 ? '' : 's'}`;
  if (projection.planChangeSavingsCents > 0) {
    return `${head} (saves ${formatCentsUsd(projection.planChangeSavingsCents)} with plan change).`;
  }
  if (projection.planChangeSavingsCents < 0) {
    return `${head} (plan change costs ${formatCentsUsd(-projection.planChangeSavingsCents)} more).`;
  }
  return `${head}.`;
}
