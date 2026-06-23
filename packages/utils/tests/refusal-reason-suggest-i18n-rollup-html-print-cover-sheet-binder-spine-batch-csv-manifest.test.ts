import { describe, it, expect } from 'vitest';
import {
  exportSpineBatchCsvManifest,
  exportSpineBatchHtmlAndManifest,
  detectSpineBatchCsvManifestDuplicates,
  summarizeSpineBatchCsvManifest,
} from '../src/refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch-csv-manifest';
import {
  rollupLocalisedRefusalSuggestions,
  type RefusalReasonI18nRollupResult,
} from '../src/refusal-reason-suggest-i18n-rollup';
import {
  REFUSAL_REASON_I18N_EN,
  type RefusalReasonI18nBundle,
} from '../src/refusal-reason-suggest-i18n';
import type { RefusalReasonSuggestInput } from '../src/refusal-reason-suggest';
import type { Dose } from '@med/types';

const MED_ID = 'med-1';
const NOW = new Date(2026, 5, 21, 12, 0);

function dose(id: string, o: Partial<Dose> & { dueAt: string }): Dose {
  return {
    id,
    medicationId: o.medicationId ?? MED_ID,
    scheduleId: o.scheduleId ?? 's-1',
    dueAt: o.dueAt,
    takenAt: o.takenAt ?? null,
    status: o.status ?? 'missed',
  } as Dose;
}

function ctx(
  o: Partial<Omit<RefusalReasonSuggestInput, 'dose'>> = {},
): Omit<RefusalReasonSuggestInput, 'dose'> {
  return {
    medication: o.medication ?? { id: MED_ID, supplyRemaining: 30 },
    now: o.now ?? NOW,
    ...(o.npoWindows !== undefined ? { npoWindows: o.npoWindows } : {}),
  };
}

const EN_BUNDLE: RefusalReasonI18nBundle = {
  locale: 'en-US',
  strings: REFUSAL_REASON_I18N_EN,
};

function rollupWithNDoses(n: number): RefusalReasonI18nRollupResult {
  const doses = Array.from({ length: n }, (_, i) =>
    dose(`d-${i}`, { dueAt: '2026-06-21T08:00:00.000' }),
  );
  return rollupLocalisedRefusalSuggestions(
    doses,
    ctx({ npoWindows: [{ startDate: '2026-06-21', endDate: '2026-06-21' }] }),
    EN_BUNDLE,
  );
}

function entries(names: string[], extras: Partial<{ dateLabel: string; panelLabel: string }> = {}) {
  const rollup = rollupWithNDoses(3);
  return names.map((n) => ({
    patientName: n,
    result: rollup,
    ...(extras.dateLabel !== undefined ? { dateLabel: extras.dateLabel } : {}),
    ...(extras.panelLabel !== undefined ? { panelLabel: extras.panelLabel } : {}),
  }));
}

function csvLines(csv: string): string[] {
  return csv.split('\n');
}

describe('exportSpineBatchCsvManifest — shape', () => {
  it('returns BOTH manifestCsv and sheetSummaryCsv', () => {
    const out = exportSpineBatchCsvManifest(entries(['Alice', 'Bob', 'Carol']));
    expect(out.manifestCsv.length).toBeGreaterThan(0);
    expect(out.sheetSummaryCsv.length).toBeGreaterThan(0);
  });

  it('manifestRowCount equals entry count', () => {
    const out = exportSpineBatchCsvManifest(entries(['A', 'B', 'C', 'D']));
    expect(out.manifestRowCount).toBe(4);
  });

  it('manifestRows.length equals entry count', () => {
    const out = exportSpineBatchCsvManifest(entries(['A', 'B', 'C', 'D', 'E']));
    expect(out.manifestRows).toHaveLength(5);
  });

  it('sheetSummaryRowCount equals at least 1 (always)', () => {
    const out = exportSpineBatchCsvManifest(entries([]));
    expect(out.sheetSummaryRowCount).toBeGreaterThanOrEqual(1);
  });

  it('emits the canonical 8-column manifest header', () => {
    const out = exportSpineBatchCsvManifest(entries(['Alice']));
    const header = csvLines(out.manifestCsv)[0];
    expect(header).toBe(
      'sheetNumber,totalSheets,rowOnSheet,columnOnSheet,positionInBatch,patientName,dateLabel,panelLabel',
    );
  });

  it('emits the canonical 4-column sheet summary header', () => {
    const out = exportSpineBatchCsvManifest(entries(['Alice']));
    const header = csvLines(out.sheetSummaryCsv)[0];
    expect(header).toBe('sheetNumber,totalSheets,spineCount,capacity');
  });
});

