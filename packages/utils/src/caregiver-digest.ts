import type { AdherenceMetrics, AdherenceSummary } from './adherence-metrics';
import type { RefillForecast } from './refill-forecast';

/**
 * Caregiver digest composer.
 *
 * Produces a deterministic, plain-text weekly summary suitable for email or
 * SMS delivery to a caregiver who has been granted a share token. The
 * composer is pure (no IO, no time mutation) so it can be unit tested and
 * reused for both scheduled jobs and on-demand previews.
 *
 * Inputs are the same shapes the API already builds for the patient's own
 * dashboard: an adherence summary, missed dose counts per medication, and
 * an optional refill forecast. The composer does no clinical interpretation
 * beyond plain counts and percentages; anything diagnostic stays out.
 */

export interface MissedDose {
  medicationId: string;
  medicationName: string;
  scheduledFor: string;
}

export interface DigestPatient {
  name: string;
  /** Short identifier shown in the subject line, for example "Mom" or initials. */
  display?: string;
}

export interface DigestInput {
  patient: DigestPatient;
  /** Inclusive ISO date range covered by the digest. */
  weekStart: string;
  weekEnd: string;
  adherence: AdherenceSummary;
  /** Map of medicationId to display name for per-med detail lines. */
  medicationNames: Record<string, string>;
  missedDoses: MissedDose[];
  refills?: RefillForecast[];
}

export interface DigestOutput {
  subject: string;
  text: string;
  /** Structured numbers in case the caller renders HTML separately. */
  stats: {
    averagePdcPct: number;
    adherentCount: number;
    nonAdherentCount: number;
    missedCount: number;
    refillsDueSoon: number;
  };
}

const REFILL_SOON_DAYS = 7;

export function composeCaregiverDigest(input: DigestInput): DigestOutput {
  const name = input.patient.display ?? input.patient.name;
  const avgPct = Math.round(input.adherence.averagePdc * 100);
  const refillsDueSoon = (input.refills ?? []).filter(
    (r) => typeof r.daysOfSupply === 'number' && r.daysOfSupply <= REFILL_SOON_DAYS,
  ).length;

  const subject = `Med-Tracker weekly update for ${name}: ${avgPct}% adherence`;

  const lines: string[] = [];
  lines.push(`Hello,`);
  lines.push('');
  lines.push(
    `Here is the weekly Med-Tracker update for ${input.patient.name}, covering ${input.weekStart} through ${input.weekEnd}.`,
  );
  lines.push('');
  lines.push(`Overall adherence (PDC): ${avgPct}%`);
  lines.push(`Medications on track: ${input.adherence.adherentCount}`);
  lines.push(`Medications below ${Math.round(input.adherence.threshold * 100)}%: ${input.adherence.nonAdherentCount}`);
  lines.push(`Missed doses this week: ${input.missedDoses.length}`);
  if (refillsDueSoon > 0) {
    lines.push(`Refills due within ${REFILL_SOON_DAYS} days: ${refillsDueSoon}`);
  }

  if (input.adherence.perMedication.length > 0) {
    lines.push('');
    lines.push('Per medication:');
    const sorted = [...input.adherence.perMedication].sort((a, b) => a.pdc - b.pdc);
    for (const m of sorted) {
      lines.push(`  ${formatMedLine(m, input.medicationNames)}`);
    }
  }

  if (input.missedDoses.length > 0) {
    lines.push('');
    lines.push('Recent missed doses:');
    const recent = input.missedDoses.slice(0, 10);
    for (const md of recent) {
      lines.push(`  ${md.scheduledFor}  ${md.medicationName}`);
    }
    if (input.missedDoses.length > recent.length) {
      lines.push(`  ...and ${input.missedDoses.length - recent.length} more`);
    }
  }

  if (refillsDueSoon > 0 && input.refills) {
    lines.push('');
    lines.push('Upcoming refills:');
    const soon = input.refills
      .filter((r) => typeof r.daysOfSupply === 'number' && r.daysOfSupply <= REFILL_SOON_DAYS)
      .sort((a, b) => (a.daysOfSupply ?? 0) - (b.daysOfSupply ?? 0));
    for (const r of soon) {
      const name = input.medicationNames[r.medicationId] ?? r.medicationId;
      lines.push(`  ${name}: ${r.daysOfSupply} days remaining`);
    }
  }

  lines.push('');
  lines.push(
    'This message was sent because you have an active Med-Tracker caregiver share. To stop receiving updates, ask the patient to revoke your share.',
  );

  return {
    subject,
    text: lines.join('\n'),
    stats: {
      averagePdcPct: avgPct,
      adherentCount: input.adherence.adherentCount,
      nonAdherentCount: input.adherence.nonAdherentCount,
      missedCount: input.missedDoses.length,
      refillsDueSoon,
    },
  };
}

function formatMedLine(m: AdherenceMetrics, names: Record<string, string>): string {
  const name = names[m.medicationId] ?? m.medicationId;
  const pct = Math.round(m.pdc * 100);
  const gaps = m.gaps.length > 0 ? ` (${m.gaps.length} gap${m.gaps.length === 1 ? '' : 's'})` : '';
  return `${pct.toString().padStart(3, ' ')}%  ${name}${gaps}`;
}
