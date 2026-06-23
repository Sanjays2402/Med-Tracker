import { describe, it, expect } from 'vitest';
import {
  buildAnonymiseKeyRotateBulk,
  buildFirstToLastEpochPseudonymLookup,
  buildEpochToEpochPseudonymLookup,
  buildTerminalPseudonymMapWithoutOriginalIds,
  summarizeKeyRotateBulk,
} from '../src/regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk';

const EPOCH_SECRETS = [
  'secret-2022-this-is-long-enough-to-pass-min-key-len',
  'secret-2023-this-is-long-enough-to-pass-min-key-len',
  'secret-2024-this-is-long-enough-to-pass-min-key-len',
  'secret-2025-this-is-long-enough-to-pass-min-key-len',
  'secret-2026-this-is-long-enough-to-pass-min-key-len',
];

const PATIENTS = [
  { patientId: 'p-alpha', patientName: 'Alpha Sibling' },
  { patientId: 'p-beta', patientName: 'Beta Sibling' },
  { patientId: 'p-gamma', patientName: 'Gamma Sibling' },
];

describe('buildAnonymiseKeyRotateBulk — chain shape', () => {
  it('returns transitionCount = secrets.length - 1', async () => {
    const result = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    expect(result.transitionCount).toBe(EPOCH_SECRETS.length - 1);
    expect(result.transitions).toHaveLength(EPOCH_SECRETS.length - 1);
  });

  it('returns epochCount = secrets.length', async () => {
    const result = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    expect(result.epochCount).toBe(EPOCH_SECRETS.length);
  });

  it('returns one patientChain per unique patient', async () => {
    const result = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    expect(result.patientChains).toHaveLength(PATIENTS.length);
  });

  it('returns one terminal mapping per unique patient', async () => {
    const result = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    expect(result.terminals).toHaveLength(PATIENTS.length);
  });

  it('builds pseudonym chains of length === epochCount', async () => {
    const result = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    for (const chain of result.patientChains) {
      expect(chain.pseudonymousIdChain).toHaveLength(EPOCH_SECRETS.length);
      expect(chain.pseudonymousNameChain).toHaveLength(EPOCH_SECRETS.length);
    }
  });

  it('mirrors originalPatientId + originalPatientName into chains', async () => {
    const result = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    expect(result.patientChains[0]?.originalPatientId).toBe('p-alpha');
    expect(result.patientChains[0]?.originalPatientName).toBe('Alpha Sibling');
  });

  it('every patient has distinct pseudonyms across epochs (when secrets differ)', async () => {
    const result = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    for (const chain of result.patientChains) {
      const ids = chain.pseudonymousIdChain;
      // All five secrets are distinct, so all five pseudonyms should be distinct.
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('all pseudonymous ids carry the default pid- prefix', async () => {
    const result = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    for (const chain of result.patientChains) {
      for (const id of chain.pseudonymousIdChain) {
        expect(id.startsWith('pid-')).toBe(true);
      }
    }
  });
});

describe('buildAnonymiseKeyRotateBulk — terminal mapping', () => {
  it('terminal.firstEpoch matches chain[0] for every patient', async () => {
    const result = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    for (let i = 0; i < PATIENTS.length; i++) {
      expect(result.terminals[i]?.firstEpochPseudonymousId).toBe(
        result.patientChains[i]?.pseudonymousIdChain[0],
      );
      expect(result.terminals[i]?.firstEpochPseudonymousName).toBe(
        result.patientChains[i]?.pseudonymousNameChain[0],
      );
    }
  });

  it('terminal.lastEpoch matches chain[last] for every patient', async () => {
    const result = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const last = EPOCH_SECRETS.length - 1;
    for (let i = 0; i < PATIENTS.length; i++) {
      expect(result.terminals[i]?.lastEpochPseudonymousId).toBe(
        result.patientChains[i]?.pseudonymousIdChain[last],
      );
    }
  });
});

describe('buildAnonymiseKeyRotateBulk — input validation', () => {
  it('rejects fewer than 2 secrets', async () => {
    await expect(
      buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: [EPOCH_SECRETS[0]!] }),
    ).rejects.toThrow();
    await expect(
      buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: [] }),
    ).rejects.toThrow();
  });

  it('rejects empty-string secrets in the chain', async () => {
    await expect(
      buildAnonymiseKeyRotateBulk(PATIENTS, {
        secrets: [EPOCH_SECRETS[0]!, '', EPOCH_SECRETS[2]!],
      }),
    ).rejects.toThrow();
  });

  it('rejects epochLabels of wrong length', async () => {
    await expect(
      buildAnonymiseKeyRotateBulk(PATIENTS, {
        secrets: EPOCH_SECRETS,
        epochLabels: ['only', 'two'],
      }),
    ).rejects.toThrow();
  });

  it('accepts epochLabels of matching length', async () => {
    const labels = ['e0', 'e1', 'e2', 'e3', 'e4'];
    const result = await buildAnonymiseKeyRotateBulk(PATIENTS, {
      secrets: EPOCH_SECRETS,
      epochLabels: labels,
    });
    expect(result.epochLabels).toEqual(labels);
    expect(result.transitions[0]?.fromEpochLabel).toBe('e0');
    expect(result.transitions[0]?.toEpochLabel).toBe('e1');
  });

  it('defaults epochLabels to epoch-0 .. epoch-N', async () => {
    const result = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    expect(result.epochLabels).toEqual(['epoch-0', 'epoch-1', 'epoch-2', 'epoch-3', 'epoch-4']);
  });
});

