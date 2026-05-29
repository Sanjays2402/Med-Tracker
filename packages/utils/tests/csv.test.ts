import { describe, it, expect } from 'vitest';
import { toCsv } from '../src/csv';

describe('toCsv', () => {
  it('emits header and rows', () => {
    const out = toCsv([{ a: 1, b: 'x' }]);
    expect(out).toContain('a,b');
    expect(out).toContain('1,x');
  });
  it('escapes commas and quotes', () => {
    const out = toCsv([{ a: 'he,llo', b: 'a"b' }]);
    expect(out).toContain('"he,llo"');
    expect(out).toContain('"a""b"');
  });
});
