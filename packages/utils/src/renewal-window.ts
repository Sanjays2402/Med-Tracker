/**
 * Prescription renewal-window planner.
 *
 * U.S. payers usually require a Rx to be (75-90)% consumed before they
 * will pay for a refill. Pharmacies enforce this by refusing to release
 * the next fill until the patient has burned through enough of the prior
 * fill, leaving them at risk of running out.
 *
 * Given:
 *   - the date the current fill was dispensed,
 *   - the days-supply on that fill,
 *   - the payer's required percent consumed (default 75% commercial),
 *   - units remaining and units per day,
 *
 * computeRenewalWindow returns:
 *   - the earliest date the payer will reimburse a refill,
 *   - whether the patient is already eligible,
 *   - projected days of supply still on hand,
 *   - a "refill gap" estimate: days between projected stockout and earliest
 *     eligible fill (positive => patient will run out before insurance pays;
 *     prescriber needs an early-fill override).
 *
 * Pure / deterministic / timezone-naive on whole-day boundaries.
 */

/**
 * Parse a date-only ISO string (YYYY-MM-DD) or full ISO into a calendar
 * day anchored at UTC midnight. We anchor at UTC because pharmacy benefit
 * adjudication is a date-only contract (no time-of-day), and the same
 * fill-date must mean the same thing regardless of where the patient or
 * server happens to live.
 */
