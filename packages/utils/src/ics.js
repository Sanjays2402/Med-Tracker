"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildIcs = buildIcs;
exports.formatIcsDate = formatIcsDate;
exports.escapeText = escapeText;
exports.foldLine = foldLine;
const schedule_1 = require("./schedule");
const schedule_timezone_1 = require("./schedule-timezone");
const CRLF = '\r\n';
function buildIcs(items, opts) {
    const calendarName = opts.calendarName ?? 'Med-Tracker';
    const prodId = opts.prodId ?? '-//Med-Tracker//Schedule Export//EN';
    const durMin = opts.durationMinutes ?? 15;
    const lines = [
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
            ? (0, schedule_timezone_1.expandScheduleInZone)(item.schedule, { timeZone: opts.timeZone, from: opts.from, to: opts.to })
            : (0, schedule_1.expandSchedule)(item.schedule, opts.from, opts.to);
        for (const dueAt of times) {
            const end = new Date(dueAt.getTime() + durMin * 60_000);
            const uid = `dose-${item.medication.id}-${dueAt.getTime()}@med-tracker`;
            const summary = `${item.medication.name} ${item.medication.strength}`.trim();
            const description = item.medication.instructions
                ? `${item.medication.form}. ${item.medication.instructions}`
                : item.medication.form;
            lines.push('BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp}`, `DTSTART:${formatIcsDate(dueAt)}`, `DTEND:${formatIcsDate(end)}`, `SUMMARY:${escapeText(summary)}`, `DESCRIPTION:${escapeText(description)}`, 'CATEGORIES:Medication', 'TRANSP:TRANSPARENT');
            if (typeof opts.alarmMinutesBefore === 'number' && opts.alarmMinutesBefore > 0) {
                lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(summary)}`, `TRIGGER:-PT${Math.round(opts.alarmMinutesBefore)}M`, 'END:VALARM');
            }
            lines.push('END:VEVENT');
        }
    }
    lines.push('END:VCALENDAR');
    return lines.map(foldLine).join(CRLF) + CRLF;
}
/** Format a Date as UTC in iCalendar basic format (YYYYMMDDTHHMMSSZ). */
function formatIcsDate(d) {
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
function escapeText(s) {
    return s
        .replace(/\\/g, '\\\\')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '')
        .replace(/,/g, '\\,')
        .replace(/;/g, '\\;');
}
/** RFC 5545 section 3.1 line folding at 75 octets. */
function foldLine(line) {
    // Octet count uses UTF-8 byte length. ASCII-only content is the common case.
    const bytes = Buffer.from(line, 'utf8');
    if (bytes.length <= 75)
        return line;
    const parts = [];
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
