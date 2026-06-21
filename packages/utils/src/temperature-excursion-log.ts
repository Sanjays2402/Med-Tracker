/**
 * Temperature excursion log for cold-chain medications.
 *
 * `cold-chain.ts` models a single medication's room-temp budget given
 * a list of excursions. In practice, excursions arrive as a STREAM of
 * patient-reported events ("left it on the counter from 9-11am", "the
 * fridge was unplugged overnight", "transport cooler reached 14C").
 * The patient app needs to:
 *
 *   - log new excursions with input validation,
 *   - classify each one (mild / significant / severe / over-max) so the
 *     UI can show a red/amber/green chip,
 *   - de-duplicate identical entries (same start, end, temperature),
 *   - aggregate per-medication for the "Insulin pen log: 3 mild,
 *     1 significant" dashboard row,
 *   - return a unified status that composes the LATEST cold-chain
 *     status read on the resulting log.
 *
 * Pure / deterministic. Composes with `computeColdChainStatus`. Does
 * NOT silently invent medical guidance — classifications and
 * thresholds come from the spec; the module's role is bookkeeping.
 */

import {
  computeColdChainStatus,
  temperatureDerating,
  type ColdChainSpec,
  type ColdChainStatus,
  type TemperatureExcursion,
} from './cold-chain';

export type ExcursionSeverity =
  | 'within-fridge'      // observed <= 8C, treated as fridge time, no budget cost
  | 'mild'               // <= nominalAmbient
  | 'significant'        // > nominal but well under max
  | 'severe'             // close to max
  | 'over-max';          // exceeds spec.maxAllowedC

export interface LoggedExcursion extends TemperatureExcursion {
  /** Stable id derived from (startedAt, endedAt, temperatureC). */
  id: string;
  /** Severity classification. */
  severity: ExcursionSeverity;
  /** Hours of room-temp budget this single excursion would consume. */
  budgetCostHours: number;
  /** Optional patient note. */
  note?: string;
}

export interface LogExcursionInput {
  spec: ColdChainSpec;
  firstUseAt: string;
  existing: LoggedExcursion[];
  /** New excursions to append. May contain duplicates of existing entries. */
  incoming: TemperatureExcursion[];
  /** Optional notes keyed by index in `incoming`. */
  notes?: Record<number, string>;
  /** Reference now (UTC ISO). Defaults to the spec firstUseAt. */
  now?: string;
}

export interface LogExcursionResult {
  /** All excursions (existing + accepted incoming), sorted by start. */
  excursions: LoggedExcursion[];
  /** Count of incoming entries actually added (not duplicates / invalid). */
  addedCount: number;
  /** Count of incoming entries skipped (duplicates + invalid). */
  skippedCount: number;
  /** Per-incoming-index validation errors. Empty when none. */
  errors: Array<{ index: number; reason: string }>;
  /** Cold-chain status recomputed on the merged log. */
  status: ColdChainStatus;
  /** Severity counts across the merged log. */
  severityCounts: Record<ExcursionSeverity, number>;
}

const SEVERE_FRACTION_OF_MAX = 0.85;

function classify(
  observedC: number,
  spec: ColdChainSpec,
): ExcursionSeverity {
  if (observedC > spec.maxAllowedC) return 'over-max';
  const nominal = spec.nominalAmbientC ?? 22;
  if (observedC <= 8) return 'within-fridge';
  if (observedC <= nominal) return 'mild';
  const severeThreshold = spec.maxAllowedC * SEVERE_FRACTION_OF_MAX;
  if (observedC >= severeThreshold) return 'severe';
  return 'significant';
}

function budgetCost(
  excursion: TemperatureExcursion,
  spec: ColdChainSpec,
): number {
  const ms = Date.parse(excursion.endedAt) - Date.parse(excursion.startedAt);
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  const hours = ms / 3_600_000;
  const nominal = spec.nominalAmbientC ?? 22;
  // 'within-fridge' time is not charged at all (it's literally fridge time).
  if (excursion.temperatureC <= 8) return 0;
  return Number((hours * temperatureDerating(excursion.temperatureC, nominal)).toFixed(3));
}

