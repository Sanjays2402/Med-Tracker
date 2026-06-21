/**
 * Inventory low-stock forecast.
 *
 * `inventory-ledger.ts` exposes per-lot availability (units, expiry,
 * recall status) at a snapshot. `refill-forecast.ts` projects daily
 * usage from active schedules. The dashboard wants the JOIN: given my
 * current lots and my schedule, when does each MEDICATION run out
 * (date, not just days-of-supply)? And — more usefully — when does
 * each LOT run out, so the patient can plan refills before the last
 * lot expires unused.
 *
 * Why a separate module instead of extending refill-forecast?
 * refill-forecast operates on a single `supplyRemaining` integer; it
 * has no concept of lots, expirations, or recalls. Lots that EXPIRE
 * before the patient reaches them are not really inventory — folding
 * them into supplyRemaining would inflate days-of-supply and silently
 * push a refill past the safe window. This module:
 *
 *   1. Walks lots in FEFO order using inventory-ledger's snapshot.
 *   2. Subtracts the lot's units from a running "days remaining"
 *      cursor using the schedule-derived daily usage rate.
 *   3. Caps each lot at its expiry boundary — if a 30-day lot expires
 *      in 15 days and the patient uses 2 units/day, only 30 of those
 *      units could be consumed (since 2*15=30), the rest (0) wastes.
 *   4. Reports the cumulative run-out date for the medication AND a
 *      per-lot "consumed until" date so the UI can render a stack
 *      bar showing which lot the patient is currently working through.
 *
 * Composes with refill-forecast.dailyUsageFromSchedules() — does NOT
 * duplicate the schedule-expansion math.
 *
 * Pure / deterministic. No I/O.
 */

import type { Schedule } from '@med/types';
import { addDays, startOfDay } from './date';
import {
  summarizeLots,
  type LedgerState,
  type LotStatus,
} from './inventory-ledger';
import { dailyUsageFromSchedules } from './refill-forecast';

export interface ForecastLotInput {
  medicationId: string;
  schedules: Schedule[];
  /** Units consumed per scheduled administration. Defaults to 1. */
  dosePerAdmin?: number;
  /**
   * Days-of-supply at which the status escalates from ok to soon.
   * Default 14.
   */
  soonThresholdDays?: number;
  /** Days-of-supply at which the status escalates to urgent. Default 5. */
  urgentThresholdDays?: number;
  /** Horizon for the schedule's daily-usage estimate. Default 14. */
  horizonDays?: number;
}

export interface LotProjection {
  lotNumber: string;
  expiresOn: string;
  receivedUnits: number;
  remainingUnits: number;
  /** Units we expect to consume from this lot before expiry. */
  unitsConsumed: number;
  /** Units that will expire UNUSED inside this lot (waste). */
  unitsWasted: number;
  /** ISO date the patient finishes this lot (or expires it). */
  exhaustedOn: string;
  reason: 'consumed' | 'expired' | 'recalled';
}

export type LowStockStatus = 'ok' | 'soon' | 'urgent' | 'out';

export interface MedicationStockForecast {
  medicationId: string;
  /** Sum of available units across non-expired non-recalled lots. */
  totalAvailableUnits: number;
  /** Schedule-derived daily usage (units/day). 0 for PRN-only. */
  dailyUsage: number;
  /** Lots in FEFO order with their per-lot exhaustion projections. */
  lotProjections: LotProjection[];
  /** Total units we expect to consume before they expire. */
  totalUnitsConsumable: number;
  /** Total units that will expire unused inside the projection. */
  totalUnitsWasted: number;
  /** Days of usable supply at current usage rate. */
  daysOfUsableSupply: number;
  /** Projected ISO date the medication runs out. Null when PRN-only. */
  runOutDate: string | null;
  /** Recommended refill-by ISO date (a few days before runOut). Null when PRN. */
  refillByDate: string | null;
  status: LowStockStatus;
  reason: string;
}

export interface StockForecastReport {
  asOf: string;
  perMedication: MedicationStockForecast[];
  /** Subset of perMedication where status is urgent or out. */
  urgent: MedicationStockForecast[];
}

const MS_DAY = 86_400_000;

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysBetween(aIso: string, bDate: Date): number {
  const [y, m, d] = aIso.split('-').map(Number);
  const a = new Date(y!, (m as number) - 1, d as number);
  return Math.max(0, Math.ceil((a.getTime() - startOfDay(bDate).getTime()) / MS_DAY));
}