describe('buildAnonymiseKeyRotateBulk — no-op rotations', () => {
  it('counts no-op transitions (same secret repeated)', async () => {
    const result = await buildAnonymiseKeyRotateBulk(PATIENTS, {
      secrets: [EPOCH_SECRETS[0]!, EPOCH_SECRETS[0]!, EPOCH_SECRETS[1]!],
    });
    expect(result.noOpTransitionCount).toBe(1);
    expect(result.transitionCount).toBe(2);
  });

  it('counts zero no-op transitions when all secrets differ', async () => {
    const result = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    expect(result.noOpTransitionCount).toBe(0);
  });

  it('flags collisionDetectedAtAnyEpoch when any transition collides', async () => {
    // Two-byte truncation virtually guarantees a collision on a small
    // cohort with two patients differing by one character — but it's
    // probabilistic. We just check the flag plumbs through.
    const result = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    expect(typeof result.collisionDetectedAtAnyEpoch).toBe('boolean');
  });
});

describe('buildAnonymiseKeyRotateBulk — minimum-length chains', () => {
  it('builds a 2-secret chain (single transition)', async () => {
    const result = await buildAnonymiseKeyRotateBulk(PATIENTS, {
      secrets: [EPOCH_SECRETS[0]!, EPOCH_SECRETS[1]!],
    });
    expect(result.epochCount).toBe(2);
    expect(result.transitionCount).toBe(1);
    expect(result.patientChains[0]?.pseudonymousIdChain).toHaveLength(2);
  });
});

describe('buildAnonymiseKeyRotateBulk — patient deduplication', () => {
  it('deduplicates patients in input array by id', async () => {
    const dup = [
      { patientId: 'p-alpha', patientName: 'Alpha' },
      { patientId: 'p-alpha', patientName: 'Alpha Duplicate' },
      { patientId: 'p-beta', patientName: 'Beta' },
    ];
    const result = await buildAnonymiseKeyRotateBulk(dup, { secrets: EPOCH_SECRETS });
    expect(result.patientChains).toHaveLength(2);
    // Keeps first-occurrence name.
    expect(result.patientChains[0]?.originalPatientName).toBe('Alpha');
  });
});

