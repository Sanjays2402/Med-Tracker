/**
 * Missed-dose re-planner.
 *
 * After a scheduled dose is skipped or marked missed, the patient (or
 * caregiver) needs an immediate answer to: "can I still take it now, or
 * just wait for the next one?". A naive "take it whenever you remember"
 * can lead to double-dosing or sub-therapeutic gaps. The right answer is
 * a function of:
 *
 *   - the medication's minimum interval between doses (pharmacokinetic
 *     half-life or label guidance),
 *   - the medication's maximum doses per rolling 24h (or other window),
 *   - the recent take history,
 *   - the original schedule of upcoming doses.
 *
 * planMissedDoseRecovery returns the safe action with rationale:
 *
 *   - `take-now`: it's safe to take the missed dose immediately and the
 *     next scheduled dose can stay.
 *   - `take-now-shift`: take now, but shift the next scheduled dose to
 *     respect min-interval.
 *   - `skip`: too close to the next dose; take the next one normally.
 *   - `wait-then-take`: wait `waitMinutes` then take, then keep
 *     the original schedule (with optional shift).
 *
 * Pure / deterministic / timezone-naive (caller aligns to user tz).
 */

export type RecoveryAction = 'take-now' | 'take-now-shift' | 'skip' | 'wait-then-take';

export interface MissedDoseInput {
  medicationId: string;
  /** The missed dose's original due timestamp (ISO). */
  missedDueAt: string;
  /** Current instant (ISO). Default = now. */
  now?: string;
  /**
   * Minimum interval between any two doses, in hours. Required guardrail.
   * For most chronic meds this is the dosing interval (e.g. 12h BID).
   */
  minIntervalHours: number;
  /** Max doses per rolling window. Both are required when set. */
  maxDosesPerWindow?: number;
  windowHours?: number;
  /** ISO timestamps of doses already taken (any order). */
  takenAt: string[];
  /** Upcoming scheduled doses, ISO. Sorted ascending; can be empty. */
  upcomingDueAt: string[];
  /**
   * When the patient is closer to the next dose than this fraction of the
   * dosing interval, the safe action is to skip the missed one. Default 0.5.
   * Standard "if you're more than halfway to the next dose, skip" rule.
   */
  skipIfPastHalfwayRatio?: number;
}

export interface RecoveryPlan {
  medicationId: string;
  action: RecoveryAction;
  /** ISO timestamp at which to take the dose (omitted when action='skip'). */
  takeAt?: string;
  /** When action='wait-then-take', minutes between now and takeAt. */
  waitMinutes?: number;
  /** When action shifts the next scheduled dose, the new ISO time. */
  shiftedNextDoseAt?: string;
  /** True if the missed dose is effectively discarded. */
  doseDropped: boolean;
  reason: string;
  /** Safety flags raised during planning. */
  warnings: string[];
}

const HOUR_MS = 3_600_000;
const MIN_MS = 60_000;

function parse(ts: string, field: string): number {
  const ms = Date.parse(ts);
  if (Number.isNaN(ms)) throw new Error(`${field} is not a valid ISO timestamp: ${ts}`);
  return ms;
}

function inWindow(takenMs: number[], atMs: number, windowMs: number): number {
  let count = 0;
  for (const t of takenMs) {
    if (t > atMs - windowMs && t <= atMs) count += 1;
  }
  return count;
}

