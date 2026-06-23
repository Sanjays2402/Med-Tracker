import { describe, it, expect } from 'vitest';
import {
  summarizeAnonymiseKeyRotationForCli,
  detectAnonymiseKeyRotateCliWarning,
  summarizeAnonymiseKeyRotationBatchForCli,
} from '../src/regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-cli-summary';
import type {
  RegimenHistoryAnonymiseKeyRotateResult,
  RegimenHistoryAnonymiseKeyRotateEntry,
} from '../src/regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate';

function entry(
  o: Partial<RegimenHistoryAnonymiseKeyRotateEntry> & { originalPatientId: string },
): RegimenHistoryAnonymiseKeyRotateEntry {
  return {
    originalPatientId: o.originalPatientId,
    originalPatientName: o.originalPatientName ?? `Name ${o.originalPatientId}`,
    oldPseudonymousId: o.oldPseudonymousId ?? `pid-old-${o.originalPatientId}`,
    oldPseudonymousName: o.oldPseudonymousName ?? `Patient old-${o.originalPatientId}`,
    newPseudonymousId: o.newPseudonymousId ?? `pid-new-${o.originalPatientId}`,
    newPseudonymousName: o.newPseudonymousName ?? `Patient new-${o.originalPatientId}`,
  };
}

function result(
  mappings: RegimenHistoryAnonymiseKeyRotateEntry[],
  o: { collisionDetected?: boolean; noOpRotation?: boolean } = {},
): RegimenHistoryAnonymiseKeyRotateResult {
  return {
    mappings,
    collisionDetected: o.collisionDetected ?? false,
    noOpRotation: o.noOpRotation ?? false,
  };
}

describe('summarizeAnonymiseKeyRotationForCli — happy path', () => {
  it('emits ship-safe verdict when every patient was reshuffled', () => {
    const r = result([
      entry({ originalPatientId: 'p1' }),
      entry({ originalPatientId: 'p2' }),
      entry({ originalPatientId: 'p3' }),
    ]);
    const s = summarizeAnonymiseKeyRotationForCli(r);
    expect(s.patients).toBe(3);
    expect(s.reshuffled).toBe(3);
    expect(s.collisions).toBe(0);
    expect(s.verdict).toBe('ship-safe');
    expect(s.line).toBe(
      '[key-rotate] patients=3 reshuffled=3 collisions=0 verdict=ship-safe',
    );
  });

  it('counts only the patients whose pseudonym changed', () => {
    const r = result([
      entry({
        originalPatientId: 'p1',
        oldPseudonymousId: 'pid-AAAA',
        newPseudonymousId: 'pid-AAAA',
        oldPseudonymousName: 'Patient A',
        newPseudonymousName: 'Patient A',
      }),
      entry({
        originalPatientId: 'p2',
        oldPseudonymousId: 'pid-BBBB',
        newPseudonymousId: 'pid-XYZW',
      }),
    ]);
    const s = summarizeAnonymiseKeyRotationForCli(r);
    expect(s.patients).toBe(2);
    expect(s.reshuffled).toBe(1);
    expect(s.verdict).toBe('ship-safe');
  });

  it('counts name-only reshuffles even when the id is stable', () => {
    const r = result([
      entry({
        originalPatientId: 'p1',
        oldPseudonymousId: 'pid-AAAA',
        newPseudonymousId: 'pid-AAAA',
        oldPseudonymousName: 'Patient A',
        newPseudonymousName: 'Patient B',
      }),
    ]);
    const s = summarizeAnonymiseKeyRotationForCli(r);
    expect(s.reshuffled).toBe(1);
    expect(s.verdict).toBe('ship-safe');
  });
});

