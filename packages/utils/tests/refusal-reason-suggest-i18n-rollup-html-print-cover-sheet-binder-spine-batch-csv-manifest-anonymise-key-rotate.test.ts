import { describe, it, expect } from 'vitest';
import {
  exportSpineBatchCsvManifestAnonymiseKeyRotate,
  countSpineBatchCsvManifestAnonymiseKeyRotateChanges,
  summarizeSpineBatchCsvManifestAnonymiseKeyRotate,
  detectSpineBatchCsvManifestAnonymiseKeyRotateRedactedEntries,
} from '../src/refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch-csv-manifest-anonymise-key-rotate';
import type { RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatchEntry } from '../src/refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch';
import type { RefusalReasonI18nRollupResult } from '../src/refusal-reason-suggest-i18n-rollup';

// Test helpers --------------------------------------------------------

const OLD_SECRET = 'super-secret-old-key-that-is-at-least-32-chars';
const NEW_SECRET = 'super-secret-new-key-that-is-at-least-32-chars';

const EMPTY_ROLLUP: RefusalReasonI18nRollupResult = {
  suggestions: [],
  byDoseId: new Map(),
  coverage: {
    totalDoses: 0,
    suggestedDoses: 0,
    suggestionCountBySource: {
      'npo-window': 0,
      'prescriber-pause': 0,
      'out-of-supply': 0,
      'sleeping-window': 0,
      'recent-pattern': 0,
    },
    fallbackLocale: 'en-US',
    missingPlaceholders: [],
  },
};

function entry(
  name: string,
): RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatchEntry {
  return { patientName: name, result: EMPTY_ROLLUP };
}

// Happy path tests ---------------------------------------------------

describe('exportSpineBatchCsvManifestAnonymiseKeyRotate — happy path', () => {
  it('produces distinct old and new manifests when secrets differ', async () => {
    const r = await exportSpineBatchCsvManifestAnonymiseKeyRotate(
      [entry('Maria Lopez'), entry('John Smith')],
      { oldSecret: OLD_SECRET, newSecret: NEW_SECRET },
    );
    expect(r.oldManifestCsv).not.toBe(r.newManifestCsv);
    expect(r.noOpRotation).toBe(false);
  });

  it('reports noOpRotation=true when oldSecret === newSecret', async () => {
    const r = await exportSpineBatchCsvManifestAnonymiseKeyRotate(
      [entry('Maria Lopez')],
      { oldSecret: OLD_SECRET, newSecret: OLD_SECRET },
    );
    expect(r.noOpRotation).toBe(true);
    expect(r.oldManifestCsv).toBe(r.newManifestCsv);
  });

  it('produces a rotation lookup CSV with original + old + new columns', async () => {
    const r = await exportSpineBatchCsvManifestAnonymiseKeyRotate(
      [entry('Maria Lopez'), entry('John Smith')],
      { oldSecret: OLD_SECRET, newSecret: NEW_SECRET },
    );
    expect(r.rotationLookupCsv).toContain(
      'originalPatientName,oldPseudonymousName,newPseudonymousName',
    );
    expect(r.rotationLookupCsv).toContain('Maria Lopez');
    expect(r.rotationLookupCsv).toContain('John Smith');
  });

  it('produces a no-original-name rotation lookup for third-party use', async () => {
    const r = await exportSpineBatchCsvManifestAnonymiseKeyRotate(
      [entry('Maria Lopez'), entry('John Smith')],
      { oldSecret: OLD_SECRET, newSecret: NEW_SECRET },
    );
    expect(r.rotationLookupCsvWithoutOriginalNames).toContain(
      'oldPseudonymousName,newPseudonymousName',
    );
    expect(r.rotationLookupCsvWithoutOriginalNames).not.toContain('Maria Lopez');
    expect(r.rotationLookupCsvWithoutOriginalNames).not.toContain('John Smith');
  });

  it('rotation entries equal the distinct source name count', async () => {
    const r = await exportSpineBatchCsvManifestAnonymiseKeyRotate(
      [entry('Maria Lopez'), entry('John Smith'), entry('Maria Lopez')],
      { oldSecret: OLD_SECRET, newSecret: NEW_SECRET },
    );
    expect(r.rotationEntries).toHaveLength(2);
  });

  it('rotation entries sorted by originalPatientName ASC', async () => {
    const r = await exportSpineBatchCsvManifestAnonymiseKeyRotate(
      [entry('Zoe Andrews'), entry('Aaron Bell'), entry('Maria Lopez')],
      { oldSecret: OLD_SECRET, newSecret: NEW_SECRET },
    );
    const names = r.rotationEntries.map((e) => e.originalPatientName);
    expect(names).toEqual(['Aaron Bell', 'Maria Lopez', 'Zoe Andrews']);
  });

  it('mirrors the resolved name strategy', async () => {
    const r = await exportSpineBatchCsvManifestAnonymiseKeyRotate(
      [entry('Maria Lopez')],
      { oldSecret: OLD_SECRET, newSecret: NEW_SECRET },
    );
    expect(r.nameStrategy).toBe('hashed');
  });
});