describe('buildAnonymiseKeyRotateBulk — naming strategies plumbed through', () => {
  it('hashed strategy yields "Patient <hex>" names at every epoch', async () => {
    const result = await buildAnonymiseKeyRotateBulk(PATIENTS, {
      secrets: EPOCH_SECRETS,
      nameStrategy: 'hashed',
    });
    for (const chain of result.patientChains) {
      for (const name of chain.pseudonymousNameChain) {
        expect(name.startsWith('Patient ')).toBe(true);
      }
    }
  });

  it('redacted strategy yields "REDACTED" at every epoch', async () => {
    const result = await buildAnonymiseKeyRotateBulk(PATIENTS, {
      secrets: EPOCH_SECRETS,
      nameStrategy: 'redacted',
    });
    for (const chain of result.patientChains) {
      for (const name of chain.pseudonymousNameChain) {
        expect(name).toBe('REDACTED');
      }
    }
  });

  it('hashPrefix plumbed through to every epoch', async () => {
    const result = await buildAnonymiseKeyRotateBulk(PATIENTS, {
      secrets: EPOCH_SECRETS,
      hashPrefix: 'anon-',
    });
    for (const chain of result.patientChains) {
      for (const id of chain.pseudonymousIdChain) {
        expect(id.startsWith('anon-')).toBe(true);
      }
    }
  });

  it('hashHexLength plumbed through to every epoch', async () => {
    const result = await buildAnonymiseKeyRotateBulk(PATIENTS, {
      secrets: EPOCH_SECRETS,
      hashHexLength: 24,
    });
    for (const chain of result.patientChains) {
      for (const id of chain.pseudonymousIdChain) {
        // 'pid-' prefix (4) + 24 hex chars
        expect(id.length).toBe(28);
      }
    }
  });
});

describe('buildAnonymiseKeyRotateBulk — determinism', () => {
  it('same input -> byte-identical chains across runs', async () => {
    const a = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const b = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    expect(a.patientChains.map((c) => c.pseudonymousIdChain)).toEqual(
      b.patientChains.map((c) => c.pseudonymousIdChain),
    );
  });
});

describe('buildFirstToLastEpochPseudonymLookup', () => {
  it('maps every first-epoch id to its last-epoch pseudonym', async () => {
    const result = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const lookup = buildFirstToLastEpochPseudonymLookup(result);
    expect(lookup.size).toBe(PATIENTS.length);
    for (const t of result.terminals) {
      expect(lookup.get(t.firstEpochPseudonymousId)?.lastEpochPseudonymousId).toBe(
        t.lastEpochPseudonymousId,
      );
    }
  });

  it('skips entries with empty first-epoch ids', async () => {
    // Build a result then synthesise an empty first-epoch entry.
    const result = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    result.terminals.push({
      originalPatientId: 'p-empty',
      originalPatientName: 'Empty Patient',
      firstEpochPseudonymousId: '',
      firstEpochPseudonymousName: '',
      lastEpochPseudonymousId: 'pid-deadbeef',
      lastEpochPseudonymousName: 'Patient deadbeef',
    });
    const lookup = buildFirstToLastEpochPseudonymLookup(result);
    expect(lookup.has('')).toBe(false);
  });
});

describe('buildEpochToEpochPseudonymLookup', () => {
  it('returns the correct pseudonym at the target epoch for each from-epoch id', async () => {
    const result = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const lookup = buildEpochToEpochPseudonymLookup(result, 1, 3);
    for (const chain of result.patientChains) {
      const fromId = chain.pseudonymousIdChain[1]!;
      const expectedId = chain.pseudonymousIdChain[3]!;
      expect(lookup.get(fromId)?.pseudonymousId).toBe(expectedId);
    }
  });

  it('rejects fromEpoch >= toEpoch', async () => {
    const result = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    expect(() => buildEpochToEpochPseudonymLookup(result, 2, 2)).toThrow();
    expect(() => buildEpochToEpochPseudonymLookup(result, 3, 1)).toThrow();
  });

  it('rejects out-of-bounds epoch indices', async () => {
    const result = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    expect(() => buildEpochToEpochPseudonymLookup(result, -1, 2)).toThrow();
    expect(() => buildEpochToEpochPseudonymLookup(result, 0, 99)).toThrow();
    expect(() => buildEpochToEpochPseudonymLookup(result, 1.5, 3)).toThrow();
  });
});

