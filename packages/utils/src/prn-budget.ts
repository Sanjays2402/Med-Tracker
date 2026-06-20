/**
 * PRN (pro re nata, "as-needed") usage budget tracker.
 *
 * PRN medications — rescue inhalers, opioid analgesics, sumatriptan,
 * lorazepam — carry a maximum number of doses per fixed rolling window
 * (e.g. "no more than 4 puffs in 24h"; "no more than 100 mg sumatriptan
 * per 24h with at least 2h between doses"; "no more than 6 doses per
 * week"). Exceeding these caps is a real adverse-event risk; the app
 * must answer two questions at any moment:
 *
 *   - **Can I take another dose right now?** (and if not, when?)
 *   - **How much budget do I have remaining in the current window?**
 *
 * This module implements both. Caller provides past doses and a budget
 * spec; `evaluatePrnBudget` returns a decision with a remaining count, a
 * `nextEligibleAt` ISO timestamp, and a textual reason.
 *
 * Two budget styles are supported:
 *   - **count window**: max N doses in the last W hours.
 *   - **interval**: minimum hours between consecutive doses (e.g. q4h).
 *
 * Specs can stack both ("max 4 in 24h AND at least 4h between doses");
 * `nextEligibleAt` is the LATER of the two constraints.
 *
 * Pure / deterministic. Numbers only, no medical advice generation.
 */

export interface PrnDose {
  takenAt: string | Date;
  /** Optional units (e.g. "1 puff", "100 mg") for display. */
  amount?: string;
}

export interface PrnBudgetSpec {
  /** Maximum doses allowed within `windowHours` rolling window. */
  maxDoses?: number;
  /** Rolling window length in hours. Required if maxDoses is set. */
  windowHours?: number;
  /** Minimum hours between consecutive doses. */
  minIntervalHours?: number;
  /** Friendly display name for the regimen. */
  label?: string;
}

export type PrnDecision = 'allowed' | 'wait' | 'denied-cap';

export interface PrnBudgetResult {
  decision: PrnDecision;
  /** Remaining doses inside the rolling window (only when spec.maxDoses set). */
  remainingInWindow?: number;
  /** Earliest ISO timestamp at which a new dose would be allowed. */
  nextEligibleAt?: string;
  /** Minutes from `now` until eligibility. */
  minutesUntilEligible?: number;
  /** Plain-text explanation. */
  reason: string;
  /** Window start used for the count, ISO timestamp. */
  windowStart?: string;
  /** Count of doses inside the window. */
  countInWindow?: number;
}

export interface EvaluateOptions {
  doses: PrnDose[];
  spec: PrnBudgetSpec;
  /** Reference "now". Default new Date(). */
  now?: Date;
}

const MS_HOUR = 3_600_000;

export function evaluatePrnBudget(opts: EvaluateOptions): PrnBudgetResult {
  const now = opts.now ?? new Date();
  const nowMs = now.getTime();
  const sorted = [...opts.doses]
    .map((d) => ({ ...d, takenAt: new Date(d.takenAt) }))
    .sort((a, b) => a.takenAt.getTime() - b.takenAt.getTime());

  // Min-interval check.
  let intervalEligibleAt: Date | undefined;
  if (opts.spec.minIntervalHours != null) {
    const last = sorted[sorted.length - 1];
    if (last) {
      const earliest = new Date(last.takenAt.getTime() + opts.spec.minIntervalHours * MS_HOUR);
      intervalEligibleAt = earliest;
    }
  }

  // Count-window check.
  let countResult: { remaining: number; countInWindow: number; windowStart: Date; rolloffAt?: Date } | undefined;
  if (opts.spec.maxDoses != null && opts.spec.windowHours != null) {
    const windowStart = new Date(nowMs - opts.spec.windowHours * MS_HOUR);
    const inWindow = sorted.filter((d) => d.takenAt.getTime() > windowStart.getTime());
    const remaining = Math.max(0, opts.spec.maxDoses - inWindow.length);
    let rolloffAt: Date | undefined;
    if (remaining <= 0 && inWindow.length > 0) {
      // The oldest dose in the window rolls off at takenAt + windowHours.
      const oldest = inWindow[0]!;
      rolloffAt = new Date(oldest.takenAt.getTime() + opts.spec.windowHours * MS_HOUR);
    }
    countResult = {
      remaining,
      countInWindow: inWindow.length,
      windowStart,
      ...(rolloffAt ? { rolloffAt } : {}),
    };
  }

  // Decision: combine constraints.
  const reasons: string[] = [];
  let decision: PrnDecision = 'allowed';
  let nextEligible: Date | undefined;

  if (countResult && countResult.remaining <= 0) {
    decision = 'denied-cap';
    if (countResult.rolloffAt) nextEligible = countResult.rolloffAt;
    reasons.push(
      `At cap: ${countResult.countInWindow} of ${opts.spec.maxDoses} doses already taken in the last ${opts.spec.windowHours}h.`,
    );
  }

  if (intervalEligibleAt && intervalEligibleAt.getTime() > nowMs) {
    // Interval constraint blocks now; pick the LATER of interval and rolloff.
    if (decision === 'allowed') decision = 'wait';
    if (!nextEligible || intervalEligibleAt.getTime() > nextEligible.getTime()) {
      nextEligible = intervalEligibleAt;
    }
    reasons.push(
      `Minimum ${opts.spec.minIntervalHours}h interval not yet elapsed since last dose.`,
    );
  }

  const result: PrnBudgetResult = {
    decision,
    reason: decision === 'allowed'
      ? buildAllowedReason(opts.spec, countResult, opts.doses.length)
      : reasons.join(' '),
  };
  if (countResult) {
    result.remainingInWindow = countResult.remaining;
    result.windowStart = countResult.windowStart.toISOString();
    result.countInWindow = countResult.countInWindow;
  }
  if (nextEligible) {
    result.nextEligibleAt = nextEligible.toISOString();
    result.minutesUntilEligible = Math.max(
      0,
      Math.ceil((nextEligible.getTime() - nowMs) / 60_000),
    );
  }
  return result;
}

function buildAllowedReason(
  spec: PrnBudgetSpec,
  count: { remaining: number; countInWindow: number } | undefined,
  totalDoses: number,
): string {
  const parts: string[] = [];
  if (count) {
    parts.push(
      `${count.remaining} of ${spec.maxDoses} doses remaining in current ${spec.windowHours}h window.`,
    );
  } else if (spec.minIntervalHours && totalDoses === 0) {
    parts.push('No prior doses; allowed.');
  }
  if (parts.length === 0) parts.push('Allowed.');
  return parts.join(' ');
}

/**
 * Convenience: project how many additional doses the patient can still
 * take in the current window, assuming each follows the minIntervalHours.
 * Useful for headline UI ("you have 3 more doses available today").
 */
export function projectRemainingDoses(opts: EvaluateOptions): number {
  const e = evaluatePrnBudget(opts);
  if (e.remainingInWindow == null) return Infinity;
  return e.remainingInWindow;
}
