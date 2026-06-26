import { describe, it, expect } from 'vitest';
import {
  splitDuration,
  humanizeDuration,
  buildDoseCountdown,
  clockLabel,
} from '../lib/countdown';
import type { NextDoseInput } from '../lib/next-dose';

const NOW = Date.parse('2026-06-25T12:00:00Z');

function dose(
  id: string,
  minutesFromNow: number,
  status: NextDoseInput['status'] = 'pending',
): NextDoseInput {
  return { id, scheduledAt: new Date(NOW + minutesFromNow * 60_000).toISOString(), status };
}

describe('splitDuration', () => {
  it('splits into whole hours + minutes', () => {
    expect(splitDuration(95 * 60_000)).toEqual({ hours: 1, minutes: 35 });
  });
  it('rounds to the nearest minute', () => {
    expect(splitDuration(89 * 1000)).toEqual({ hours: 0, minutes: 1 }); // 89s -> 1m
  });
  it('clamps negatives to zero', () => {
    expect(splitDuration(-50_000)).toEqual({ hours: 0, minutes: 0 });
  });
  it('handles exact hours', () => {
    expect(splitDuration(120 * 60_000)).toEqual({ hours: 2, minutes: 0 });
  });
});

describe('humanizeDuration', () => {
  it('formats "until" phrasing', () => {
    expect(humanizeDuration(72 * 60_000, 'until')).toBe('in 1 hour 12 minutes');
  });
  it('formats "since" phrasing', () => {
    expect(humanizeDuration(72 * 60_000, 'since')).toBe('1 hour 12 minutes ago');
  });
  it('formats bare phrasing', () => {
    expect(humanizeDuration(72 * 60_000)).toBe('1 hour 12 minutes');
  });
  it('pluralises correctly', () => {
    expect(humanizeDuration(61 * 60_000)).toBe('1 hour 1 minute');
    expect(humanizeDuration(125 * 60_000)).toBe('2 hours 5 minutes');
  });
  it('drops a zero hour part', () => {
    expect(humanizeDuration(20 * 60_000, 'until')).toBe('in 20 minutes');
  });
  it('drops a zero minute part', () => {
    expect(humanizeDuration(60 * 60_000, 'until')).toBe('in 1 hour');
  });
  it('special-cases sub-minute durations per direction', () => {
    expect(humanizeDuration(20_000, 'until')).toBe('due now');
    expect(humanizeDuration(20_000, 'since')).toBe('just now');
    expect(humanizeDuration(20_000, 'bare')).toBe('less than a minute');
  });
});

describe('buildDoseCountdown', () => {
  it('returns an all-clear model when nothing is pending', () => {
    const m = buildDoseCountdown([dose('a', -30, 'taken')], NOW);
    expect(m.hasNext).toBe(false);
    expect(m.doseId).toBeNull();
    expect(m.tone).toBe('none');
    expect(m.long).toMatch(/caught up/i);
  });

  it('counts down to the soonest upcoming dose', () => {
    const m = buildDoseCountdown([dose('soon', 72), dose('later', 200)], NOW);
    expect(m.doseId).toBe('soon');
    expect(m.hasNext).toBe(true);
    expect(m.overdue).toBe(false);
    expect(m.hours).toBe(1);
    expect(m.minutes).toBe(12);
    expect(m.long).toBe('in 1 hour 12 minutes');
  });

  it('marks an overdue dose and phrases it as elapsed', () => {
    const m = buildDoseCountdown([dose('late', -90)], NOW);
    expect(m.doseId).toBe('late');
    expect(m.overdue).toBe(true);
    expect(m.tone).toBe('overdue');
    expect(m.long).toBe('1 hour 30 minutes ago');
    expect(m.deltaMs).toBeLessThan(0);
  });

  it('treats a dose inside the grace window as due (not overdue)', () => {
    const m = buildDoseCountdown([dose('due', -5)], NOW);
    expect(m.tone).toBe('due');
    expect(m.overdue).toBe(false);
  });
});

describe('clockLabel', () => {
  it('formats an ISO time', () => {
    const label = clockLabel(new Date(NOW).toISOString());
    expect(typeof label).toBe('string');
    expect(label.length).toBeGreaterThan(0);
  });
  it('returns empty string for an invalid date', () => {
    expect(clockLabel('nope')).toBe('');
  });
});