function buildId(e: TemperatureExcursion): string {
  // Stable, deterministic id. UTC ISO with the temperature rounded to
  // 1 decimal — handles 5.0 vs 5.00 reliably.
  const t = Math.round(e.temperatureC * 10) / 10;
  return `${e.startedAt}__${e.endedAt}__${t.toFixed(1)}`;
}

function validate(e: TemperatureExcursion): string | null {
  const s = Date.parse(e.startedAt);
  const en = Date.parse(e.endedAt);
  if (!Number.isFinite(s)) return 'startedAt is not a valid datetime';
  if (!Number.isFinite(en)) return 'endedAt is not a valid datetime';
  if (en <= s) return 'endedAt must be after startedAt';
  if (!Number.isFinite(e.temperatureC)) return 'temperatureC must be a number';
  if (e.temperatureC < -50 || e.temperatureC > 80) return 'temperatureC outside plausible range -50..80';
  return null;
}

function toLogged(e: TemperatureExcursion, spec: ColdChainSpec, note?: string): LoggedExcursion {
  return {
    startedAt: e.startedAt,
    endedAt: e.endedAt,
    temperatureC: e.temperatureC,
    id: buildId(e),
    severity: classify(e.temperatureC, spec),
    budgetCostHours: budgetCost(e, spec),
    note,
  };
}

/**
 * Append validated, de-duplicated excursions to the log and recompute
 * cold-chain status. The result includes both the merged log and any
 * per-input validation errors so the UI can surface "1 added, 2
 * duplicates skipped, 1 rejected".
 */
export function logTemperatureExcursions(input: LogExcursionInput): LogExcursionResult {
  const existing = [...input.existing];
  const seen = new Set(existing.map((e) => e.id));
  const errors: Array<{ index: number; reason: string }> = [];

  let addedCount = 0;
  let skippedCount = 0;

  input.incoming.forEach((raw, i) => {
    const err = validate(raw);
    if (err !== null) {
      errors.push({ index: i, reason: err });
      skippedCount += 1;
      return;
    }
    const note = input.notes?.[i];
    const logged = toLogged(raw, input.spec, note);
    if (seen.has(logged.id)) {
      skippedCount += 1;
      return;
    }
    seen.add(logged.id);
    existing.push(logged);
    addedCount += 1;
  });

  existing.sort(
    (a, b) =>
      Date.parse(a.startedAt) - Date.parse(b.startedAt) ||
      Date.parse(a.endedAt) - Date.parse(b.endedAt),
  );

  const status = computeColdChainStatus({
    spec: input.spec,
    firstUseAt: input.firstUseAt,
    excursions: existing.map(({ startedAt, endedAt, temperatureC }) => ({
      startedAt,
      endedAt,
      temperatureC,
    })),
    now: input.now,
  });

  const severityCounts: Record<ExcursionSeverity, number> = {
    'within-fridge': 0,
    mild: 0,
    significant: 0,
    severe: 0,
    'over-max': 0,
  };
  for (const e of existing) severityCounts[e.severity] += 1;

  return {
    excursions: existing,
    addedCount,
    skippedCount,
    errors,
    status,
    severityCounts,
  };
}

/**
 * Summarize the log for a dashboard row.
 *   "Insulin pen: 3 excursions (1 severe, 2 mild). 18.3h budget used."
 */
export function summarizeExcursionLog(result: LogExcursionResult): string {
  const counts = result.severityCounts;
  const total = result.excursions.length;
  if (total === 0) return `${result.status.medicationName}: no excursions logged.`;
  const chips: string[] = [];
  if (counts['over-max']) chips.push(`${counts['over-max']} over-max`);
  if (counts.severe) chips.push(`${counts.severe} severe`);
  if (counts.significant) chips.push(`${counts.significant} significant`);
  if (counts.mild) chips.push(`${counts.mild} mild`);
  if (counts['within-fridge']) chips.push(`${counts['within-fridge']} within-fridge`);
  const chipText = chips.length === 0 ? '' : ` (${chips.join(', ')})`;
  const used = result.status.consumedHours.toFixed(1);
  return `${result.status.medicationName}: ${total} excursion${total === 1 ? '' : 's'}${chipText}. ${used}h budget used.`;
}
