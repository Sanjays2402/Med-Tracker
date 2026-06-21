import { describe, it, expect } from 'vitest';
import {
  logTemperatureExcursions,
  summarizeExcursionLog,
  type LoggedExcursion,
} from '../src/temperature-excursion-log';
import type { ColdChainSpec, TemperatureExcursion } from '../src/cold-chain';

const SPEC: ColdChainSpec = {
  medicationId: 'm-insulin',
  medicationName: 'Insulin Glargine',
  roomTempBudgetHours: 24 * 28, // 28 days
  maxAllowedC: 30,
  nominalAmbientC: 22,
};

const FIRST_USE = '2026-06-01T00:00:00.000Z';

function ex(s: string, e: string, t: number): TemperatureExcursion {
  return { startedAt: s, endedAt: e, temperatureC: t };
}

describe('logTemperatureExcursions', () => {
  it('adds new excursions, classifies them, and recomputes status', () => {
    const out = logTemperatureExcursions({
      spec: SPEC,
      firstUseAt: FIRST_USE,
      existing: [],
      incoming: [
        ex('2026-06-02T09:00:00.000Z', '2026-06-02T11:00:00.000Z', 25), // significant
        ex('2026-06-03T09:00:00.000Z', '2026-06-03T09:30:00.000Z', 18), // mild
      ],
      now: '2026-06-05T00:00:00.000Z',
    });
    expect(out.addedCount).toBe(2);
    expect(out.skippedCount).toBe(0);
    expect(out.excursions).toHaveLength(2);
    expect(out.excursions[0]!.severity).toBe('significant');
    expect(out.excursions[1]!.severity).toBe('mild');
    expect(out.status.medicationId).toBe('m-insulin');
  });

  it('classifies over-max excursions and marks the cold-chain status as overheat', () => {
    const out = logTemperatureExcursions({
      spec: SPEC,
      firstUseAt: FIRST_USE,
      existing: [],
      incoming: [
        ex('2026-06-02T09:00:00.000Z', '2026-06-02T10:00:00.000Z', 35), // over-max (>30)
      ],
      now: '2026-06-05T00:00:00.000Z',
    });
    expect(out.excursions[0]!.severity).toBe('over-max');
    expect(out.status.status).toBe('overheat');
    expect(out.status.mustDiscardNow).toBe(true);
  });

  it('classifies severe at >= 85% of maxAllowedC', () => {
    // max 30 -> severeThreshold 25.5; 28 is severe, 24 is significant.
    const out = logTemperatureExcursions({
      spec: SPEC,
      firstUseAt: FIRST_USE,
      existing: [],
      incoming: [
        ex('2026-06-02T09:00:00.000Z', '2026-06-02T10:00:00.000Z', 28),
        ex('2026-06-02T11:00:00.000Z', '2026-06-02T12:00:00.000Z', 24),
      ],
    });
    expect(out.excursions[0]!.severity).toBe('severe');
    expect(out.excursions[1]!.severity).toBe('significant');
  });

  it('classifies fridge-temp readings as within-fridge with zero budget cost', () => {
    const out = logTemperatureExcursions({
      spec: SPEC,
      firstUseAt: FIRST_USE,
      existing: [],
      incoming: [ex('2026-06-02T00:00:00.000Z', '2026-06-02T04:00:00.000Z', 5)],
    });
    expect(out.excursions[0]!.severity).toBe('within-fridge');
    expect(out.excursions[0]!.budgetCostHours).toBe(0);
  });

  it('de-duplicates identical entries by (start, end, temperature)', () => {
    const existing: LoggedExcursion[] = [
      {
        ...ex('2026-06-02T09:00:00.000Z', '2026-06-02T10:00:00.000Z', 25),
        id: '2026-06-02T09:00:00.000Z__2026-06-02T10:00:00.000Z__25.0',
        severity: 'significant',
        budgetCostHours: 2,
      },
    ];
    const out = logTemperatureExcursions({
      spec: SPEC,
      firstUseAt: FIRST_USE,
      existing,
      incoming: [
        ex('2026-06-02T09:00:00.000Z', '2026-06-02T10:00:00.000Z', 25), // dup
        ex('2026-06-03T09:00:00.000Z', '2026-06-03T10:00:00.000Z', 20), // new
      ],
    });
    expect(out.addedCount).toBe(1);
    expect(out.skippedCount).toBe(1);
    expect(out.excursions).toHaveLength(2);
  });

  it('rejects invalid excursions with per-index errors', () => {
    const out = logTemperatureExcursions({
      spec: SPEC,
      firstUseAt: FIRST_USE,
      existing: [],
      incoming: [
        ex('not-a-date', '2026-06-02T10:00:00.000Z', 25),
        ex('2026-06-02T10:00:00.000Z', '2026-06-02T09:00:00.000Z', 25), // end before start
        ex('2026-06-02T09:00:00.000Z', '2026-06-02T10:00:00.000Z', 999), // out-of-range temp
        ex('2026-06-04T09:00:00.000Z', '2026-06-04T10:00:00.000Z', 22), // OK
      ],
    });
    expect(out.addedCount).toBe(1);
    expect(out.errors).toHaveLength(3);
    expect(out.errors.map((e) => e.index)).toEqual([0, 1, 2]);
  });

  it('attaches per-index notes to the corresponding excursion', () => {
    const out = logTemperatureExcursions({
      spec: SPEC,
      firstUseAt: FIRST_USE,
      existing: [],
      incoming: [
        ex('2026-06-02T09:00:00.000Z', '2026-06-02T10:00:00.000Z', 25),
        ex('2026-06-03T09:00:00.000Z', '2026-06-03T10:00:00.000Z', 22),
      ],
      notes: { 0: 'Left on kitchen counter', 1: 'Travel cooler' },
    });
    expect(out.excursions[0]!.note).toBe('Left on kitchen counter');
    expect(out.excursions[1]!.note).toBe('Travel cooler');
  });

  it('sorts the merged log by start, then by end', () => {
    const out = logTemperatureExcursions({
      spec: SPEC,
      firstUseAt: FIRST_USE,
      existing: [],
      incoming: [
        ex('2026-06-04T09:00:00.000Z', '2026-06-04T10:00:00.000Z', 22),
        ex('2026-06-02T09:00:00.000Z', '2026-06-02T10:00:00.000Z', 22),
        ex('2026-06-03T09:00:00.000Z', '2026-06-03T11:00:00.000Z', 22),
        ex('2026-06-03T09:00:00.000Z', '2026-06-03T09:30:00.000Z', 22),
      ],
    });
    const starts = out.excursions.map((e) => e.startedAt);
    expect(starts).toEqual([
      '2026-06-02T09:00:00.000Z',
      '2026-06-03T09:00:00.000Z',
      '2026-06-03T09:00:00.000Z',
      '2026-06-04T09:00:00.000Z',
    ]);
    // Same-start entries are tied by end ascending.
    expect(out.excursions[1]!.endedAt < out.excursions[2]!.endedAt).toBe(true);
  });

  it('budgetCostHours scales with temperature derating', () => {
    const out = logTemperatureExcursions({
      spec: SPEC,
      firstUseAt: FIRST_USE,
      existing: [],
      incoming: [
        ex('2026-06-02T00:00:00.000Z', '2026-06-02T01:00:00.000Z', 22), // 1h at nominal
        ex('2026-06-03T00:00:00.000Z', '2026-06-03T01:00:00.000Z', 27), // 1h at +5C -> 2x
      ],
    });
    expect(out.excursions[0]!.budgetCostHours).toBeCloseTo(1, 1);
    expect(out.excursions[1]!.budgetCostHours).toBeCloseTo(2, 1);
  });

  it('reports correct severity counts in the result', () => {
    const out = logTemperatureExcursions({
      spec: SPEC,
      firstUseAt: FIRST_USE,
      existing: [],
      incoming: [
        ex('2026-06-02T09:00:00.000Z', '2026-06-02T10:00:00.000Z', 18), // mild
        ex('2026-06-02T11:00:00.000Z', '2026-06-02T12:00:00.000Z', 24), // significant
        ex('2026-06-02T13:00:00.000Z', '2026-06-02T14:00:00.000Z', 28), // severe
        ex('2026-06-02T15:00:00.000Z', '2026-06-02T16:00:00.000Z', 6), // within-fridge
      ],
    });
    expect(out.severityCounts.mild).toBe(1);
    expect(out.severityCounts.significant).toBe(1);
    expect(out.severityCounts.severe).toBe(1);
    expect(out.severityCounts['within-fridge']).toBe(1);
    expect(out.severityCounts['over-max']).toBe(0);
  });

  it('emits an empty result when no incoming and no existing', () => {
    const out = logTemperatureExcursions({
      spec: SPEC,
      firstUseAt: FIRST_USE,
      existing: [],
      incoming: [],
    });
    expect(out.excursions).toHaveLength(0);
    expect(out.addedCount).toBe(0);
    expect(out.severityCounts.mild).toBe(0);
    expect(out.status.status).toBe('ok');
  });

  it('treats round-tripped existing entries as duplicates', () => {
    // Real-world flow: load existing from DB, then write back. Existing
    // ids should never be re-added if the user re-submits the same form.
    const first = logTemperatureExcursions({
      spec: SPEC,
      firstUseAt: FIRST_USE,
      existing: [],
      incoming: [ex('2026-06-02T09:00:00.000Z', '2026-06-02T10:00:00.000Z', 25)],
    });
    const second = logTemperatureExcursions({
      spec: SPEC,
      firstUseAt: FIRST_USE,
      existing: first.excursions,
      incoming: [ex('2026-06-02T09:00:00.000Z', '2026-06-02T10:00:00.000Z', 25)],
    });
    expect(second.addedCount).toBe(0);
    expect(second.skippedCount).toBe(1);
    expect(second.excursions).toHaveLength(1);
  });

  it('exhausts the room-temp budget when severe excursions accumulate', () => {
    // 28-day budget at nominal. 100h at 32C (>max) flips to overheat.
    // To force budget-exhausted without overheating, use repeated 27C
    // excursions (~2x derating) totaling >336h actual = 168h of budget;
    // a single ~700h excursion at 27C produces ~1400h consumed.
    const out = logTemperatureExcursions({
      spec: SPEC,
      firstUseAt: FIRST_USE,
      existing: [],
      incoming: [
        ex('2026-06-01T00:00:00.000Z', '2026-07-30T00:00:00.000Z', 27),
      ],
      now: '2026-07-30T00:00:00.000Z',
    });
    expect(out.status.status).toBe('budget-exhausted');
    expect(out.status.mustDiscardNow).toBe(true);
  });
});

describe('summarizeExcursionLog', () => {
  it('renders the empty case', () => {
    const out = logTemperatureExcursions({
      spec: SPEC,
      firstUseAt: FIRST_USE,
      existing: [],
      incoming: [],
    });
    const s = summarizeExcursionLog(out);
    expect(s).toMatch(/no excursions/);
  });

  it('lists every non-zero severity bucket', () => {
    const out = logTemperatureExcursions({
      spec: SPEC,
      firstUseAt: FIRST_USE,
      existing: [],
      incoming: [
        ex('2026-06-02T09:00:00.000Z', '2026-06-02T10:00:00.000Z', 18),
        ex('2026-06-02T11:00:00.000Z', '2026-06-02T12:00:00.000Z', 28),
        ex('2026-06-02T13:00:00.000Z', '2026-06-02T14:00:00.000Z', 18),
      ],
    });
    const s = summarizeExcursionLog(out);
    expect(s).toMatch(/3 excursions/);
    expect(s).toMatch(/1 severe/);
    expect(s).toMatch(/2 mild/);
    expect(s).toMatch(/budget used/);
  });
});
