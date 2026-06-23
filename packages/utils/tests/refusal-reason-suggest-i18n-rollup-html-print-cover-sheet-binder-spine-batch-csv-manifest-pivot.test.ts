import { describe, it, expect } from 'vitest';
import type { RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatchEntry } from '../src/refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch';
import {
  exportSpineBatchCsvManifestPivot,
  detectPartialSpineSheets,
  summarizeSpineBatchCsvManifestPivot,
} from '../src/refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch-csv-manifest-pivot';
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

const SHARED_ROLLUP = rollupWithNDoses(3);

function entries(
  count: number,
  opts: { includeDates?: boolean } = {},
): RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatchEntry[] {
  return Array.from({ length: count }, (_, i) => {
    const e: RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatchEntry = {
      patientName: `Patient ${i + 1}`,
      result: SHARED_ROLLUP,
    };
    if (opts.includeDates !== false) {
      e.dateLabel = `2026-06-${String((i % 28) + 1).padStart(2, '0')}`;
      e.panelLabel = `Panel ${i + 1}`;
    }
    return e;
  });
}

// Force a 2x3 grid (6 per sheet) — predictable for small tests.
const FORCED_2x3 = { forceColumns: 2, forceRows: 3 } as const;

describe('exportSpineBatchCsvManifestPivot — shape', () => {
  it('produces a non-empty CSV', () => {
    const out = exportSpineBatchCsvManifestPivot(entries(6), FORCED_2x3);
    expect(out.pivotCsv.length).toBeGreaterThan(0);
  });

  it('has header + one row per sheet', () => {
    const out = exportSpineBatchCsvManifestPivot(entries(12), FORCED_2x3);
    const lines = out.pivotCsv.split('\n');
    expect(lines).toHaveLength(1 + 2); // 12 spines / 6 per sheet = 2 sheets
  });

  it('pivotRowCount equals sheet count', () => {
    const out = exportSpineBatchCsvManifestPivot(entries(12), FORCED_2x3);
    expect(out.pivotRowCount).toBe(2);
  });

  it('header starts with the base columns', () => {
    const out = exportSpineBatchCsvManifestPivot(entries(6), FORCED_2x3);
    const header = out.pivotCsv.split('\n')[0]!;
    expect(header.startsWith('sheetNumber,totalSheets,capacity,spineCount,')).toBe(true);
  });

  it('header has one column per position (capacity)', () => {
    const out = exportSpineBatchCsvManifestPivot(entries(6), FORCED_2x3);
    const cols = out.pivotCsv.split('\n')[0]!.split(',');
    // 4 base + 6 positions
    expect(cols).toHaveLength(10);
  });

  it('columnCount field matches header length', () => {
    const out = exportSpineBatchCsvManifestPivot(entries(6), FORCED_2x3);
    const headerLen = out.pivotCsv.split('\n')[0]!.split(',').length;
    expect(out.columnCount).toBe(headerLen);
  });

  it('position column header pattern defaults to pos_{n}', () => {
    const out = exportSpineBatchCsvManifestPivot(entries(6), FORCED_2x3);
    const header = out.pivotCsv.split('\n')[0]!;
    expect(header).toContain(',pos_1,');
    expect(header).toContain(',pos_6');
  });

  it('honours custom positionColumnTemplate', () => {
    const out = exportSpineBatchCsvManifestPivot(entries(6), {
      ...FORCED_2x3,
      positionColumnTemplate: 'slot{n}',
    });
    const header = out.pivotCsv.split('\n')[0]!;
    expect(header).toContain(',slot1,');
    expect(header).toContain(',slot6');
  });
});

describe('exportSpineBatchCsvManifestPivot — body rows', () => {
  it('first body row has correct sheetNumber + totalSheets', () => {
    const out = exportSpineBatchCsvManifestPivot(entries(12), FORCED_2x3);
    const row = out.pivotCsv.split('\n')[1]!.split(',');
    expect(row[0]).toBe('1');
    expect(row[1]).toBe('2');
  });

  it('capacity column equals computed sheet capacity', () => {
    const out = exportSpineBatchCsvManifestPivot(entries(6), FORCED_2x3);
    const row = out.pivotCsv.split('\n')[1]!.split(',');
    expect(row[2]).toBe('6');
  });

  it('spineCount column equals filled positions on that sheet', () => {
    const out = exportSpineBatchCsvManifestPivot(entries(4), FORCED_2x3);
    const row = out.pivotCsv.split('\n')[1]!.split(',');
    expect(row[3]).toBe('4');
  });

  it('position cells contain patient names in row-major order', () => {
    const out = exportSpineBatchCsvManifestPivot(entries(6), FORCED_2x3);
    const cells = out.pivotCsv.split('\n')[1]!.split(',');
    // base columns 0..3, positions 4..9
    expect(cells[4]).toBe('Patient 1');
    expect(cells[5]).toBe('Patient 2');
    expect(cells[6]).toBe('Patient 3');
    expect(cells[9]).toBe('Patient 6');
  });

  it('partial sheet has empty cells for unfilled positions', () => {
    const out = exportSpineBatchCsvManifestPivot(entries(4), FORCED_2x3);
    const cells = out.pivotCsv.split('\n')[1]!.split(',');
    // first 4 positions filled, last 2 empty
    expect(cells[4]).toBe('Patient 1');
    expect(cells[7]).toBe('Patient 4');
    expect(cells[8]).toBe('');
    expect(cells[9]).toBe('');
  });
});

