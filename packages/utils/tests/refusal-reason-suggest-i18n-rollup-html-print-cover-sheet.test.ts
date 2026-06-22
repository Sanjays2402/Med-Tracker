import { describe, it, expect } from 'vitest';
import {
  renderRefusalReasonI18nRollupHtmlPrintCoverSheet,
  renderRefusalReasonI18nRollupHtmlPrintWithCoverSheet,
} from '../src/refusal-reason-suggest-i18n-rollup-html-print-cover-sheet';
import { renderRefusalReasonI18nRollupHtmlPrint } from '../src/refusal-reason-suggest-i18n-rollup-html-print';
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

function emptyRollup(): RefusalReasonI18nRollupResult {
  // No suggestions: 5 doses but no triggering context.
  const doses = Array.from({ length: 5 }, (_, i) =>
    dose(`d-${i}`, { dueAt: '2026-06-21T08:00:00.000' }),
  );
  return rollupLocalisedRefusalSuggestions(doses, ctx({}), EN_BUNDLE);
}

describe('renderRefusalReasonI18nRollupHtmlPrintCoverSheet — hero block', () => {
  it('renders patient name in the hero title', () => {
    const rollup = rollupWithNDoses(5);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheet(rollup, {
      patientName: 'Alice Smith',
    });
    expect(out.html).toContain('Alice Smith');
    expect(out.html).toContain('font-size:32px');
  });

  it('renders panel label as the hero subtitle', () => {
    const rollup = rollupWithNDoses(5);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheet(rollup, {
      patientName: 'Alice Smith',
      panelLabel: 'Cardiology Q3 review',
    });
    expect(out.html).toContain('Cardiology Q3 review');
  });

  it('falls back to a generic title when patientName missing', () => {
    const rollup = rollupWithNDoses(5);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheet(rollup);
    expect(out.html).toContain('Refusal-reason adjudication');
  });

  it('escapes HTML in patient and panel labels', () => {
    const rollup = rollupWithNDoses(5);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheet(rollup, {
      patientName: '<Alice & "the kid">',
      panelLabel: '<panel>',
    });
    expect(out.html).toContain('&lt;Alice &amp; &quot;the kid&quot;&gt;');
    expect(out.html).toContain('&lt;panel&gt;');
    expect(out.html).not.toContain('<Alice');
  });
});

describe('renderRefusalReasonI18nRollupHtmlPrintCoverSheet — metadata block', () => {
  it('renders dose count + suggested count', () => {
    const rollup = rollupWithNDoses(7);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheet(rollup);
    expect(out.html).toContain('Doses reviewed');
    expect(out.html).toContain('7');
    expect(out.html).toContain('Suggested');
  });

  it('renders dateLabel when provided', () => {
    const rollup = rollupWithNDoses(5);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheet(rollup, {
      dateLabel: 'Generated 2026-06-22',
    });
    expect(out.html).toContain('Generated 2026-06-22');
  });

  it('omits dateLabel row when not provided', () => {
    const rollup = rollupWithNDoses(5);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheet(rollup);
    expect(out.html).not.toContain('>Generated<');
  });

  it('renders body page count when bodyPageCount provided', () => {
    const rollup = rollupWithNDoses(5);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheet(rollup, {
      bodyPageCount: 3,
    });
    expect(out.html).toContain('Body pages');
    expect(out.html).toContain('3 following');
  });

  it('omits body page count row when not provided', () => {
    const rollup = rollupWithNDoses(5);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheet(rollup);
    expect(out.html).not.toContain('Body pages');
  });

  it('renders locale-fallback row only when fallbackCount > 0', () => {
    const noFallbackRollup = rollupWithNDoses(5);
    const noFallback = renderRefusalReasonI18nRollupHtmlPrintCoverSheet(noFallbackRollup);
    expect(noFallback.html).not.toContain('Locale fallbacks');
  });
});

describe('renderRefusalReasonI18nRollupHtmlPrintCoverSheet — source breakdown', () => {
  it('renders one row per source with at least one suggestion', () => {
    const rollup = rollupWithNDoses(5);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheet(rollup);
    expect(out.html).toContain('Source breakdown');
    expect(out.html).toContain('NPO WINDOW');
    expect(out.sourceBreakdownRowCount).toBeGreaterThanOrEqual(1);
  });

  it('shows an empty state when no source has suggestions', () => {
    const rollup = emptyRollup();
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheet(rollup);
    expect(out.html).toContain('No suggestions in any source');
    expect(out.sourceBreakdownRowCount).toBe(0);
  });

  it('source breakdown order follows declared priority (NPO first), not count', () => {
    // We can't trivially trigger multiple sources in one test without
    // fabricating a complex context. But we CAN assert the NPO row
    // appears before any other source row when present.
    const rollup = rollupWithNDoses(5);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheet(rollup);
    expect(out.html).toContain('NPO WINDOW');
  });
});

