import { describe, it, expect } from 'vitest';
import {
  localKey,
  classifyDay,
  buildWeekStrip,
  summarizeWeekStrip,
  type WeekStripDoseInput,
} from '../lib/week-strip';

// Fixed reference: Thursday 2026-06-25 12:00 local.
const TODAY = new Date(2026, 5, 25, 12, 0, 0, 0).getTime();

function dose(status: WeekStripDoseInput['status']): WeekStripDoseInput {
  return { scheduledAt: new Date(TODAY).toISOString(), status };
}

describe('localKey', () => {
  it('formats local YYYY-MM-DD with zero padding', () => {
    expect(localKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(localKey(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});

describe('classifyDay', () => {
  it('none when nothing scheduled', () => {
    expect(classifyDay([]).state).toBe('none');
  });
  it('full when every dose taken', () => {
    expect(classifyDay([dose('taken'), dose('taken')]).state).toBe('full');
  });
  it('missed when scheduled but none taken', () => {
    expect(classifyDay([dose('missed'), dose('skipped')]).state).toBe('missed');
  });
  it('partial on a mix', () => {
    const r = classifyDay([dose('taken'), dose('missed')]);
    expect(r.state).toBe('partial');
    expect(r.taken).toBe(1);
    expect(r.scheduled).toBe(2);
  });
});

describe('buildWeekStrip', () => {
  it('produces seven days ending on today (rightmost)', () => {
    const strip = buildWeekStrip({}, TODAY);
    expect(strip).toHaveLength(7);
    expect(strip[6]!.isToday).toBe(true);
    expect(strip[6]!.key).toBe('2026-06-25');
    expect(strip[0]!.key).toBe('2026-06-19'); // 6 days earlier
  });
  it('marks exactly one today cell', () => {
    const strip = buildWeekStrip({}, TODAY);
    expect(strip.filter((d) => d.isToday)).toHaveLength(1);
  });
  it('uses correct weekday initials', () => {
    const strip = buildWeekStrip({}, TODAY);
    // 2026-06-19 is a Friday, 2026-06-25 is a Thursday
    expect(strip[0]!.weekdayInitial).toBe('F');
    expect(strip[6]!.weekdayInitial).toBe('T');
  });
  it('classifies days from the dose map', () => {
    const strip = buildWeekStrip(
      {
        '2026-06-25': [dose('taken'), dose('taken')],
        '2026-06-24': [dose('taken'), dose('missed')],
        '2026-06-23': [dose('missed')],
      },
      TODAY,
    );
    expect(strip.find((d) => d.key === '2026-06-25')!.state).toBe('full');
    expect(strip.find((d) => d.key === '2026-06-24')!.state).toBe('partial');
    expect(strip.find((d) => d.key === '2026-06-23')!.state).toBe('missed');
    expect(strip.find((d) => d.key === '2026-06-22')!.state).toBe('none');
  });
  it('honours a custom day count', () => {
    expect(buildWeekStrip({}, TODAY, 3)).toHaveLength(3);
  });
});

describe('summarizeWeekStrip', () => {
  it('rolls up active / perfect / missed days and adherence', () => {
    const strip = buildWeekStrip(
      {
        '2026-06-25': [dose('taken'), dose('taken')], // full
        '2026-06-24': [dose('taken'), dose('missed')], // partial
        '2026-06-23': [dose('missed')], // missed
        '2026-06-22': [dose('taken')], // full
      },
      TODAY,
    );
    const s = summarizeWeekStrip(strip);
    expect(s.activeDays).toBe(4);
    expect(s.perfectDays).toBe(2);
    expect(s.missedDays).toBe(1);
    // taken 4 / scheduled 6 = 67
    expect(s.adherencePct).toBe(67);
  });
  it('reports 0% adherence on an empty week', () => {
    expect(summarizeWeekStrip(buildWeekStrip({}, TODAY)).adherencePct).toBe(0);
  });
});
