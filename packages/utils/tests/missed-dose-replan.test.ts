import { describe, it, expect } from 'vitest';
import { planMissedDoseRecovery } from '../src/missed-dose-replan';

const BASE = '2026-06-20T00:00:00.000Z';
const at = (h: number, m = 0) => new Date(Date.parse(BASE) + h * 3600_000 + m * 60_000).toISOString();

describe('planMissedDoseRecovery', () => {
  it('returns take-now when safe and next dose is far away', () => {
    // Missed dose was at 08:00, now is 09:00, next at 20:00 (12h apart).
    const out = planMissedDoseRecovery({
      medicationId: 'm', missedDueAt: at(8), now: at(9),
      minIntervalHours: 6, takenAt: [at(2)], // last dose 7h ago
      upcomingDueAt: [at(20)],
    });
    expect(out.action).toBe('take-now');
    expect(out.takeAt).toBe(at(9));
    expect(out.doseDropped).toBe(false);
  });

  it('skips when past halfway to next dose', () => {
    // Missed 08:00, next 20:00, now 14:00.5 (just past halfway at 14:00).
    const out = planMissedDoseRecovery({
      medicationId: 'm', missedDueAt: at(8), now: at(15),
      minIntervalHours: 6, takenAt: [at(2)],
      upcomingDueAt: [at(20)],
    });
    expect(out.action).toBe('skip');
    expect(out.doseDropped).toBe(true);
    expect(out.reason).toMatch(/skip/);
  });

  it('waits when last dose was within min-interval', () => {
    // Missed 08:00, now 09:30, last actually-taken 06:00, interval 6h.
    // 09:30 - 06:00 = 3.5h < 6h, must wait 2.5h.
    const out = planMissedDoseRecovery({
      medicationId: 'm', missedDueAt: at(8), now: at(9, 30),
      minIntervalHours: 6, takenAt: [at(6)],
      upcomingDueAt: [at(20)],
    });
    expect(out.action).toBe('wait-then-take');
    expect(out.waitMinutes).toBe(150);
    expect(out.takeAt).toBe(at(12));
    expect(out.doseDropped).toBe(false);
  });

  it('shifts the next dose when taking now violates the next interval', () => {
    // Missed 08:00, now 09:00, next 12:00, interval 6h.
    // 12:00 - 09:00 = 3h < 6h, so take now then shift next to 15:00.
    const out = planMissedDoseRecovery({
      medicationId: 'm', missedDueAt: at(8), now: at(9),
      minIntervalHours: 6, takenAt: [],
      upcomingDueAt: [at(12), at(18)],
    });
    expect(out.action).toBe('take-now-shift');
    expect(out.takeAt).toBe(at(9));
    expect(out.shiftedNextDoseAt).toBe(at(15));
  });

  it('respects rolling-window cap', () => {
    // Cap 3 doses per 24h. Already took 3 in last 24h. Now must wait until
    // the oldest counted dose (at 02:00) ages out of the window at 02:00 next day = 26:00.
    const out = planMissedDoseRecovery({
      medicationId: 'm', missedDueAt: at(20), now: at(22),
      minIntervalHours: 4, takenAt: [at(2), at(8), at(14)],
      upcomingDueAt: [at(32)],
      maxDosesPerWindow: 3, windowHours: 24,
    });
    expect(out.action).toBe('wait-then-take');
    expect(out.takeAt).toBe(at(26));
    expect(out.waitMinutes).toBe(4 * 60);
    expect(out.warnings.length).toBeGreaterThan(0);
  });

  it('skips when the cap-wait would push past next dose', () => {
    const out = planMissedDoseRecovery({
      medicationId: 'm', missedDueAt: at(20), now: at(22),
      minIntervalHours: 4, takenAt: [at(20)],
      upcomingDueAt: [at(23)],
      maxDosesPerWindow: 1, windowHours: 24,
    });
    expect(out.action).toBe('skip');
    expect(out.doseDropped).toBe(true);
  });

  it('throws when cap window or count is set without the other', () => {
    expect(() => planMissedDoseRecovery({
      medicationId: 'm', missedDueAt: at(8), now: at(9),
      minIntervalHours: 6, takenAt: [], upcomingDueAt: [],
      maxDosesPerWindow: 3,
    })).toThrow(/together/);
  });

  it('rejects bad min-interval', () => {
    expect(() => planMissedDoseRecovery({
      medicationId: 'm', missedDueAt: at(8), now: at(9),
      minIntervalHours: 0, takenAt: [], upcomingDueAt: [],
    })).toThrow(/positive/);
  });

  it('handles no-history, no-upcoming case as plain take-now', () => {
    const out = planMissedDoseRecovery({
      medicationId: 'm', missedDueAt: at(8), now: at(9),
      minIntervalHours: 6, takenAt: [], upcomingDueAt: [],
    });
    expect(out.action).toBe('take-now');
  });
});
