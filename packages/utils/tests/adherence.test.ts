import { describe, it, expect } from 'vitest';
import { adherencePct, weeklyAdherence } from '../src/adherence';

describe('adherencePct', () => {
  it('returns 0 for empty list', () => {
    expect(adherencePct([])).toBe(0);
  });
  it('computes a rounded percent', () => {
    expect(adherencePct([{ takenAt: '2025-01-01', dueAt: '2025-01-01' }, { takenAt: null, dueAt: '2025-01-01' }])).toBe(50);
  });
});

describe('weeklyAdherence', () => {
  it('produces 7 entries', () => {
    expect(weeklyAdherence([])).toHaveLength(7);
  });
});
