import { describe, it, expect } from 'vitest';
import {
  forecastLowStock,
  summarizeStockForecast,
  type ForecastLotInput,
} from '../src/inventory-low-stock-forecast';
import type { LedgerState, Lot } from '../src/inventory-ledger';
import type { Schedule } from '@med/types';

function lot(o: Partial<Lot>): Lot {
  return {
    lotNumber: o.lotNumber ?? 'L1',
    medicationId: o.medicationId ?? 'm-1',
    ndc: o.ndc,
    receivedUnits: o.receivedUnits ?? 30,
    expiresOn: o.expiresOn ?? '2027-01-01',
    receivedAt: o.receivedAt ?? '2026-01-01T00:00:00Z',
  };
}

function state(o: Partial<LedgerState>): LedgerState {
  return {
    lots: o.lots ?? [],
    consumption: o.consumption ?? [],
    recalls: o.recalls ?? [],
  };
}

function dailySchedule(times: string[]): Schedule {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    medicationId: '00000000-0000-0000-0000-000000000001',
    kind: 'daily',
    times,
    daysOfWeek: undefined,
    intervalHours: undefined,
    cronExpression: undefined,
    startsAt: '2026-01-01T00:00:00Z',
    endsAt: null,
    enabled: true,
  };
}

const AS_OF = new Date(2026, 5, 1); // June 1, 2026

describe('forecastLowStock — empty cases', () => {
  it('reports "out" when no lots present for a medication', () => {
    const report = forecastLowStock(
      state({}),
      [{ medicationId: 'm-1', schedules: [dailySchedule(['08:00'])] }],
      AS_OF,
    );
    expect(report.perMedication[0]!.status).toBe('out');
    expect(report.perMedication[0]!.totalAvailableUnits).toBe(0);
    expect(report.urgent).toHaveLength(1);
  });

  it('reports "out" when all lots already expired before asOf', () => {
    const report = forecastLowStock(
      state({ lots: [lot({ expiresOn: '2026-01-01' })] }),
      [{ medicationId: 'm-1', schedules: [dailySchedule(['08:00'])] }],
      AS_OF,
    );
    expect(report.perMedication[0]!.status).toBe('out');
    expect(report.perMedication[0]!.totalAvailableUnits).toBe(0);
  });

  it('handles empty input list', () => {
    expect(forecastLowStock(state({}), [], AS_OF).perMedication).toEqual([]);
  });
});

describe('forecastLowStock — basic single-lot projection', () => {
  it('projects run-out from a 30-unit lot at 1 unit/day = 30 days', () => {
    const report = forecastLowStock(
      state({ lots: [lot({ receivedUnits: 30, expiresOn: '2028-01-01' })] }),
      [{ medicationId: 'm-1', schedules: [dailySchedule(['08:00'])] }],
      AS_OF,
    );
    const m = report.perMedication[0]!;
    expect(m.daysOfUsableSupply).toBeGreaterThanOrEqual(28);
    expect(m.daysOfUsableSupply).toBeLessThanOrEqual(31);
    expect(m.status).toBe('ok');
    expect(m.lotProjections[0]!.unitsConsumed).toBe(30);
    expect(m.lotProjections[0]!.unitsWasted).toBe(0);
    expect(m.lotProjections[0]!.reason).toBe('consumed');
  });

  it('flags "urgent" when projected days <= urgentThreshold', () => {
    const report = forecastLowStock(
      state({ lots: [lot({ receivedUnits: 3, expiresOn: '2028-01-01' })] }),
      [{ medicationId: 'm-1', schedules: [dailySchedule(['08:00'])], urgentThresholdDays: 5 }],
      AS_OF,
    );
    expect(report.perMedication[0]!.status).toBe('urgent');
  });

  it('flags "soon" between urgent and soon thresholds', () => {
    const report = forecastLowStock(
      state({ lots: [lot({ receivedUnits: 10, expiresOn: '2028-01-01' })] }),
      [{ medicationId: 'm-1', schedules: [dailySchedule(['08:00'])] }],
      AS_OF,
    );
    expect(report.perMedication[0]!.status).toBe('soon');
  });

  it('refillByDate is a few days before runOutDate', () => {
    const report = forecastLowStock(
      state({ lots: [lot({ receivedUnits: 30, expiresOn: '2028-01-01' })] }),
      [{ medicationId: 'm-1', schedules: [dailySchedule(['08:00'])] }],
      AS_OF,
    );
    const m = report.perMedication[0]!;
    expect(new Date(m.refillByDate!).getTime()).toBeLessThan(new Date(m.runOutDate!).getTime());
  });
});

