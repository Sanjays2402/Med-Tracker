import type { Schedule } from '@med/types';
import { expandSchedule } from './schedule';

/**
 * Detect conflicts in a user's medication schedule. Three classes of conflict
 * are reported so the UI can surface them with distinct severity badges:
 *
 *   - cluster: many doses bunched into a short window. People miss doses when
 *     too many fall together; this surfaces opportunities to split them.
 *   - spacing: two medications flagged as needing separation (for example a
 *     thyroid hormone and a calcium supplement) are scheduled inside the
 *     required gap. The pair list is supplied by the caller so the rules can
 *     come from the drug catalog or a clinician override.
 *   - duplicate: the same medication has two schedules whose dose times
 *     collide within the dedup window, which usually indicates a data-entry
 *     mistake.
 *
 * The detector is deterministic and offline. It does not load the drug
 * catalog or hit the database; callers expand any catalog rules into the
 * `spacingRules` argument before invoking.
 */

export interface ScheduledMedication {
  medicationId: string;
  schedule: Schedule;
}

export interface SpacingRule {
  /** Either ordering of (a,b) is matched. */
  medicationA: string;
  medicationB: string;
  /** Minimum minutes that should separate any dose of A from any dose of B. */
  minMinutes: number;
  /** Optional human label used in the conflict report. */
  reason?: string;
}

export interface ConflictDetectorOptions {
  /** Window within which to check; both ends inclusive. */
  from: Date;
  to: Date;
  /** Doses falling inside this many minutes count as one cluster. Default 15. */
  clusterWindowMinutes?: number;
  /** Cluster size that triggers a `cluster` conflict. Default 4. */
  clusterThreshold?: number;
  /** Duplicate-collision window in minutes. Default 5. */
  duplicateWindowMinutes?: number;
  /** Pairwise spacing rules. */
  spacingRules?: SpacingRule[];
}

export type ConflictKind = 'cluster' | 'spacing' | 'duplicate';

export interface ScheduleConflict {
  kind: ConflictKind;
  at: string;
  medicationIds: string[];
  message: string;
  /** Conflict severity for UI badging. */
  severity: 'info' | 'warning' | 'critical';
}

interface DoseRef {
  medicationId: string;
  scheduleId: string;
  at: Date;
}

const MIN_MS = 60_000;

export function detectScheduleConflicts(
  meds: ScheduledMedication[],
  opts: ConflictDetectorOptions,
): ScheduleConflict[] {
  const clusterWindow = (opts.clusterWindowMinutes ?? 15) * MIN_MS;
  const clusterThreshold = opts.clusterThreshold ?? 4;
  const dupWindow = (opts.duplicateWindowMinutes ?? 5) * MIN_MS;

  const doses: DoseRef[] = [];
  for (const m of meds) {
    for (const at of expandSchedule(m.schedule, opts.from, opts.to)) {
      doses.push({ medicationId: m.medicationId, scheduleId: m.schedule.id, at });
    }
  }
  doses.sort((a, b) => a.at.getTime() - b.at.getTime());

  const out: ScheduleConflict[] = [];

  // Cluster: sliding window over sorted doses.
  for (let i = 0; i < doses.length; i++) {
    let j = i;
    while (j + 1 < doses.length && doses[j + 1]!.at.getTime() - doses[i]!.at.getTime() <= clusterWindow) {
      j += 1;
    }
    const span = j - i + 1;
    if (span >= clusterThreshold) {
      const ids = Array.from(new Set(doses.slice(i, j + 1).map((d) => d.medicationId)));
      out.push({
        kind: 'cluster',
        at: doses[i]!.at.toISOString(),
        medicationIds: ids,
        message: `${span} doses scheduled within ${(clusterWindow / MIN_MS).toFixed(0)} minutes`,
        severity: 'warning',
      });
      i = j; // skip ahead past the cluster
    }
  }

  // Duplicate: same medication, two schedules, doses within dupWindow.
  for (let i = 0; i < doses.length; i++) {
    for (let j = i + 1; j < doses.length; j++) {
      const dt = doses[j]!.at.getTime() - doses[i]!.at.getTime();
      if (dt > dupWindow) break;
      if (
        doses[i]!.medicationId === doses[j]!.medicationId &&
        doses[i]!.scheduleId !== doses[j]!.scheduleId
      ) {
        out.push({
          kind: 'duplicate',
          at: doses[i]!.at.toISOString(),
          medicationIds: [doses[i]!.medicationId],
          message: 'Duplicate dose times from two schedules for the same medication',
          severity: 'critical',
        });
      }
    }
  }

  // Spacing: every pair of doses across the two meds in a rule.
  for (const rule of opts.spacingRules ?? []) {
    const gapMs = rule.minMinutes * MIN_MS;
    const a = doses.filter((d) => d.medicationId === rule.medicationA);
    const b = doses.filter((d) => d.medicationId === rule.medicationB);
    for (const da of a) {
      for (const db of b) {
        const delta = Math.abs(da.at.getTime() - db.at.getTime());
        if (delta < gapMs) {
          out.push({
            kind: 'spacing',
            at: (da.at.getTime() <= db.at.getTime() ? da.at : db.at).toISOString(),
            medicationIds: [rule.medicationA, rule.medicationB],
            message:
              rule.reason ??
              `Doses are ${Math.round(delta / MIN_MS)} min apart; should be at least ${rule.minMinutes} min`,
            severity: 'critical',
          });
        }
      }
    }
  }

  // Sort final report by time then severity (critical first within ties).
  const sevRank = { critical: 0, warning: 1, info: 2 };
  out.sort((x, y) => {
    const t = x.at.localeCompare(y.at);
    return t !== 0 ? t : sevRank[x.severity] - sevRank[y.severity];
  });
  return out;
}
