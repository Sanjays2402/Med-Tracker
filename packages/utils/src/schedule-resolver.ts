import type { Schedule } from '@med/types';
import {
  detectScheduleConflicts,
  type ConflictDetectorOptions,
  type ScheduleConflict,
  type ScheduledMedication,
  type SpacingRule,
} from './schedule-conflicts';
import { expandSchedule } from './schedule';

/**
 * Schedule conflict resolver.
 *
 * Conflict *detection* answers "is something wrong?". Resolution answers
 * "what should I do?". Given a set of scheduled medications and the same
 * detector options used to surface conflicts, the resolver proposes
 * minimal-shift edits that break cluster, duplicate, and spacing
 * collisions without violating any user-imposed locks.
 *
 * The output is a list of proposals, never an in-place mutation. Each
 * proposal names the schedule to update, the original time, and the
 * suggested new time, along with the rationale. Callers display these to
 * the user and apply only the approved ones.
 */

export interface ResolverOptions extends ConflictDetectorOptions {
  /**
   * Maximum minutes to shift a single dose in either direction. Default 90.
   * Tighter bounds keep the suggestion close to the patient's habits.
   */
  maxShiftMinutes?: number;
  /** Step in minutes for candidate searches. Default 15. */
  stepMinutes?: number;
  /** Schedule ids that must not be touched (for example: tied to meals). */
  lockedScheduleIds?: string[];
  /** Spacing rules duplicated from the detector for reuse. */
  spacingRules?: SpacingRule[];
}

export type ProposalReason = 'cluster' | 'spacing' | 'duplicate';

export interface ScheduleProposal {
  scheduleId: string;
  medicationId: string;
  timeIndex: number;
  originalTime: string;
  proposedTime: string;
  shiftMinutes: number;
  reason: ProposalReason;
  rationale: string;
}

interface MutableSchedule extends ScheduledMedication {
  schedule: Schedule & { times: string[] };
}

function cloneMeds(meds: ScheduledMedication[]): MutableSchedule[] {
  return meds.map((m) => ({
    medicationId: m.medicationId,
    schedule: { ...m.schedule, times: [...m.schedule.times] },
  }));
}

function parseHHMM(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function fmtHHMM(minutes: number): string {
  const wrapped = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function detect(meds: MutableSchedule[], opts: ResolverOptions): ScheduleConflict[] {
  return detectScheduleConflicts(meds, {
    from: opts.from,
    to: opts.to,
    clusterWindowMinutes: opts.clusterWindowMinutes,
    clusterThreshold: opts.clusterThreshold,
    duplicateWindowMinutes: opts.duplicateWindowMinutes,
    spacingRules: opts.spacingRules,
  });
}

/**
 * Try every candidate shift between `-maxShift` and `+maxShift` at the given
 * step, picking the smallest absolute shift that strictly reduces conflict
 * count. Returns null if no candidate improves things.
 */
function bestShiftFor(
  meds: MutableSchedule[],
  medIndex: number,
  timeIndex: number,
  opts: ResolverOptions,
  baselineCount: number,
): { newTime: string; shiftMinutes: number } | null {
  const step = opts.stepMinutes ?? 15;
  const maxShift = opts.maxShiftMinutes ?? 90;
  const original = meds[medIndex].schedule.times[timeIndex];
  const originalMin = parseHHMM(original);

  let best: { newTime: string; shiftMinutes: number; conflicts: number } | null = null;
  for (let delta = step; delta <= maxShift; delta += step) {
    for (const sign of [-1, 1]) {
      const candidateMin = originalMin + sign * delta;
      if (candidateMin < 0 || candidateMin >= 24 * 60) continue;
      const candidate = fmtHHMM(candidateMin);
      if (candidate === original) continue;
      meds[medIndex].schedule.times[timeIndex] = candidate;
      const conflicts = detect(meds, opts).length;
      meds[medIndex].schedule.times[timeIndex] = original;
      if (conflicts < baselineCount) {
        if (!best || conflicts < best.conflicts || delta < Math.abs(best.shiftMinutes)) {
          best = { newTime: candidate, shiftMinutes: sign * delta, conflicts };
        }
      }
    }
    if (best) return { newTime: best.newTime, shiftMinutes: best.shiftMinutes };
  }
  return best ? { newTime: best.newTime, shiftMinutes: best.shiftMinutes } : null;
}

function classifyConflict(c: ScheduleConflict): ProposalReason {
  return c.kind as ProposalReason;
}

/**
 * Generate a deterministic set of proposals. The algorithm iterates while
 * there are still conflicts, picks the first conflict's first non-locked
 * medication, and asks `bestShiftFor` for the smallest helpful change.
 * Bounded by a hard iteration cap so pathological inputs cannot loop.
 */
export function resolveConflicts(
  meds: ScheduledMedication[],
  opts: ResolverOptions,
): ScheduleProposal[] {
  const work = cloneMeds(meds);
  const locked = new Set(opts.lockedScheduleIds ?? []);
  const proposals: ScheduleProposal[] = [];
  const maxIterations = 25;

  for (let iter = 0; iter < maxIterations; iter++) {
    const conflicts = detect(work, opts);
    if (conflicts.length === 0) break;

    const target = conflicts[0];
    let resolved = false;

    for (const medId of target.medicationIds) {
      const medIndex = work.findIndex(
        (m) => m.medicationId === medId && !locked.has(m.schedule.id),
      );
      if (medIndex < 0) continue;
      const sched = work[medIndex].schedule;
      const targetTimeMin = (() => {
        const at = new Date(target.at);
        const expanded = expandSchedule(sched, opts.from, opts.to);
        const match = expanded.find((d) => d.getTime() === at.getTime());
        if (!match) return parseHHMM(sched.times[0] ?? '08:00');
        return match.getHours() * 60 + match.getMinutes();
      })();
      const timeIndex = sched.times.findIndex((t) => parseHHMM(t) === targetTimeMin);
      if (timeIndex < 0) continue;

      const baseline = conflicts.length;
      const shift = bestShiftFor(work, medIndex, timeIndex, opts, baseline);
      if (!shift) continue;

      const original = sched.times[timeIndex];
      sched.times[timeIndex] = shift.newTime;
      proposals.push({
        scheduleId: sched.id,
        medicationId: medId,
        timeIndex,
        originalTime: original,
        proposedTime: shift.newTime,
        shiftMinutes: shift.shiftMinutes,
        reason: classifyConflict(target),
        rationale: target.message,
      });
      resolved = true;
      break;
    }

    if (!resolved) break; // nothing we can do without violating locks
  }

  return proposals;
}
