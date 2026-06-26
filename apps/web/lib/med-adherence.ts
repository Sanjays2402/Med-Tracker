/**
 * med-adherence — pure model for a single medication's adherence ring.
 *
 * The medication detail page reuses the dashboard's AdherenceRing to show ONE
 * medication's adherence over a window. The page already fetches per-medication
 * taken/scheduled rows (getMedicationAdherence); this module turns the matching
 * row into the ring's inputs: a clamped percent, the ok/warn/danger tone from
 * the shared adherence ramp, and a short caption ("26 of 30 doses - last 30
 * days"). When the med has no row or nothing was scheduled it reports an
 * explicit `hasData: false` so the UI can render an honest "no data yet" state
 * instead of a misleading red 0%.
 *
 * No React, no Date.now() — deterministic under test. Tone thresholds match
 * lib/adherence-bars.ts (danger < 70, warn < 90, ok otherwise) so the ring and
 * the reports bars never disagree.
 */

export interface MedAdherenceRowLike {
  medicationId: string;
  medicationName: string;
  taken: number;
  scheduled: number;
}

export type AdherenceTone = 'ok' | 'warn' | 'danger';

export interface MedAdherenceView {
  hasData: boolean;
  /** Integer percent 0..100 (0 when no data). */
  pct: number;
  tone: AdherenceTone;
  taken: number;
  scheduled: number;
  windowDays: number;
  /** "26 of 30 doses" or "no doses scheduled". */
  caption: string;
  /** "last 30 days" — for the ring subtitle. */
  windowLabel: string;
}

export const MED_ADHERENCE_THRESHOLDS = { danger: 70, warn: 90 } as const;

export function medAdherencePct(taken: number, scheduled: number): number {
  if (!Number.isFinite(taken) || !Number.isFinite(scheduled) || scheduled <= 0) return 0;
  const raw = (Math.max(0, taken) / scheduled) * 100;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export function medAdherenceTone(pct: number): AdherenceTone {
  if (pct < MED_ADHERENCE_THRESHOLDS.danger) return 'danger';
  if (pct < MED_ADHERENCE_THRESHOLDS.warn) return 'warn';
  return 'ok';
}

/** Pick the row for a medication id from a per-med list (null when absent). */
export function findMedRow(
  rows: readonly MedAdherenceRowLike[] | null | undefined,
  medicationId: string,
): MedAdherenceRowLike | null {
  if (!rows) return null;
  return rows.find((r) => r.medicationId === medicationId) ?? null;
}

function pluralDays(n: number): string {
  return `last ${n} day${n === 1 ? '' : 's'}`;
}

/**
 * Build the ring view for a single med. Pass the resolved row (or null) and the
 * window length. A null row, or a row with nothing scheduled, yields
 * hasData=false so the page can show "no data yet" rather than 0%.
 */
export function buildMedAdherence(
  row: MedAdherenceRowLike | null | undefined,
  windowDays = 30,
): MedAdherenceView {
  const wd = Number.isFinite(windowDays) && windowDays > 0 ? Math.round(windowDays) : 30;
  const windowLabel = pluralDays(wd);

  if (!row || !Number.isFinite(row.scheduled) || row.scheduled <= 0) {
    return {
      hasData: false,
      pct: 0,
      tone: 'danger',
      taken: row && Number.isFinite(row.taken) ? Math.max(0, row.taken) : 0,
      scheduled: 0,
      windowDays: wd,
      caption: 'no doses scheduled',
      windowLabel,
    };
  }

  const taken = Math.max(0, Math.min(row.taken, row.scheduled));
  const pct = medAdherencePct(taken, row.scheduled);
  return {
    hasData: true,
    pct,
    tone: medAdherenceTone(pct),
    taken,
    scheduled: row.scheduled,
    windowDays: wd,
    caption: `${taken} of ${row.scheduled} doses`,
    windowLabel,
  };
}