// Secret validation tests --------------------------------------------

describe('exportSpineBatchCsvManifestAnonymiseKeyRotate — secret validation', () => {
  it('throws when oldSecret is too short', async () => {
    await expect(
      exportSpineBatchCsvManifestAnonymiseKeyRotate(
        [entry('Maria Lopez')],
        { oldSecret: 'short', newSecret: NEW_SECRET },
      ),
    ).rejects.toThrow(/oldSecret must be a string of at least 32 chars/);
  });

  it('throws when newSecret is too short', async () => {
    await expect(
      exportSpineBatchCsvManifestAnonymiseKeyRotate(
        [entry('Maria Lopez')],
        { oldSecret: OLD_SECRET, newSecret: 'short' },
      ),
    ).rejects.toThrow(/newSecret must be a string of at least 32 chars/);
  });

  it('accepts oldSecret === newSecret (no-op rotation, not an error)', async () => {
    await expect(
      exportSpineBatchCsvManifestAnonymiseKeyRotate(
        [entry('Maria Lopez')],
        { oldSecret: OLD_SECRET, newSecret: OLD_SECRET },
      ),
    ).resolves.toBeDefined();
  });

  it('throws when oldSecret is not a string', async () => {
    await expect(
      exportSpineBatchCsvManifestAnonymiseKeyRotate(
        [entry('Maria Lopez')],
        { oldSecret: undefined as unknown as string, newSecret: NEW_SECRET },
      ),
    ).rejects.toThrow(/oldSecret must be a string/);
  });
});

// Hashed strategy tests ----------------------------------------------

