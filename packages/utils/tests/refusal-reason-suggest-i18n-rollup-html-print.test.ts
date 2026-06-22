import { describe, it, expect } from 'vitest';
import {
  renderRefusalReasonI18nRollupHtmlPrint,
  refusalReasonI18nRollupPrintPageCount,
} from '../src/refusal-reason-suggest-i18n-rollup-html-print';
import {
  rollupLocalisedRefusalSuggestions,
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
    ...(o.sleeping !== undefined ? { sleeping: o.sleeping } : {}),
    ...(o.npoWindows !== undefined ? { npoWindows: o.npoWindows } : {}),
    ...(o.prescriberPauses !== undefined ? { prescriberPauses: o.prescriberPauses } : {}),
    ...(o.recentRefusals !== undefined ? { recentRefusals: o.recentRefusals } : {}),
  };
}

const EN_BUNDLE: RefusalReasonI18nBundle = {
  locale: 'en-US',
  strings: REFUSAL_REASON_I18N_EN,
};

function rollupWithNDoses(n: number) {
  const doses = Array.from({ length: n }, (_, i) =>
    dose(`d-${i}`, { dueAt: '2026-06-21T08:00:00.000' }),
  );
  return rollupLocalisedRefusalSuggestions(
    doses,
    ctx({ npoWindows: [{ startDate: '2026-06-21', endDate: '2026-06-21' }] }),
    EN_BUNDLE,
  );
}

describe('renderRefusalReasonI18nRollupHtmlPrint — pagination', () => {
  it('emits one page when row count <= rowsPerPage', () => {
    const rollup = rollupWithNDoses(5);
    const out = renderRefusalReasonI18nRollupHtmlPrint(rollup, { rowsPerPage: 10 });
    expect(out.pageCount).toBe(1);
    expect(out.shownSuggestionCount).toBe(5);
  });

  it('paginates when row count exceeds rowsPerPage', () => {
    const rollup = rollupWithNDoses(45);
    const out = renderRefusalReasonI18nRollupHtmlPrint(rollup, { rowsPerPage: 20 });
    // 45 rows / 20 per page = 3 pages
    expect(out.pageCount).toBe(3);
    expect(out.shownSuggestionCount).toBe(45);
  });

  it('renders default rowsPerPage = 20', () => {
    const rollup = rollupWithNDoses(40);
    const out = renderRefusalReasonI18nRollupHtmlPrint(rollup);
    expect(out.pageCount).toBe(2);
  });

  it('handles an exactly-page-sized boundary', () => {
    const rollup = rollupWithNDoses(20);
    const out = renderRefusalReasonI18nRollupHtmlPrint(rollup, { rowsPerPage: 20 });
    expect(out.pageCount).toBe(1);
  });

  it('renders a single page with empty-state message when no suggestions exist', () => {
    const doses = [dose('d-no-trigger', { dueAt: '2026-06-22T08:00:00.000' })];
    const rollup = rollupLocalisedRefusalSuggestions(doses, ctx(), EN_BUNDLE);
    const out = renderRefusalReasonI18nRollupHtmlPrint(rollup);
    expect(out.pageCount).toBe(1);
    expect(out.html).toContain('No suggestions to review.');
    expect(out.shownSuggestionCount).toBe(0);
  });
});

describe('renderRefusalReasonI18nRollupHtmlPrint — header content', () => {
  it('uses a generic title when patientName is not provided', () => {
    const rollup = rollupWithNDoses(3);
    const out = renderRefusalReasonI18nRollupHtmlPrint(rollup);
    expect(out.html).toContain('Refusal-reason adjudication');
  });

  it('prepends patient name when provided', () => {
    const rollup = rollupWithNDoses(3);
    const out = renderRefusalReasonI18nRollupHtmlPrint(rollup, { patientName: 'Jane Doe' });
    expect(out.html).toContain('Jane Doe — refusal-reason adjudication');
  });

  it('includes dateLabel when provided', () => {
    const rollup = rollupWithNDoses(3);
    const out = renderRefusalReasonI18nRollupHtmlPrint(rollup, {
      dateLabel: 'Generated 2026-06-22',
    });
    expect(out.html).toContain('Generated 2026-06-22');
  });

  it('repeats the header on each page', () => {
    const rollup = rollupWithNDoses(50);
    const out = renderRefusalReasonI18nRollupHtmlPrint(rollup, { rowsPerPage: 10 });
    // 50/10 = 5 pages; each page has "Page N of 5"
    expect(out.html).toContain('Page 1 of 5');
    expect(out.html).toContain('Page 3 of 5');
    expect(out.html).toContain('Page 5 of 5');
  });
});

