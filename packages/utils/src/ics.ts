import type { Medication, Schedule } from '@med/types';
import { expandSchedule } from './schedule';
import { expandScheduleInZone } from './schedule-timezone';

/**
 * iCalendar (RFC 5545) export for medication dose schedules.
 *
 * Each generated dose becomes a VEVENT with a stable UID so calendar clients
 * (Google, Apple, Outlook) deduplicate when the file is re-imported. The
 * VEVENT duration defaults to 15 minutes which is long enough to surface as
 * a banner notification on most clients without blocking a real meeting.
 *
 * Output is plain text suitable for serving as `text/calendar; charset=utf-8`
 * or downloading as `.ics`. Line folding follows RFC 5545 section 3.1: any
 * line longer than 75 octets is split with a CRLF + single space prefix.
 */

export interface IcsMedication {
  medication: Pick<Medication, 'id' | 'name' | 'strength' | 'form' | 'instructions'>;
  schedule: Schedule;
}

export interface IcsOptions {
  /** Window for schedule expansion. Required to bound recurring schedules. */
  from: Date;
  to: Date;
  /** Calendar name shown in clients (X-WR-CALNAME). */
  calendarName?: string;
  /** Per-dose duration in minutes. Default 15. */
  durationMinutes?: number;
  /** PRODID value. Default identifies Med-Tracker. */
  prodId?: string;
  /** Optional VALARM lead time in minutes. Omit for no alarm. */
  alarmMinutesBefore?: number;
  /**
   * IANA timezone (for example "America/Los_Angeles") in which the
   * schedule's HH:MM times should be interpreted. When omitted the schedule
   * is expanded in the host's local timezone, which matches legacy behavior
   * but is generally wrong in production. Always pass the patient's timezone.
   */
  timeZone?: string;
}

const CRLF = '\r\n';

export function buildIcs(items: IcsMedication[], opts: IcsOptions): string {
  const calendarName = opts.calendarName ?? 'Med-Tracker';
  const prodId = opts.prodId ?? '-//Med-Tracker//Schedule Export//EN';
  const durMin = opts.durationMinutes ?? 15;
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${prodId}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];
  const stamp = formatIcsDate(new Date());
  for (const item of items) {
    const times = opts.timeZone
      ? expandScheduleInZone(item.schedule, { timeZone: opts.timeZone, from: opts.from, to: opts.to })
      : expandSchedule(item.schedule, opts.from, opts.to);
    for (const dueAt of times) {
      const end = new Date(dueAt.getTime() + durMin * 60_000);
      const uid = `dose-${item.medication.id}-${dueAt.getTime()}@med-tracker`;
      const summary = `${item.medication.name} ${item.medication.strength}`.trim();
      const description =
        item.medication.instructions
          ? `${item.medication.form}. ${item.medication.instructions}`
          : item.medication.form;
      lines.push(
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${formatIcsDate(dueAt)}`,
        `DTEND:${formatIcsDate(end)}`,
        `SUMMARY:${escapeText(summary)}`,
        `DESCRIPTION:${escapeText(description)}`,
        'CATEGORIES:Medication',
        'TRANSP:TRANSPARENT',
      );
      if (typeof opts.alarmMinutesBefore === 'number' && opts.alarmMinutesBefore > 0) {
        lines.push(
          'BEGIN:VALARM',
          'ACTION:DISPLAY',
          `DESCRIPTION:${escapeText(summary)}`,
          `TRIGGER:-PT${Math.round(opts.alarmMinutesBefore)}M`,
          'END:VALARM',
        );
      }
      lines.push('END:VEVENT');
    }
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join(CRLF) + CRLF;
}

/** Format a Date as UTC in iCalendar basic format (YYYYMMDDTHHMMSSZ). */
export function formatIcsDate(d: Date): string {
  const y = d.getUTCFullYear().toString().padStart(4, '0');
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = d.getUTCDate().toString().padStart(2, '0');
  const hh = d.getUTCHours().toString().padStart(2, '0');
  const mm = d.getUTCMinutes().toString().padStart(2, '0');
  const ss = d.getUTCSeconds().toString().padStart(2, '0');
  return `${y}${m}${day}T${hh}${mm}${ss}Z`;
}

/**
 * Escape per RFC 5545: backslash, comma, semicolon, and newlines.
 * Order matters: backslash first to avoid double-escaping our own escapes.
 */
export function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/** RFC 5545 section 3.1 line folding at 75 octets. */
export function foldLine(line: string): string {
  // Octet count uses UTF-8 byte length. ASCII-only content is the common case.
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let i = 0;
  // First chunk up to 75 bytes, subsequent chunks up to 74 bytes (space prefix counts).
  let chunk = 75;
  while (i < bytes.length) {
    const end = Math.min(i + chunk, bytes.length);
    parts.push(bytes.slice(i, end).toString('utf8'));
    i = end;
    chunk = 74;
  }
  return parts.join(CRLF + ' ');
}