describe('exportSpineBatchCsvManifestPivot — empty placeholder', () => {
  it('empty positions use bare empty cells by default', () => {
    const out = exportSpineBatchCsvManifestPivot(entries(4), FORCED_2x3);
    expect(out.pivotRows[0]?.positions[4]).toBe('');
    expect(out.pivotRows[0]?.positions[5]).toBe('');
  });

  it('honours custom emptyPositionPlaceholder', () => {
    const out = exportSpineBatchCsvManifestPivot(entries(4), {
      ...FORCED_2x3,
      emptyPositionPlaceholder: '\u2014',
    });
    expect(out.pivotRows[0]?.positions[4]).toBe('\u2014');
  });

  it('placeholder is CSV-escaped when it contains comma', () => {
    const out = exportSpineBatchCsvManifestPivot(entries(4), {
      ...FORCED_2x3,
      emptyPositionPlaceholder: 'empty, here',
    });
    const cells = out.pivotCsv.split('\n')[1]!;
    expect(cells).toContain('"empty, here"');
  });
});

describe('exportSpineBatchCsvManifestPivot — includeDateLabelInPosition', () => {
  it('default OFF: position cells contain only patient name', () => {
    const out = exportSpineBatchCsvManifestPivot(entries(6), FORCED_2x3);
    expect(out.pivotRows[0]?.positions[0]).toBe('Patient 1');
  });

  it('on: position cells contain patient name + (dateLabel)', () => {
    const out = exportSpineBatchCsvManifestPivot(entries(6), {
      ...FORCED_2x3,
      includeDateLabelInPosition: true,
    });
    expect(out.pivotRows[0]?.positions[0]).toBe('Patient 1 (2026-06-01)');
  });

  it('falls back to patient name when dateLabel is missing', () => {
    const ents = entries(6, { includeDates: false });
    const out = exportSpineBatchCsvManifestPivot(ents, {
      ...FORCED_2x3,
      includeDateLabelInPosition: true,
    });
    expect(out.pivotRows[0]?.positions[0]).toBe('Patient 1');
  });
});

describe('exportSpineBatchCsvManifestPivot — CSV escaping', () => {
  it('escapes patient names with commas', () => {
    const ents: RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatchEntry[] = [
      { patientName: 'Smith, John', result: SHARED_ROLLUP },
    ];
    const out = exportSpineBatchCsvManifestPivot(ents, FORCED_2x3);
    expect(out.pivotCsv).toContain('"Smith, John"');
  });

  it('escapes patient names with quotes', () => {
    const ents: RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatchEntry[] = [
      { patientName: 'O"Brien', result: SHARED_ROLLUP },
    ];
    const out = exportSpineBatchCsvManifestPivot(ents, FORCED_2x3);
    expect(out.pivotCsv).toContain('"O""Brien"');
  });

  it('escapes patient names with newlines', () => {
    const ents: RefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatchEntry[] = [
      { patientName: 'Multi\nLine', result: SHARED_ROLLUP },
    ];
    const out = exportSpineBatchCsvManifestPivot(ents, FORCED_2x3);
    expect(out.pivotCsv).toContain('"Multi\nLine"');
  });
});

