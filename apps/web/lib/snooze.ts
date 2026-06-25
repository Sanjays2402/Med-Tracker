/**
 * snooze — pure "wake this notification later" time math.
 *
 * The notifications list lets a user snooze a reminder for a relative window
 * ("1 hour"), or until a named future moment ("tomorrow morning", "Monday").
 * This module turns a snooze choice + a reference `now` into a concrete wake
 * timestamp and a friendly label, with no React and no Date.now() so it is
 * fully deterministic under test.
 *
 * Morning defaults to 09:00 local. "Tomorrow" is the next calendar day at 09:00.
 * "Monday" is the next Monday at 09:00 (if today IS Monday, it jumps a week so a
 * snooze always moves forward). "This evening" is 18:00 today, or 18:00 tomorrow
 * if it is already past 18:00.
 */

export type SnoozeChoice = '1h' | '3h' | 'evening' | 'tomorrow' | 'monday';

export interface SnoozeOption {
  choice: SnoozeChoice;
  label: string;
}

export const SNOOZE_OPTIONS: SnoozeOption[] = [
  { choice: '1h', label: 'For 1 hour' },
  { choice: '3h', label: 'For 3 hours' },
  { choice: 'evening', label: 'Until this evening' },
  { choice: 'tomorrow', label: 'Until tomorrow' },
  { choice: 'monday', label: 'Until Monday' },
];

const MORNING_HOUR = 9;
const EVENING_HOUR = 18;

/** Compute the wake time (ms epoch) for a snooze choice relative to `now`. */
export function snoozeUntil(choice: SnoozeChoice, now: number = Date.now()): number {
  const base = new Date(now);
  switch (choice) {
    case '1h':
      return now + 60 * 60_000;
    case '3h':
      return now + 3 * 60 * 60_000;
    case 'evening': {
      const d = atHour(base, EVENING_HOUR);
      // If it's already past 18:00, roll to tomorrow evening.
      if (d.getTime() <= now) d.setDate(d.getDate() + 1);
      return d.getTime();
    }
    case 'tomorrow': {
      const d = atHour(base, MORNING_HOUR);
      d.setDate(d.getDate() + 1);
      return d.getTime();
    }
    case 'monday': {
      const d = atHour(base, MORNING_HOUR);
      // 1 = Monday. Days until next Monday; if today is Monday, jump a full week.
      let delta = (1 - d.getDay() + 7) % 7;
      if (delta === 0) delta = 7;
      d.setDate(d.getDate() + delta);
      return d.getTime();
    }
  }
}

function atHour(ref: Date, hour: number): Date {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), hour, 0, 0, 0);
  return d;
}

/**
 * A short human label for when a snooze will resurface, e.g. "in 1h",
 * "tonight 6:00 PM", "tomorrow 9:00 AM", "Mon 9:00 AM". Uses the provided
 * locale-free time format so it is stable across environments in tests when a
 * formatter is injected; defaults to toLocaleTimeString otherwise.
 */
export function snoozeLabel(
  choice: SnoozeChoice,
  now: number = Date.now(),
  fmt: (ms: number) => string = defaultTimeFmt,
): string {
  const when = snoozeUntil(choice, now);
  switch (choice) {
    case '1h':
      return 'in 1 hour';
    case '3h':
      return 'in 3 hours';
    case 'evening':
      return `this evening, ${fmt(when)}`;
    case 'tomorrow':
      return `tomorrow, ${fmt(when)}`;
    case 'monday':
      return `Monday, ${fmt(when)}`;
  }
}

function defaultTimeFmt(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
