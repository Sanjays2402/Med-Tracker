import { describe, it, expect } from 'vitest';
import {
  renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine,
  renderRefusalReasonI18nRollupHtmlPrintCoverSheetWithBinderSpine,
} from '../src/refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine';
import { renderRefusalReasonI18nRollupHtmlPrintCoverSheet } from '../src/refusal-reason-suggest-i18n-rollup-html-print-cover-sheet';
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

describe('renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine — size presets', () => {
  it("default size preset is '3.5x1.5cm'", () => {
    const rollup = rollupWithNDoses(5);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine(rollup, {
      patientName: 'Alice',
    });
    expect(out.widthCm).toBe(3.5);
    expect(out.heightCm).toBe(1.5);
    expect(out.html).toContain('width:3.5cm');
    expect(out.html).toContain('height:1.5cm');
  });

  it("'5x2cm' preset emits a 5x2 spine", () => {
    const rollup = rollupWithNDoses(5);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine(rollup, {
      patientName: 'Alice',
      sizePreset: '5x2cm',
    });
    expect(out.widthCm).toBe(5);
    expect(out.heightCm).toBe(2);
  });

  it("'2.5x1cm' preset emits a 2.5x1 spine", () => {
    const rollup = rollupWithNDoses(5);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine(rollup, {
      patientName: 'Alice',
      sizePreset: '2.5x1cm',
    });
    expect(out.widthCm).toBe(2.5);
    expect(out.heightCm).toBe(1);
  });

  it("'custom' preset honours customWidthCm + customHeightCm", () => {
    const rollup = rollupWithNDoses(5);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine(rollup, {
      patientName: 'Alice',
      sizePreset: 'custom',
      customWidthCm: 4,
      customHeightCm: 1.8,
    });
    expect(out.widthCm).toBe(4);
    expect(out.heightCm).toBe(1.8);
  });

  it("'custom' throws when customWidthCm / customHeightCm are missing or non-positive", () => {
    const rollup = rollupWithNDoses(5);
    expect(() =>
      renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine(rollup, {
        patientName: 'Alice',
        sizePreset: 'custom',
      }),
    ).toThrow();
    expect(() =>
      renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine(rollup, {
        patientName: 'Alice',
        sizePreset: 'custom',
        customWidthCm: 0,
        customHeightCm: 2,
      }),
    ).toThrow();
  });
});

describe('renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine — rotation', () => {
  it('default rotation is -90 (text reads bottom-to-top)', () => {
    const rollup = rollupWithNDoses(5);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine(rollup, {
      patientName: 'Alice',
    });
    expect(out.rotationDegrees).toBe(-90);
    expect(out.html).toContain('rotate(-90deg)');
  });

  it('supports rotationDegrees=90 (text reads top-to-bottom)', () => {
    const rollup = rollupWithNDoses(5);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine(rollup, {
      patientName: 'Alice',
      rotationDegrees: 90,
    });
    expect(out.rotationDegrees).toBe(90);
    expect(out.html).toContain('rotate(90deg)');
  });

  it('supports rotationDegrees=0 (no rotation; emits no transform)', () => {
    const rollup = rollupWithNDoses(5);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine(rollup, {
      patientName: 'Alice',
      rotationDegrees: 0,
    });
    expect(out.rotationDegrees).toBe(0);
    expect(out.html).not.toContain('rotate(0deg)');
    expect(out.html).not.toContain('rotate(-');
  });
});