describe('forecastLowStock — lot expiry capping', () => {
  it('caps a 30-unit lot at the expiry boundary (waste reported)', () => {
    // Lot has 30 units but expires in 10 days. At 1 unit/day patient
    // can only consume 10 units before expiry; 20 waste.
    const report = forecastLowStock(
      state({ lots: [lot({ receivedUnits: 30, expiresOn: '2026-06-11' })] }), // 10 days from June 1
      [{ medicationId: 'm-1', schedules: [dailySchedule(['08:00'])] }],
      AS_OF,
    );
    const m = report.perMedication[0]!;
    expect(m.lotProjections[0]!.unitsConsumed).toBe(10);
    expect(m.lotProjections[0]!.unitsWasted).toBe(20);
    expect(m.lotProjections[0]!.reason).toBe('expired');
    expect(m.totalUnitsConsumable).toBe(10);
    expect(m.totalUnitsWasted).toBe(20);
  });

  it('walks lots FEFO and accumulates run-out cursor', () => {
    // Lot A: 5 units expiring soon, Lot B: 30 units expiring later.
    const report = forecastLowStock(
      state({
        lots: [
          lot({ lotNumber: 'A', receivedUnits: 5, expiresOn: '2026-06-10' }), // 9d
          lot({ lotNumber: 'B', receivedUnits: 30, expiresOn: '2028-01-01' }),
        ],
      }),
      [{ medicationId: 'm-1', schedules: [dailySchedule(['08:00'])] }],
      AS_OF,
    );
    const m = report.perMedication[0]!;
    expect(m.lotProjections[0]!.lotNumber).toBe('A');
    expect(m.lotProjections[1]!.lotNumber).toBe('B');
    // Total consumable = 5 (lot A, no waste) + 30 (lot B) = 35 days at 1/day.
    expect(m.totalUnitsConsumable).toBe(35);
    expect(m.totalUnitsWasted).toBe(0);
  });

  it('cumulative cursor capping: lot B starts where lot A left off', () => {
    // Lot A: 5 units, expires at 2026-06-10. Patient uses 1/day starting June 1,
    // exhausts lot A on June 5. Lot B then has roughly 26 days until its own
    // expiry on July 1 from where we left off — at 1/day that's ~26 consumable.
    const report = forecastLowStock(
      state({
        lots: [
          lot({ lotNumber: 'A', receivedUnits: 5, expiresOn: '2026-06-10' }),
          lot({ lotNumber: 'B', receivedUnits: 30, expiresOn: '2026-07-01' }),
        ],
      }),
      [{ medicationId: 'm-1', schedules: [dailySchedule(['08:00'])] }],
      AS_OF,
    );
    const m = report.perMedication[0]!;
    // Lot B's consumption is capped by its own expiry. From end of lot A
    // (cursor=June 5/6) to July 1 = ~25-26 days; 30 unit lot wastes a few.
    expect(m.lotProjections[1]!.unitsConsumed).toBeLessThan(30);
    expect(m.lotProjections[1]!.unitsWasted).toBeGreaterThan(0);
    expect(m.totalUnitsWasted).toBeGreaterThan(0);
  });
});

describe('forecastLowStock — recalls and ledger consumption', () => {
  it('excludes recalled lots from available stock', () => {
    const report = forecastLowStock(
      state({
        lots: [
          lot({ lotNumber: 'A', receivedUnits: 30 }),
          lot({ lotNumber: 'B', receivedUnits: 30, ndc: 'NDC-X' }),
        ],
        recalls: [
          { lotNumber: 'A', issuedAt: '2026-06-01T00:00:00Z', reason: 'contamination' },
        ],
      }),
      [{ medicationId: 'm-1', schedules: [dailySchedule(['08:00'])] }],
      AS_OF,
    );
    const m = report.perMedication[0]!;
    expect(m.lotProjections.find((p) => p.lotNumber === 'A')).toBeUndefined();
    expect(m.totalAvailableUnits).toBe(30);
  });

  it('subtracts ledger consumption from remaining units', () => {
    const report = forecastLowStock(
      state({
        lots: [lot({ lotNumber: 'A', receivedUnits: 30 })],
        consumption: [
          { doseId: 'd1', medicationId: 'm-1', takenAt: '2026-05-25T08:00:00Z', units: 10, lotNumber: 'A' },
        ],
      }),
      [{ medicationId: 'm-1', schedules: [dailySchedule(['08:00'])] }],
      AS_OF,
    );
    const m = report.perMedication[0]!;
    expect(m.totalAvailableUnits).toBe(20);
    expect(m.lotProjections[0]!.remainingUnits).toBe(20);
  });
});

