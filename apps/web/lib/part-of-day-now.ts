/**
 * part-of-day-now — pure "which section is happening now" selector for /today.
 *
 * The Today page groups doses into Morning / Afternoon / Evening / Night
 * (lib/part-of-day). This tiny module answers a different question: which of
 * those sections contains the CURRENT hour, so the page can drop a subtle "now"
 * cap on the active section header and the eye lands on the block in play.
 *
 * It reuses partOfDayForHour so the thresholds never drift from the bucketing,
 * and takes the current hour (or a Date) as input so it stays deterministic
 * under test. No React.
 */

import { partOfDayForHour, type PartOfDay } from './part-of-day';

/**
 * The section the given hour-of-day (0..23) falls in. Thin pass-through to
 * partOfDayForHour so callers can read intent ("current part of day") without
 * importing the bucketing helper directly.
 */
export function currentPartOfDay(hour: number): PartOfDay {
  return partOfDayForHour(hour);
}

/**
 * The section happening right now, derived from a Date (defaults to now). Uses
 * the local hour exactly as the page renders dose times, so the cap lands on
 * the section the user is actually living in.
 */
export function currentPartOfDayFromDate(date: Date = new Date()): PartOfDay {
  const h = date.getHours();
  return partOfDayForHour(Number.isFinite(h) ? h : 0);
}

/**
 * True when `label` is the section containing `hour`. Lets a section header ask
 * `isCurrentPartOfDay(label, now.getHours())` to decide whether to show its
 * "now" cap.
 */
export function isCurrentPartOfDay(label: PartOfDay, hour: number): boolean {
  return partOfDayForHour(hour) === label;
}

/**
 * The lowercase verb phrase a "now" cap can show next to the section title:
 * "this morning", "this afternoon", "this evening", "tonight". Night reads
 * "tonight" rather than "this night" so the copy stays natural.
 */
export function nowCapLabel(label: PartOfDay): string {
  switch (label) {
    case 'Morning': return 'this morning';
    case 'Afternoon': return 'this afternoon';
    case 'Evening': return 'this evening';
    case 'Night': return 'tonight';
  }
}
