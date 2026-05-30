import type { Schedule } from '@med/types';
import { forecastRefill, forecastMany, type RefillForecast, type RefillForecastInput } from '@med/utils';

/**
 * Per-medication input row passed to the RefillService. Keeps the service
 * decoupled from Prisma so it can be unit tested and reused from background
 * jobs that load data through any storage layer.
 */
export interface MedicationSupplyRow {
  medicationId: string;
  supplyRemaining: number;
  dosePerAdmin?: number;
  schedules: Schedule[];
}

export class RefillService {
  constructor(
    private readonly thresholds: { soonThresholdDays?: number; urgentThresholdDays?: number } = {},
  ) {}

  forecast(row: MedicationSupplyRow, now: Date = new Date()): RefillForecast {
    return forecastRefill(this.buildInput(row), now);
  }

  forecastAll(rows: MedicationSupplyRow[], now: Date = new Date()): RefillForecast[] {
    return forecastMany(rows.map((r) => this.buildInput(r)), now);
  }

  /** Filter helper for the /refills/needed endpoint. */
  needsAttention(rows: MedicationSupplyRow[], now: Date = new Date()): RefillForecast[] {
    return this.forecastAll(rows, now).filter((f) => f.status !== 'ok');
  }

  private buildInput(r: MedicationSupplyRow): RefillForecastInput {
    return {
      medicationId: r.medicationId,
      supplyRemaining: r.supplyRemaining,
      dosePerAdmin: r.dosePerAdmin ?? 1,
      schedules: r.schedules,
      soonThresholdDays: this.thresholds.soonThresholdDays,
      urgentThresholdDays: this.thresholds.urgentThresholdDays,
    };
  }
}
