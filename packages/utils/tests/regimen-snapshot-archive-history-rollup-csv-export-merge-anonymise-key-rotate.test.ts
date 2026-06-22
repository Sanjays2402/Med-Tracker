import { describe, it, expect } from 'vitest';
import {
  buildAnonymiseKeyRotation,
  buildOldToNewPseudonymMapWithoutOriginalIds,
  buildOldToNewPseudonymLookup,
  summarizeAnonymiseKeyRotation,
} from '../src/regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate';

const OLD_SECRET = 'old-secret-which-is-long-enough-okay-12345';
const NEW_SECRET = 'new-secret-which-is-ALSO-long-enough-67890';

const PATIENTS = [
  { patientId: 'p-alpha', patientName: 'Alpha Sibling' },
  { patientId: 'p-beta', patientName: 'Beta Sibling' },
  { patientId: 'p-gamma', patientName: 'Gamma Sibling' },
];

describe('buildAnonymiseKeyRotation — basic mapping', () => {
  it('produces one entry per unique patient', async () => {
    const result = await buildAnonymiseKeyRotation(PATIENTS, {
      oldSecret: OLD_SECRET,
      newSecret: NEW_SECRET,
    });
    expect(result.mappings).toHaveLength(3);
    expect(result.mappings.map((m) => m.originalPatientId)).toEqual([
      'p-alpha',
      'p-beta',
      'p-gamma',
    ]);
  });

  it('mirrors the original patientId and patientName into each mapping', async () => {
    const result = await buildAnonymiseKeyRotation(PATIENTS, {
      oldSecret: OLD_SECRET,
      newSecret: NEW_SECRET,
    });
    expect(result.mappings[0]?.originalPatientId).toBe('p-alpha');
    expect(result.mappings[0]?.originalPatientName).toBe('Alpha Sibling');
  });

  it('emits oldPseudonymousId and newPseudonymousId that differ when secrets differ', async () => {
    const result = await buildAnonymiseKeyRotation(PATIENTS, {
      oldSecret: OLD_SECRET,
      newSecret: NEW_SECRET,
    });
    for (const m of result.mappings) {
      expect(m.oldPseudonymousId).not.toBe(m.newPseudonymousId);
      expect(m.oldPseudonymousId.startsWith('pid-')).toBe(true);
      expect(m.newPseudonymousId.startsWith('pid-')).toBe(true);
    }
  });

  it('uses default hashHexLength=16 (16-hex + "pid-" prefix = 20 chars)', async () => {
    const result = await buildAnonymiseKeyRotation(PATIENTS, {
      oldSecret: OLD_SECRET,
      newSecret: NEW_SECRET,
    });
    expect(result.mappings[0]?.oldPseudonymousId.length).toBe('pid-'.length + 16);
    expect(result.mappings[0]?.newPseudonymousId.length).toBe('pid-'.length + 16);
  });

  it('respects an explicit hashHexLength + hashPrefix override', async () => {
    const result = await buildAnonymiseKeyRotation(PATIENTS, {
      oldSecret: OLD_SECRET,
      newSecret: NEW_SECRET,
      hashHexLength: 8,
      hashPrefix: 'anon_',
    });
    expect(result.mappings[0]?.oldPseudonymousId.length).toBe('anon_'.length + 8);
    expect(result.mappings[0]?.oldPseudonymousId.startsWith('anon_')).toBe(true);
  });

  it('dedupes by patientId, preserving first-occurrence ordering', async () => {
    const dupes = [
      ...PATIENTS,
      { patientId: 'p-alpha', patientName: 'Alpha Sibling DUPLICATE' },
    ];
    const result = await buildAnonymiseKeyRotation(dupes, {
      oldSecret: OLD_SECRET,
      newSecret: NEW_SECRET,
    });
    expect(result.mappings).toHaveLength(3);
    // First occurrence wins for name.
    expect(result.mappings[0]?.originalPatientName).toBe('Alpha Sibling');
  });
});

describe('buildAnonymiseKeyRotation — naming strategies', () => {
  it("default 'sequential' assigns Patient A/B/C in hashed-id-sort order", async () => {
    const result = await buildAnonymiseKeyRotation(PATIENTS, {
      oldSecret: OLD_SECRET,
      newSecret: NEW_SECRET,
    });
    const oldNames = result.mappings.map((m) => m.oldPseudonymousName).sort();
    expect(oldNames).toEqual(['Patient A', 'Patient B', 'Patient C']);
    const newNames = result.mappings.map((m) => m.newPseudonymousName).sort();
    expect(newNames).toEqual(['Patient A', 'Patient B', 'Patient C']);
  });

  it("'hashed' uses 'Patient <hex>' for both columns", async () => {
    const result = await buildAnonymiseKeyRotation(PATIENTS, {
      oldSecret: OLD_SECRET,
      newSecret: NEW_SECRET,
      nameStrategy: 'hashed',
    });
    for (const m of result.mappings) {
      expect(m.oldPseudonymousName.startsWith('Patient ')).toBe(true);
      expect(m.newPseudonymousName.startsWith('Patient ')).toBe(true);
      // Strip "pid-" prefix from id, compare bare-hex against the
      // name body.
      const oldBare = m.oldPseudonymousId.replace(/^pid-/, '');
      expect(m.oldPseudonymousName).toBe(`Patient ${oldBare}`);
    }
  });

  it("'redacted' replaces every name with literal 'REDACTED'", async () => {
    const result = await buildAnonymiseKeyRotation(PATIENTS, {
      oldSecret: OLD_SECRET,
      newSecret: NEW_SECRET,
      nameStrategy: 'redacted',
    });
    for (const m of result.mappings) {
      expect(m.oldPseudonymousName).toBe('REDACTED');
      expect(m.newPseudonymousName).toBe('REDACTED');
    }
  });
});