describe('exportSpineBatchCsvManifest — row contents', () => {
  it('positionInBatch is 1-based and matches input order', () => {
    const out = exportSpineBatchCsvManifest(entries(['Alice', 'Bob', 'Carol']));
    expect(out.manifestRows[0]?.positionInBatch).toBe(1);
    expect(out.manifestRows[1]?.positionInBatch).toBe(2);
    expect(out.manifestRows[2]?.positionInBatch).toBe(3);
  });

  it('patientName matches the input entry', () => {
    const out = exportSpineBatchCsvManifest(entries(['Alice', 'Bob']));
    expect(out.manifestRows[0]?.patientName).toBe('Alice');
    expect(out.manifestRows[1]?.patientName).toBe('Bob');
  });

  it('dateLabel + panelLabel default to null when not supplied', () => {
    const out = exportSpineBatchCsvManifest(entries(['Alice']));
    expect(out.manifestRows[0]?.dateLabel).toBeNull();
    expect(out.manifestRows[0]?.panelLabel).toBeNull();
  });

  it('preserves supplied dateLabel + panelLabel verbatim', () => {
    const out = exportSpineBatchCsvManifest(
      entries(['Alice'], { dateLabel: '2026-06-21', panelLabel: 'Q3 review' }),
    );
    expect(out.manifestRows[0]?.dateLabel).toBe('2026-06-21');
    expect(out.manifestRows[0]?.panelLabel).toBe('Q3 review');
  });

  it('row/column on sheet wraps based on columnsPerSheet', () => {
    // Without a forced grid we just verify each row has valid coords.
    const out = exportSpineBatchCsvManifest(
      entries(['A', 'B', 'C', 'D', 'E', 'F']),
    );
    for (const r of out.manifestRows) {
      expect(r.rowOnSheet).toBeGreaterThanOrEqual(1);
      expect(r.columnOnSheet).toBeGreaterThanOrEqual(1);
    }
  });

  it('forced 2x2 grid wraps rows/columns deterministically', () => {
    const out = exportSpineBatchCsvManifest(
      entries(['A', 'B', 'C', 'D', 'E']),
      { forceColumns: 2, forceRows: 2 },
    );
    // Spines per sheet = 4; A=sheet1 r1c1, B=sheet1 r1c2, C=sheet1 r2c1,
    // D=sheet1 r2c2, E=sheet2 r1c1.
    expect(out.manifestRows[0]).toMatchObject({ sheetNumber: 1, rowOnSheet: 1, columnOnSheet: 1 });
    expect(out.manifestRows[1]).toMatchObject({ sheetNumber: 1, rowOnSheet: 1, columnOnSheet: 2 });
    expect(out.manifestRows[2]).toMatchObject({ sheetNumber: 1, rowOnSheet: 2, columnOnSheet: 1 });
    expect(out.manifestRows[3]).toMatchObject({ sheetNumber: 1, rowOnSheet: 2, columnOnSheet: 2 });
    expect(out.manifestRows[4]).toMatchObject({ sheetNumber: 2, rowOnSheet: 1, columnOnSheet: 1 });
  });

  it('totalSheets is consistent across every row', () => {
    const out = exportSpineBatchCsvManifest(
      entries(['A', 'B', 'C', 'D', 'E']),
      { forceColumns: 2, forceRows: 2 },
    );
    const totalSheetsValues = new Set(out.manifestRows.map((r) => r.totalSheets));
    expect(totalSheetsValues.size).toBe(1);
    expect([...totalSheetsValues][0]).toBe(2);
  });
});

describe('exportSpineBatchCsvManifest — sheet summary', () => {
  it('reports the correct capacity per sheet', () => {
    const out = exportSpineBatchCsvManifest(
      entries(['A', 'B', 'C']),
      { forceColumns: 2, forceRows: 2 },
    );
    expect(out.sheetSummaryRows[0]?.capacity).toBe(4);
  });

  it('reports the actual spine count per sheet (not capacity)', () => {
    const out = exportSpineBatchCsvManifest(
      entries(['A', 'B', 'C', 'D', 'E']),
      { forceColumns: 2, forceRows: 2 },
    );
    // Sheet 1: 4 spines (full); Sheet 2: 1 spine (partial).
    expect(out.sheetSummaryRows[0]?.spineCount).toBe(4);
    expect(out.sheetSummaryRows[1]?.spineCount).toBe(1);
  });

  it('produces one summary row per sheet', () => {
    const out = exportSpineBatchCsvManifest(
      entries(['A', 'B', 'C', 'D', 'E', 'F', 'G']),
      { forceColumns: 2, forceRows: 2 },
    );
    // 7 spines, 4 per sheet -> 2 sheets.
    expect(out.sheetSummaryRowCount).toBe(2);
  });
});

describe('exportSpineBatchCsvManifest — RFC 4180 escaping', () => {
  it('escapes patient names containing commas', () => {
    const out = exportSpineBatchCsvManifest(entries(['Smith, John']));
    expect(out.manifestCsv).toContain('"Smith, John"');
  });

  it('escapes patient names containing double quotes (doubled)', () => {
    const out = exportSpineBatchCsvManifest(entries(['O"Reilly']));
    expect(out.manifestCsv).toContain('"O""Reilly"');
  });

  it('escapes patient names containing newlines', () => {
    const out = exportSpineBatchCsvManifest(entries(['Bad\nName']));
    expect(out.manifestCsv).toContain('"Bad\nName"');
  });
});

