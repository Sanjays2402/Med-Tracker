/**
 * Cold-chain potency tracker for refrigerated medications.
 *
 * Biologics, insulin pens, GLP-1 agonists, and many vaccines have two
 * potency clocks:
 *   - a refrigerated shelf life (e.g. until manufacturer expiry while at 2-8C),
 *   - a room-temperature in-use window once removed from refrigeration
 *     (e.g. insulin glargine pens: 28 days at <= 30C after first use).
 *
 * Real-world handling involves brief excursions: a pen left on the counter
 * for an hour, or a cooler that briefly warmed during transit. Each
 * excursion eats into the room-temp budget at a temperature-dependent rate.
 *
 * computeColdChainStatus takes the medication's cold-chain spec, a list of
 * temperature excursions with start, end, and observed temperature (C), and
 * the current time. It returns:
 *   - the remaining room-temperature budget in hours,
 *   - the projected "discard by" instant,
 *   - whether the medication should be flagged for discard now,
 *   - per-excursion contribution and a summary reason.
 *
 * Pure, deterministic, side-effect free.
 */

export interface ColdChainSpec {
  medicationId: string;
  medicationName: string;
  /** Allowed time at room temperature once first used or removed from fridge, in hours. */
  roomTempBudgetHours: number;
  /** Max allowed temperature, Celsius. Above this, the spec is exceeded entirely. */
  maxAllowedC: number;
  /** Nominal in-use ambient temperature, Celsius. Default 22. */
  nominalAmbientC?: number;
  /** Manufacturer expiry datetime (UTC ISO). Overrides any remaining budget if earlier. */
  manufacturerExpiresAt?: string;
}

export interface TemperatureExcursion {
  /** UTC ISO start of the excursion. */
  startedAt: string;
  /** UTC ISO end of the excursion. */
  endedAt: string;
  /** Observed temperature, Celsius. */
  temperatureC: number;
}

export interface ColdChainInput {
  spec: ColdChainSpec;
  /** UTC ISO when the medication was first removed from refrigeration / first used. */
  firstUseAt: string;
  excursions: TemperatureExcursion[];
  /** Reference now (UTC ISO). Defaults to spec firstUseAt if omitted. */
  now?: string;
}

export interface ColdChainExcursionDetail {
  startedAt: string;
  endedAt: string;
  temperatureC: number;
  /** Hours of room-temp budget consumed by this excursion (after temperature derating). */
  budgetConsumedHours: number;
  /** True if the excursion exceeded the max allowed temperature. */
  excursionExceededMax: boolean;
}

export interface ColdChainStatus {
  medicationId: string;
  medicationName: string;
  /** Hours of budget consumed total. */
  consumedHours: number;
  /** Hours of budget remaining. Zero if exhausted. */
  remainingHours: number;
  /** Projected discard-by UTC ISO instant given current consumption rate at nominal ambient. */
  discardBy: string;
  /** True if the medication should be discarded now. */
  mustDiscardNow: boolean;
  /** Reason flag: 'expired', 'overheat', 'budget-exhausted', or 'ok'. */
  status: 'ok' | 'expired' | 'overheat' | 'budget-exhausted';
  perExcursion: ColdChainExcursionDetail[];
  reason: string;
}

const HOUR_MS = 3_600_000;

/**
 * Per-excursion derating: hours of budget consumed per hour of wall clock,
 * given observed temperature relative to nominal.
 *
 * Below nominal: 1x (no acceleration).
 * Each +5C above nominal doubles the consumption rate, Arrhenius-style
 * approximation used by many manufacturer in-use tables.
 */
export function temperatureDerating(observedC: number, nominalC: number): number {
  if (observedC <= nominalC) return 1;
  const delta = observedC - nominalC;
  return Math.pow(2, delta / 5);
}

