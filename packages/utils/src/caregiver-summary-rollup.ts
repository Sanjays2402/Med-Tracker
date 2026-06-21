/**
 * Multi-patient caregiver household digest rollup.
 *
 * `composeCaregiverDigest` writes a per-patient weekly email. A
 * single caregiver often watches multiple patients (an adult child
 * caring for both parents; a paid aide covering three clients in
 * the same building). They want a single message with a quick
 * scoreboard:
 *
 *   - "Mom: 92% adherence (5 missed)"
 *   - "Dad: 73% adherence (12 missed) — Atorvastatin and
 *      Metformin both below 80%"
 *   - "Refills due this week: 3 across both"
 *
 * This module composes that household-level rollup from a list of
 * per-patient digest inputs. It reuses the same DigestInput type so
 * callers can fan-out a single SQL query into both individual emails
 * and a combined household summary.
 *
 * Pure / deterministic.
 */

import type { DigestInput } from './caregiver-digest';

export interface HouseholdRollupOptions {
  /**
   * PDC threshold below which a medication is flagged as "needs
   * attention". Defaults to the adherence summary's threshold (which
   * is 0.8 per CMS convention).
   */
  attentionThreshold?: number;
  /**
   * Max per-patient missed doses to list inline. Excess is summarized.
   * Default 3.
   */
  perPatientMissedLimit?: number;
  /** Refill horizon in days for "due this week". Default 7. */
  refillHorizonDays?: number;
}

export interface PatientRollupLine {
  patientName: string;
  display: string;
  pdcPct: number;
  missedCount: number;
  refillsDueSoon: number;
  /** Medications below the attention threshold (sorted by PDC ascending). */
  attentionMedications: Array<{
    medicationId: string;
    name: string;
    pdcPct: number;
  }>;
}

export interface HouseholdRollupStats {
  totalPatients: number;
  averagePdcPct: number;
  /** Sum across all patients of doses missed this week. */
  totalMissed: number;
  /** Number of refills across all patients within the horizon. */
  totalRefillsDueSoon: number;
  /** Patients with at least one medication below attentionThreshold. */
  patientsNeedingAttention: number;
}

export interface HouseholdRollupOutput {
  subject: string;
  text: string;
  perPatient: PatientRollupLine[];
  stats: HouseholdRollupStats;
}

const DEFAULT_REFILL_HORIZON = 7;

function pct(n: number): number {
  return Math.round(n * 100);
}

function buildPatientLine(
  input: DigestInput,
  options: HouseholdRollupOptions,
): PatientRollupLine {
  const display = input.patient.display ?? input.patient.name;
  const horizon = options.refillHorizonDays ?? DEFAULT_REFILL_HORIZON;
  const threshold = options.attentionThreshold ?? input.adherence.threshold;
  const refillsDueSoon = (input.refills ?? []).filter(
    (r) => typeof r.daysOfSupply === 'number' && r.daysOfSupply <= horizon,
  ).length;
  const attentionMedications = input.adherence.perMedication
    .filter((m) => m.pdc < threshold)
    .sort((a, b) => a.pdc - b.pdc)
    .map((m) => ({
      medicationId: m.medicationId,
      name: input.medicationNames[m.medicationId] ?? m.medicationId,
      pdcPct: pct(m.pdc),
    }));
  return {
    patientName: input.patient.name,
    display,
    pdcPct: pct(input.adherence.averagePdc),
    missedCount: input.missedDoses.length,
    refillsDueSoon,
    attentionMedications,
  };
}

function buildSubject(stats: HouseholdRollupStats, caregiverName?: string): string {
  const who = caregiverName ?? 'household';
  const watch = stats.patientsNeedingAttention > 0
    ? `, ${stats.patientsNeedingAttention} need${stats.patientsNeedingAttention === 1 ? 's' : ''} attention`
    : '';
  return `Med-Tracker household digest for ${who}: avg ${stats.averagePdcPct}% adherence${watch}`;
}

/**
 * Compose a single rollup message across multiple patients' digest
 * inputs.
 */
export function composeHouseholdRollup(
  inputs: DigestInput[],
  options: HouseholdRollupOptions = {},
  caregiverName?: string,
): HouseholdRollupOutput {
  const perPatient = inputs.map((i) => buildPatientLine(i, options));
  const totalMissed = perPatient.reduce((a, p) => a + p.missedCount, 0);
  const totalRefillsDueSoon = perPatient.reduce((a, p) => a + p.refillsDueSoon, 0);
  const patientsNeedingAttention = perPatient.filter(
    (p) => p.attentionMedications.length > 0,
  ).length;
  const averagePdcPct = perPatient.length === 0
    ? 0
    : Math.round(perPatient.reduce((a, p) => a + p.pdcPct, 0) / perPatient.length);
  const stats: HouseholdRollupStats = {
    totalPatients: perPatient.length,
    averagePdcPct,
    totalMissed,
    totalRefillsDueSoon,
    patientsNeedingAttention,
  };

  const lines: string[] = [];
  lines.push(`Hello,`);
  lines.push('');
  if (perPatient.length === 0) {
    lines.push('No patients in this digest.');
  } else {
    lines.push(`Weekly summary for ${perPatient.length} patient${perPatient.length === 1 ? '' : 's'}:`);
    lines.push('');
    for (const p of perPatient) {
      lines.push(`${p.display}: ${p.pdcPct}% adherence, ${p.missedCount} missed, ${p.refillsDueSoon} refill${p.refillsDueSoon === 1 ? '' : 's'} due this week.`);
      if (p.attentionMedications.length > 0) {
        const perMedLimit = options.perPatientMissedLimit ?? 3;
        const top = p.attentionMedications.slice(0, perMedLimit);
        const names = top.map((m) => `${m.name} (${m.pdcPct}%)`).join(', ');
        const moreCount = p.attentionMedications.length - top.length;
        const moreText = moreCount > 0 ? `, and ${moreCount} more` : '';
        lines.push(`  Below threshold: ${names}${moreText}`);
      }
    }
    lines.push('');
    lines.push(
      `Household totals: ${stats.totalMissed} missed dose${stats.totalMissed === 1 ? '' : 's'}, ${stats.totalRefillsDueSoon} upcoming refill${stats.totalRefillsDueSoon === 1 ? '' : 's'}.`,
    );
  }
  lines.push('');
  lines.push(
    'This message was sent because you have active Med-Tracker caregiver shares. To stop receiving updates, ask each patient to revoke your share.',
  );

  return {
    subject: buildSubject(stats, caregiverName),
    text: lines.join('\n'),
    perPatient,
    stats,
  };
}
