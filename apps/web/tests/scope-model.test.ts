import { describe, it, expect } from 'vitest';
import {
  SCOPE_DEFS,
  getScopeDef,
  groupedScopes,
  toggleScope,
  normalizeScopes,
  validateScopes,
  summarizeScopes,
} from '../lib/scope-model';

describe('SCOPE_DEFS', () => {
  it('gives every scope a group, label, desc, and phrase', () => {
    for (const s of SCOPE_DEFS) {
      expect(['view', 'act']).toContain(s.group);
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.desc.length).toBeGreaterThan(0);
      expect(s.phrase.length).toBeGreaterThan(0);
    }
  });
  it('includes the core tokens the data layer uses', () => {
    const ids = SCOPE_DEFS.map((s) => s.id);
    expect(ids).toContain('view-meds');
    expect(ids).toContain('request-refill');
  });
});

describe('getScopeDef', () => {
  it('finds a known scope', () => {
    expect(getScopeDef('view-meds')?.label).toBe('View medications');
  });
  it('is undefined for an unknown id', () => {
    expect(getScopeDef('nope')).toBeUndefined();
  });
});

describe('groupedScopes', () => {
  it('returns View then Act, each non-empty', () => {
    const g = groupedScopes();
    expect(g.map((x) => x.group)).toEqual(['view', 'act']);
    expect(g[0]!.scopes.length).toBeGreaterThan(0);
    expect(g[1]!.scopes.length).toBeGreaterThan(0);
  });
  it('puts request-refill in the act group only', () => {
    const g = groupedScopes();
    const act = g.find((x) => x.group === 'act')!;
    expect(act.scopes.map((s) => s.id)).toEqual(['request-refill']);
  });
});

describe('toggleScope', () => {
  it('adds a scope not present', () => {
    expect(toggleScope(['view-meds'], 'view-refills')).toEqual(['view-meds', 'view-refills']);
  });
  it('removes a scope already present', () => {
    expect(toggleScope(['view-meds', 'view-refills'], 'view-meds')).toEqual(['view-refills']);
  });
  it('does not mutate the input', () => {
    const input = ['view-meds'];
    toggleScope(input, 'view-refills');
    expect(input).toEqual(['view-meds']);
  });
});

describe('normalizeScopes', () => {
  it('drops unknown ids and de-dupes', () => {
    expect(normalizeScopes(['view-meds', 'bogus', 'view-meds'])).toEqual(['view-meds']);
  });
  it('returns catalog order regardless of input order', () => {
    expect(normalizeScopes(['request-refill', 'view-meds'])).toEqual(['view-meds', 'request-refill']);
  });
});

describe('validateScopes', () => {
  it('is invalid with no scopes', () => {
    const v = validateScopes([]);
    expect(v.valid).toBe(false);
    expect(v.message).toMatch(/at least one/i);
  });
  it('is valid and quiet for a normal view selection', () => {
    const v = validateScopes(['view-meds', 'view-adherence']);
    expect(v).toMatchObject({ valid: true, actWithoutView: false, message: null });
  });
  it('warns when act is granted without any view', () => {
    const v = validateScopes(['request-refill']);
    expect(v.valid).toBe(true);
    expect(v.actWithoutView).toBe(true);
    expect(v.message).toMatch(/cannot view/i);
  });
  it('does not warn when act is paired with a view scope', () => {
    const v = validateScopes(['view-meds', 'request-refill']);
    expect(v.actWithoutView).toBe(false);
    expect(v.message).toBeNull();
  });
  it('treats an all-unknown selection as empty', () => {
    expect(validateScopes(['bogus']).valid).toBe(false);
  });
});

describe('summarizeScopes', () => {
  it('placeholders an empty selection', () => {
    expect(summarizeScopes([])).toMatch(/pick what this share/i);
  });
  it('summarizes a single scope', () => {
    expect(summarizeScopes(['view-meds'])).toBe('Can view medications.');
  });
  it('joins two scopes with "and"', () => {
    expect(summarizeScopes(['view-meds', 'request-refill'])).toBe(
      'Can view medications and request refills.',
    );
  });
  it('joins three or more with commas and a trailing and, in catalog order', () => {
    expect(summarizeScopes(['request-refill', 'view-adherence', 'view-meds'])).toBe(
      'Can view medications, view adherence and request refills.',
    );
  });
  it('ignores unknown scopes in the summary', () => {
    expect(summarizeScopes(['view-meds', 'bogus'])).toBe('Can view medications.');
  });
});
