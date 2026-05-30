/**
 * Inventory lot ledger.
 *
 * Tracks medication inventory at the lot level so that:
 *
 *   1. Consumption follows FEFO (first-expire-first-out). When a dose
 *      is taken we draw from the lot with the soonest expiration that
 *      still has units, never from an expired lot.
 *   2. Expired stock is quarantined automatically and surfaced for
 *      disposal rather than silently consumed.
 *   3. A recall on a lot number / NDC immediately removes those units
 *      from available stock and reports any doses that were already
 *      taken from the recalled lot so the patient can be notified.
 *
 * Pure function, deterministic ordering: lots are sorted by
 * (expiresOn ASC, lotNumber ASC). Ties resolved by lotNumber to keep
 * output stable across runs.
 */

export interface Lot {
  /** Stable lot identifier (pharmacy or manufacturer assigned). */
  lotNumber: string;
  medicationId: string;
  /** NDC or product code, used for recall matching. */
  ndc?: string;
  /** Units initially received in this lot. */
  receivedUnits: number;
  /** ISO date (YYYY-MM-DD) the lot expires. End-of-day inclusive. */
  expiresOn: string;
  /** ISO timestamp the lot was added to inventory. */
  receivedAt: string;
}

export interface ConsumptionEvent {
  /** Stable id of the dose that consumed units. */
  doseId: string;
  medicationId: string;
  /** ISO timestamp the dose was taken. */
  takenAt: string;
  /** Units consumed (typically 1, but liquids/partial tablets allowed). */
  units: number;
  /** Lot the units were drawn from. */
  lotNumber: string;
}

export interface Recall {
  /** Match by lotNumber OR ndc (either is sufficient). */
  lotNumber?: string;
  ndc?: string;
  /** ISO timestamp the recall was issued. */
  issuedAt: string;
  reason: string;
}

export interface LedgerState {
  lots: Lot[];
  consumption: ConsumptionEvent[];
  recalls: Recall[];
}

export interface LotStatus {
  lotNumber: string;
  medicationId: string;
  ndc?: string;
  expiresOn: string;
  receivedUnits: number;
  consumedUnits: number;
  remainingUnits: number;
  expired: boolean;
  recalled: boolean;
  recallReason?: string;
  /** Available = not expired, not recalled, remaining > 0. */
  available: boolean;
}

export interface DrawResult {
  /** Successful per-lot allocations, in draw order. */
  draws: { lotNumber: string; units: number }[];
  /** Units that could not be filled from healthy stock. */
  shortfall: number;
}

export interface RecallImpact {
  recall: Recall;
  affectedLots: string[];
  /** Doses already consumed from recalled lots. */
  exposedDoses: ConsumptionEvent[];
  /** Units quarantined (remaining stock in recalled lots). */
  quarantinedUnits: number;
}

/** End-of-day inclusive expiry: a lot expiring 2025-01-15 is good through 23:59:59 that day. */
function isExpiredAt(lot: Lot, asOfIso: string): boolean {
  const asOf = new Date(asOfIso).getTime();
  const expiry = new Date(`${lot.expiresOn}T23:59:59.999Z`).getTime();
  return asOf > expiry;
}

function matchesRecall(lot: Lot, recall: Recall): boolean {
  if (recall.lotNumber && recall.lotNumber === lot.lotNumber) return true;
  if (recall.ndc && lot.ndc && recall.ndc === lot.ndc) return true;
  return false;
}

function lotConsumed(state: LedgerState, lotNumber: string): number {
  let total = 0;
  for (const c of state.consumption) {
    if (c.lotNumber === lotNumber) total += c.units;
  }
  return total;
}

function isRecalled(lot: Lot, recalls: Recall[]): Recall | undefined {
  for (const r of recalls) if (matchesRecall(lot, r)) return r;
  return undefined;
}

