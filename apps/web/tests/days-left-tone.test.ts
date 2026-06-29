import { describe, it, expect } from 'vitest';
import {
  daysLeftTone,
  daysLeftToneVar,
  buildSupplyBar,
  supplyBarAriaLabel,
  runoutChip,
  remainingChip,
} from '../lib/days-left-tone';
import type { Medication } from '../lib/types';

function med(over: Partial<Medication> = {}): Medication {
  return { id: 'm1', name: 'Atorvastatin', ...over };
}

describe('daysLeftTone', () => {
  it('is neutral when days are unknown', () => {
    expect(daysLeftTone(null)).toBe('neutral');
    expect(daysLeftTone(undefined)).toBe('neutral');
    expect(daysLeftTone(Number.NaN)).toBe('neutral');
    expect(daysLeftTone(Infinity)).toBe('neutral');
  });

  it('is danger under a week of supply', () => {
    expect(daysLeftTone(0)).toBe('danger');
    expect(daysLeftTone(6)).toBe('danger');
  });

  it('treats the 7-day boundary as warn, not danger', () => {
    expect(daysLeftTone(7)).toBe('warn');
  });

  it('is warn between one and two weeks', () => {
    expect(daysLeftTone(7)).toBe('warn');
    expect(daysLeftTone(13)).toBe('warn');
  });

  it('treats the 14-day boundary as ok, not warn', () => {
    expect(daysLeftTone(14)).toBe('ok');
  });

  it('is ok with a comfortable runway', () => {
    expect(daysLeftTone(30)).toBe('ok');
    expect(daysLeftTone(90)).toBe('ok');
  });

  it('honours overridden cut points', () => {
    expect(daysLeftTone(10, { dangerBelow: 14, warnBelow: 28 })).toBe('danger');
    expect(daysLeftTone(20, { dangerBelow: 14, warnBelow: 28 })).toBe('warn');
    expect(daysLeftTone(30, { dangerBelow: 14, warnBelow: 28 })).toBe('ok');
  });
});

describe('daysLeftToneVar', () => {
  it('maps each tone to its CSS variable', () => {
    expect(daysLeftToneVar(3)).toBe('var(--danger)');
    expect(daysLeftToneVar(10)).toBe('var(--warn)');
    expect(daysLeftToneVar(40)).toBe('var(--ok)');
    expect(daysLeftToneVar(null)).toBe('var(--ink-muted)');
  });
});

describe('buildSupplyBar', () => {
  it('reports no data when remainingDoses is unknown', () => {
    const bar = buildSupplyBar(med());
    expect(bar.hasData).toBe(false);
    expect(bar.daysLeft).toBeNull();
    expect(bar.pct).toBe(0);
    expect(bar.tone).toBe('neutral');
    expect(bar.caption).toBe('No supply data');
  });

  it('fills proportional to days-left across the horizon', () => {
    // 30 doses, once-daily schedule -> 30 days left -> full bar on a 30d horizon.
    const bar = buildSupplyBar(med({ remainingDoses: 30, schedule: '08:00 daily' }));
    expect(bar.daysLeft).toBe(30);
    expect(bar.pct).toBe(100);
    expect(bar.tone).toBe('ok');
    expect(bar.hasData).toBe(true);
  });

  it('halves the fill at half the horizon', () => {
    const bar = buildSupplyBar(med({ remainingDoses: 15, schedule: '08:00 daily' }));
    expect(bar.daysLeft).toBe(15);
    expect(bar.pct).toBe(50);
    expect(bar.tone).toBe('ok'); // 15 >= 14
  });

  it('accounts for twice-daily schedules in days-left', () => {
    // 20 doses at 2/day -> 10 days left -> warn, 33% of a 30d horizon.
    const bar = buildSupplyBar(med({ remainingDoses: 20, schedule: '08:00, 20:00 daily' }));
    expect(bar.daysLeft).toBe(10);
    expect(bar.tone).toBe('warn');
    expect(bar.pct).toBe(33);
  });

  it('flags a near-empty bottle as danger', () => {
    const bar = buildSupplyBar(med({ remainingDoses: 4, schedule: '08:00 daily' }));
    expect(bar.daysLeft).toBe(4);
    expect(bar.tone).toBe('danger');
    expect(bar.caption).toBe('4 days of supply left');
  });

  it('clamps the fill at 100 for a long runway', () => {
    const bar = buildSupplyBar(med({ remainingDoses: 90, schedule: '08:00 daily' }));
    expect(bar.daysLeft).toBe(90);
    expect(bar.pct).toBe(100);
  });

  it('reads an empty bottle as out of supply', () => {
    const bar = buildSupplyBar(med({ remainingDoses: 0, schedule: '08:00 daily' }));
    expect(bar.daysLeft).toBe(0);
    expect(bar.pct).toBe(0);
    expect(bar.tone).toBe('danger');
    expect(bar.caption).toBe('Out of supply');
  });

  it('singularises a one-day caption', () => {
    const bar = buildSupplyBar(med({ remainingDoses: 1, schedule: '08:00 daily' }));
    expect(bar.caption).toBe('1 day of supply left');
  });

  it('respects a custom horizon', () => {
    // 7 days left on a 14d horizon -> 50%.
    const bar = buildSupplyBar(med({ remainingDoses: 7, schedule: '08:00 daily' }), { horizonDays: 14 });
    expect(bar.pct).toBe(50);
    expect(bar.horizonDays).toBe(14);
  });
});