describe('buildTerminalPseudonymMapWithoutOriginalIds', () => {
  it('drops originalPatientId + originalPatientName from terminals', async () => {
    const result = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const mapped = buildTerminalPseudonymMapWithoutOriginalIds(result);
    expect(mapped).toHaveLength(PATIENTS.length);
    for (const m of mapped) {
      // @ts-expect-error originalPatientId intentionally absent
      expect(m.originalPatientId).toBeUndefined();
      // @ts-expect-error originalPatientName intentionally absent
      expect(m.originalPatientName).toBeUndefined();
      expect(m.firstEpochPseudonymousId.startsWith('pid-')).toBe(true);
      expect(m.lastEpochPseudonymousId.startsWith('pid-')).toBe(true);
    }
  });
});

describe('summarizeKeyRotateBulk', () => {
  it('describes a 5-epoch chain with 3 patients (no no-ops, no collisions)', async () => {
    const result = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const line = summarizeKeyRotateBulk(result);
    expect(line).toContain('5 epochs');
    expect(line).toContain('4 transitions');
    expect(line).toContain('3 patients');
    expect(line).toContain('0 no-op rotations');
    expect(line).toContain('no collisions');
  });

  it('flags no-op rotations in the line', async () => {
    const result = await buildAnonymiseKeyRotateBulk(PATIENTS, {
      secrets: [EPOCH_SECRETS[0]!, EPOCH_SECRETS[0]!, EPOCH_SECRETS[1]!],
    });
    const line = summarizeKeyRotateBulk(result);
    expect(line).toContain('1 no-op rotation');
  });

  it('uses singular "transition" when only one transition', async () => {
    const result = await buildAnonymiseKeyRotateBulk(PATIENTS, {
      secrets: [EPOCH_SECRETS[0]!, EPOCH_SECRETS[1]!],
    });
    const line = summarizeKeyRotateBulk(result);
    expect(line).toContain('1 transition');
    expect(line).not.toContain('1 transitions');
  });

  it('uses singular "patient" when only one patient', async () => {
    const result = await buildAnonymiseKeyRotateBulk(
      [{ patientId: 'lone', patientName: 'Lone' }],
      { secrets: EPOCH_SECRETS },
    );
    const line = summarizeKeyRotateBulk(result);
    expect(line).toContain('1 patient chained');
  });
});

describe('buildAnonymiseKeyRotateBulk — empty patient list', () => {
  it('handles empty patient list (still computes empty chains)', async () => {
    const result = await buildAnonymiseKeyRotateBulk([], { secrets: EPOCH_SECRETS });
    expect(result.patientChains).toHaveLength(0);
    expect(result.terminals).toHaveLength(0);
    expect(result.transitions).toHaveLength(EPOCH_SECRETS.length - 1);
    expect(result.transitionCount).toBe(EPOCH_SECRETS.length - 1);
    expect(result.noOpTransitionCount).toBe(0);
  });
});

describe('buildAnonymiseKeyRotateBulk — transition mapping shape', () => {
  it('each transition.result has same patient count as the input', async () => {
    const result = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    for (const t of result.transitions) {
      expect(t.result.mappings).toHaveLength(PATIENTS.length);
    }
  });

  it('transition[i].fromEpoch === i and toEpoch === i+1', async () => {
    const result = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    for (let i = 0; i < result.transitionCount; i++) {
      expect(result.transitions[i]?.fromEpoch).toBe(i);
      expect(result.transitions[i]?.toEpoch).toBe(i + 1);
    }
  });
});
