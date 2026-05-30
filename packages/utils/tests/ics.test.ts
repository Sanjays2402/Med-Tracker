import { describe, it, expect } from 'vitest';
import { buildIcs, escapeText, foldLine, formatIcsDate, type IcsMedication } from '../src/ics';

const med: IcsMedication = {
  medication: {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Atorvastatin',
    strength: '20mg',
    form: 'tablet',
    instructions: 'Take with evening meal.',
  },
  schedule: {
    id: '22222222-2222-2222-2222-222222222222',
    medicationId: '11111111-1111-1111-1111-111111111111',
    kind: 'daily',
    times: ['08:00', '20:00'],
    startsAt: '2026-01-01T00:00:00.000Z',
    enabled: true,
  } as any,
};

const from = new Date('2026-01-01T00:00:00.000Z');
const to = new Date('2026-01-02T23:59:59.000Z');

describe('ics export', () => {
  it('formats UTC date in basic iCalendar form', () => {
    expect(formatIcsDate(new Date('2026-03-04T05:06:07.000Z'))).toBe('20260304T050607Z');
  });

  it('escapes commas, semicolons, backslashes, and newlines', () => {
    expect(escapeText('a, b; c\\d\ne')).toBe('a\\, b\\; c\\\\d\\ne');
  });

  it('folds long lines at 75 octets with CRLF + space', () => {
    const long = 'X'.repeat(200);
    const folded = foldLine(long);
    const segments = folded.split('\r\n ');
    expect(segments[0]!.length).toBe(75);
    // Subsequent segments are at most 74 bytes (space prefix counts).
    for (let i = 1; i < segments.length; i++) expect(segments[i]!.length).toBeLessThanOrEqual(74);
    expect(segments.join('').length).toBe(200);
  });

  it('builds a valid VCALENDAR with one VEVENT per dose', () => {
    const ics = buildIcs([med], { from, to });
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    const events = ics.match(/BEGIN:VEVENT/g) ?? [];
    // 2 days x 2 times per day = 4 events
    expect(events.length).toBe(4);
    expect(ics).toContain('SUMMARY:Atorvastatin 20mg');
    expect(ics).toContain('CATEGORIES:Medication');
  });

  it('emits stable UIDs based on medication and timestamp', () => {
    const ics = buildIcs([med], { from, to });
    const uids = [...ics.matchAll(/UID:([^\r\n]+)/g)].map((m) => m[1]);
    expect(new Set(uids).size).toBe(uids.length);
    for (const uid of uids) expect(uid).toMatch(/^dose-11111111-1111-1111-1111-111111111111-\d+@med-tracker$/);
  });

  it('omits VALARM when alarmMinutesBefore is not set', () => {
    const ics = buildIcs([med], { from, to });
    expect(ics).not.toContain('BEGIN:VALARM');
  });

  it('adds VALARM when alarmMinutesBefore is positive', () => {
    const ics = buildIcs([med], { from, to, alarmMinutesBefore: 10 });
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics).toContain('TRIGGER:-PT10M');
  });

  it('asNeeded schedule emits no events', () => {
    const asNeeded: IcsMedication = {
      ...med,
      schedule: { ...med.schedule, kind: 'asNeeded', times: [] } as any,
    };
    const ics = buildIcs([asNeeded], { from, to });
    expect(ics).not.toContain('BEGIN:VEVENT');
  });

  it('uses CRLF line endings throughout', () => {
    const ics = buildIcs([med], { from, to });
    // No lone LF (every \n must be preceded by \r).
    expect(/[^\r]\n/.test(ics)).toBe(false);
  });
});