describe('exportSpineBatchCsvManifestAnonymiseKeyRotate — hashed strategy', () => {
  it('produces stable old pseudonym across runs', async () => {
    const r1 = await exportSpineBatchCsvManifestAnonymiseKeyRotate(
      [entry('Maria Lopez')],
      { oldSecret: OLD_SECRET, newSecret: NEW_SECRET },
    );
    const r2 = await exportSpineBatchCsvManifestAnonymiseKeyRotate(
      [entry('Maria Lopez')],
      { oldSecret: OLD_SECRET, newSecret: NEW_SECRET },
    );
    expect(r1.rotationEntries[0]!.oldPseudonymousName).toBe(
      r2.rotationEntries[0]!.oldPseudonymousName,
    );
    expect(r1.rotationEntries[0]!.newPseudonymousName).toBe(
      r2.rotationEntries[0]!.newPseudonymousName,
    );
  });

  it('produces different old + new pseudonyms when secrets differ', async () => {
    const r = await exportSpineBatchCsvManifestAnonymiseKeyRotate(
      [entry('Maria Lopez')],
      { oldSecret: OLD_SECRET, newSecret: NEW_SECRET },
    );
    expect(r.rotationEntries[0]!.oldPseudonymousName).not.toBe(
      r.rotationEntries[0]!.newPseudonymousName,
    );
  });

  it('honours hashPrefix override', async () => {
    const r = await exportSpineBatchCsvManifestAnonymiseKeyRotate(
      [entry('Maria Lopez')],
      {
        oldSecret: OLD_SECRET,
        newSecret: NEW_SECRET,
        hashPrefix: 'audit-',
      },
    );
    expect(r.rotationEntries[0]!.oldPseudonymousName).toMatch(/^audit-/);
    expect(r.rotationEntries[0]!.newPseudonymousName).toMatch(/^audit-/);
  });

  it('honours hashHexLength override', async () => {
    const r = await exportSpineBatchCsvManifestAnonymiseKeyRotate(
      [entry('Maria Lopez')],
      {
        oldSecret: OLD_SECRET,
        newSecret: NEW_SECRET,
        hashHexLength: 8,
      },
    );
    // Default prefix 'spine-' is 6 chars; hex length 8 -> total 14.
    expect(r.rotationEntries[0]!.oldPseudonymousName).toHaveLength(14);
  });
});

// Redacted strategy tests --------------------------------------------

describe('exportSpineBatchCsvManifestAnonymiseKeyRotate — redacted strategy', () => {
  it('maps every name to "REDACTED" under both secrets (always no-op)', async () => {
    const r = await exportSpineBatchCsvManifestAnonymiseKeyRotate(
      [entry('Maria Lopez'), entry('John Smith')],
      {
        oldSecret: OLD_SECRET,
        newSecret: NEW_SECRET,
        nameStrategy: 'redacted',
      },
    );
    expect(r.noOpRotation).toBe(true);
    expect(r.rotationEntries.every((e) => e.oldPseudonymousName === 'REDACTED')).toBe(true);
    expect(r.rotationEntries.every((e) => e.newPseudonymousName === 'REDACTED')).toBe(true);
  });

  it('still surfaces every distinct source name in the lookup', async () => {
    const r = await exportSpineBatchCsvManifestAnonymiseKeyRotate(
      [entry('Maria Lopez'), entry('John Smith')],
      {
        oldSecret: OLD_SECRET,
        newSecret: NEW_SECRET,
        nameStrategy: 'redacted',
      },
    );
    expect(r.rotationEntries).toHaveLength(2);
    expect(r.rotationEntries.map((e) => e.originalPatientName)).toEqual([
      'John Smith',
      'Maria Lopez',
    ]);
  });
});

// CSV escaping + BOM tests --------------------------------------------

describe('exportSpineBatchCsvManifestAnonymiseKeyRotate — CSV escaping', () => {
  it('escapes commas in original patient names', async () => {
    const r = await exportSpineBatchCsvManifestAnonymiseKeyRotate(
      [entry('Lopez, Maria')],
      { oldSecret: OLD_SECRET, newSecret: NEW_SECRET },
    );
    expect(r.rotationLookupCsv).toContain('"Lopez, Maria"');
  });

  it('escapes quotes in original patient names', async () => {
    const r = await exportSpineBatchCsvManifestAnonymiseKeyRotate(
      [entry('Maria "Mar" Lopez')],
      { oldSecret: OLD_SECRET, newSecret: NEW_SECRET },
    );
    expect(r.rotationLookupCsv).toContain('"Maria ""Mar"" Lopez"');
  });

  it('emits BOM when includeBom=true', async () => {
    const r = await exportSpineBatchCsvManifestAnonymiseKeyRotate(
      [entry('Maria Lopez')],
      {
        oldSecret: OLD_SECRET,
        newSecret: NEW_SECRET,
        includeBom: true,
      },
    );
    expect(r.rotationLookupCsv.charCodeAt(0)).toBe(0xfeff);
    expect(r.rotationLookupCsvWithoutOriginalNames.charCodeAt(0)).toBe(0xfeff);
  });

  it('omits BOM by default', async () => {
    const r = await exportSpineBatchCsvManifestAnonymiseKeyRotate(
      [entry('Maria Lopez')],
      { oldSecret: OLD_SECRET, newSecret: NEW_SECRET },
    );
    expect(r.rotationLookupCsv.charCodeAt(0)).not.toBe(0xfeff);
  });
});