/**
 * Project per-medication run-out dates by walking lots in FEFO order
 * and capping each lot at its expiry boundary.
 *
 * Algorithm per medication:
 *   1. Get the dailyUsage from schedule expansion.
 *   2. List available lots (sorted FEFO by inventory-ledger).
 *   3. For each lot in order, compute `daysUntilExpiry`. The lot
 *      contributes min(remainingUnits, daysUntilExpiry * dailyUsage)
 *      units of consumable supply. Anything left over expires.
 *   4. Track a `cursor` that walks forward by `unitsConsumed /
 *      dailyUsage` days as each lot is exhausted. The final cursor
 *      = the medication's run-out date.
 *   5. When dailyUsage is 0 (PRN-only), no lot expires — all lots
 *      sit until their expiry. unitsConsumed is set to remainingUnits
 *      (we can't predict PRN consumption); runOutDate is null.
 */
export function forecastLowStock(
  state: LedgerState,
  inputs: ForecastLotInput[],
  asOf: Date = new Date(),
): StockForecastReport {
  const asOfIso = asOf.toISOString();
  const allLots = summarizeLots(state, asOfIso);
  const lotsByMed = new Map<string, LotStatus[]>();
  for (const lot of allLots) {
    if (!lot.available) continue;
    const arr = lotsByMed.get(lot.medicationId);
    if (arr) arr.push(lot);
    else lotsByMed.set(lot.medicationId, [lot]);
  }

  const perMedication: MedicationStockForecast[] = [];

  for (const input of inputs) {
    const dosePerAdmin = input.dosePerAdmin ?? 1;
    const horizon = input.horizonDays ?? 14;
    const soonThreshold = input.soonThresholdDays ?? 14;
    const urgentThreshold = input.urgentThresholdDays ?? 5;
    const dailyUsage = dailyUsageFromSchedules(input.schedules, asOf, horizon, dosePerAdmin);
    const lots = lotsByMed.get(input.medicationId) ?? [];

    const totalAvailableUnits = lots.reduce((s, l) => s + l.remainingUnits, 0);

    if (lots.length === 0) {
      perMedication.push({
        medicationId: input.medicationId,
        totalAvailableUnits: 0,
        dailyUsage,
        lotProjections: [],
        totalUnitsConsumable: 0,
        totalUnitsWasted: 0,
        daysOfUsableSupply: 0,
        runOutDate: toIso(asOf),
        refillByDate: toIso(asOf),
        status: 'out',
        reason: 'No available stock on hand.',
      });
      continue;
    }

    if (dailyUsage <= 0) {
      // PRN-only: we can't predict run-out. Report every lot as
      // sitting until expiry; no waste called out because PRN
      // consumption could legitimately clear them.
      const projections: LotProjection[] = lots.map((l) => ({
        lotNumber: l.lotNumber,
        expiresOn: l.expiresOn,
        receivedUnits: l.receivedUnits,
        remainingUnits: l.remainingUnits,
        unitsConsumed: l.remainingUnits,
        unitsWasted: 0,
        exhaustedOn: l.expiresOn,
        reason: 'expired',
      }));
      perMedication.push({
        medicationId: input.medicationId,
        totalAvailableUnits,
        dailyUsage: 0,
        lotProjections: projections,
        totalUnitsConsumable: totalAvailableUnits,
        totalUnitsWasted: 0,
        daysOfUsableSupply: Infinity,
        runOutDate: null,
        refillByDate: null,
        status: 'ok',
        reason: 'As-needed regimen; lots sit until expiry.',
      });
      continue;
    }

    const projections: LotProjection[] = [];
    let cursor = new Date(startOfDay(asOf).getTime());
    let totalConsumable = 0;
    let totalWasted = 0;

    for (const lot of lots) {
      const daysUntilExpiry = daysBetween(lot.expiresOn, cursor);
      if (daysUntilExpiry <= 0) {
        projections.push({
          lotNumber: lot.lotNumber,
          expiresOn: lot.expiresOn,
          receivedUnits: lot.receivedUnits,
          remainingUnits: lot.remainingUnits,
          unitsConsumed: 0,
          unitsWasted: lot.remainingUnits,
          exhaustedOn: lot.expiresOn,
          reason: 'expired',
        });
        totalWasted += lot.remainingUnits;
        continue;
      }
      // How many units can we consume from this lot before it expires?
      const consumableBudget = Math.floor(daysUntilExpiry * dailyUsage);
      const willConsume = Math.min(lot.remainingUnits, consumableBudget);
      const wasted = lot.remainingUnits - willConsume;
      const daysToConsume = willConsume / dailyUsage;
      const exhausted = addDays(cursor, Math.ceil(daysToConsume));
      const exhaustedDate = wasted > 0 ? lot.expiresOn : toIso(exhausted);
      projections.push({
        lotNumber: lot.lotNumber,
        expiresOn: lot.expiresOn,
        receivedUnits: lot.receivedUnits,
        remainingUnits: lot.remainingUnits,
        unitsConsumed: willConsume,
        unitsWasted: wasted,
        exhaustedOn: exhaustedDate,
        reason: wasted > 0 ? 'expired' : 'consumed',
      });
      totalConsumable += willConsume;
      totalWasted += wasted;
      cursor = addDays(cursor, Math.ceil(daysToConsume));
    }

    const daysOfSupply = totalConsumable / dailyUsage;
    const runOutDate = addDays(startOfDay(asOf), Math.ceil(daysOfSupply));
    const refillLead = Math.min(urgentThreshold, Math.max(2, Math.floor(urgentThreshold / 2)));
    const refillByCandidate = addDays(runOutDate, -refillLead);
    const refillByDate =
      refillByCandidate.getTime() < startOfDay(asOf).getTime()
        ? toIso(startOfDay(asOf))
        : toIso(refillByCandidate);

    let status: LowStockStatus;
    let reason: string;
    if (daysOfSupply <= 0) {
      status = 'out';
      reason = 'All available lots already expired or recalled.';
    } else if (daysOfSupply <= urgentThreshold) {
      status = 'urgent';
      reason = `Only ${Math.floor(daysOfSupply)} day${Math.floor(daysOfSupply) === 1 ? '' : 's'} of usable supply at current usage.`;
    } else if (daysOfSupply <= soonThreshold) {
      status = 'soon';
      reason = `Usable supply lasts about ${Math.floor(daysOfSupply)} days. Plan a refill this week.`;
    } else {
      status = 'ok';
      reason = `Usable supply lasts about ${Math.floor(daysOfSupply)} days.`;
    }

    perMedication.push({
      medicationId: input.medicationId,
      totalAvailableUnits,
      dailyUsage: Number(dailyUsage.toFixed(3)),
      lotProjections: projections,
      totalUnitsConsumable: totalConsumable,
      totalUnitsWasted: totalWasted,
      daysOfUsableSupply: Math.floor(daysOfSupply),
      runOutDate: toIso(runOutDate),
      refillByDate,
      status,
      reason,
    });
  }

  perMedication.sort((a, b) => {
    const order: Record<LowStockStatus, number> = { out: 0, urgent: 1, soon: 2, ok: 3 };
    const d = order[a.status] - order[b.status];
    if (d !== 0) return d;
    return a.medicationId.localeCompare(b.medicationId);
  });

  const urgent = perMedication.filter((m) => m.status === 'urgent' || m.status === 'out');

  return {
    asOf: toIso(asOf),
    perMedication,
    urgent,
  };
}

/**
 * Headline string for the dashboard:
 *   "Stock: 1 medication out, 2 urgent, 3 soon, 4 ok; 14 units will expire unused."
 */
export function summarizeStockForecast(report: StockForecastReport): string {
  const total = report.perMedication.length;
  if (total === 0) return 'No medications tracked for inventory.';
  const out = report.perMedication.filter((m) => m.status === 'out').length;
  const urgent = report.perMedication.filter((m) => m.status === 'urgent').length;
  const soon = report.perMedication.filter((m) => m.status === 'soon').length;
  const ok = report.perMedication.filter((m) => m.status === 'ok').length;
  const totalWaste = report.perMedication.reduce((s, m) => s + m.totalUnitsWasted, 0);
  const parts: string[] = [];
  if (out) parts.push(`${out} out`);
  if (urgent) parts.push(`${urgent} urgent`);
  if (soon) parts.push(`${soon} soon`);
  if (ok) parts.push(`${ok} ok`);
  const head = `Stock: ${parts.join(', ')}`;
  if (totalWaste > 0) return `${head}; ${totalWaste} units will expire unused.`;
  return `${head}.`;
}
