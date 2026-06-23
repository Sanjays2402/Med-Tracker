import { describe, it, expect } from 'vitest';
import {
  exportSpineBatchCsvManifestAnonymise,
  summarizeSpineBatchCsvManifestAnonymise,
  detectSpineBatchCsvManifestAnonymiseRedactedRows,
} from '../src/refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch-csv-manifest-anonymise';
import type { RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatchEntry } from '../src/refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch';
import type { RefusalReasonI18nRollupResult } from '../src/refusal-reason-suggest-i18n-rollup';

// Test helpers --------------------------------------------------------

const SECRET = 'super-secret-key-that-is-at-least-32-chars';

// Minimal empty rollup result; the manifest builder doesn't use the
// suggestion content (only the count, via includePanelSize which is
// off by default), so a fully empty result is safe for these tests.
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
  options: { dateLabel?: string | null; panelLabel?: string | null } = {},
): RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatchEntry {
  const out: RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatchEntry = {
    patientName: name,
    result: EMPTY_ROLLUP,
  };
  if (options.dateLabel !== undefined && options.dateLabel !== null) {
    out.dateLabel = options.dateLabel;
  }
  if (options.panelLabel !== undefined && options.panelLabel !== null) {
    out.panelLabel = options.panelLabel;
  }
  return out;
}

// Happy path tests ----------------------------------------------------

describe('exportSpineBatchCsvManifestAnonymise — happy path', () => {
  it('hashes patient names by default with spine- prefix', async () => {
    const r = await exportSpineBatchCsvManifestAnonymise(
      [entry('Maria Lopez')],
      { hmacSecret: SECRET },
    );
    expect(r.manifestRowCount).toBe(1);
    expect(r.manifestRows[0]!.patientName).toMatch(/^spine-[0-9a-f]{16}$/);
    expect(r.distinctPatientCount).toBe(1);
    expect(r.collisionDetected).toBe(false);
  });

  it('hash is deterministic across runs with the same secret', async () => {
    const r1 = await exportSpineBatchCsvManifestAnonymise(
      [entry('Maria Lopez')],
      { hmacSecret: SECRET },
    );
    const r2 = await exportSpineBatchCsvManifestAnonymise(
      [entry('Maria Lopez')],
      { hmacSecret: SECRET },
    );
    expect(r1.manifestRows[0]!.patientName).toBe(
      r2.manifestRows[0]!.patientName,
    );
  });

  it('different secrets produce different hashes', async () => {
    const r1 = await exportSpineBatchCsvManifestAnonymise(
      [entry('Maria Lopez')],
      { hmacSecret: SECRET },
    );
    const r2 = await exportSpineBatchCsvManifestAnonymise(
      [entry('Maria Lopez')],
      { hmacSecret: 'different-long-secret-must-be-at-least-32-chars' },
    );
    expect(r1.manifestRows[0]!.patientName).not.toBe(
      r2.manifestRows[0]!.patientName,
    );
  });

  it('emits the manifest CSV with anonymised cells', async () => {
    const r = await exportSpineBatchCsvManifestAnonymise(
      [entry('Maria Lopez')],
      { hmacSecret: SECRET },
    );
    expect(r.manifestCsv).toContain(
      'sheetNumber,totalSheets,rowOnSheet,columnOnSheet,positionInBatch,patientName,dateLabel,panelLabel',
    );
    expect(r.manifestCsv).toMatch(/spine-[0-9a-f]{16}/);
    expect(r.manifestCsv).not.toContain('Maria Lopez');
  });

  it('hashes the SAME patient name to ONE pseudonym across multiple rows', async () => {
    const r = await exportSpineBatchCsvManifestAnonymise(
      [entry('Maria Lopez'), entry('Maria Lopez'), entry('Maria Lopez')],
      { hmacSecret: SECRET },
    );
    expect(r.manifestRows.length).toBe(3);
    expect(r.manifestRows[0]!.patientName).toBe(
      r.manifestRows[1]!.patientName,
    );
    expect(r.manifestRows[0]!.patientName).toBe(
      r.manifestRows[2]!.patientName,
    );
    expect(r.distinctPatientCount).toBe(1);
  });
});

// Lookup CSV tests ----------------------------------------------------

