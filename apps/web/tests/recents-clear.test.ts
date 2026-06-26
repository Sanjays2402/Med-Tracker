import { describe, it, expect } from 'vitest';
import {
  pressClear,
  disarmClear,
  clearLabel,
  clearAriaLabel,
  clearedRecents,
  canClearRecents,
  CLEAR_ARM_TIMEOUT_MS,
  type ClearState,
} from '../lib/recents-clear';
import type { RecentEntry } from '../lib/command-recents';

const entry = (id: string): RecentEntry => ({ id, title: id, at: 1 });

describe('pressClear', () => {
  it('first press arms without confirming', () => {
    const r = pressClear('idle');
    expect(r.next).toBe<ClearState>('armed');
    expect(r.confirmed).toBe(false);
  });
  it('second press confirms and returns to idle', () => {
    const r = pressClear('armed');
    expect(r.next).toBe<ClearState>('idle');
    expect(r.confirmed).toBe(true);
  });
  it('full cycle: idle -> armed -> confirmed idle', () => {
    let state: ClearState = 'idle';
    let res = pressClear(state);
    state = res.next;
    expect(res.confirmed).toBe(false);
    res = pressClear(state);
    state = res.next;
    expect(res.confirmed).toBe(true);
    expect(state).toBe('idle');
  });
});

describe('disarmClear', () => {
  it('always returns idle', () => {
    expect(disarmClear()).toBe<ClearState>('idle');
  });
});

describe('clearLabel', () => {
  it('asks for confirmation when armed', () => {
    expect(clearLabel('idle')).toBe('Clear');
    expect(clearLabel('armed')).toBe('Clear recent?');
  });
});

describe('clearAriaLabel', () => {
  it('announces the confirm step when armed', () => {
    expect(clearAriaLabel('idle')).toMatch(/clear recent commands/i);
    expect(clearAriaLabel('armed')).toMatch(/confirm/i);
  });
});

describe('clearedRecents', () => {
  it('returns an empty list', () => {
    expect(clearedRecents()).toEqual([]);
  });
  it('returns a fresh array each call (no shared reference)', () => {
    expect(clearedRecents()).not.toBe(clearedRecents());
  });
});

describe('canClearRecents', () => {
  it('is true only when there is something to clear', () => {
    expect(canClearRecents([])).toBe(false);
    expect(canClearRecents([entry('a')])).toBe(true);
  });
});

describe('CLEAR_ARM_TIMEOUT_MS', () => {
  it('is a sane positive default', () => {
    expect(CLEAR_ARM_TIMEOUT_MS).toBeGreaterThan(0);
    expect(CLEAR_ARM_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
  });
});