describe('forecastLowStock — PRN regimens', () => {
  it('PRN-only (asNeeded) returns infinite supply and null runOut', () => {
    const report = forecastLowStock(
      state({ lots: [lot({ receivedUnits: 30 })] }),
      [
        {
          medicationId: 'm-1',
          schedules: [
            {
              ...dailySchedule([]),
              kind: 'asNeeded',
              times: [],
            },
          ],
        },
      ],
      AS_OF,
    );
    const m = report.perMedication[0]!;
    expect(m.dailyUsage).toBe(0);
    expect(m.daysOfUsableSupply).toBe(Infinity);
    expect(m.runOutDate).toBeNull();
    expect(m.refillByDate).toBeNull();
    expect(m.status).toBe('ok');
  });
});

describe('forecastLowStock — twice-daily and multi-medication', () => {
  it('twice-daily schedule doubles consumption rate', () => {
    const report = forecastLowStock(
      state({ lots: [lot({ receivedUnits: 30, expiresOn: '2028-01-01' })] }),
      [{ medicationId: 'm-1', schedules: [dailySchedule(['08:00', '20:00'])] }],
      AS_OF,
    );
    const m = report.perMedication[0]!;
    // 2 units/day -> 15 days of supply, not 30.
    expect(m.daysOfUsableSupply).toBeGreaterThanOrEqual(13);
    expect(m.daysOfUsableSupply).toBeLessThanOrEqual(16);
  });

  it('multiple medications projected independently', () => {
    const report = forecastLowStock(
      state({
        lots: [
          lot({ medicationId: 'm-1', receivedUnits: 30, expiresOn: '2028-01-01' }),
          lot({ medicationId: 'm-2', receivedUnits: 3, expiresOn: '2028-01-01' }),
        ],
      }),
      [
        { medicationId: 'm-1', schedules: [dailySchedule(['08:00'])] },
        { medicationId: 'm-2', schedules: [dailySchedule(['08:00'])] },
      ],
      AS_OF,
    );
    expect(report.perMedication).toHaveLength(2);
    // m-2 (3 days) sorts before m-1 (30 days) due to status order (urgent first).
    expect(report.perMedication[0]!.medicationId).toBe('m-2');
    expect(report.perMedication[0]!.status).toBe('urgent');
    expect(report.perMedication[1]!.medicationId).toBe('m-1');
  });

  it('urgent list filters to urgent + out statuses', () => {
    const report = forecastLowStock(
      state({
        lots: [
          lot({ medicationId: 'm-1', receivedUnits: 30, expiresOn: '2028-01-01' }),
          lot({ medicationId: 'm-2', receivedUnits: 2, expiresOn: '2028-01-01' }),
        ],
      }),
      [
        { medicationId: 'm-1', schedules: [dailySchedule(['08:00'])] },
        { medicationId: 'm-2', schedules: [dailySchedule(['08:00'])] },
      ],
      AS_OF,
    );
    expect(report.urgent).toHaveLength(1);
    expect(report.urgent[0]!.medicationId).toBe('m-2');
  });
});

describe('summarizeStockForecast', () => {
  it('reports clean stock state', () => {
    const report = forecastLowStock(
      state({ lots: [lot({ receivedUnits: 60, expiresOn: '2028-01-01' })] }),
      [{ medicationId: 'm-1', schedules: [dailySchedule(['08:00'])] }],
      AS_OF,
    );
    expect(summarizeStockForecast(report)).toMatch(/1 ok/);
  });

  it('mentions wasted units when expiry causes waste', () => {
    const report = forecastLowStock(
      state({ lots: [lot({ receivedUnits: 30, expiresOn: '2026-06-11' })] }),
      [{ medicationId: 'm-1', schedules: [dailySchedule(['08:00'])] }],
      AS_OF,
    );
    const summary = summarizeStockForecast(report);
    expect(summary).toMatch(/expire unused/);
  });

  it('handles empty report', () => {
    expect(summarizeStockForecast({ asOf: '2026-06-01', perMedication: [], urgent: [] }))
      .toBe('No medications tracked for inventory.');
  });
});
