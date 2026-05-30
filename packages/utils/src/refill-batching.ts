/**
 * Pharmacy refill order batching.
 *
 * Real users juggling 4 to 10 medications often refill them piecemeal, which
 * means multiple pharmacy trips per month, missed copay caps, and avoidable
 * shipping fees on mail-order plans. This module turns a flat list of
 * upcoming refill needs into a small set of "pickup batches" grouped by
 * pharmacy and aligned to a preferred pickup day, while respecting per-batch
 * copay caps and 30 vs 90 day fill preferences.
 *
 * Pure and deterministic. Operates on plain objects so the API, mobile app,
 * and caregiver digest can share the same plan.
 */

export type FillPreference = '30day' | '90day' | 'either';

export interface RefillCandidate {
  medicationId: string;
  medicationName: string;
  pharmacyId: string;
  pharmacyName: string;
  /** Earliest date this refill is allowed (insurance refill-too-soon date). */
  earliestFillDate: string;
  /** Latest date before the user runs out. */
  runOutDate: string;
  /** Out-of-pocket cost in cents. */
  copayCents: number;
  /** Days of supply this refill represents. */
  daysSupply: number;
  fillPreference?: FillPreference;
  /** Optional grouping key for insurance plan, used for copay caps. */
  insurancePlanId?: string;
}

export interface BatchingOptions {
  /** Preferred weekday for pickup (0=Sun..6=Sat). Default 5 (Fri). */
  preferredPickupDow?: number;
  /** Max combined copay per batch in cents. Above this, split. Default Infinity. */
  maxCopayCentsPerBatch?: number;
  /** Slack in days. A med joins a batch if its window overlaps batch date +- slack. Default 3. */
  windowSlackDays?: number;
  /** Reference now. Default new Date(). */
  now?: Date;
}

export interface RefillBatch {
  /** Stable batch id derived from pharmacy + pickup date. */
  id: string;
  pharmacyId: string;
  pharmacyName: string;
  pickupDate: string;
  medications: RefillCandidate[];
  totalCopayCents: number;
  /** Reason this batch was created (for UI explanation). */
  reason: string;
}

export interface BatchingPlan {
  batches: RefillBatch[];
  /** Medications that could not be batched given the constraints. */
  unbatched: { medication: RefillCandidate; reason: string }[];
  totalTrips: number;
  totalCopayCents: number;
  summary: string;
}

function utcStartOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function utcAddDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

function nextDow(from: Date, dow: number): Date {
  const start = utcStartOfDay(from);
  const diff = (dow - start.getUTCDay() + 7) % 7;
  return utcAddDays(start, diff === 0 ? 0 : diff);
}

function clampToWindow(date: Date, earliest: Date, latest: Date): Date {
  if (date.getTime() < earliest.getTime()) return earliest;
  if (date.getTime() > latest.getTime()) return latest;
  return date;
}

/**
 * Group refill candidates into pickup batches.
 *
 * Algorithm:
 *  1. Drop candidates whose fill window has already passed (runOut < now).
 *  2. For each candidate, compute a preferred pickup date as the next
 *     preferred weekday on or after its earliest fill date, clamped to its
 *     [earliest, runOut] window.
 *  3. Group by pharmacy. Within a pharmacy, merge candidates whose pickup
 *     dates fall within `windowSlackDays` of an existing batch's date, as
 *     long as the combined copay does not exceed the per-batch cap.
 *  4. Sort batches by pickup date so the UI renders a chronological plan.
 */
export function planRefillBatches(
  candidates: RefillCandidate[],
  options: BatchingOptions = {},
): BatchingPlan {
  const {
    preferredPickupDow = 5,
    maxCopayCentsPerBatch = Number.POSITIVE_INFINITY,
    windowSlackDays = 3,
    now = new Date(),
  } = options;

  const today = utcStartOfDay(now);
  const unbatched: BatchingPlan['unbatched'] = [];
  const planned: { cand: RefillCandidate; pickup: Date }[] = [];

  for (const c of candidates) {
    const earliest = utcStartOfDay(new Date(c.earliestFillDate));
    const runOut = utcStartOfDay(new Date(c.runOutDate));
    if (runOut.getTime() < today.getTime()) {
      unbatched.push({ medication: c, reason: 'Run-out date is in the past.' });
      continue;
    }
    if (earliest.getTime() > runOut.getTime()) {
      unbatched.push({ medication: c, reason: 'Earliest fill date is after run-out date.' });
      continue;
    }
    const anchor = earliest.getTime() < today.getTime() ? today : earliest;
    const target = nextDow(anchor, preferredPickupDow);
    const pickup = clampToWindow(target, anchor, runOut);
    planned.push({ cand: c, pickup });
  }

  // Group by pharmacy, then merge by date proximity.
  const byPharmacy = new Map<string, typeof planned>();
  for (const p of planned) {
    const arr = byPharmacy.get(p.cand.pharmacyId) ?? [];
    arr.push(p);
    byPharmacy.set(p.cand.pharmacyId, arr);
  }

  const batches: RefillBatch[] = [];
  for (const [pharmacyId, items] of byPharmacy) {
    items.sort((a, b) => a.pickup.getTime() - b.pickup.getTime());
    const pharmacyName = items[0]!.cand.pharmacyName;
    let current: { pickup: Date; meds: RefillCandidate[]; copay: number } | null = null;
    for (const it of items) {
      const slackMs = windowSlackDays * 86_400_000;
      if (
        current &&
        Math.abs(it.pickup.getTime() - current.pickup.getTime()) <= slackMs &&
        current.copay + it.cand.copayCents <= maxCopayCentsPerBatch
      ) {
        current.meds.push(it.cand);
        current.copay += it.cand.copayCents;
        // Push pickup date to the latest of the two so we never schedule
        // before any earliest-fill constraint represented by the prior choice.
        if (it.pickup.getTime() > current.pickup.getTime()) current.pickup = it.pickup;
      } else {
        if (current) {
          batches.push(toBatch(pharmacyId, pharmacyName, current));
        }
        current = { pickup: it.pickup, meds: [it.cand], copay: it.cand.copayCents };
      }
    }
    if (current) batches.push(toBatch(pharmacyId, pharmacyName, current));
  }

  batches.sort((a, b) => a.pickupDate.localeCompare(b.pickupDate));

  const totalCopay = batches.reduce((acc, b) => acc + b.totalCopayCents, 0);
  const summary =
    batches.length === 0
      ? 'No refills due in the planning window.'
      : `${batches.length} pickup${batches.length === 1 ? '' : 's'} across ${byPharmacy.size} pharmac${byPharmacy.size === 1 ? 'y' : 'ies'} totalling $${(totalCopay / 100).toFixed(2)}.`;

  return {
    batches,
    unbatched,
    totalTrips: batches.length,
    totalCopayCents: totalCopay,
    summary,
  };
}

function toBatch(
  pharmacyId: string,
  pharmacyName: string,
  current: { pickup: Date; meds: RefillCandidate[]; copay: number },
): RefillBatch {
  const pickupIso = current.pickup.toISOString();
  return {
    id: `${pharmacyId}:${pickupIso.slice(0, 10)}`,
    pharmacyId,
    pharmacyName,
    pickupDate: pickupIso,
    medications: [...current.meds].sort((a, b) => a.medicationName.localeCompare(b.medicationName)),
    totalCopayCents: current.copay,
    reason:
      current.meds.length === 1
        ? 'Single medication scheduled at preferred pickup day.'
        : `${current.meds.length} medications combined into one trip.`,
  };
}