describe('exportSpineBatchCsvManifestAnonymise — lookup CSV', () => {
  it('emits a lookup CSV with original-to-pseudonym mapping', async () => {
    const r = await exportSpineBatchCsvManifestAnonymise(
      [entry('Maria Lopez'), entry('Juan Garcia')],
      { hmacSecret: SECRET },
    );
    expect(r.nameLookupCsv).toContain(
      'originalPatientName,pseudonymousPatientName',
    );
    expect(r.nameLookupCsv).toContain('Maria Lopez');
    expect(r.nameLookupCsv).toContain('Juan Garcia');
    expect(r.lookupRows.length).toBe(2);
  });

  it('sorts lookup rows by original name ascending', async () => {
    const r = await exportSpineBatchCsvManifestAnonymise(
      [entry('Zoe'), entry('Maria'), entry('Juan'), entry('Adam')],
      { hmacSecret: SECRET },
    );
    expect(r.lookupRows.map((l) => l.originalPatientName)).toEqual([
      'Adam',
      'Juan',
      'Maria',
      'Zoe',
    ]);
  });

  it('deduplicates lookup rows for repeated names', async () => {
    const r = await exportSpineBatchCsvManifestAnonymise(
      [entry('Maria'), entry('Maria'), entry('Maria')],
      { hmacSecret: SECRET },
    );
    expect(r.lookupRows.length).toBe(1);
    expect(r.lookupRows[0]!.originalPatientName).toBe('Maria');
  });
});

// Name strategy tests -------------------------------------------------

describe('exportSpineBatchCsvManifestAnonymise — name strategies', () => {
  it('redacted strategy replaces every name with literal "REDACTED"', async () => {
    const r = await exportSpineBatchCsvManifestAnonymise(
      [entry('Maria Lopez'), entry('Juan Garcia')],
      { hmacSecret: SECRET, nameStrategy: 'redacted' },
    );
    expect(r.manifestRows.every((row) => row.patientName === 'REDACTED')).toBe(
      true,
    );
    expect(r.manifestCsv).not.toContain('spine-');
    expect(r.manifestCsv).toContain('REDACTED');
  });

  it('hashed strategy uses configurable prefix', async () => {
    const r = await exportSpineBatchCsvManifestAnonymise(
      [entry('Maria Lopez')],
      { hmacSecret: SECRET, hashPrefix: 'pt-' },
    );
    expect(r.manifestRows[0]!.patientName).toMatch(/^pt-[0-9a-f]+$/);
  });

  it('hashed strategy respects hashHexLength', async () => {
    const r = await exportSpineBatchCsvManifestAnonymise(
      [entry('Maria Lopez')],
      { hmacSecret: SECRET, hashHexLength: 8 },
    );
    expect(r.manifestRows[0]!.patientName).toMatch(/^spine-[0-9a-f]{8}$/);
  });

  it('clamps hashHexLength below 4 to 4', async () => {
    const r = await exportSpineBatchCsvManifestAnonymise(
      [entry('Maria Lopez')],
      { hmacSecret: SECRET, hashHexLength: 1 },
    );
    expect(r.manifestRows[0]!.patientName).toMatch(/^spine-[0-9a-f]{4}$/);
  });

  it('clamps hashHexLength above 64 to 64', async () => {
    const r = await exportSpineBatchCsvManifestAnonymise(
      [entry('Maria Lopez')],
      { hmacSecret: SECRET, hashHexLength: 9999 },
    );
    expect(r.manifestRows[0]!.patientName).toMatch(/^spine-[0-9a-f]{64}$/);
  });
});

// Pass-through cell tests ---------------------------------------------

