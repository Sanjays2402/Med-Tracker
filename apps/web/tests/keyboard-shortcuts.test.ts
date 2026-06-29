import { describe, it, expect } from 'vitest';
import {
  BASE_GROUPS,
  routeActionShortcut,
  shortcutGroupsFor,
} from '../lib/keyboard-shortcuts';
import { STRIP_DENSITY_HOTKEY } from '../lib/refill-timeline-density';

describe('BASE_GROUPS', () => {
  it('has the three expected groups in order', () => {
    expect(BASE_GROUPS.map((g) => g.heading)).toEqual(['Navigation', 'Actions', 'Help']);
  });
  it('ends the Actions group with Esc (the tail page-local extras insert before)', () => {
    const actions = BASE_GROUPS.find((g) => g.heading === 'Actions')!;
    expect(actions.shortcuts.at(-1)!.keys).toEqual(['Esc']);
  });
});

describe('routeActionShortcut', () => {
  it('gives the density-flip shortcut on /refills', () => {
    const sc = routeActionShortcut('/refills');
    expect(sc).not.toBeNull();
    expect(sc!.keys).toEqual([STRIP_DENSITY_HOTKEY.toUpperCase()]);
    expect(sc!.label).toBe('Flip refill timeline density');
  });
  it('also matches nested refills routes', () => {
    expect(routeActionShortcut('/refills/needed')).not.toBeNull();
    expect(routeActionShortcut('/refills/history')).not.toBeNull();
  });
  it('is null on every other route', () => {
    expect(routeActionShortcut('/today')).toBeNull();
    expect(routeActionShortcut('/medications')).toBeNull();
    expect(routeActionShortcut('/')).toBeNull();
    expect(routeActionShortcut('')).toBeNull();
  });
});

describe('shortcutGroupsFor', () => {
  it('returns the base catalogue unchanged off /refills', () => {
    const groups = shortcutGroupsFor('/today');
    expect(groups.map((g) => g.heading)).toEqual(['Navigation', 'Actions', 'Help']);
    const actions = groups.find((g) => g.heading === 'Actions')!;
    expect(actions.shortcuts.map((s) => s.label)).toEqual([
      'New medication',
      'Toggle theme',
      'Close dialog / overlay',
    ]);
  });

  it('folds the density flip into Actions on /refills, before Esc', () => {
    const actions = shortcutGroupsFor('/refills').find((g) => g.heading === 'Actions')!;
    expect(actions.shortcuts.map((s) => s.label)).toEqual([
      'New medication',
      'Toggle theme',
      'Flip refill timeline density',
      'Close dialog / overlay',
    ]);
    // Esc stays the tail.
    expect(actions.shortcuts.at(-1)!.keys).toEqual(['Esc']);
  });

  it('leaves Navigation and Help untouched on /refills', () => {
    const groups = shortcutGroupsFor('/refills');
    const nav = groups.find((g) => g.heading === 'Navigation')!;
    const help = groups.find((g) => g.heading === 'Help')!;
    const baseNav = BASE_GROUPS.find((g) => g.heading === 'Navigation')!;
    expect(nav.shortcuts.length).toBe(baseNav.shortcuts.length);
    expect(help.shortcuts.map((s) => s.label)).toEqual(['Show keyboard shortcuts']);
  });

  it('returns fresh arrays so the shared BASE_GROUPS cannot be mutated', () => {
    const groups = shortcutGroupsFor('/refills');
    const actions = groups.find((g) => g.heading === 'Actions')!;
    actions.shortcuts.push({ keys: ['Z'], label: 'tamper' });
    // BASE_GROUPS Actions is untouched (still ends with Esc, no 'tamper').
    const baseActions = BASE_GROUPS.find((g) => g.heading === 'Actions')!;
    expect(baseActions.shortcuts.some((s) => s.label === 'tamper')).toBe(false);
    expect(baseActions.shortcuts.at(-1)!.keys).toEqual(['Esc']);
  });

  it('only adds the page-local row on /refills (count grows by exactly one)', () => {
    const base = shortcutGroupsFor('/today').find((g) => g.heading === 'Actions')!;
    const refills = shortcutGroupsFor('/refills').find((g) => g.heading === 'Actions')!;
    expect(refills.shortcuts.length).toBe(base.shortcuts.length + 1);
  });
});