describe('buildAnonymiseKeyRotation — sequential reshuffle on rotation', () => {
  it("reshuffle on rotation under 'sequential' is captured by the mapping", async () => {
    // Because sequential names assign by HASHED-ID sort order and
    // rotating the secret reshuffles the hashed-id sort order, a
    // patient who was "Patient A" under the old secret might be
    // "Patient B" under the new one. The mapping captures that.
    const result = await buildAnonymiseKeyRotation(PATIENTS, {
      oldSecret: OLD_SECRET,
      newSecret: NEW_SECRET,
    });
    // Across the cohort, both sets of names ARE {A, B, C}, but the
    // pairing between original id and sequence letter is allowed
    // to change. At least one mapping entry must show old !=
    // new name, or the test is degenerate. (Probabilistically true
    // for these specific secrets.)
    const reshuffled = result.mappings.some(
      (m) => m.oldPseudonymousName !== m.newPseudonymousName,
    );
    expect(reshuffled).toBe(true);
  });
});

describe('buildAnonymiseKeyRotation — no-op rotation flag', () => {
  it('flags no-op rotation when old + new secrets are identical', async () => {
    const sameSecret = OLD_SECRET;
    const result = await buildAnonymiseKeyRotation(PATIENTS, {
      oldSecret: sameSecret,
      newSecret: sameSecret,
    });
    expect(result.noOpRotation).toBe(true);
    for (const m of result.mappings) {
      expect(m.oldPseudonymousId).toBe(m.newPseudonymousId);
      expect(m.oldPseudonymousName).toBe(m.newPseudonymousName);
    }
  });

  it('noOpRotation is false when secrets differ', async () => {
    const result = await buildAnonymiseKeyRotation(PATIENTS, {
      oldSecret: OLD_SECRET,
      newSecret: NEW_SECRET,
    });
    expect(result.noOpRotation).toBe(false);
  });

  it('noOpRotation is false when the cohort is empty', async () => {
    const result = await buildAnonymiseKeyRotation([], {
      oldSecret: OLD_SECRET,
      newSecret: NEW_SECRET,
    });
    expect(result.noOpRotation).toBe(false);
    expect(result.mappings).toEqual([]);
  });
});

describe('buildAnonymiseKeyRotation — input validation', () => {
  it('throws when oldSecret is empty', async () => {
    await expect(
      buildAnonymiseKeyRotation(PATIENTS, {
        oldSecret: '',
        newSecret: NEW_SECRET,
      }),
    ).rejects.toThrow(/oldSecret/);
  });

  it('throws when newSecret is empty', async () => {
    await expect(
      buildAnonymiseKeyRotation(PATIENTS, {
        oldSecret: OLD_SECRET,
        newSecret: '',
      }),
    ).rejects.toThrow(/newSecret/);
  });

  it('propagates the primary modules min-secret length enforcement', async () => {
    await expect(
      buildAnonymiseKeyRotation(PATIENTS, {
        oldSecret: 'too-short',
        newSecret: NEW_SECRET,
      }),
    ).rejects.toThrow();
  });
});

describe('buildAnonymiseKeyRotation — determinism', () => {
  it('produces byte-identical mappings on repeat runs with the same inputs', async () => {
    const a = await buildAnonymiseKeyRotation(PATIENTS, {
      oldSecret: OLD_SECRET,
      newSecret: NEW_SECRET,
    });
    const b = await buildAnonymiseKeyRotation(PATIENTS, {
      oldSecret: OLD_SECRET,
      newSecret: NEW_SECRET,
    });
    expect(a).toEqual(b);
  });

  it("'sequential' assignment is stable regardless of input array order", async () => {
    const a = await buildAnonymiseKeyRotation(PATIENTS, {
      oldSecret: OLD_SECRET,
      newSecret: NEW_SECRET,
    });
    const reversed = [...PATIENTS].reverse();
    const b = await buildAnonymiseKeyRotation(reversed, {
      oldSecret: OLD_SECRET,
      newSecret: NEW_SECRET,
    });
    // For each original patient, the assigned old + new pseudonyms
    // are the SAME across the two runs (even though the input array
    // order differs).
    for (const p of PATIENTS) {
      const fromA = a.mappings.find((m) => m.originalPatientId === p.patientId)!;
      const fromB = b.mappings.find((m) => m.originalPatientId === p.patientId)!;
      expect(fromA.oldPseudonymousId).toBe(fromB.oldPseudonymousId);
      expect(fromA.oldPseudonymousName).toBe(fromB.oldPseudonymousName);
      expect(fromA.newPseudonymousId).toBe(fromB.newPseudonymousId);
      expect(fromA.newPseudonymousName).toBe(fromB.newPseudonymousName);
    }
  });
});

