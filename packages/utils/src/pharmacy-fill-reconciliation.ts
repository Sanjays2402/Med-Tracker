/**
 * Pharmacy fill reconciliation: did the pharmacy dispense the right amount?
 *
 * For each medication we have two sources of truth:
 *
 *   1. EXPECTED supply trajectory derived from the regimen — daily
 *      consumption from the schedule + previous fills + on-hand at
 *      cycle start.
 *   2. ACTUAL fill events from the pharmacy.
 *
 * Reconciliation walks both timelines in lockstep and surfaces:
 *
 *   - SHORT FILLS: the pharmacy dispensed fewer units than the
 *     prescription says (e.g. a partial fill while waiting for the
 *     full quantity), so on-hand will run out earlier than the
 *     schedule expects.
 *   - OVER FILLS: the pharmacy dispensed more than the prescription
 *     says (a dispensing error or a refill-too-soon override that
 *     stockpiles supply faster than consumption).
 *   - EARLY REFILLS: fill arrived while on-hand was still > the
 *     "refill safe" threshold (default 7 days). These are usually
 *     fine but PBMs flag them for fraud screening, and they distort
 *     PDC numerators upward.
 *   - LATE REFILLS: fill arrived AFTER on-hand reached zero. These
 *     are the real adherence misses — patient ran out before the
 *     next fill.
 *   - DUPLICATE FILLS: two fills of the same medication on the same
 *     day, frequently a pharmacy POS-double-charge that the patient
 *     paid for once but the EHR shows twice.
 *
 * The reconciler returns per-fill `FillReconciliationEntry` records
 * (every fill is classified) AND a per-medication summary so the
 * dashboard can render "Lisinopril: 2 short fills, 1 late refill".
 *
 * Pure / deterministic. No I/O.
 */

import { startOfDay } from './date';

export type FillIssueKind =
  | 'ok'
  | 'short-fill'
  | 'over-fill'
  | 'early-refill'
  | 'late-refill'
  | 'duplicate-fill';

export interface ExpectedFillSpec {
  medicationId: string;
  /** Expected units per fill (= dosesPerRefill on Medication). */
  expectedUnitsPerFill: number;
  /** Daily consumption units (from refill-forecast.dailyUsageFromSchedules). */
  dailyUsage: number;
}

export interface ReconFillEvent {
  /** Stable id of the fill record. */
  fillId: string;
  medicationId: string;
  /** When the fill happened. ISO timestamp / date / Date. */
  filledAt: string | Date;
  /** Units actually dispensed. */
  actualUnits: number;
}

export interface FillReconciliationEntry {
  fillId: string;
  medicationId: string;
  filledOn: string;
  actualUnits: number;
  expectedUnits: number;
  /** actualUnits - expectedUnits; negative = short, positive = over. */
  delta: number;
  /** On-hand inventory (units) the moment THIS fill landed. */
  onHandBeforeFill: number;
  /** Days of supply on hand the moment this fill landed. */
  daysOfSupplyBeforeFill: number;
  /** Days late (negative = early) versus the safe-refill date. */
  daysLate: number;
  kind: FillIssueKind;
  /** Single-line human-readable explanation for the UI badge. */
  note: string;
}

export interface MedicationReconciliationSummary {
  medicationId: string;
  fillCount: number;
  /** Counts per kind, e.g. { 'short-fill': 2, 'late-refill': 1, ok: 5 }. */
  byKind: Record<FillIssueKind, number>;
  /** Net units missing (sum of negative deltas) — useful for cost-recovery. */
  netShortfallUnits: number;
  /** Net units over-dispensed (sum of positive deltas). */
  netOverageUnits: number;
}

export interface ReconciliationReport {
  perFill: FillReconciliationEntry[];
  perMedication: MedicationReconciliationSummary[];
  /** Total fills that classified as anything other than 'ok'. */
  flaggedCount: number;
}

export interface ReconcileOptions {
  /**
   * On-hand inventory at the start of the analysis (per medicationId).
   * Default 0 — assumes the first observed fill is the start of supply.
   */
  startingInventory?: Record<string, number>;
  /**
   * Days-of-supply on hand at which a refill is "safely on time". A
   * fill that arrives with MORE than this on hand is flagged as
   * early-refill; less means OK or late. Default 7.
   */
  safeRefillDaysOfSupply?: number;
  /**
   * Unit tolerance for short/over fill classification — deltas within
   * +/- tolerance are treated as 'ok'. Default 0. Set to e.g. 5 if
   * liquid measurements should round.
   */
  unitTolerance?: number;
}