describe('summarizeAnonymiseKeyRotationForCli — verdicts', () => {
  it('emits no-op when the result flag is set', () => {
    const r = result(
      [
        entry({
          originalPatientId: 'p1',
          oldPseudonymousId: 'pid-AAAA',
          newPseudonymousId: 'pid-AAAA',
          oldPseudonymousName: 'Patient A',
          newPseudonymousName: 'Patient A',
        }),
      ],
      { noOpRotation: true },
    );
    const s = summarizeAnonymiseKeyRotationForCli(r);
    expect(s.verdict).toBe('no-op');
    expect(s.reshuffled).toBe(0);
    expect(s.line).toBe(
      '[key-rotate] patients=1 reshuffled=0 collisions=0 verdict=no-op',
    );
  });

  it('emits widen-hash when collisions are detected, regardless of reshuffled count', () => {
    const r = result(
      [
        entry({
          originalPatientId: 'p1',
          oldPseudonymousId: 'pid-AAAA',
          newPseudonymousId: 'pid-XXXX',
        }),
        entry({
          originalPatientId: 'p2',
          oldPseudonymousId: 'pid-AAAA',
          newPseudonymousId: 'pid-XXXX',
        }),
      ],
      { collisionDetected: true },
    );
    const s = summarizeAnonymiseKeyRotationForCli(r);
    expect(s.verdict).toBe('widen-hash');
    expect(s.collisions).toBe(2); // 1 in old + 1 in new
  });

  it('emits empty-cohort when mappings is empty', () => {
    const r = result([]);
    const s = summarizeAnonymiseKeyRotationForCli(r);
    expect(s.verdict).toBe('empty-cohort');
    expect(s.patients).toBe(0);
    expect(s.line).toBe(
      '[key-rotate] patients=0 reshuffled=0 collisions=0 verdict=empty-cohort',
    );
  });

  it('emits no-op when no reshuffles happened and the flag was not set', () => {
    // Defensive case: noOpRotation=false but reshuffled=0 (no patient changed).
    const r = result([
      entry({
        originalPatientId: 'p1',
        oldPseudonymousId: 'pid-AAAA',
        newPseudonymousId: 'pid-AAAA',
        oldPseudonymousName: 'Patient A',
        newPseudonymousName: 'Patient A',
      }),
    ]);
    const s = summarizeAnonymiseKeyRotationForCli(r);
    expect(s.verdict).toBe('no-op');
  });
});

describe('summarizeAnonymiseKeyRotationForCli — collisions math', () => {
  it('counts each colliding member beyond the first as a collision', () => {
    // Three patients hash to the same old pseudonym, all distinct in new.
    const r = result(
      [
        entry({
          originalPatientId: 'p1',
          oldPseudonymousId: 'pid-AAAA',
          newPseudonymousId: 'pid-1',
        }),
        entry({
          originalPatientId: 'p2',
          oldPseudonymousId: 'pid-AAAA',
          newPseudonymousId: 'pid-2',
        }),
        entry({
          originalPatientId: 'p3',
          oldPseudonymousId: 'pid-AAAA',
          newPseudonymousId: 'pid-3',
        }),
      ],
      { collisionDetected: true },
    );
    const s = summarizeAnonymiseKeyRotationForCli(r);
    expect(s.collisions).toBe(2); // 3-1 in old
  });

  it('counts collisions in both epochs together', () => {
    const r = result(
      [
        entry({
          originalPatientId: 'p1',
          oldPseudonymousId: 'pid-A',
          newPseudonymousId: 'pid-X',
        }),
        entry({
          originalPatientId: 'p2',
          oldPseudonymousId: 'pid-A',
          newPseudonymousId: 'pid-X',
        }),
      ],
      { collisionDetected: true },
    );
    const s = summarizeAnonymiseKeyRotationForCli(r);
    expect(s.collisions).toBe(2); // 1 in old + 1 in new
  });

  it('returns 0 collisions when none are detected even if data has duplicates', () => {
    // Defensive: caller forgot to set collisionDetected; we still
    // trust the upstream flag (don't second-guess).
    const r = result([
      entry({
        originalPatientId: 'p1',
        oldPseudonymousId: 'pid-A',
        newPseudonymousId: 'pid-X',
      }),
      entry({
        originalPatientId: 'p2',
        oldPseudonymousId: 'pid-A',
        newPseudonymousId: 'pid-X',
      }),
    ]);
    const s = summarizeAnonymiseKeyRotationForCli(r);
    expect(s.collisions).toBe(0);
  });
});

