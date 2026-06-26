/**
 * runout-group — pure run-out urgency bucketer for the /medications list.
 *
 * The medications list gets an optional "group by run-out" toggle that files
 * each medication under an urgency band (Overdue / This week / This month /
 * Healthy / Unknown) based on its estimated days of supply left. This module
 * owns the band thresholds, the bucketing pass, and the per-band metadata
 * (label, tone, empty copy) so the page renders sticky group headers from a
 * deterministic model.
 *
 * "Days left" comes from estimatedDaysLeft in medication-sort, so the bands
 * line up with the per-row "~Nd left" chip the list already shows. Medications
 * with no supply data fall into an "Unknown" band that always sorts last so a
 * med without data never masquerades as urgent. No React, no Date.now().
 */

import type { Medication } from './types';
import { estimatedDaysLeft } from './medication-sort';

export type RunoutBand = 'overdue' | 'week' | 'month' | 'healthy' | 'unknown';

/** Bands in display order: most urgent first, unknown last. */
export const RUNOUT_BANDS: RunoutBand[] = ['overdue', 'week', 'month', 'healthy', 'unknown'];

export interface RunoutBandMeta {
  band: RunoutBand;
  label: string;
  /** Tone hint for the header chip / dot. */
  tone: 'danger' | 'warn' | 'info' | 'ok' | 'neutral';
  /** One-line description for the group subhead. */
  hint: string;
}

export const RUNOUT_BAND_META: Record<RunoutBand, RunoutBandMeta> = {
  overdue: { band: 'overdue', label: 'Out of supply', tone: 'danger', hint: 'No doses left — refill now.' },
  week: { band: 'week', label: 'This week', tone: 'warn', hint: 'Runs out within 7 days.' },
  month: { band: 'month', label: 'This month', tone: 'info', hint: 'Runs out within 30 days.' },
  healthy: { band: 'healthy', label: 'Healthy', tone: 'ok', hint: 'More than 30 days on hand.' },
  unknown: { band: 'unknown', label: 'No supply data', tone: 'neutral', hint: 'Add a dose count to track run-out.' },
};

/**
 * Classify one medication into a run-out band.
 *  - unknown: no remainingDoses / unparseable schedule (estimatedDaysLeft null)
 *  - overdue: 0 days left or fewer
 *  - week:    1..7 days
 *  - month:   8..30 days
 *  - healthy: 31+ days
 */
export function runoutBand(med: Medication): RunoutBand {
  const days = estimatedDaysLeft(med);
  if (days == null) return 'unknown';
  if (days <= 0) return 'overdue';
  if (days <= 7) return 'week';
  if (days <= 30) return 'month';
  return 'healthy';
}

export interface RunoutGroup {
  meta: RunoutBandMeta;
  meds: Medication[];
}

/**
 * Bucket a list of medications into urgency groups. Within each band, rows are
 * ordered by ascending days-left (most urgent first); unknown rows fall back to
 * name A-Z. EMPTY bands are omitted so the page only renders headers that have
 * rows. The input is never mutated.
 */
export function groupByRunout(meds: readonly Medication[]): RunoutGroup[] {
  const byBand = new Map<RunoutBand, Medication[]>();
  for (const band of RUNOUT_BANDS) byBand.set(band, []);
  for (const med of meds) byBand.get(runoutBand(med))!.push(med);

  const byName = (a: Medication, b: Medication) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

  const groups: RunoutGroup[] = [];
  for (const band of RUNOUT_BANDS) {
    const rows = byBand.get(band)!;
    if (rows.length === 0) continue;
    rows.sort((a, b) => {
      const da = estimatedDaysLeft(a);
      const db = estimatedDaysLeft(b);
      if (da == null && db == null) return byName(a, b);
      if (da == null) return 1;
      if (db == null) return -1;
      return da - db || byName(a, b);
    });
    groups.push({ meta: RUNOUT_BAND_META[band], meds: rows });
  }
  return groups;
}

export interface RunoutSummary {
  groups: RunoutGroup[];
  /** Count of meds in the overdue + this-week bands (the actionable total). */
  urgentCount: number;
  /** Distinct bands present (after empties are dropped). */
  bandCount: number;
}

/**
 * Group plus a small headline the list header can show ("3 need attention").
 * urgentCount sums the overdue + week bands — the rows a user should act on.
 */
export function summarizeRunout(meds: readonly Medication[]): RunoutSummary {
  const groups = groupByRunout(meds);
  let urgentCount = 0;
  for (const g of groups) {
    if (g.meta.band === 'overdue' || g.meta.band === 'week') urgentCount += g.meds.length;
  }
  return { groups, urgentCount, bandCount: groups.length };
}