/** Snapshot every lot's status as of `asOfIso`. Deterministic ordering. */
export function summarizeLots(state: LedgerState, asOfIso: string): LotStatus[] {
  const sorted = [...state.lots].sort((a, b) =>
    a.expiresOn === b.expiresOn
      ? a.lotNumber.localeCompare(b.lotNumber)
      : a.expiresOn.localeCompare(b.expiresOn),
  );
  return sorted.map((lot) => {
    const consumed = lotConsumed(state, lot.lotNumber);
    const remaining = Math.max(0, lot.receivedUnits - consumed);
    const expired = isExpiredAt(lot, asOfIso);
    const recall = isRecalled(lot, state.recalls);
    return {
      lotNumber: lot.lotNumber,
      medicationId: lot.medicationId,
      ndc: lot.ndc,
      expiresOn: lot.expiresOn,
      receivedUnits: lot.receivedUnits,
      consumedUnits: consumed,
      remainingUnits: remaining,
      expired,
      recalled: Boolean(recall),
      recallReason: recall?.reason,
      available: !expired && !recall && remaining > 0,
    };
  });
}

/** Total available units for a medication, ignoring expired and recalled lots. */
export function availableUnits(
  state: LedgerState,
  medicationId: string,
  asOfIso: string,
): number {
  return summarizeLots(state, asOfIso)
    .filter((l) => l.medicationId === medicationId && l.available)
    .reduce((s, l) => s + l.remainingUnits, 0);
}

/**
 * Plan a FEFO draw of `units` from `medicationId` as of `asOfIso`.
 * Does not mutate state. Caller appends ConsumptionEvent(s) to commit.
 */
export function planFefoDraw(
  state: LedgerState,
  medicationId: string,
  units: number,
  asOfIso: string,
): DrawResult {
  if (units <= 0) return { draws: [], shortfall: 0 };
  const available = summarizeLots(state, asOfIso).filter(
    (l) => l.medicationId === medicationId && l.available,
  );
  // summarizeLots already sorts by (expiresOn ASC, lotNumber ASC) -> FEFO.
  let need = units;
  const draws: { lotNumber: string; units: number }[] = [];
  for (const lot of available) {
    if (need <= 0) break;
    const take = Math.min(lot.remainingUnits, need);
    if (take > 0) {
      draws.push({ lotNumber: lot.lotNumber, units: take });
      need -= take;
    }
  }
  return { draws, shortfall: Math.max(0, need) };
}

/**
 * Commit a dose against the ledger using FEFO. Returns new state and the
 * draw plan. If shortfall > 0 the consumption is still recorded for
 * what was available; caller decides how to surface the shortfall.
 */
export function recordDose(
  state: LedgerState,
  args: { doseId: string; medicationId: string; units: number; takenAt: string },
): { state: LedgerState; draw: DrawResult } {
  const draw = planFefoDraw(state, args.medicationId, args.units, args.takenAt);
  const events: ConsumptionEvent[] = draw.draws.map((d) => ({
    doseId: args.doseId,
    medicationId: args.medicationId,
    takenAt: args.takenAt,
    units: d.units,
    lotNumber: d.lotNumber,
  }));
  return {
    state: { ...state, consumption: [...state.consumption, ...events] },
    draw,
  };
}

/** Report the impact of every recall. Pure read of state. */
export function recallImpact(state: LedgerState): RecallImpact[] {
  return state.recalls.map((recall) => {
    const affected = state.lots.filter((l) => matchesRecall(l, recall));
    const affectedNumbers = affected.map((l) => l.lotNumber);
    const exposed = state.consumption.filter((c) => affectedNumbers.includes(c.lotNumber));
    const quarantined = affected.reduce(
      (s, l) => s + Math.max(0, l.receivedUnits - lotConsumed(state, l.lotNumber)),
      0,
    );
    return {
      recall,
      affectedLots: affectedNumbers.sort(),
      exposedDoses: exposed,
      quarantinedUnits: quarantined,
    };
  });
}