describe('summarizeAnonymiseKeyRotationForCli — custom tag', () => {
  it('respects a custom tag', () => {
    const r = result([entry({ originalPatientId: 'p1' })]);
    const s = summarizeAnonymiseKeyRotationForCli(r, {
      tag: '[key-rotate cohort=cardiology]',
    });
    expect(s.line).toContain('[key-rotate cohort=cardiology]');
    expect(s.line).toBe(
      '[key-rotate cohort=cardiology] patients=1 reshuffled=1 collisions=0 verdict=ship-safe',
    );
  });

  it('keeps the field order fixed regardless of tag', () => {
    const r = result([entry({ originalPatientId: 'p1' })]);
    const s = summarizeAnonymiseKeyRotationForCli(r, { tag: '[x]' });
    // The line MUST be parseable by /patients=(\d+) reshuffled=(\d+) collisions=(\d+) verdict=(\w+)/
    const re = /^\[x\] patients=(\d+) reshuffled=(\d+) collisions=(\d+) verdict=([\w-]+)$/;
    expect(s.line).toMatch(re);
  });
});

describe('summarizeAnonymiseKeyRotationForCli — fixed-shape grep compat', () => {
  it('always emits exactly 5 fields in the same order', () => {
    const cases = [
      result([]),
      result([entry({ originalPatientId: 'p1' })], { noOpRotation: true }),
      result([entry({ originalPatientId: 'p1' })], { collisionDetected: true }),
      result([entry({ originalPatientId: 'p1' })]),
    ];
    for (const r of cases) {
      const s = summarizeAnonymiseKeyRotationForCli(r);
      const tokens = s.line.split(' ');
      // tag + patients= + reshuffled= + collisions= + verdict=
      expect(tokens).toHaveLength(5);
      expect(tokens[0]).toBe('[key-rotate]');
      expect(tokens[1]!.startsWith('patients=')).toBe(true);
      expect(tokens[2]!.startsWith('reshuffled=')).toBe(true);
      expect(tokens[3]!.startsWith('collisions=')).toBe(true);
      expect(tokens[4]!.startsWith('verdict=')).toBe(true);
    }
  });
});

describe('detectAnonymiseKeyRotateCliWarning', () => {
  it('warns for widen-hash with the collision count', () => {
    const r = result(
      [
        entry({
          originalPatientId: 'p1',
          oldPseudonymousId: 'pid-A',
          newPseudonymousId: 'pid-X',
        }),
        entry({
          originalPatientId: 'p2',
          oldPseudonymousId: 'pid-A',
          newPseudonymousId: 'pid-Y',
        }),
        entry({
          originalPatientId: 'p3',
          oldPseudonymousId: 'pid-A',
          newPseudonymousId: 'pid-Z',
        }),
      ],
      { collisionDetected: true },
    );
    const s = summarizeAnonymiseKeyRotationForCli(r);
    const w = detectAnonymiseKeyRotateCliWarning(s);
    expect(w).toBe('widen hashHexLength: 2 colliding pseudonyms detected');
  });

  it('singularises the collision warning when count is 1', () => {
    const r = result(
      [
        entry({
          originalPatientId: 'p1',
          oldPseudonymousId: 'pid-A',
          newPseudonymousId: 'pid-X',
        }),
        entry({
          originalPatientId: 'p2',
          oldPseudonymousId: 'pid-A',
          newPseudonymousId: 'pid-Y',
        }),
      ],
      { collisionDetected: true },
    );
    const s = summarizeAnonymiseKeyRotationForCli(r);
    const w = detectAnonymiseKeyRotateCliWarning(s);
    expect(w).toBe('widen hashHexLength: 1 colliding pseudonym detected');
  });

  it('warns for a no-op rotation with non-empty cohort', () => {
    const r = result(
      [
        entry({
          originalPatientId: 'p1',
          oldPseudonymousId: 'pid-A',
          newPseudonymousId: 'pid-A',
          oldPseudonymousName: 'Patient A',
          newPseudonymousName: 'Patient A',
        }),
      ],
      { noOpRotation: true },
    );
    const s = summarizeAnonymiseKeyRotationForCli(r);
    const w = detectAnonymiseKeyRotateCliWarning(s);
    expect(w).not.toBeNull();
    expect(w).toContain('no-op rotation');
  });

  it('warns for empty-cohort', () => {
    const r = result([]);
    const s = summarizeAnonymiseKeyRotationForCli(r);
    const w = detectAnonymiseKeyRotateCliWarning(s);
    expect(w).toBe('empty cohort: upstream cohort query returned zero patients');
  });

  it('returns null for ship-safe', () => {
    const r = result([entry({ originalPatientId: 'p1' })]);
    const s = summarizeAnonymiseKeyRotationForCli(r);
    const w = detectAnonymiseKeyRotateCliWarning(s);
    expect(w).toBeNull();
  });
});