describe('runoutChip', () => {
  it('is neutral with no label when remainingDoses is unknown', () => {
    expect(runoutChip(med())).toEqual({ daysLeft: null, tone: 'neutral', label: null });
  });

  it('shares daysLeftTone bands with the detail-hero supply bar', () => {
    // 6 days -> danger (< 7), same band the hero bar uses.
    const danger = runoutChip(med({ remainingDoses: 6, schedule: '08:00 daily' }));
    expect(danger).toEqual({ daysLeft: 6, tone: 'danger', label: '~6d left' });
    expect(danger.tone).toBe(buildSupplyBar(med({ remainingDoses: 6, schedule: '08:00 daily' })).tone);
  });

  it('reads the 7-day boundary as warn (not danger), matching the hero', () => {
    const chip = runoutChip(med({ remainingDoses: 7, schedule: '08:00 daily' }));
    expect(chip.tone).toBe('warn');
    expect(chip.label).toBe('~7d left');
  });

  it('reads a comfortable runway as ok (the old list chip read it neutral)', () => {
    // 20 days -> ok. The list's old inline `< 14 ? warn : neutral` would have
    // read this neutral; sharing daysLeftTone makes it sage like the hero.
    const chip = runoutChip(med({ remainingDoses: 20, schedule: '08:00 daily' }));
    expect(chip.tone).toBe('ok');
    expect(chip.daysLeft).toBe(20);
  });

  it('accounts for twice-daily schedules in the day count', () => {
    // 20 doses at 2/day -> 10 days -> warn.
    const chip = runoutChip(med({ remainingDoses: 20, schedule: '08:00, 20:00 daily' }));
    expect(chip.daysLeft).toBe(10);
    expect(chip.tone).toBe('warn');
    expect(chip.label).toBe('~10d left');
  });

  it('forwards custom cut points to daysLeftTone', () => {
    const chip = runoutChip(med({ remainingDoses: 20, schedule: '08:00 daily' }), { dangerBelow: 14, warnBelow: 28 });
    expect(chip.tone).toBe('warn'); // 20 is < 28 and >= 14
  });
});

describe('remainingChip', () => {
  it('returns null label + neutral tone when remaining is unknown', () => {
    expect(remainingChip(null)).toEqual({ remaining: null, tone: 'neutral', label: null });
    expect(remainingChip(undefined)).toEqual({ remaining: null, tone: 'neutral', label: null });
  });

  it('tones low / mid / healthy counts on the same calm bands', () => {
    expect(remainingChip(8).tone).toBe('danger');
    expect(remainingChip(15).tone).toBe('warn');
    expect(remainingChip(40).tone).toBe('ok');
  });

  it('reads the cut points as the calmer band', () => {
    expect(remainingChip(10).tone).toBe('warn'); // 10 is not danger
    expect(remainingChip(20).tone).toBe('ok'); // 20 is not warn
  });

  it('labels the count', () => {
    expect(remainingChip(8).label).toBe('8 left');
  });

  it('accepts custom cut points', () => {
    expect(remainingChip(15, { dangerBelow: 20 }).tone).toBe('danger');
  });
});

describe('supplyBarAriaLabel', () => {
  it('pairs the caption with a tone word for a healthy bar', () => {
    const bar = buildSupplyBar(med({ remainingDoses: 30, schedule: '08:00 daily' }));
    expect(supplyBarAriaLabel(bar)).toBe('30 days of supply left, healthy');
  });
  it('says "getting low" on a warn bar', () => {
    const bar = buildSupplyBar(med({ remainingDoses: 10, schedule: '08:00 daily' }));
    expect(supplyBarAriaLabel(bar)).toBe('10 days of supply left, getting low');
  });
  it('says "low" on a danger bar', () => {
    const bar = buildSupplyBar(med({ remainingDoses: 4, schedule: '08:00 daily' }));
    expect(supplyBarAriaLabel(bar)).toContain('low');
  });
  it('is null when there is no supply data', () => {
    expect(supplyBarAriaLabel(buildSupplyBar(med()))).toBeNull();
  });
});