describe('renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine — content', () => {
  it('renders patientName as the primary line', () => {
    const rollup = rollupWithNDoses(5);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine(rollup, {
      patientName: 'Alice Smith',
    });
    expect(out.html).toContain('Alice Smith');
  });

  it('falls back to a generic label when patientName missing', () => {
    const rollup = rollupWithNDoses(5);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine(rollup);
    expect(out.html).toContain('Refusal-reason roster');
  });

  it('includes dateLabel when present', () => {
    const rollup = rollupWithNDoses(5);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine(rollup, {
      patientName: 'Alice',
      dateLabel: '2026-06-22',
    });
    expect(out.html).toContain('2026-06-22');
  });

  it('omits dateLabel section when not provided', () => {
    const rollup = rollupWithNDoses(5);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine(rollup, {
      patientName: 'Alice',
    });
    // No date string at all when not passed.
    expect(out.html).not.toContain('2026');
  });

  it('includes panelLabel as a secondary uppercase line', () => {
    const rollup = rollupWithNDoses(5);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine(rollup, {
      patientName: 'Alice',
      panelLabel: 'Q3 Review',
    });
    expect(out.html).toContain('Q3 Review');
    expect(out.html).toContain('text-transform:uppercase');
  });

  it('omits panelLabel section when not provided', () => {
    const rollup = rollupWithNDoses(5);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine(rollup, {
      patientName: 'Alice',
    });
    expect(out.html).not.toContain('text-transform:uppercase');
  });

  it('includePanelSize=true adds the dose-count line', () => {
    const rollup = rollupWithNDoses(5);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine(rollup, {
      patientName: 'Alice',
      includePanelSize: true,
    });
    // 5 doses, only 5 suggestions (all triggered by npo-window).
    expect(out.html).toContain(`${rollup.coverage.suggestedCount} dose`);
  });

  it('singular "dose" when suggestedCount===1', () => {
    const rollup = rollupWithNDoses(1);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine(rollup, {
      patientName: 'Alice',
      includePanelSize: true,
    });
    expect(out.html).toContain('1 dose');
    expect(out.html).not.toContain('1 doses');
  });

  it('plural "doses" when suggestedCount > 1', () => {
    const rollup = rollupWithNDoses(3);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine(rollup, {
      patientName: 'Alice',
      includePanelSize: true,
    });
    expect(out.html).toContain('3 doses');
  });

  it('escapes HTML in patientName / panelLabel / dateLabel', () => {
    const rollup = rollupWithNDoses(5);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine(rollup, {
      patientName: '<Alice & "child">',
      panelLabel: '<panel>',
      dateLabel: '<date>',
    });
    expect(out.html).toContain('&lt;Alice &amp; &quot;child&quot;&gt;');
    expect(out.html).toContain('&lt;panel&gt;');
    expect(out.html).toContain('&lt;date&gt;');
    expect(out.html).not.toContain('<Alice');
    expect(out.html).not.toContain('<panel>');
  });
});

describe('renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine — border + page break', () => {
  it('includes a 1px black border by default', () => {
    const rollup = rollupWithNDoses(5);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine(rollup, {
      patientName: 'Alice',
    });
    expect(out.borderIncluded).toBe(true);
    expect(out.html).toContain('border:1px solid #000');
  });

  it('omits the border when includeBorder=false', () => {
    const rollup = rollupWithNDoses(5);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine(rollup, {
      patientName: 'Alice',
      includeBorder: false,
    });
    expect(out.borderIncluded).toBe(false);
    expect(out.html).not.toContain('border:1px solid #000');
  });

  it('emits page-break-before:always by default', () => {
    const rollup = rollupWithNDoses(5);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine(rollup, {
      patientName: 'Alice',
    });
    expect(out.html).toContain('page-break-before:always');
  });

  it('omits page-break-before when pageBreakBefore=false', () => {
    const rollup = rollupWithNDoses(5);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine(rollup, {
      patientName: 'Alice',
      pageBreakBefore: false,
    });
    expect(out.html).not.toContain('page-break-before:always');
  });
});

describe('renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine — typography', () => {
  it('uses the print-friendly serif by default', () => {
    const rollup = rollupWithNDoses(5);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine(rollup, {
      patientName: 'Alice',
    });
    expect(out.html).toContain('Georgia');
  });

  it('respects a custom fontFamily', () => {
    const rollup = rollupWithNDoses(5);
    const out = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine(rollup, {
      patientName: 'Alice',
      fontFamily: 'Helvetica',
    });
    expect(out.html).toContain('Helvetica');
    expect(out.html).not.toContain('Georgia');
  });
});

describe('renderRefusalReasonI18nRollupHtmlPrintCoverSheetWithBinderSpine', () => {
  it('appends the spine HTML after the cover sheet HTML', () => {
    const rollup = rollupWithNDoses(5);
    const cover = renderRefusalReasonI18nRollupHtmlPrintCoverSheet(rollup, {
      patientName: 'Alice',
    });
    const combined = renderRefusalReasonI18nRollupHtmlPrintCoverSheetWithBinderSpine(
      rollup,
      cover.html,
      { patientName: 'Alice', dateLabel: '2026-06-22' },
    );
    expect(combined.indexOf(cover.html)).toBe(0);
    expect(combined).toContain('2026-06-22'); // from spine
  });
});

describe('determinism', () => {
  it('produces byte-identical HTML on repeat runs with the same inputs', () => {
    const rollup = rollupWithNDoses(5);
    const a = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine(rollup, {
      patientName: 'Alice',
      dateLabel: '2026-06-22',
    });
    const z = renderRefusalReasonI18nRollupHtmlPrintCoverSheetBinderSpine(rollup, {
      patientName: 'Alice',
      dateLabel: '2026-06-22',
    });
    expect(a.html).toBe(z.html);
  });
});