// Empty / edge-case tests --------------------------------------------

describe('exportSpineBatchCsvManifestAnonymiseKeyRotate — edge cases', () => {
  it('handles empty entry list (header-only CSVs, no-op rotation)', async () => {
    const r = await exportSpineBatchCsvManifestAnonymiseKeyRotate([], {
      oldSecret: OLD_SECRET,
      newSecret: NEW_SECRET,
    });
    expect(r.rotationEntries).toEqual([]);
    expect(r.noOpRotation).toBe(true); // every() on empty is true
    expect(r.rotationLookupCsv).toBe(
      'originalPatientName,oldPseudonymousName,newPseudonymousName',
    );
    expect(r.rotationLookupCsvWithoutOriginalNames).toBe(
      'oldPseudonymousName,newPseudonymousName',
    );
  });

  it('handles single-entry input', async () => {
    const r = await exportSpineBatchCsvManifestAnonymiseKeyRotate(
      [entry('Solo Patient')],
      { oldSecret: OLD_SECRET, newSecret: NEW_SECRET },
    );
    expect(r.rotationEntries).toHaveLength(1);
  });

  it('preserves underlying collision flag from EITHER secret', async () => {
    // Tiny hash length almost guarantees a collision across many names.
    const names = Array.from({ length: 50 }, (_, i) => entry(`Patient ${i}`));
    const r = await exportSpineBatchCsvManifestAnonymiseKeyRotate(names, {
      oldSecret: OLD_SECRET,
      newSecret: NEW_SECRET,
      hashHexLength: 4,
    });
    // The flag is the OR of both underlying anonymise results.
    expect(r.collisionDetected).toBe(
      r.oldAnonymise.collisionDetected || r.newAnonymise.collisionDetected,
    );
  });
});

// countChanges helper tests ------------------------------------------

describe('countSpineBatchCsvManifestAnonymiseKeyRotateChanges', () => {
  it('returns 0 for no-op rotation', async () => {
    const r = await exportSpineBatchCsvManifestAnonymiseKeyRotate(
      [entry('Maria Lopez')],
      { oldSecret: OLD_SECRET, newSecret: OLD_SECRET },
    );
    expect(countSpineBatchCsvManifestAnonymiseKeyRotateChanges(r)).toBe(0);
  });

  it('returns N for a real rotation across N patients', async () => {
    const r = await exportSpineBatchCsvManifestAnonymiseKeyRotate(
      [entry('Maria Lopez'), entry('John Smith'), entry('Aaron Bell')],
      { oldSecret: OLD_SECRET, newSecret: NEW_SECRET },
    );
    expect(countSpineBatchCsvManifestAnonymiseKeyRotateChanges(r)).toBe(3);
  });

  it('returns 0 for redacted strategy', async () => {
    const r = await exportSpineBatchCsvManifestAnonymiseKeyRotate(
      [entry('Maria Lopez'), entry('John Smith')],
      {
        oldSecret: OLD_SECRET,
        newSecret: NEW_SECRET,
        nameStrategy: 'redacted',
      },
    );
    expect(countSpineBatchCsvManifestAnonymiseKeyRotateChanges(r)).toBe(0);
  });
});

// summarize tests ----------------------------------------------------

