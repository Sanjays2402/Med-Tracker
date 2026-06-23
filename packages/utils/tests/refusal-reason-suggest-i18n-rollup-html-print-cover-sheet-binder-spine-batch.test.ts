import { describe, it, expect } from 'vitest';
import {
  renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatch,
  computeSpineBatchCapacity,
  summarizeSpineBatchLayout,
} from '../src/refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch';
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

function ctx(o: Partial<Omit<RefusalReasonSuggestInput, 'dose'>> = {}): Omit<RefusalReasonSuggestInput, 'dose'> {
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

function entries(names: string[]) {
  const rollup = rollupWithNDoses(3);
  return names.map((n) => ({ patientName: n, result: rollup }));
}

describe('renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatch — single sheet', () => {
  it('renders all spines on one sheet when count fits the auto-grid', () => {
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatch(
      entries(['Alice', 'Bob', 'Carol']),
    );
    expect(out.sheets).toHaveLength(1);
    expect(out.totalSpines).toBe(3);
  });

  it('produces 30 spines per US-letter sheet on the default 3.5x1.5cm spine', () => {
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatch(
      entries(['x']),
    );
    expect(out.spinesPerSheet).toBeGreaterThanOrEqual(20);
    // We expect roughly 5 columns x 12-13 rows on US letter with 3.5x1.5cm spines.
    expect(out.columnsPerSheet).toBeGreaterThanOrEqual(4);
    expect(out.columnsPerSheet).toBeLessThanOrEqual(6);
    expect(out.rowsPerSheet).toBeGreaterThanOrEqual(10);
  });

  it('emits a sheet HTML fragment with patient names in it', () => {
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatch(
      entries(['Alice', 'Bob']),
    );
    expect(out.sheets[0]?.html).toContain('Alice');
    expect(out.sheets[0]?.html).toContain('Bob');
  });

  it('uses grid CSS for the sheet container', () => {
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatch(
      entries(['Alice']),
    );
    expect(out.sheets[0]?.html).toContain('display:grid');
    expect(out.sheets[0]?.html).toContain('grid-template-columns');
  });

  it('combines all sheets into the result.html', () => {
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatch(
      entries(['Alice']),
    );
    expect(out.html).toBe(out.sheets[0]?.html);
  });
});

describe('renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatch — pagination', () => {
  it('paginates onto multiple sheets when spine count exceeds sheet capacity', () => {
    const names = Array.from({ length: 100 }, (_, i) => `Patient ${i}`);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatch(
      entries(names),
    );
    expect(out.sheets.length).toBeGreaterThan(1);
    expect(out.totalSpines).toBe(100);
  });

  it('every sheet after the first has page-break-before:always', () => {
    const names = Array.from({ length: 100 }, (_, i) => `Patient ${i}`);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatch(
      entries(names),
    );
    expect(out.sheets[0]?.html).not.toContain('page-break-before:always');
    for (let i = 1; i < out.sheets.length; i++) {
      expect(out.sheets[i]?.html).toContain('page-break-before:always');
    }
  });

  it('sheet numbers are 1-based + totalSheets is set', () => {
    const names = Array.from({ length: 100 }, (_, i) => `Patient ${i}`);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatch(
      entries(names),
    );
    expect(out.sheets[0]?.sheetNumber).toBe(1);
    expect(out.sheets[0]?.totalSheets).toBe(out.sheets.length);
  });

  it('last sheet may have fewer spines than spinesPerSheet', () => {
    const names = Array.from({ length: 7 }, (_, i) => `Patient ${i}`);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatch(
      entries(names),
      { forceColumns: 2, forceRows: 3 }, // 6 per sheet -> 2 sheets, last has 1
    );
    expect(out.sheets[0]?.spineCount).toBe(6);
    expect(out.sheets[1]?.spineCount).toBe(1);
  });

  it('individual spine page-break-before is suppressed (sheet wraps it)', () => {
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatch(
      entries(['Alice']),
    );
    // The spine itself should NOT carry page-break-before because the
    // sheet wraps it.
    expect(out.sheets[0]?.html.indexOf('page-break-before:always;width:3.5cm')).toBe(-1);
  });
});

describe('renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatch — forced grid', () => {
  it('honours forceColumns', () => {
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatch(
      entries(['A']),
      { forceColumns: 3 },
    );
    expect(out.columnsPerSheet).toBe(3);
    expect(out.sheets[0]?.html).toContain('grid-template-columns:repeat(3,');
  });

  it('honours forceRows', () => {
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatch(
      entries(['A']),
      { forceRows: 4 },
    );
    expect(out.rowsPerSheet).toBe(4);
    expect(out.sheets[0]?.html).toContain('grid-template-rows:repeat(4,');
  });

  it('throws when forced columns do not fit printable width', () => {
    expect(() =>
      renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatch(
        entries(['A']),
        { forceColumns: 100 },
      ),
    ).toThrow();
  });

  it('throws when forced rows do not fit printable height', () => {
    expect(() =>
      renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatch(
        entries(['A']),
        { forceRows: 100 },
      ),
    ).toThrow();
  });
});

describe('renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatch — A4 sheet', () => {
  it('uses A4 dimensions when sheetPreset="a4"', () => {
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatch(
      entries(['A']),
      { sheetPreset: 'a4' },
    );
    expect(out.sheetWidthCm).toBe(21.0);
    expect(out.sheetHeightCm).toBe(29.7);
  });

  it('uses US-letter dimensions by default', () => {
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatch(
      entries(['A']),
    );
    expect(out.sheetWidthCm).toBeCloseTo(21.59, 2);
    expect(out.sheetHeightCm).toBeCloseTo(27.94, 2);
  });

  it('honours a custom sheet size', () => {
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatch(
      entries(['A']),
      { sheetPreset: 'custom', customSheetWidthCm: 30, customSheetHeightCm: 40 },
    );
    expect(out.sheetWidthCm).toBe(30);
    expect(out.sheetHeightCm).toBe(40);
  });

  it('throws on missing custom sheet dimensions', () => {
    expect(() =>
      renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatch(
        entries(['A']),
        { sheetPreset: 'custom' },
      ),
    ).toThrow();
  });
});

describe('renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatch — empty input', () => {
  it('produces one empty sheet for an empty entries array', () => {
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatch([]);
    expect(out.sheets).toHaveLength(1);
    expect(out.totalSpines).toBe(0);
    expect(out.sheets[0]?.spineCount).toBe(0);
  });
});

describe('renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatch — entry options', () => {
  it('forwards dateLabel and panelLabel into each spine', () => {
    const rollup = rollupWithNDoses(3);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatch(
      [{ patientName: 'Alice', dateLabel: '2026-06-22', panelLabel: 'Q3 Review', result: rollup }],
    );
    expect(out.sheets[0]?.html).toContain('Alice');
    expect(out.sheets[0]?.html).toContain('2026-06-22');
    expect(out.sheets[0]?.html).toContain('Q3 Review'); // raw text; CSS uppercases for display
    expect(out.sheets[0]?.html).toContain('text-transform:uppercase');
  });

  it('honours spine sizePreset across all entries', () => {
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatch(
      entries(['A', 'B']),
      { sizePreset: '5x2cm' },
    );
    expect(out.sheets[0]?.html).toContain('width:5cm');
    expect(out.sheets[0]?.html).toContain('height:2cm');
  });
});

describe('computeSpineBatchCapacity', () => {
  it('reports the auto-computed columns + rows + total for a default sheet', () => {
    const cap = computeSpineBatchCapacity({});
    expect(cap.columnsPerSheet).toBeGreaterThanOrEqual(4);
    expect(cap.rowsPerSheet).toBeGreaterThanOrEqual(10);
    expect(cap.spinesPerSheet).toBe(cap.columnsPerSheet * cap.rowsPerSheet);
  });

  it('honours forceColumns + forceRows', () => {
    const cap = computeSpineBatchCapacity({ forceColumns: 4, forceRows: 8 });
    expect(cap.columnsPerSheet).toBe(4);
    expect(cap.rowsPerSheet).toBe(8);
    expect(cap.spinesPerSheet).toBe(32);
  });

  it('returns 1x1 minimum even with tiny printable area', () => {
    const cap = computeSpineBatchCapacity({
      sheetPreset: 'custom',
      customSheetWidthCm: 2.0,
      customSheetHeightCm: 2.0,
      sheetMarginCm: 0.1,
    });
    expect(cap.columnsPerSheet).toBeGreaterThanOrEqual(1);
    expect(cap.rowsPerSheet).toBeGreaterThanOrEqual(1);
  });
});

describe('summarizeSpineBatchLayout', () => {
  it('reports total spines + sheet count + grid', () => {
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatch(
      entries(['A', 'B', 'C']),
    );
    const line = summarizeSpineBatchLayout(out);
    expect(line).toContain('3 spines');
    expect(line).toContain('1 sheet');
  });

  it('uses singular "spine" for a one-spine batch', () => {
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatch(
      entries(['A']),
    );
    const line = summarizeSpineBatchLayout(out);
    expect(line).toContain('1 spine');
    expect(line).not.toContain('1 spines');
  });

  it('uses plural "sheets" when paginated', () => {
    const names = Array.from({ length: 100 }, (_, i) => `Patient ${i}`);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpineBatch(
      entries(names),
    );
    const line = summarizeSpineBatchLayout(out);
    expect(line).toContain('sheets');
  });
});
