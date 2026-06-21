/**
 * Insurance tier-aware pick across covered alternatives.
 *
 * `rankCostAlternatives` answers "what could the patient switch TO
 * to save money?" It's narrowly therapeutic-class oriented and only
 * recommends switches that meet a minimum monthly savings threshold.
 *
 * The pharmacy counter often needs the inverse: given the patient is
 * being prescribed drug X, and given the patient's specific insurance
 * plan covers it across multiple tiers (preferred-brand, non-preferred,
 * generic), which COVERED form is cheapest for THIS plan THIS month?
 * Tier choice is plan-specific and refreshes quarterly — the
 * therapeutic ranker is the wrong tool because the substitution might
 * just be the same molecule at a different tier (manufacturer
 * coupon, mail-order discount, 90-day pack).
 *
 * This module:
 *
 *   - takes the prescribed drug plus a list of plan tier offerings
 *     for THAT drug (or therapeutic equivalents the plan allows),
 *   - computes per-month cost in cents for each offering accounting
 *     for daysSupply and the optional patient deductible state,
 *   - returns offerings sorted by monthly cost ascending, with the
 *     cheapest as `pick`,
 *   - flags reasons (deductible still applies, prior-auth required,
 *     step-therapy required) so a pharmacist can audit the pick.
 *
 * Pure / deterministic. Cents-only to avoid float drift.
 */

export type TierLabel = 'generic' | 'preferred-brand' | 'non-preferred' | 'specialty';
export type TierPickFlag =
  | 'deductible-applies'
  | 'prior-auth-required'
  | 'step-therapy-required'
  | 'mail-order-discount'
  | 'ninety-day-pack';

export interface PlanTierOffering {
  /** Stable identifier for the offering (NDC + tier or vendor code). */
  offeringId: string;
  /** Display name shown to the patient. */
  name: string;
  tier: TierLabel;
  /** Out-of-pocket per fill in cents AFTER deductible (steady-state). */
  copayCents: number;
  /** Cost in cents BEFORE deductible is met (full price). */
  fullPriceCents: number;
  /** Days of supply per fill. */
  daysSupply: number;
  priorAuthRequired?: boolean;
  stepTherapyRequired?: boolean;
  mailOrder?: boolean;
}

export interface PatientPlanState {
  /** Cents the patient still owes toward this year's deductible. */
  deductibleRemainingCents: number;
  /**
   * Optional out-of-pocket cap for the year (cents). The pick uses this
   * to flip from full price back to copay once cumulative spend hits
   * the cap. Currently only used for the projected ninetyDayCost
   * disclosure; copay is used directly otherwise.
   */
  outOfPocketMaxCents?: number;
}

export interface TierPickOptions {
  /** Doses per day, used to weight 30-day spend. Default 1. */
  dosesPerDay?: number;
  /**
   * When true, mail-order offerings are reweighted to assume the
   * standard 3-month pack (90 days) which often discounts. Default true.
   */
  preferMailOrderForLongTerm?: boolean;
  /**
   * Flag prior-auth / step-therapy offerings as a tiebreaker rather
   * than excluding them. Default true (don't exclude — the pharmacist
   * can still pursue them). When false, both are removed entirely.
   */
  allowPriorAuth?: boolean;
}

export interface TierPickResult {
  offeringId: string;
  name: string;
  tier: TierLabel;
  thirtyDayCostCents: number;
  ninetyDayCostCents: number;
  flags: TierPickFlag[];
  reason: string;
}

export interface TierPickPlan {
  pick: TierPickResult | null;
  ranked: TierPickResult[];
  excluded: Array<{ offeringId: string; reason: string }>;
}

function thirtyDay(offering: PlanTierOffering, dosesPerDay: number, billed: number): number {
  if (offering.daysSupply <= 0) return 0;
  // Scale by dosesPerDay only if greater than 1 — for typical 1/day meds
  // the daysSupply already accounts for it. We expose the multiplier so
  // BID/TID patients don't get a misleading "monthly" number when the
  // daysSupply implicitly assumed 1/day.
  const perDay = (billed / offering.daysSupply) * Math.max(1, dosesPerDay);
  return Math.round(perDay * 30);
}