describe('renderRefusalReasonI18nRollupHtmlPrint — content + safety', () => {
  it('omits accept / reject form controls (no interactive elements on paper)', () => {
    const rollup = rollupWithNDoses(2);
    const out = renderRefusalReasonI18nRollupHtmlPrint(rollup);
    expect(out.html).not.toContain('type="checkbox"');
    expect(out.html).not.toContain('<button');
    // Paper signoff bubble IS expected.
    expect(out.html).toContain('[ ] Accept');
    expect(out.html).toContain('[ ] Reject');
    expect(out.html).toContain('Signed:');
  });

  it('shows the source label in brackets next to the dose id', () => {
    const rollup = rollupWithNDoses(1);
    const out = renderRefusalReasonI18nRollupHtmlPrint(rollup);
    expect(out.html).toContain('[NPO WINDOW]');
  });

  it('uses page-break-after on non-last pages and page-break-inside on rows', () => {
    const rollup = rollupWithNDoses(30);
    const out = renderRefusalReasonI18nRollupHtmlPrint(rollup, { rowsPerPage: 10 });
    // Page 1 and 2 should have page-break-after; page 3 should not.
    const pageBreakAfterCount = (out.html.match(/page-break-after:always/g) ?? []).length;
    expect(pageBreakAfterCount).toBe(2);
    // page-break-inside:avoid should appear on every row (so a single
    // row doesn't span two pages mid-paragraph).
    expect(out.html).toContain('page-break-inside:avoid');
  });

  it('html-escapes patient name', () => {
    const rollup = rollupWithNDoses(1);
    const out = renderRefusalReasonI18nRollupHtmlPrint(rollup, {
      patientName: '<script>alert(1)</script>',
    });
    expect(out.html).not.toContain('<script>alert(1)</script>');
    expect(out.html).toContain('&lt;script&gt;');
  });

  it('html-escapes dateLabel', () => {
    const rollup = rollupWithNDoses(1);
    const out = renderRefusalReasonI18nRollupHtmlPrint(rollup, {
      dateLabel: 'Generated <b>2026-06-22</b>',
    });
    expect(out.html).not.toContain('<b>2026-06-22</b>');
    expect(out.html).toContain('&lt;b&gt;');
  });
});

describe('renderRefusalReasonI18nRollupHtmlPrint — coverage strip', () => {
  it('includes coverage strip on page 1 by default', () => {
    const rollup = rollupWithNDoses(3);
    const out = renderRefusalReasonI18nRollupHtmlPrint(rollup);
    expect(out.html).toContain('3/3 suggested');
    expect(out.html).toContain('Top source: NPO WINDOW');
  });

  it('omits coverage strip when includeCoverageStrip=false', () => {
    const rollup = rollupWithNDoses(3);
    const out = renderRefusalReasonI18nRollupHtmlPrint(rollup, {
      includeCoverageStrip: false,
    });
    expect(out.html).not.toContain('Top source');
  });

  it('coverage strip appears on page 1 only, not subsequent pages', () => {
    const rollup = rollupWithNDoses(40);
    const out = renderRefusalReasonI18nRollupHtmlPrint(rollup, { rowsPerPage: 10 });
    // 40 rows / 10 per page = 4 pages.
    expect(out.pageCount).toBe(4);
    // "Top source" string should appear at most once (on page 1).
    const matches = (out.html.match(/Top source/g) ?? []).length;
    expect(matches).toBe(1);
  });
});

describe('renderRefusalReasonI18nRollupHtmlPrint — footer', () => {
  it('includes page footer by default', () => {
    const rollup = rollupWithNDoses(3);
    const out = renderRefusalReasonI18nRollupHtmlPrint(rollup);
    expect(out.html).toContain('Med-Tracker print preview');
  });

  it('omits page footer when includePageFooter=false', () => {
    const rollup = rollupWithNDoses(3);
    const out = renderRefusalReasonI18nRollupHtmlPrint(rollup, { includePageFooter: false });
    expect(out.html).not.toContain('Med-Tracker print preview');
  });
});

describe('renderRefusalReasonI18nRollupHtmlPrint — drop unsuggested rows', () => {
  it('drops doses with no suggestion from the printed pages', () => {
    const doses = [
      dose('d-trigger', { dueAt: '2026-06-21T08:00:00.000' }),
      dose('d-no-trigger', { dueAt: '2026-06-22T08:00:00.000' }),
    ];
    const rollup = rollupLocalisedRefusalSuggestions(
      doses,
      ctx({ npoWindows: [{ startDate: '2026-06-21', endDate: '2026-06-21' }] }),
      EN_BUNDLE,
    );
    const out = renderRefusalReasonI18nRollupHtmlPrint(rollup);
    expect(out.html).toContain('d-trigger');
    expect(out.html).not.toContain('d-no-trigger');
    expect(out.shownSuggestionCount).toBe(1);
    expect(out.droppedSuggestionCount).toBe(1);
  });
});

describe('refusalReasonI18nRollupPrintPageCount', () => {
  it('returns 1 for empty result', () => {
    const doses = [dose('d-no-trigger', { dueAt: '2026-06-22T08:00:00.000' })];
    const rollup = rollupLocalisedRefusalSuggestions(doses, ctx(), EN_BUNDLE);
    expect(refusalReasonI18nRollupPrintPageCount(rollup)).toBe(1);
  });

  it('matches the page count returned by the renderer', () => {
    const rollup = rollupWithNDoses(33);
    const expected = renderRefusalReasonI18nRollupHtmlPrint(rollup, { rowsPerPage: 10 }).pageCount;
    const got = refusalReasonI18nRollupPrintPageCount(rollup, { rowsPerPage: 10 });
    expect(got).toBe(expected);
  });
});

describe('renderRefusalReasonI18nRollupHtmlPrint — determinism', () => {
  it('produces byte-identical output across invocations', () => {
    const rollup = rollupWithNDoses(7);
    const a = renderRefusalReasonI18nRollupHtmlPrint(rollup);
    const b = renderRefusalReasonI18nRollupHtmlPrint(rollup);
    expect(a.html).toBe(b.html);
    expect(a.pageCount).toBe(b.pageCount);
  });
});
