import {
  detectScheduleConflicts,
  expandSchedule,
  type ConflictDetectorOptions,
  type ScheduleConflict,
  type ScheduledMedication,
} from '@med/utils';
import type { Schedule } from '@med/types';

/**
 * ScheduleService groups schedule-shaped operations that do not touch
 * persistence. Routes inject persistence-backed loaders and pass the results
 * here so the math stays unit-testable without a database.
 */
export class ScheduleService {
  /** Expand a single schedule into concrete dose timestamps. */
  expand(schedule: Schedule, from: Date, to: Date): Date[] {
    return expandSchedule(schedule, from, to);
  }

  /**
   * Detect cluster, duplicate, and spacing conflicts across a user's
   * scheduled medications. Returns an empty list when no conflicts exist.
   */
  conflicts(meds: ScheduledMedication[], opts: ConflictDetectorOptions): ScheduleConflict[] {
    return detectScheduleConflicts(meds, opts);
  }
}
