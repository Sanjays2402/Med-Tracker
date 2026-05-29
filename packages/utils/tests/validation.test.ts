import { describe, it, expect } from 'vitest';
import { isEmail, isStrongPassword, clamp } from '../src/validation';

describe('validation', () => {
  it('checks emails', () => {
    expect(isEmail('a@b.co')).toBe(true);
    expect(isEmail('nope')).toBe(false);
  });
  it('flags weak passwords', () => {
    expect(isStrongPassword('Strong1pass')).toBe(true);
    expect(isStrongPassword('short')).toBe(false);
  });
  it('clamps values', () => {
    expect(clamp(15, 0, 10)).toBe(10);
    expect(clamp(-1, 0, 10)).toBe(0);
  });
});
