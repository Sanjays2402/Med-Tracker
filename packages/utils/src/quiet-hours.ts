import { addDays, parseHHMM } from './date';

/**
 * Quiet hours support for reminders.
 *
 * Users define a quiet window as a pair of HH:MM strings. The window can wrap
 * across midnight (for example 22:00 to 07:00). These helpers answer two
 * questions a reminder engine needs:
 *
 *  1. Is a given instant inside the quiet window?
 *  2. If a reminder would fall inside the quiet window, when should it be
 *     deferred to?
 *
 * All math is timezone naive; the caller is expected to pass instants that
 * have already been aligned to the user's timezone offset.
 */

export interface QuietHours {
  start: string; // HH:MM, inclusive
  end: string;   // HH:MM, exclusive
}

function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

function parseHM(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * True when `instant` falls inside the quiet window. Handles both same-day
 * (start < end) and overnight (start > end) windows. start == end is treated
 * as "no quiet hours".
 */
export function isInQuietHours(instant: Date, quiet: QuietHours): boolean {
  const startMin = parseHM(quiet.start);
  const endMin = parseHM(quiet.end);
  if (startMin === endMin) return false;
  const minute = minutesOfDay(instant);
  if (startMin < endMin) return minute >= startMin && minute < endMin;
  // overnight window wraps midnight
  return minute >= startMin || minute < endMin;
}

/**
 * If `instant` is inside the quiet window, return the next instant at which
 * reminders are allowed (the end of the current quiet window). Otherwise
 * return `instant` unchanged.
 */
export function deferToAllowedWindow(instant: Date, quiet: QuietHours): Date {
  if (!isInQuietHours(instant, quiet)) return instant;
  const startMin = parseHM(quiet.start);
  const endMin = parseHM(quiet.end);
  // Compute the next end boundary after `instant`.
  if (startMin < endMin) {
    // same-day window; end is later today
    return parseHHMM(quiet.end, instant);
  }
  // overnight window
  if (minutesOfDay(instant) >= startMin) {
    // we are in the pre-midnight tail; end is tomorrow at quiet.end
    return parseHHMM(quiet.end, addDays(instant, 1));
  }
  // we are in the post-midnight head; end is today at quiet.end
  return parseHHMM(quiet.end, instant);
}

export interface ReminderItem {
  medicationId: string;
  scheduleId: string;
  dueAt: Date;
}

export interface ScheduledReminder extends ReminderItem {
  /** When the reminder will actually fire after quiet-hours deferral. */
  fireAt: Date;
  /** True when the original due time was inside quiet hours. */
  deferred: boolean;
  /** True when fireAt is within the lead window of dueAt. */
  snoozeEligible: boolean;
}

/**
 * Decide when each due reminder should actually fire, given quiet hours and a
 * lead window. A reminder may fire up to `leadMinutes` before its dueAt, but
 * never inside the quiet window.
 */
export function planReminders(
  items: ReminderItem[],
  options: { now: Date; leadMinutes?: number; quiet?: QuietHours | null },
): ScheduledReminder[] {
  const leadMinutes = options.leadMinutes ?? 5;
  const out: ScheduledReminder[] = [];
  for (const item of items) {
    const target = item.dueAt;
    const earliest = new Date(target.getTime() - leadMinutes * 60_000);
    let fireAt = earliest.getTime() < options.now.getTime() ? options.now : earliest;
    let deferred = false;
    if (options.quiet && isInQuietHours(fireAt, options.quiet)) {
      fireAt = deferToAllowedWindow(fireAt, options.quiet);
      deferred = true;
    }
    out.push({
      ...item,
      fireAt,
      deferred,
      snoozeEligible: !deferred && fireAt.getTime() <= target.getTime(),
    });
  }
  return out.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
}