export function planMissedDoseRecovery(input: MissedDoseInput): RecoveryPlan {
  if (input.minIntervalHours <= 0) throw new Error('minIntervalHours must be positive');
  const skipRatio = input.skipIfPastHalfwayRatio ?? 0.5;
  if (skipRatio < 0 || skipRatio > 1) throw new Error('skipIfPastHalfwayRatio must be in [0,1]');
  if ((input.maxDosesPerWindow == null) !== (input.windowHours == null)) {
    throw new Error('maxDosesPerWindow and windowHours must be provided together');
  }

  const nowMs = input.now ? parse(input.now, 'now') : Date.now();
  const missedMs = parse(input.missedDueAt, 'missedDueAt');
  const takenMs = input.takenAt.map((t, i) => parse(t, `takenAt[${i}]`)).sort((a, b) => a - b);
  const upcoming = input.upcomingDueAt
    .map((t, i) => parse(t, `upcomingDueAt[${i}]`))
    .sort((a, b) => a - b);

  const intervalMs = input.minIntervalHours * HOUR_MS;
  const lastTaken = takenMs.length ? takenMs[takenMs.length - 1]! : null;
  const nextDose = upcoming.find((t) => t > nowMs) ?? null;

  const warnings: string[] = [];

  // Halfway rule: if the patient is more than skipRatio of the way through
  // the dosing interval toward the next scheduled dose, the safe play is to
  // skip the missed dose. This avoids the classic "take-and-take-again-too-soon"
  // double dose.
  if (nextDose != null) {
    const intervalCovered = nextDose - missedMs;
    const elapsedFromMiss = nowMs - missedMs;
    if (intervalCovered > 0 && elapsedFromMiss / intervalCovered >= skipRatio) {
      return {
        medicationId: input.medicationId,
        action: 'skip',
        doseDropped: true,
        reason: `More than ${Math.round(skipRatio * 100)}% of the way to the next scheduled dose; skip the missed one to avoid double-dosing.`,
        warnings,
      };
    }
  }

  // Min-interval guardrail vs last take.
  if (lastTaken != null) {
    const sinceLast = nowMs - lastTaken;
    if (sinceLast < intervalMs) {
      const waitMs = intervalMs - sinceLast;
      const takeAtMs = nowMs + waitMs;
      // If waiting pushes us past the next scheduled dose, skip instead.
      if (nextDose != null && takeAtMs >= nextDose) {
        return {
          medicationId: input.medicationId,
          action: 'skip',
          doseDropped: true,
          reason: 'Waiting for the minimum dosing interval would push the missed dose past the next scheduled one.',
          warnings,
        };
      }
      return {
        medicationId: input.medicationId,
        action: 'wait-then-take',
        takeAt: new Date(takeAtMs).toISOString(),
        waitMinutes: Math.ceil(waitMs / MIN_MS),
        doseDropped: false,
        reason: `Last dose was ${(sinceLast / HOUR_MS).toFixed(1)}h ago; wait ${Math.ceil(waitMs / MIN_MS)} min to respect the ${input.minIntervalHours}h minimum interval.`,
        warnings,
      };
    }
  }

  // Rolling-window cap guardrail.
  if (input.maxDosesPerWindow != null && input.windowHours != null) {
    const windowMs = input.windowHours * HOUR_MS;
    const count = inWindow(takenMs, nowMs, windowMs);
    if (count + 1 > input.maxDosesPerWindow) {
      warnings.push(`Already at ${count} doses in the last ${input.windowHours}h; cap is ${input.maxDosesPerWindow}.`);
      // Find the earliest takeAt that drops the oldest counted dose out of the window.
      const counted = takenMs.filter((t) => t > nowMs - windowMs).sort((a, b) => a - b);
      const earliestOldExits = counted.length > 0 ? counted[0]! + windowMs : nowMs;
      const takeAtMs = Math.max(nowMs, earliestOldExits);
      if (nextDose != null && takeAtMs >= nextDose) {
        return {
          medicationId: input.medicationId,
          action: 'skip',
          doseDropped: true,
          reason: 'Rolling-window cap would not clear before next scheduled dose; skip.',
          warnings,
        };
      }
      return {
        medicationId: input.medicationId,
        action: 'wait-then-take',
        takeAt: new Date(takeAtMs).toISOString(),
        waitMinutes: Math.ceil((takeAtMs - nowMs) / MIN_MS),
        doseDropped: false,
        reason: `At cap of ${input.maxDosesPerWindow} per ${input.windowHours}h; wait until oldest counted dose ages out.`,
        warnings,
      };
    }
  }

  // Safe to take now. Decide whether to shift the next dose.
  if (nextDose != null) {
    const fromNowToNext = nextDose - nowMs;
    if (fromNowToNext < intervalMs) {
      const shifted = nowMs + intervalMs;
      return {
        medicationId: input.medicationId,
        action: 'take-now-shift',
        takeAt: new Date(nowMs).toISOString(),
        shiftedNextDoseAt: new Date(shifted).toISOString(),
        doseDropped: false,
        reason: `Take the missed dose now; shift the next scheduled dose by ${Math.ceil((shifted - nextDose) / MIN_MS)} min to preserve the ${input.minIntervalHours}h interval.`,
        warnings,
      };
    }
  }

  return {
    medicationId: input.medicationId,
    action: 'take-now',
    takeAt: new Date(nowMs).toISOString(),
    doseDropped: false,
    reason: 'Safe to take the missed dose immediately; next scheduled dose unaffected.',
    warnings,
  };
}