describe('exportSpineBatchCsvManifestAnonymise — pass-through cells', () => {
  it('preserves dateLabel by default', async () => {
    const r = await exportSpineBatchCsvManifestAnonymise(
      [entry('Maria', { dateLabel: 'Q1 2026' })],
      { hmacSecret: SECRET },
    );
    expect(r.manifestRows[0]!.dateLabel).toBe('Q1 2026');
    expect(r.manifestCsv).toContain('Q1 2026');
  });

  it('redacts dateLabel when preserveDateLabel=false (non-null only)', async () => {
    const r = await exportSpineBatchCsvManifestAnonymise(
      [
        entry('Maria', { dateLabel: 'DOB 1972-04-12' }),
        entry('Juan', { dateLabel: null }),
      ],
      { hmacSecret: SECRET, preserveDateLabel: false },
    );
    expect(r.manifestRows[0]!.dateLabel).toBe('REDACTED');
    expect(r.manifestRows[1]!.dateLabel).toBeNull();
  });

  it('preserves panelLabel by default', async () => {
    const r = await exportSpineBatchCsvManifestAnonymise(
      [entry('Maria', { panelLabel: 'Cardiology' })],
      { hmacSecret: SECRET },
    );
    expect(r.manifestRows[0]!.panelLabel).toBe('Cardiology');
  });

  it('redacts panelLabel when preservePanelLabel=false (non-null only)', async () => {
    const r = await exportSpineBatchCsvManifestAnonymise(
      [
        entry('Maria', { panelLabel: 'Lopez Family' }),
        entry('Juan', { panelLabel: null }),
      ],
      { hmacSecret: SECRET, preservePanelLabel: false },
    );
    expect(r.manifestRows[0]!.panelLabel).toBe('REDACTED');
    expect(r.manifestRows[1]!.panelLabel).toBeNull();
  });

  it('passes the sheet summary CSV through unchanged (no PHI)', async () => {
    const r = await exportSpineBatchCsvManifestAnonymise(
      [entry('Maria'), entry('Juan')],
      { hmacSecret: SECRET },
    );
    expect(r.sheetSummaryCsv).toContain(
      'sheetNumber,totalSheets,spineCount,capacity',
    );
    expect(r.sheetSummaryCsv).not.toContain('Maria');
    expect(r.sheetSummaryCsv).not.toContain('Juan');
  });
});

// Geometry preservation tests -----------------------------------------

describe('exportSpineBatchCsvManifestAnonymise — geometry preservation', () => {
  it('preserves sheetNumber / rowOnSheet / columnOnSheet from source', async () => {
    const r = await exportSpineBatchCsvManifestAnonymise(
      [entry('Maria'), entry('Juan'), entry('Sarah')],
      { hmacSecret: SECRET },
    );
    expect(r.manifestRows.every((row, i) => row.positionInBatch === i + 1)).toBe(
      true,
    );
    // Source manifest and anonymised manifest should agree on every
    // geometry cell.
    for (let i = 0; i < r.manifestRows.length; i++) {
      expect(r.manifestRows[i]!.sheetNumber).toBe(
        r.source.manifestRows[i]!.sheetNumber,
      );
      expect(r.manifestRows[i]!.rowOnSheet).toBe(
        r.source.manifestRows[i]!.rowOnSheet,
      );
      expect(r.manifestRows[i]!.columnOnSheet).toBe(
        r.source.manifestRows[i]!.columnOnSheet,
      );
    }
  });
});

// Validation tests ----------------------------------------------------

describe('exportSpineBatchCsvManifestAnonymise — validation', () => {
  it('throws on short hmacSecret', async () => {
    await expect(
      exportSpineBatchCsvManifestAnonymise([entry('Maria')], {
        hmacSecret: 'short',
      }),
    ).rejects.toThrow(/at least 32 chars/);
  });

  it('throws on non-string hmacSecret', async () => {
    await expect(
      exportSpineBatchCsvManifestAnonymise([entry('Maria')], {
        hmacSecret: undefined as unknown as string,
      }),
    ).rejects.toThrow(/at least 32 chars/);
  });
});

// Empty input tests ---------------------------------------------------

describe('exportSpineBatchCsvManifestAnonymise — empty input', () => {
  it('handles zero entries cleanly', async () => {
    const r = await exportSpineBatchCsvManifestAnonymise([], {
      hmacSecret: SECRET,
    });
    expect(r.manifestRowCount).toBe(0);
    expect(r.distinctPatientCount).toBe(0);
    expect(r.lookupRows).toEqual([]);
    expect(r.collisionDetected).toBe(false);
    // CSV still emits the header row.
    expect(r.manifestCsv).toContain('sheetNumber,totalSheets');
    expect(r.nameLookupCsv).toContain(
      'originalPatientName,pseudonymousPatientName',
    );
  });
});

// summarizeSpineBatchCsvManifestAnonymise tests -----------------------