const MS_DAY = 86_400_000;

function toDate(v: string | Date): Date | null {
  const d = v instanceof Date ? new Date(v.getTime()) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : startOfDay(d);
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function emptyByKind(): Record<FillIssueKind, number> {
  return {
    ok: 0,
    'short-fill': 0,
    'over-fill': 0,
    'early-refill': 0,
    'late-refill': 0,
    'duplicate-fill': 0,
  };
}

/**
 * Reconcile pharmacy fills against the expected supply trajectory.
 *
 * Walks each medication's fills in chronological order, maintaining a
 * rolling on-hand value that ticks down by dailyUsage every day and
 * up by actualUnits at each fill. Each fill is classified by:
 *
 *   - duplicate-fill: another fill of the same medicationId on the
 *     same calendar day already landed.
 *   - short-fill / over-fill: delta is outside +/- unitTolerance and
 *     daysOfSupplyBeforeFill <= safeRefillDaysOfSupply (otherwise an
 *     "over-fill" with 30 days on hand is reported as 'early-refill'
 *     instead, which is the more diagnostic signal).
 *   - late-refill: on-hand at the time of the fill is 0 AND daysLate
 *     is positive. This is the true non-adherence flag.
 *   - early-refill: daysOfSupplyBeforeFill > safeRefillDaysOfSupply
 *     when the fill arrives. PBMs flag these for fraud screening.
 *   - ok: everything else.
 */
export function reconcileFills(
  fills: ReconFillEvent[],
  specs: ExpectedFillSpec[],
  options: ReconcileOptions = {},
): ReconciliationReport {
  const safeDays = options.safeRefillDaysOfSupply ?? 7;
  const tolerance = Math.max(0, options.unitTolerance ?? 0);
  const startingInventory = options.startingInventory ?? {};
  const specByMed = new Map<string, ExpectedFillSpec>();
  for (const s of specs) specByMed.set(s.medicationId, s);

  const fillsByMed = new Map<string, ReconFillEvent[]>();
  for (const f of fills) {
    const arr = fillsByMed.get(f.medicationId);
    if (arr) arr.push(f);
    else fillsByMed.set(f.medicationId, [f]);
  }

  const perFill: FillReconciliationEntry[] = [];
  const perMedication: MedicationReconciliationSummary[] = [];

  for (const [medicationId, medFills] of fillsByMed) {
    const spec = specByMed.get(medicationId);
    if (!spec) continue; // No spec -> nothing to reconcile against.

    const sorted = [...medFills]
      .map((f) => ({ ...f, parsed: toDate(f.filledAt) }))
      .filter((f): f is ReconFillEvent & { parsed: Date } => f.parsed !== null)
      .sort((a, b) => a.parsed.getTime() - b.parsed.getTime());

    let onHand = startingInventory[medicationId] ?? 0;
    let lastFillMs: number | null = null;
    const seenOnDay = new Set<string>();
    const summary: MedicationReconciliationSummary = {
      medicationId,
      fillCount: sorted.length,
      byKind: emptyByKind(),
      netShortfallUnits: 0,
      netOverageUnits: 0,
    };

    for (const f of sorted) {
      const fillDay = toIso(f.parsed);
      // Tick down on-hand for the days that passed since the last fill.
      if (lastFillMs !== null) {
        const daysElapsed = Math.max(
          0,
          Math.round((f.parsed.getTime() - lastFillMs) / MS_DAY),
        );
        const consumed = daysElapsed * spec.dailyUsage;
        onHand = Math.max(0, onHand - consumed);
      }

      const onHandBefore = onHand;
      const daysOfSupplyBefore =
        spec.dailyUsage > 0 ? onHand / spec.dailyUsage : Infinity;
      // Run-out date = lastFill + (expectedUnits / dailyUsage) days,
      // i.e. when the prior fill's supply was scheduled to be exhausted.
      // daysLate is calendar days from run-out to this fill.
      const ranOutMs = lastFillMs !== null && spec.dailyUsage > 0
        ? lastFillMs + Math.round((spec.expectedUnitsPerFill / spec.dailyUsage) * MS_DAY)
        : null;
      const daysLate = ranOutMs !== null
        ? Math.round((f.parsed.getTime() - ranOutMs) / MS_DAY)
        : 0;

      const delta = f.actualUnits - spec.expectedUnitsPerFill;

      // Classification order matters:
      //   1. duplicate (same-day re-record) — always wins.
      //   2. short / over fill (quantity dispensed disagrees with sig).
      //      Quantity mismatches are most actionable for cost-recovery
      //      and patient education; they take precedence over timing.
      //   3. late refill (on-hand 0 AND days late > 0).
      //   4. early refill (on-hand still > safe threshold).
      //   5. ok.
      let kind: FillIssueKind = 'ok';
      let note = `Filled ${f.actualUnits} units as expected.`;

      if (seenOnDay.has(fillDay)) {
        kind = 'duplicate-fill';
        note = `Duplicate fill on ${fillDay} (already recorded today).`;
      } else if (delta < -tolerance) {
        kind = 'short-fill';
        note = `Short fill: dispensed ${f.actualUnits} of ${spec.expectedUnitsPerFill} expected (${delta} units).`;
      } else if (delta > tolerance) {
        kind = 'over-fill';
        note = `Over fill: dispensed ${f.actualUnits} of ${spec.expectedUnitsPerFill} expected (+${delta} units).`;
      } else if (lastFillMs !== null && onHandBefore === 0 && daysLate > 0) {
        kind = 'late-refill';
        note = `Filled ${daysLate} day${daysLate === 1 ? '' : 's'} after running out.`;
      } else if (lastFillMs !== null && daysOfSupplyBefore > safeDays) {
        kind = 'early-refill';
        note = `Filled with ${Math.round(daysOfSupplyBefore)} days of supply still on hand.`;
      }

      seenOnDay.add(fillDay);

      // Apply the fill to on-hand AFTER classification so daysOfSupplyBefore
      // reflects state at moment of dispensing.
      onHand += f.actualUnits;
      lastFillMs = f.parsed.getTime();

      summary.byKind[kind] += 1;
      if (delta < 0) summary.netShortfallUnits += -delta;
      if (delta > 0) summary.netOverageUnits += delta;

      perFill.push({
        fillId: f.fillId,
        medicationId,
        filledOn: fillDay,
        actualUnits: f.actualUnits,
        expectedUnits: spec.expectedUnitsPerFill,
        delta,
        onHandBeforeFill: onHandBefore,
        daysOfSupplyBeforeFill:
          spec.dailyUsage > 0 ? onHandBefore / spec.dailyUsage : Infinity,
        daysLate,
        kind,
        note,
      });
    }

    perMedication.push(summary);
  }

  perFill.sort((a, b) => {
    if (a.medicationId !== b.medicationId) return a.medicationId.localeCompare(b.medicationId);
    return a.filledOn.localeCompare(b.filledOn);
  });
  perMedication.sort((a, b) => a.medicationId.localeCompare(b.medicationId));

  const flaggedCount = perFill.filter((p) => p.kind !== 'ok').length;
  return { perFill, perMedication, flaggedCount };
}

/**
 * Headline:
 *   "Reconciliation: 4 of 17 fills flagged (2 short fills, 1 late refill, 1 duplicate)."
 */
export function summarizeReconciliation(report: ReconciliationReport): string {
  const total = report.perFill.length;
  if (total === 0) return 'No fills to reconcile.';
  if (report.flaggedCount === 0) {
    return `Reconciliation: all ${total} fill${total === 1 ? '' : 's'} match expected supply.`;
  }
  // Aggregate by kind across medications.
  const tallies = emptyByKind();
  for (const f of report.perFill) tallies[f.kind] += 1;
  const order: FillIssueKind[] = [
    'late-refill',
    'short-fill',
    'duplicate-fill',
    'over-fill',
    'early-refill',
  ];
  const parts: string[] = [];
  for (const k of order) {
    if (tallies[k] === 0) continue;
    const label = k.replace('-', ' ');
    parts.push(`${tallies[k]} ${label}${tallies[k] === 1 ? '' : 's'}`);
  }
  return `Reconciliation: ${report.flaggedCount} of ${total} fill${total === 1 ? '' : 's'} flagged (${parts.join(', ')}).`;
}