describe('exportSpineBatchCsvManifest — BOM', () => {
  it('does not include a BOM by default', () => {
    const out = exportSpineBatchCsvManifest(entries(['Alice']));
    expect(out.manifestCsv.startsWith('\uFEFF')).toBe(false);
    expect(out.sheetSummaryCsv.startsWith('\uFEFF')).toBe(false);
  });

  it('prepends a BOM when includeBom=true', () => {
    const out = exportSpineBatchCsvManifest(entries(['Alice']), { includeBom: true });
    expect(out.manifestCsv.startsWith('\uFEFF')).toBe(true);
    expect(out.sheetSummaryCsv.startsWith('\uFEFF')).toBe(true);
  });
});

describe('exportSpineBatchCsvManifest — empty input', () => {
  it('emits a header-only manifestCsv for zero entries', () => {
    const out = exportSpineBatchCsvManifest(entries([]));
    expect(csvLines(out.manifestCsv)).toHaveLength(1);
    expect(out.manifestRowCount).toBe(0);
  });

  it('emits exactly one summary row for zero entries', () => {
    const out = exportSpineBatchCsvManifest(entries([]));
    expect(out.sheetSummaryRowCount).toBe(1);
    expect(out.sheetSummaryRows[0]?.spineCount).toBe(0);
  });
});

describe('detectSpineBatchCsvManifestDuplicates', () => {
  it('returns empty array when all patient names are unique', () => {
    const out = exportSpineBatchCsvManifest(entries(['Alice', 'Bob', 'Carol']));
    expect(detectSpineBatchCsvManifestDuplicates(out)).toEqual([]);
  });

  it('returns a single duplicate entry when a name appears twice', () => {
    const out = exportSpineBatchCsvManifest(entries(['Alice', 'Bob', 'Alice']));
    const dupes = detectSpineBatchCsvManifestDuplicates(out);
    expect(dupes).toHaveLength(1);
    expect(dupes[0]?.patientName).toBe('Alice');
    expect(dupes[0]?.occurrences).toHaveLength(2);
  });

  it('returns multiple duplicates sorted by patient name', () => {
    const out = exportSpineBatchCsvManifest(
      entries(['Zebra', 'Alice', 'Bob', 'Alice', 'Zebra']),
    );
    const dupes = detectSpineBatchCsvManifestDuplicates(out);
    expect(dupes).toHaveLength(2);
    expect(dupes[0]?.patientName).toBe('Alice');
    expect(dupes[1]?.patientName).toBe('Zebra');
  });

  it('occurrences carry sheet + row + column + position', () => {
    const out = exportSpineBatchCsvManifest(
      entries(['Alice', 'Bob', 'Alice']),
      { forceColumns: 2, forceRows: 2 },
    );
    const dupes = detectSpineBatchCsvManifestDuplicates(out);
    const occ = dupes[0]?.occurrences ?? [];
    expect(occ).toHaveLength(2);
    expect(occ[0]?.positionInBatch).toBe(1);
    expect(occ[1]?.positionInBatch).toBe(3);
  });
});

describe('exportSpineBatchHtmlAndManifest', () => {
  it('returns both batch HTML and CSV manifest', () => {
    const out = exportSpineBatchHtmlAndManifest(entries(['Alice', 'Bob']));
    expect(out.batch.html.length).toBeGreaterThan(0);
    expect(out.manifest.manifestCsv.length).toBeGreaterThan(0);
  });

  it('manifest spine count matches the batch totalSpines', () => {
    const out = exportSpineBatchHtmlAndManifest(entries(['A', 'B', 'C', 'D', 'E']));
    expect(out.manifest.manifestRowCount).toBe(out.batch.totalSpines);
  });
});

describe('summarizeSpineBatchCsvManifest', () => {
  it('emits a one-line summary with spine + sheet counts', () => {
    const out = exportSpineBatchCsvManifest(entries(['Alice', 'Bob']));
    const line = summarizeSpineBatchCsvManifest(out);
    expect(line).toMatch(/^Spine manifest: 2 spines across 1 sheet/);
    expect(line).toContain('no duplicates');
    expect(line).not.toContain('\n');
  });

  it('reports duplicate count when present', () => {
    const out = exportSpineBatchCsvManifest(entries(['Alice', 'Bob', 'Alice']));
    const line = summarizeSpineBatchCsvManifest(out);
    expect(line).toContain('1 duplicate name');
  });

  it('pluralises "duplicate names" for >1', () => {
    const out = exportSpineBatchCsvManifest(
      entries(['Alice', 'Alice', 'Bob', 'Bob']),
    );
    const line = summarizeSpineBatchCsvManifest(out);
    expect(line).toContain('2 duplicate names');
  });

  it('singularises "spine" / "sheet" / "name" for 1', () => {
    const out = exportSpineBatchCsvManifest(entries(['Alice']));
    const line = summarizeSpineBatchCsvManifest(out);
    expect(line).toContain('1 spine ');
    expect(line).toContain('1 sheet ');
  });
});