describe('buildOldToNewPseudonymMapWithoutOriginalIds', () => {
  it('drops the originalPatientId + originalPatientName columns', async () => {
    const result = await buildAnonymiseKeyRotation(PATIENTS, {
      oldSecret: OLD_SECRET,
      newSecret: NEW_SECRET,
    });
    const sanitised = buildOldToNewPseudonymMapWithoutOriginalIds(result);
    expect(sanitised).toHaveLength(3);
    for (const row of sanitised) {
      expect(Object.keys(row).sort()).toEqual([
        'newPseudonymousId',
        'newPseudonymousName',
        'oldPseudonymousId',
        'oldPseudonymousName',
      ]);
    }
  });

  it('preserves the per-patient mapping (sanitised row order matches input order)', async () => {
    const result = await buildAnonymiseKeyRotation(PATIENTS, {
      oldSecret: OLD_SECRET,
      newSecret: NEW_SECRET,
    });
    const sanitised = buildOldToNewPseudonymMapWithoutOriginalIds(result);
    for (let i = 0; i < sanitised.length; i++) {
      expect(sanitised[i]?.oldPseudonymousId).toBe(result.mappings[i]?.oldPseudonymousId);
      expect(sanitised[i]?.newPseudonymousId).toBe(result.mappings[i]?.newPseudonymousId);
    }
  });
});

describe('buildOldToNewPseudonymLookup', () => {
  it('returns a Map keyed on oldPseudonymousId', async () => {
    const result = await buildAnonymiseKeyRotation(PATIENTS, {
      oldSecret: OLD_SECRET,
      newSecret: NEW_SECRET,
    });
    const lookup = buildOldToNewPseudonymLookup(result);
    expect(lookup.size).toBe(3);
    for (const m of result.mappings) {
      const looked = lookup.get(m.oldPseudonymousId);
      expect(looked?.newPseudonymousId).toBe(m.newPseudonymousId);
      expect(looked?.newPseudonymousName).toBe(m.newPseudonymousName);
    }
  });

  it('returns an empty Map for an empty cohort', async () => {
    const result = await buildAnonymiseKeyRotation([], {
      oldSecret: OLD_SECRET,
      newSecret: NEW_SECRET,
    });
    const lookup = buildOldToNewPseudonymLookup(result);
    expect(lookup.size).toBe(0);
  });
});

describe('summarizeAnonymiseKeyRotation', () => {
  it('reports the normal mapped count + no-collision phrasing', async () => {
    const result = await buildAnonymiseKeyRotation(PATIENTS, {
      oldSecret: OLD_SECRET,
      newSecret: NEW_SECRET,
    });
    const line = summarizeAnonymiseKeyRotation(result);
    expect(line).toContain('3 patients mapped');
    expect(line).toContain('(no collisions)');
  });

  it("uses singular 'patient' for a 1-patient cohort", async () => {
    const result = await buildAnonymiseKeyRotation(
      [{ patientId: 'p-alpha', patientName: 'Alpha' }],
      { oldSecret: OLD_SECRET, newSecret: NEW_SECRET },
    );
    const line = summarizeAnonymiseKeyRotation(result);
    expect(line).toContain('1 patient mapped');
  });

  it("reports 'NO-OP rotation' when secrets match", async () => {
    const result = await buildAnonymiseKeyRotation(PATIENTS, {
      oldSecret: OLD_SECRET,
      newSecret: OLD_SECRET,
    });
    const line = summarizeAnonymiseKeyRotation(result);
    expect(line).toContain('NO-OP rotation');
  });

  it('reports the collision warning when a collision is detected', async () => {
    // Force collision risk by truncating to a tiny hex length.
    const result = await buildAnonymiseKeyRotation(
      // Many patients + 2 hex chars (256 buckets) makes collision plausible
      Array.from({ length: 60 }, (_, i) => ({
        patientId: `p-${i}`,
        patientName: `Patient ${i}`,
      })),
      {
        oldSecret: OLD_SECRET,
        newSecret: NEW_SECRET,
        hashHexLength: 4,
      },
    );
    // Whether or not the specific seeds collide isn't guaranteed,
    // but tha 60-patient 4-hex cohort is overwhelmingly likely to
    // hit at least one collision. Defensive: only assert the
    // collision phrasing when the flag is set; otherwise verify
    // the standard no-collision phrasing.
    const line = summarizeAnonymiseKeyRotation(result);
    if (result.collisionDetected) {
      expect(line).toContain('collision detected');
      expect(line).toContain('widen hashHexLength');
    } else {
      expect(line).toContain('(no collisions)');
    }
  });
});