describe('exportSpineBatchCsvManifestPivot — multi-sheet', () => {
  it('emits one row per sheet even for many sheets', () => {
    const out = exportSpineBatchCsvManifestPivot(entries(20), FORCED_2x3);
    // 20 spines / 6 per sheet = ceil(20/6) = 4 sheets
    expect(out.pivotRowCount).toBe(4);
  });

  it('each row carries its own sheetNumber sequentially', () => {
    const out = exportSpineBatchCsvManifestPivot(entries(18), FORCED_2x3);
    const sheetNumbers = out.pivotRows.map((r) => r.sheetNumber);
    expect(sheetNumbers).toEqual([1, 2, 3]);
  });

  it('totalSheets is consistent across rows', () => {
    const out = exportSpineBatchCsvManifestPivot(entries(18), FORCED_2x3);
    const totals = out.pivotRows.map((r) => r.totalSheets);
    expect(totals).toEqual([3, 3, 3]);
  });

  it('last sheet has the trailing spines + empty positions', () => {
    const out = exportSpineBatchCsvManifestPivot(entries(8), FORCED_2x3);
    // 8 / 6 = 2 sheets; second sheet has 2 spines + 4 empty
    const lastSheet = out.pivotRows.at(-1)!;
    expect(lastSheet.spineCount).toBe(2);
    expect(lastSheet.positions[0]).toBe('Patient 7');
    expect(lastSheet.positions[1]).toBe('Patient 8');
    expect(lastSheet.positions[2]).toBe('');
  });
});

describe('exportSpineBatchCsvManifestPivot — edge cases', () => {
  it('empty entries produces header + one virtual sheet row', () => {
    const out = exportSpineBatchCsvManifestPivot([], FORCED_2x3);
    expect(out.pivotCsv.split('\n')[0]).toContain('sheetNumber');
    // 0 entries => totalSheets=1 (one virtual empty sheet from underlying summary)
    expect(out.pivotRowCount).toBe(1);
    expect(out.pivotRows[0]?.spineCount).toBe(0);
  });

  it('includeBom prepends BOM', () => {
    const out = exportSpineBatchCsvManifestPivot(entries(6), {
      ...FORCED_2x3,
      includeBom: true,
    });
    expect(out.pivotCsv.startsWith('\uFEFF')).toBe(true);
  });

  it('source manifest is exposed', () => {
    const out = exportSpineBatchCsvManifestPivot(entries(6), FORCED_2x3);
    expect(out.source.manifestRowCount).toBe(6);
    expect(out.source.sheetSummaryRowCount).toBe(1);
  });
});

describe('detectPartialSpineSheets', () => {
  it('returns empty array when every sheet is full', () => {
    const out = exportSpineBatchCsvManifestPivot(entries(12), FORCED_2x3);
    expect(detectPartialSpineSheets(out)).toEqual([]);
  });

  it('returns the sheet number of a partial last sheet', () => {
    const out = exportSpineBatchCsvManifestPivot(entries(8), FORCED_2x3);
    // 8 spines, 2 sheets, second one has 2 spines (partial)
    expect(detectPartialSpineSheets(out)).toEqual([2]);
  });

  it('returns multiple partial sheets sorted ASC', () => {
    const out = exportSpineBatchCsvManifestPivot(entries(4), FORCED_2x3);
    // 4 spines, 1 sheet of 6; sheet 1 is partial
    expect(detectPartialSpineSheets(out)).toEqual([1]);
  });
});

describe('summarizeSpineBatchCsvManifestPivot', () => {
  it('summarises a fully-used multi-sheet pivot', () => {
    const out = exportSpineBatchCsvManifestPivot(entries(12), FORCED_2x3);
    const line = summarizeSpineBatchCsvManifestPivot(out);
    expect(line).toContain('2 sheets');
    expect(line).toContain('6 per sheet');
    expect(line).toContain('12 positions');
    expect(line).toContain('(all used)');
  });

  it('reports partial sheets', () => {
    const out = exportSpineBatchCsvManifestPivot(entries(8), FORCED_2x3);
    const line = summarizeSpineBatchCsvManifestPivot(out);
    expect(line).toContain('partial sheet');
  });

  it('singular grammar for one sheet + one partial', () => {
    const out = exportSpineBatchCsvManifestPivot(entries(4), FORCED_2x3);
    const line = summarizeSpineBatchCsvManifestPivot(out);
    expect(line).toContain('1 sheet ');
    expect(line).toContain('1 partial sheet');
  });

  it('reports used/empty split for partial sheets', () => {
    const out = exportSpineBatchCsvManifestPivot(entries(8), FORCED_2x3);
    const line = summarizeSpineBatchCsvManifestPivot(out);
    expect(line).toContain('8 used');
    expect(line).toContain('4 empty');
  });
});

describe('exportSpineBatchCsvManifestPivot — determinism', () => {
  it('two identical inputs produce identical CSVs', () => {
    const a = exportSpineBatchCsvManifestPivot(entries(12), FORCED_2x3);
    const b = exportSpineBatchCsvManifestPivot(entries(12), FORCED_2x3);
    expect(a.pivotCsv).toBe(b.pivotCsv);
  });
});