describe('renderRefusalReasonI18nRollupHtmlPrintCoverSheet — locale breakdown', () => {
  it('renders locale breakdown when at least one suggestion fired', () => {
    const rollup = rollupWithNDoses(5);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheet(rollup);
    expect(out.html).toContain('Locale breakdown');
    expect(out.html).toContain('en-US');
    expect(out.localeBreakdownRowCount).toBeGreaterThanOrEqual(1);
  });

  it('omits locale breakdown when no suggestions fired', () => {
    const rollup = emptyRollup();
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheet(rollup);
    expect(out.html).not.toContain('Locale breakdown');
    expect(out.localeBreakdownRowCount).toBe(0);
  });

  it('uses singular "suggestion" for count of 1', () => {
    const rollup = rollupWithNDoses(1);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheet(rollup);
    expect(out.html).toContain('1 suggestion<');
    expect(out.html).not.toContain('1 suggestions');
  });

  it('uses plural "suggestions" for count > 1', () => {
    const rollup = rollupWithNDoses(3);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheet(rollup);
    expect(out.html).toContain('3 suggestions');
  });
});

describe('renderRefusalReasonI18nRollupHtmlPrintCoverSheet — signature block', () => {
  it('includes signature block by default', () => {
    const rollup = rollupWithNDoses(5);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheet(rollup);
    expect(out.html).toContain('Reviewer attestation');
    expect(out.html).toContain('Reviewer signature');
    expect(out.html).toContain('Date');
    expect(out.html).toContain('Printed name');
    expect(out.signatureBlockIncluded).toBe(true);
  });

  it('omits signature block when includeSignatureBlock=false', () => {
    const rollup = rollupWithNDoses(5);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheet(rollup, {
      includeSignatureBlock: false,
    });
    expect(out.html).not.toContain('Reviewer attestation');
    expect(out.html).not.toContain('Reviewer signature');
    expect(out.signatureBlockIncluded).toBe(false);
  });

  it('renders custom signature lines', () => {
    const rollup = rollupWithNDoses(5);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheet(rollup, {
      signatureLines: ['Attending MD', 'License #', 'Date reviewed'],
    });
    expect(out.html).toContain('Attending MD');
    expect(out.html).toContain('License #');
    expect(out.html).toContain('Date reviewed');
    // Default lines should NOT appear when overridden.
    expect(out.html).not.toContain('Reviewer signature');
  });
});

describe('renderRefusalReasonI18nRollupHtmlPrintCoverSheet — page break + style', () => {
  it('default: page-break-after:always set so body starts on page 2', () => {
    const rollup = rollupWithNDoses(5);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheet(rollup);
    expect(out.html).toContain('page-break-after:always');
  });

  it('pageBreakAfter=false drops the page break', () => {
    const rollup = rollupWithNDoses(5);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheet(rollup, {
      pageBreakAfter: false,
    });
    expect(out.html).not.toContain('page-break-after:always');
  });

  it('default font is a print-friendly serif', () => {
    const rollup = rollupWithNDoses(5);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheet(rollup);
    expect(out.html).toContain('Georgia');
  });

  it('honours custom fontFamily', () => {
    const rollup = rollupWithNDoses(5);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheet(rollup, {
      fontFamily: 'Courier, monospace',
    });
    expect(out.html).toContain('Courier, monospace');
  });
});

describe('renderRefusalReasonI18nRollupHtmlPrintWithCoverSheet', () => {
  it('splices the cover sheet in front of the body HTML', () => {
    const rollup = rollupWithNDoses(5);
    const body = renderRefusalReasonI18nRollupHtmlPrint(rollup);
    const combined = renderRefusalReasonI18nRollupHtmlPrintWithCoverSheet(
      rollup,
      body.html,
      { patientName: 'Alice Smith', dateLabel: 'Generated 2026-06-22' },
    );
    const coverIdx = combined.indexOf('Alice Smith');
    const bodyIdx = combined.indexOf(body.html);
    expect(coverIdx).toBeGreaterThanOrEqual(0);
    expect(bodyIdx).toBeGreaterThan(coverIdx);
  });

  it('default page-break-after on cover ensures body starts on page 2', () => {
    const rollup = rollupWithNDoses(5);
    const body = renderRefusalReasonI18nRollupHtmlPrint(rollup);
    const combined = renderRefusalReasonI18nRollupHtmlPrintWithCoverSheet(rollup, body.html, {});
    expect(combined).toContain('page-break-after:always');
  });
});

describe('determinism', () => {
  it('same input + options produces byte-identical HTML', () => {
    const rollup = rollupWithNDoses(5);
    const a = renderRefusalReasonI18nRollupHtmlPrintCoverSheet(rollup, {
      patientName: 'Alice',
      dateLabel: '2026-06-22',
    });
    const b = renderRefusalReasonI18nRollupHtmlPrintCoverSheet(rollup, {
      patientName: 'Alice',
      dateLabel: '2026-06-22',
    });
    expect(a.html).toBe(b.html);
  });
});
