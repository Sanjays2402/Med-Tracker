import { describe, it, expect } from 'vitest';
import { PillIdentifierService, DEFAULT_PILL_CATALOG } from '../src/services/PillIdentifierService';

describe('PillIdentifierService', () => {
  it('exposes catalog size', () => {
    const svc = new PillIdentifierService(DEFAULT_PILL_CATALOG);
    expect(svc.size()).toBe(DEFAULT_PILL_CATALOG.length);
  });

  it('identifies a pill by imprint', () => {
    const svc = new PillIdentifierService(DEFAULT_PILL_CATALOG);
    const out = svc.identify({ imprint: 'L484' });
    expect(out[0].descriptor.id).toBe('acetaminophen-500');
  });

  it('returns empty array below threshold', () => {
    const svc = new PillIdentifierService(DEFAULT_PILL_CATALOG);
    const out = svc.identify({ imprint: 'NOPE', shape: 'diamond' }, { minScore: 0.6 });
    expect(out).toEqual([]);
  });

  it('setCatalog swaps the underlying list', () => {
    const svc = new PillIdentifierService([]);
    expect(svc.size()).toBe(0);
    svc.setCatalog(DEFAULT_PILL_CATALOG.slice(0, 3));
    expect(svc.size()).toBe(3);
  });
});