describe('summarizeSpineBatchCsvManifestAnonymiseKeyRotate', () => {
  it('reports real rotation totals', async () => {
    const r = await exportSpineBatchCsvManifestAnonymiseKeyRotate(
      [entry('Maria Lopez'), entry('John Smith')],
      { oldSecret: OLD_SECRET, newSecret: NEW_SECRET },
    );
    const s = summarizeSpineBatchCsvManifestAnonymiseKeyRotate(r, {
      oldSecret: OLD_SECRET,
      newSecret: NEW_SECRET,
    });
    expect(s).toContain('2 patients');
    expect(s).toContain('2 pseudonyms changed');
    expect(s).toContain('hashed, hex=16');
    expect(s).toContain('no collisions');
  });

  it('flags no-op rotation in the message', async () => {
    const r = await exportSpineBatchCsvManifestAnonymiseKeyRotate(
      [entry('Maria Lopez')],
      { oldSecret: OLD_SECRET, newSecret: OLD_SECRET },
    );
    const s = summarizeSpineBatchCsvManifestAnonymiseKeyRotate(r, {
      oldSecret: OLD_SECRET,
      newSecret: OLD_SECRET,
    });
    expect(s).toContain('no-op rotation');
  });

  it('flags widen-hashHexLength when collision detected', async () => {
    const names = Array.from({ length: 80 }, (_, i) => entry(`Patient ${i}`));
    const r = await exportSpineBatchCsvManifestAnonymiseKeyRotate(names, {
      oldSecret: OLD_SECRET,
      newSecret: NEW_SECRET,
      hashHexLength: 4,
    });
    if (r.collisionDetected) {
      const s = summarizeSpineBatchCsvManifestAnonymiseKeyRotate(r, {
        oldSecret: OLD_SECRET,
        newSecret: NEW_SECRET,
        hashHexLength: 4,
      });
      expect(s).toContain('widen hashHexLength');
    }
  });

  it('reports redacted strategy', async () => {
    const r = await exportSpineBatchCsvManifestAnonymiseKeyRotate(
      [entry('Maria Lopez')],
      {
        oldSecret: OLD_SECRET,
        newSecret: NEW_SECRET,
        nameStrategy: 'redacted',
      },
    );
    const s = summarizeSpineBatchCsvManifestAnonymiseKeyRotate(r, {
      oldSecret: OLD_SECRET,
      newSecret: NEW_SECRET,
      nameStrategy: 'redacted',
    });
    expect(s).toContain('(redacted)');
    expect(s).toContain('no-op rotation');
  });

  it('reports 0 patients gracefully', async () => {
    const r = await exportSpineBatchCsvManifestAnonymiseKeyRotate([], {
      oldSecret: OLD_SECRET,
      newSecret: NEW_SECRET,
    });
    const s = summarizeSpineBatchCsvManifestAnonymiseKeyRotate(r, {
      oldSecret: OLD_SECRET,
      newSecret: NEW_SECRET,
    });
    expect(s).toContain('0 patients');
  });
});

// detectRedactedEntries tests ----------------------------------------

describe('detectSpineBatchCsvManifestAnonymiseKeyRotateRedactedEntries', () => {
  it('returns every entry under redacted strategy', async () => {
    const r = await exportSpineBatchCsvManifestAnonymiseKeyRotate(
      [entry('Maria Lopez'), entry('John Smith')],
      {
        oldSecret: OLD_SECRET,
        newSecret: NEW_SECRET,
        nameStrategy: 'redacted',
      },
    );
    const redacted = detectSpineBatchCsvManifestAnonymiseKeyRotateRedactedEntries(r);
    expect(redacted).toHaveLength(2);
  });

  it('returns empty array under hashed strategy', async () => {
    const r = await exportSpineBatchCsvManifestAnonymiseKeyRotate(
      [entry('Maria Lopez')],
      { oldSecret: OLD_SECRET, newSecret: NEW_SECRET },
    );
    expect(
      detectSpineBatchCsvManifestAnonymiseKeyRotateRedactedEntries(r),
    ).toEqual([]);
  });
});