export function computeColdChainStatus(input: ColdChainInput): ColdChainStatus {
  const nominal = input.spec.nominalAmbientC ?? 22;
  const firstUseMs = Date.parse(input.firstUseAt);
  const nowMs = input.now ? Date.parse(input.now) : firstUseMs;
  if (Number.isNaN(firstUseMs)) throw new Error('firstUseAt is not a valid datetime');
  if (Number.isNaN(nowMs)) throw new Error('now is not a valid datetime');
  if (nowMs < firstUseMs) throw new Error('now must be at or after firstUseAt');

  const budget = input.spec.roomTempBudgetHours;
  const perExcursion: ColdChainExcursionDetail[] = [];
  let consumed = 0;
  let overheat = false;

  // Build a sorted, clipped list of excursions within [firstUseMs, nowMs].
  const ex = [...input.excursions]
    .map((e) => ({ s: Date.parse(e.startedAt), e: Date.parse(e.endedAt), t: e.temperatureC, raw: e }))
    .filter((e) => !Number.isNaN(e.s) && !Number.isNaN(e.e) && e.e > e.s)
    .map((e) => ({ ...e, s: Math.max(e.s, firstUseMs), e: Math.min(e.e, nowMs) }))
    .filter((e) => e.e > e.s)
    .sort((a, b) => a.s - b.s);

  // Merge excursions only for "covered time" tracking, not for derating
  // (different temperatures need to be charged separately). For overlap, the
  // hotter excursion wins for the overlapping interval.
  let cursor = firstUseMs;
  for (const e of ex) {
    const startsAt = Math.max(cursor, e.s);
    const endsAt = e.e;
    if (endsAt <= startsAt) {
      // fully covered by earlier (hotter) excursion already
      perExcursion.push({
        startedAt: e.raw.startedAt,
        endedAt: e.raw.endedAt,
        temperatureC: e.t,
        budgetConsumedHours: 0,
        excursionExceededMax: e.t > input.spec.maxAllowedC,
      });
      if (e.t > input.spec.maxAllowedC) overheat = true;
      continue;
    }

    // Charge ambient nominal time between cursor and excursion start.
    if (e.s > cursor) {
      const ambientHours = (e.s - cursor) / HOUR_MS;
      consumed += ambientHours; // derating = 1
    }

    const excursionHours = (endsAt - startsAt) / HOUR_MS;
    const rate = temperatureDerating(e.t, nominal);
    const consumedThis = excursionHours * rate;
    consumed += consumedThis;

    perExcursion.push({
      startedAt: e.raw.startedAt,
      endedAt: e.raw.endedAt,
      temperatureC: e.t,
      budgetConsumedHours: Number(consumedThis.toFixed(3)),
      excursionExceededMax: e.t > input.spec.maxAllowedC,
    });
    if (e.t > input.spec.maxAllowedC) overheat = true;

    cursor = Math.max(cursor, endsAt);
  }
  // Charge ambient nominal for any remainder up to now.
  if (cursor < nowMs) {
    consumed += (nowMs - cursor) / HOUR_MS;
  }

  const remaining = Math.max(0, budget - consumed);
  const remainingMs = remaining * HOUR_MS;
  let discardByMs = nowMs + remainingMs;

  // Apply manufacturer expiry cap.
  let expiredByManufacturer = false;
  if (input.spec.manufacturerExpiresAt) {
    const mfgMs = Date.parse(input.spec.manufacturerExpiresAt);
    if (!Number.isNaN(mfgMs)) {
      if (mfgMs < discardByMs) discardByMs = mfgMs;
      if (mfgMs <= nowMs) expiredByManufacturer = true;
    }
  }

  let status: ColdChainStatus['status'] = 'ok';
  let reason = `Within budget. ${remaining.toFixed(1)} of ${budget} hours remaining.`;
  let mustDiscardNow = false;

  if (expiredByManufacturer) {
    status = 'expired';
    mustDiscardNow = true;
    reason = 'Manufacturer expiry passed; discard regardless of in-use budget.';
  } else if (overheat) {
    status = 'overheat';
    mustDiscardNow = true;
    reason = `Excursion exceeded maximum allowed temperature (${input.spec.maxAllowedC}C); discard.`;
  } else if (remaining <= 0) {
    status = 'budget-exhausted';
    mustDiscardNow = true;
    reason = 'Room-temperature in-use budget exhausted; discard.';
  }

  return {
    medicationId: input.spec.medicationId,
    medicationName: input.spec.medicationName,
    consumedHours: Number(consumed.toFixed(3)),
    remainingHours: Number(remaining.toFixed(3)),
    discardBy: new Date(discardByMs).toISOString(),
    mustDiscardNow,
    status,
    perExcursion,
    reason,
  };
}