describe('summarizeSpineBatchCsvManifestAnonymise', () => {
  it('reports the hashed strategy + hex length', async () => {
    const r = await exportSpineBatchCsvManifestAnonymise(
      [entry('Maria'), entry('Juan')],
      { hmacSecret: SECRET },
    );
    const s = summarizeSpineBatchCsvManifestAnonymise(r, {
      hmacSecret: SECRET,
    });
    expect(s).toContain('2 rows');
    expect(s).toContain('2 distinct patients');
    expect(s).toContain('(hashed, hex=16)');
    expect(s).toContain('no collisions');
  });

  it('reports the redacted strategy', async () => {
    const r = await exportSpineBatchCsvManifestAnonymise(
      [entry('Maria')],
      { hmacSecret: SECRET, nameStrategy: 'redacted' },
    );
    const s = summarizeSpineBatchCsvManifestAnonymise(r, {
      hmacSecret: SECRET,
      nameStrategy: 'redacted',
    });
    expect(s).toContain('(redacted)');
    expect(s).not.toContain('hex=');
  });

  it('reports hex= with clamped lower bound', async () => {
    const r = await exportSpineBatchCsvManifestAnonymise(
      [entry('Maria')],
      { hmacSecret: SECRET, hashHexLength: 1 },
    );
    const s = summarizeSpineBatchCsvManifestAnonymise(r, {
      hmacSecret: SECRET,
      hashHexLength: 1,
    });
    expect(s).toContain('hex=4');
  });

  it('singular grammar when only one row / patient', async () => {
    const r = await exportSpineBatchCsvManifestAnonymise(
      [entry('Maria')],
      { hmacSecret: SECRET },
    );
    const s = summarizeSpineBatchCsvManifestAnonymise(r, {
      hmacSecret: SECRET,
    });
    expect(s).toContain('1 row,');
    expect(s).toContain('1 distinct patient');
  });
});

// detectSpineBatchCsvManifestAnonymiseRedactedRows tests --------------

describe('detectSpineBatchCsvManifestAnonymiseRedactedRows', () => {
  it('returns every row when nameStrategy=redacted', async () => {
    const r = await exportSpineBatchCsvManifestAnonymise(
      [entry('Maria'), entry('Juan'), entry('Sarah')],
      { hmacSecret: SECRET, nameStrategy: 'redacted' },
    );
    const rows = detectSpineBatchCsvManifestAnonymiseRedactedRows(r);
    expect(rows.length).toBe(3);
  });

  it('returns empty array under hashed strategy with no collisions', async () => {
    const r = await exportSpineBatchCsvManifestAnonymise(
      [entry('Maria'), entry('Juan'), entry('Sarah')],
      { hmacSecret: SECRET },
    );
    const rows = detectSpineBatchCsvManifestAnonymiseRedactedRows(r);
    expect(rows).toEqual([]);
  });
});

// HMAC source spec tests ----------------------------------------------

describe('exportSpineBatchCsvManifestAnonymise — CSV escaping', () => {
  it('escapes commas / quotes in preserved cells', async () => {
    const r = await exportSpineBatchCsvManifestAnonymise(
      [entry('Maria', { dateLabel: 'Q1, 2026', panelLabel: 'O"Brien Plan' })],
      { hmacSecret: SECRET },
    );
    expect(r.manifestCsv).toContain('"Q1, 2026"');
    expect(r.manifestCsv).toContain('"O""Brien Plan"');
  });

  it('emits empty cell (not null) for null pass-through values', async () => {
    const r = await exportSpineBatchCsvManifestAnonymise(
      [entry('Maria', { dateLabel: null, panelLabel: null })],
      { hmacSecret: SECRET },
    );
    expect(r.manifestRows[0]!.dateLabel).toBeNull();
    expect(r.manifestRows[0]!.panelLabel).toBeNull();
    // CSV cell should be bare empty.
    const dataLine = r.manifestCsv.split('\n')[1]!;
    expect(dataLine.endsWith(',,')).toBe(true);
  });
});

// BOM tests -----------------------------------------------------------

describe('exportSpineBatchCsvManifestAnonymise — BOM', () => {
  it('includeBom=true prepends UTF-8 BOM to both CSVs', async () => {
    const r = await exportSpineBatchCsvManifestAnonymise(
      [entry('Maria')],
      { hmacSecret: SECRET, includeBom: true },
    );
    expect(r.manifestCsv.charCodeAt(0)).toBe(0xfeff);
    expect(r.nameLookupCsv.charCodeAt(0)).toBe(0xfeff);
    expect(r.sheetSummaryCsv.charCodeAt(0)).toBe(0xfeff);
  });

  it('default emits no BOM', async () => {
    const r = await exportSpineBatchCsvManifestAnonymise(
      [entry('Maria')],
      { hmacSecret: SECRET },
    );
    expect(r.manifestCsv.charCodeAt(0)).not.toBe(0xfeff);
    expect(r.nameLookupCsv.charCodeAt(0)).not.toBe(0xfeff);
  });
});