describe('summarizeAnonymiseKeyRotationBatchForCli', () => {
  it('rolls multiple cohorts into a single line', () => {
    const a = summarizeAnonymiseKeyRotationForCli(
      result([
        entry({ originalPatientId: 'p1' }),
        entry({ originalPatientId: 'p2' }),
      ]),
    );
    const b = summarizeAnonymiseKeyRotationForCli(
      result(
        [
          entry({
            originalPatientId: 'p3',
            oldPseudonymousId: 'pid-A',
            newPseudonymousId: 'pid-A',
            oldPseudonymousName: 'P A',
            newPseudonymousName: 'P A',
          }),
        ],
        { noOpRotation: true },
      ),
    );
    const batch = summarizeAnonymiseKeyRotationBatchForCli([a, b]);
    expect(batch.cohorts).toBe(2);
    expect(batch.patientsTotal).toBe(3);
    expect(batch.reshuffledTotal).toBe(2);
    expect(batch.collisionsTotal).toBe(0);
    // ship-safe wins over no-op
    expect(batch.verdict).toBe('ship-safe');
    expect(batch.line).toBe(
      '[key-rotate-batch] cohorts=2 patients_total=3 reshuffled_total=2 collisions_total=0 verdict=ship-safe',
    );
  });

  it('widen-hash wins across the batch', () => {
    const safe = summarizeAnonymiseKeyRotationForCli(
      result([entry({ originalPatientId: 'p1' })]),
    );
    const widen = summarizeAnonymiseKeyRotationForCli(
      result(
        [
          entry({
            originalPatientId: 'p2',
            oldPseudonymousId: 'pid-A',
            newPseudonymousId: 'pid-X',
          }),
          entry({
            originalPatientId: 'p3',
            oldPseudonymousId: 'pid-A',
            newPseudonymousId: 'pid-Y',
          }),
        ],
        { collisionDetected: true },
      ),
    );
    const batch = summarizeAnonymiseKeyRotationBatchForCli([safe, widen]);
    expect(batch.verdict).toBe('widen-hash');
    expect(batch.collisionsTotal).toBe(1);
  });

  it('returns empty-cohort verdict for a zero-cohort batch', () => {
    const batch = summarizeAnonymiseKeyRotationBatchForCli([]);
    expect(batch.cohorts).toBe(0);
    expect(batch.verdict).toBe('empty-cohort');
    expect(batch.line).toBe(
      '[key-rotate-batch] cohorts=0 patients_total=0 reshuffled_total=0 collisions_total=0 verdict=empty-cohort',
    );
  });

  it('falls back to no-op when every cohort is no-op', () => {
    const noop1 = summarizeAnonymiseKeyRotationForCli(
      result(
        [
          entry({
            originalPatientId: 'p1',
            oldPseudonymousId: 'pid-A',
            newPseudonymousId: 'pid-A',
            oldPseudonymousName: 'A',
            newPseudonymousName: 'A',
          }),
        ],
        { noOpRotation: true },
      ),
    );
    const noop2 = summarizeAnonymiseKeyRotationForCli(
      result(
        [
          entry({
            originalPatientId: 'p2',
            oldPseudonymousId: 'pid-B',
            newPseudonymousId: 'pid-B',
            oldPseudonymousName: 'B',
            newPseudonymousName: 'B',
          }),
        ],
        { noOpRotation: true },
      ),
    );
    const batch = summarizeAnonymiseKeyRotationBatchForCli([noop1, noop2]);
    expect(batch.verdict).toBe('no-op');
  });

  it('respects a custom batch tag', () => {
    const a = summarizeAnonymiseKeyRotationForCli(
      result([entry({ originalPatientId: 'p1' })]),
    );
    const batch = summarizeAnonymiseKeyRotationBatchForCli([a], {
      tag: '[key-rotate-nightly]',
    });
    expect(batch.line).toContain('[key-rotate-nightly]');
  });
});

describe('summarizeAnonymiseKeyRotationForCli — determinism', () => {
  it('is byte-identical for identical inputs', () => {
    const r = result([
      entry({ originalPatientId: 'p1' }),
      entry({ originalPatientId: 'p2' }),
    ]);
    const s1 = summarizeAnonymiseKeyRotationForCli(r);
    const s2 = summarizeAnonymiseKeyRotationForCli(r);
    expect(s1.line).toBe(s2.line);
  });
});