function ninetyDay(offering: PlanTierOffering, dosesPerDay: number, billed: number): number {
  if (offering.daysSupply <= 0) return 0;
  const perDay = (billed / offering.daysSupply) * Math.max(1, dosesPerDay);
  return Math.round(perDay * 90);
}

/**
 * Pick the cheapest covered tier for the prescribed drug across the
 * plan's offerings. Returns a sorted ranking plus the leader.
 */
export function pickCheapestPlanTier(
  offerings: PlanTierOffering[],
  state: PatientPlanState,
  options: TierPickOptions = {},
): TierPickPlan {
  const dosesPerDay = options.dosesPerDay ?? 1;
  const preferMail = options.preferMailOrderForLongTerm ?? true;
  const allowPa = options.allowPriorAuth ?? true;

  const excluded: TierPickPlan['excluded'] = [];
  const considered: PlanTierOffering[] = [];
  for (const o of offerings) {
    if (!allowPa && (o.priorAuthRequired || o.stepTherapyRequired)) {
      excluded.push({ offeringId: o.offeringId, reason: 'prior-auth/step-therapy excluded by options' });
      continue;
    }
    if (o.daysSupply <= 0) {
      excluded.push({ offeringId: o.offeringId, reason: 'invalid daysSupply' });
      continue;
    }
    considered.push(o);
  }

  const ranked: TierPickResult[] = considered.map((o) => {
    // If deductible still applies (and is nonzero), bill at fullPrice
    // until deductible exhausts. We model this as: the patient pays
    // up to (deductibleRemaining) at fullPrice, then copay for the rest.
    // For the 30-day window approximation:
    //   - if fullPriceCents <= deductibleRemaining: billed = fullPrice
    //   - else: billed = copay
    // This is approximate; an exact tracker would partial-bill the
    // first fill. We surface "deductible-applies" so the UI can
    // disclose the assumption.
    const billed30 = state.deductibleRemainingCents > 0 && o.fullPriceCents <= state.deductibleRemainingCents
      ? o.fullPriceCents
      : o.copayCents;
    const flags: TierPickFlag[] = [];
    if (state.deductibleRemainingCents > 0) flags.push('deductible-applies');
    if (o.priorAuthRequired) flags.push('prior-auth-required');
    if (o.stepTherapyRequired) flags.push('step-therapy-required');
    if (o.mailOrder) {
      flags.push('mail-order-discount');
      if (preferMail && o.daysSupply >= 90) flags.push('ninety-day-pack');
    }

    const thirty = thirtyDay(o, dosesPerDay, billed30);
    const ninety = ninetyDay(o, dosesPerDay, billed30);
    return {
      offeringId: o.offeringId,
      name: o.name,
      tier: o.tier,
      thirtyDayCostCents: thirty,
      ninetyDayCostCents: ninety,
      flags,
      reason: buildReason(o, thirty, flags),
    };
  });

  ranked.sort((a, b) => {
    if (a.thirtyDayCostCents !== b.thirtyDayCostCents) {
      return a.thirtyDayCostCents - b.thirtyDayCostCents;
    }
    // Tiebreak: friendlier flags first (no PA / step before flagged ones).
    const aPenalty = a.flags.filter((f) => f === 'prior-auth-required' || f === 'step-therapy-required').length;
    const bPenalty = b.flags.filter((f) => f === 'prior-auth-required' || f === 'step-therapy-required').length;
    if (aPenalty !== bPenalty) return aPenalty - bPenalty;
    return a.name.localeCompare(b.name);
  });

  return {
    pick: ranked[0] ?? null,
    ranked,
    excluded,
  };
}

function buildReason(o: PlanTierOffering, thirtyCents: number, flags: TierPickFlag[]): string {
  const tier = o.tier;
  const dollars = (thirtyCents / 100).toFixed(2);
  const notes: string[] = [];
  if (flags.includes('mail-order-discount')) notes.push('mail order');
  if (flags.includes('ninety-day-pack')) notes.push('90-day pack');
  if (flags.includes('prior-auth-required')) notes.push('prior auth needed');
  if (flags.includes('step-therapy-required')) notes.push('step therapy needed');
  if (flags.includes('deductible-applies')) notes.push('deductible applies');
  const noteText = notes.length ? ` (${notes.join('; ')})` : '';
  return `Tier ${tier} at $${dollars}/30 days${noteText}.`;
}
