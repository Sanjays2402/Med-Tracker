import type { Schedule } from '@med/types';
import { expandSchedule } from './schedule';
import { addDays, startOfDay } from './date';

/**
 * Refill forecasting.
 *
 * Given a medication's current supply, dose-per-administration, and active
 * schedules, project the daily consumption rate, days of supply remaining, the
 * predicted run-out date, and a refill status level. Designed to be pure and
 * deterministic so it can run in the browser, the API, and the mobile app
 * without DB access.
 */

export type RefillStatus = 'ok' | 'soon' | 'urgent' | 'out';

export interface RefillForecastInput {
  medicationId: string;
  supplyRemaining: number;
  /** Units consumed per scheduled administration. Defaults to 1. */
  dosePerAdmin?: number;
  schedules: Schedule[];
  /** Days of supply at which the status escalates from ok to soon. Default 14. */
  soonThresholdDays?: number;
  /** Days of supply at which the status escalates to urgent. Default 5. */
  urgentThresholdDays?: number;
  /** How far ahead to project usage when estimating daily rate. Default 14. */
  horizonDays?: number;
}

export interface RefillForecast {
  medicationId: string;
  supplyRemaining: number;
  dailyUsage: number;
  daysOfSupply: number;
  runOutDate: string | null;
  refillByDate: string | null;
  status: RefillStatus;
  reason: string;
}

/**
 * Average daily consumption derived by expanding each enabled schedule over the
 * forecast horizon. Falls back to 0 for as-needed-only regimens.
 */
export function dailyUsageFromSchedules(
  schedules: Schedule[],
  now: Date,
  horizonDays: number,
  dosePerAdmin = 1,
): number {
  const to = addDays(startOfDay(now), horizonDays);
  let total = 0;
  for (const s of schedules) {
    if (!s.enabled) continue;
    total += expandSchedule(s, now, to).length * dosePerAdmin;
  }
  return total / horizonDays;
}

export function forecastRefill(input: RefillForecastInput, now: Date = new Date()): RefillForecast {
  const {
    medicationId,
    supplyRemaining,
    dosePerAdmin = 1,
    schedules,
    soonThresholdDays = 14,
    urgentThresholdDays = 5,
    horizonDays = 14,
  } = input;

  const dailyUsage = dailyUsageFromSchedules(schedules, now, horizonDays, dosePerAdmin);

  if (supplyRemaining <= 0) {
    return {
      medicationId,
      supplyRemaining,
      dailyUsage,
      daysOfSupply: 0,
      runOutDate: startOfDay(now).toISOString(),
      refillByDate: startOfDay(now).toISOString(),
      status: 'out',
      reason: 'No supply remaining.',
    };
  }

  if (dailyUsage <= 0) {
    return {
      medicationId,
      supplyRemaining,
      dailyUsage: 0,
      daysOfSupply: Infinity,
      runOutDate: null,
      refillByDate: null,
      status: 'ok',
      reason: 'As needed regimen; no scheduled daily usage.',
    };
  }

  const daysOfSupply = Math.floor(supplyRemaining / dailyUsage);
  const runOut = addDays(startOfDay(now), daysOfSupply);
  // Recommend refilling a few days before run-out, never in the past.
  const refillLead = Math.min(urgentThresholdDays, Math.max(2, Math.floor(urgentThresholdDays / 2)));
  const refillBy = addDays(runOut, -refillLead);
  const refillByDate = refillBy.getTime() < startOfDay(now).getTime() ? startOfDay(now).toISOString() : refillBy.toISOString();

  let status: RefillStatus;
  let reason: string;
  if (daysOfSupply <= urgentThresholdDays) {
    status = 'urgent';
    reason = `Only ${daysOfSupply} day${daysOfSupply === 1 ? '' : 's'} of supply remaining at current usage.`;
  } else if (daysOfSupply <= soonThresholdDays) {
    status = 'soon';
    reason = `Supply will last about ${daysOfSupply} days. Plan a refill this week.`;
  } else {
    status = 'ok';
    reason = `Supply will last about ${daysOfSupply} days.`;
  }

  return {
    medicationId,
    supplyRemaining,
    dailyUsage: Number(dailyUsage.toFixed(3)),
    daysOfSupply,
    runOutDate: runOut.toISOString(),
    refillByDate,
    status,
    reason,
  };
}

export function forecastMany(
  inputs: RefillForecastInput[],
  now: Date = new Date(),
): RefillForecast[] {
  return inputs
    .map((i) => forecastRefill(i, now))
    .sort((a, b) => {
      const order: Record<RefillStatus, number> = { out: 0, urgent: 1, soon: 2, ok: 3 };
      const d = order[a.status] - order[b.status];
      if (d !== 0) return d;
      return a.daysOfSupply - b.daysOfSupply;
    });
}