function utcDay(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, mo, d] = value.split('-').map(Number);
    return new Date(Date.UTC(y!, mo! - 1, d!));
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return d;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function utcDayFromInstant(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addUtcDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

function diffUtcDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface RenewalWindowInput {
  medicationId: string;
  /** ISO date (YYYY-MM-DD or full ISO) the current fill was dispensed. */
  filledOn: string;
  /** Days-supply written on the dispensed fill. */
  daysSupply: number;
  /** Units left in hand. */
  unitsRemaining: number;
  /** Units consumed per calendar day at the prescribed regimen. */
  unitsPerDay: number;
  /**
   * Fraction of the fill that must be used before the payer will pay
   * again. 0.75 = 75% (common commercial), 0.85-0.90 for Medicare Part D
   * controlled substances. Defaults to 0.75.
   */
  payerConsumedRatio?: number;
  /** Reference "today". Defaults to new Date(). */
  now?: Date;
}

export type RenewalEligibility = 'eligible' | 'too-early' | 'overdue';

export interface RenewalWindow {
  medicationId: string;
  /** ISO date the patient first becomes eligible for a payer-covered refill. */
  earliestEligibleDate: string;
  /** ISO date the patient is projected to run out of stock. */
  projectedStockoutDate: string;
  /** Days of supply remaining at the prescribed rate. */
  daysOfSupplyOnHand: number;
  /**
   * Days between projected stockout and earliest eligible fill.
   *  > 0 = patient runs out before insurance pays (gap).
   *  < 0 = eligible before stockout (safe).
   *  = 0 = exactly aligned.
   */
  refillGapDays: number;
  eligibility: RenewalEligibility;
  /**
   * Strict payer view: "true" if a refill submitted right now would be
   * paid. This is a function of dispensed-on + days-supply only, the
   * standard pharmacy benefit math (no behind-the-scenes inventory).
   */
  payerWouldCoverNow: boolean;
  reason: string;
}

function clampRatio(r: number): number {
  if (!Number.isFinite(r)) return 0.75;
  if (r < 0) return 0;
  if (r > 1) return 1;
  return r;
}

export function computeRenewalWindow(input: RenewalWindowInput): RenewalWindow {
  if (input.daysSupply <= 0) throw new Error('daysSupply must be positive');
  if (input.unitsPerDay < 0) throw new Error('unitsPerDay must be non-negative');
  if (input.unitsRemaining < 0) throw new Error('unitsRemaining must be non-negative');

  const now = utcDayFromInstant(input.now ?? new Date());
  const filled = utcDay(input.filledOn);
  if (Number.isNaN(filled.getTime())) throw new Error('filledOn is not a valid date');

  const ratio = clampRatio(input.payerConsumedRatio ?? 0.75);

  // Payer eligibility: earliestEligible = filledOn + ceil(daysSupply * ratio).
  // Pharmacies typically round up; we follow suit so we never claim earlier
  // than the payer's adjudication system would allow.
  const consumedDaysRequired = Math.ceil(input.daysSupply * ratio);
  const earliestEligible = addUtcDays(filled, consumedDaysRequired);

  // Stockout projection: days-of-supply on hand = unitsRemaining / unitsPerDay.
  // When unitsPerDay == 0 the regimen is as-needed and there is no stockout.
  let daysOfSupplyOnHand: number;
  let projectedStockout: Date;
  if (input.unitsPerDay === 0) {
    daysOfSupplyOnHand = Number.POSITIVE_INFINITY;
    projectedStockout = addUtcDays(now, 365 * 10);
  } else {
    daysOfSupplyOnHand = Math.floor(input.unitsRemaining / input.unitsPerDay);
    projectedStockout = addUtcDays(now, daysOfSupplyOnHand);
  }

  const refillGapDays = diffUtcDays(earliestEligible, projectedStockout);

  let eligibility: RenewalEligibility;
  if (now.getTime() >= earliestEligible.getTime()) {
    eligibility = 'eligible';
  } else {
    eligibility = 'too-early';
  }
  // Overdue: zero stock right now, or projected stockout is in the past.
  if (input.unitsPerDay > 0 && projectedStockout.getTime() <= now.getTime()) {
    eligibility = 'overdue';
  }

  const payerWouldCoverNow = eligibility === 'eligible' || eligibility === 'overdue';

  let reason: string;
  if (eligibility === 'overdue') {
    reason = 'Stockout already passed; submit refill immediately.';
  } else if (eligibility === 'eligible') {
    if (refillGapDays > 0) {
      reason = `Eligible now; would otherwise have run out in ${daysOfSupplyOnHand} day${daysOfSupplyOnHand === 1 ? '' : 's'}.`;
    } else {
      reason = 'Eligible now; safe to refill.';
    }
  } else if (refillGapDays > 0) {
    const daysUntilEligible = Math.abs(diffUtcDays(earliestEligible, now));
    reason = `Refill not payable for ${daysUntilEligible} more day${daysUntilEligible === 1 ? '' : 's'}; projected to be short by ${refillGapDays} day${refillGapDays === 1 ? '' : 's'}. Consider an early-fill override.`;
  } else {
    reason = `Refill payable on ${isoDate(earliestEligible)}; current supply covers the gap.`;
  }

  return {
    medicationId: input.medicationId,
    earliestEligibleDate: isoDate(earliestEligible),
    projectedStockoutDate: input.unitsPerDay === 0 ? '' : isoDate(projectedStockout),
    daysOfSupplyOnHand: input.unitsPerDay === 0 ? Number.POSITIVE_INFINITY : daysOfSupplyOnHand,
    refillGapDays: input.unitsPerDay === 0 ? Number.NEGATIVE_INFINITY : refillGapDays,
    eligibility,
    payerWouldCoverNow,
    reason,
  };
}

/**
 * Bulk renewal-window evaluation. Returns gaps ranked worst-first:
 * `overdue` then `eligible-with-gap` then `too-early-with-gap` then safe.
 */
export function rankRenewalGaps(
  inputs: RenewalWindowInput[],
): RenewalWindow[] {
  const out = inputs.map((i) => computeRenewalWindow(i));
  const priority: Record<RenewalEligibility, number> = {
    overdue: 0,
    'too-early': 1,
    eligible: 2,
  };
  return out.sort((a, b) => {
    const dp = priority[a.eligibility] - priority[b.eligibility];
    if (dp !== 0) return dp;
    return b.refillGapDays - a.refillGapDays;
  });
}
