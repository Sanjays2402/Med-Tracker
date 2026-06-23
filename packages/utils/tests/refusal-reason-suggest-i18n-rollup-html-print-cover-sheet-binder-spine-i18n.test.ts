import { describe, it, expect } from 'vitest';
import {
  renderLocalisedRefusalReasonSpine,
  renderLocalisedRefusalReasonSpineByLocale,
  pickBuiltInSpineBundle,
  validateSpineI18nBundle,
  summarizeLocalisedSpineResult,
  REFUSAL_REASON_SPINE_I18N_EN,
  REFUSAL_REASON_SPINE_I18N_ES_419,
  REFUSAL_REASON_SPINE_I18N_FR_FR,
  REFUSAL_REASON_SPINE_I18N_DE_DE,
  REFUSAL_REASON_SPINE_I18N_HI_IN,
  type RefusalReasonSpineI18nBundle,
} from '../src/refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-i18n';
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

const EN_REFUSAL_BUNDLE: RefusalReasonI18nBundle = {
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
    EN_REFUSAL_BUNDLE,
  );
}

describe('renderLocalisedRefusalReasonSpine — default English fallback', () => {
  it('uses English when no bundle is provided', () => {
    const rollup = rollupWithNDoses(3);
    const out = renderLocalisedRefusalReasonSpine(rollup, {
      patientName: 'Alice',
      includePanelSize: true,
    });
    expect(out.locale).toBe('en-US');
    expect(out.html).toContain('3 doses');
  });

  it('singularises to "1 dose" in English when panel size is 1', () => {
    const rollup = rollupWithNDoses(1);
    const out = renderLocalisedRefusalReasonSpine(rollup, {
      patientName: 'Bob',
      includePanelSize: true,
    });
    expect(out.html).toContain('1 dose');
    expect(out.html).not.toContain('1 doses');
  });

  it('does NOT emit the doses label when includePanelSize=false', () => {
    const rollup = rollupWithNDoses(5);
    const out = renderLocalisedRefusalReasonSpine(rollup, {
      patientName: 'Carol',
      includePanelSize: false,
    });
    expect(out.html).not.toContain('5 doses');
  });
});

describe('renderLocalisedRefusalReasonSpine — Spanish (es-419)', () => {
  const ES: RefusalReasonSpineI18nBundle = {
    locale: 'es-419',
    strings: REFUSAL_REASON_SPINE_I18N_ES_419,
  };

  it('renders "3 dosis" for 3 doses in Spanish', () => {
    const rollup = rollupWithNDoses(3);
    const out = renderLocalisedRefusalReasonSpine(rollup, {
      patientName: 'Alicia',
      includePanelSize: true,
      bundle: ES,
    });
    expect(out.locale).toBe('es-419');
    expect(out.html).toContain('3 dosis');
    expect(out.html).not.toContain('3 doses');
  });

  it('renders "1 dosis" singular in Spanish (same form as plural)', () => {
    const rollup = rollupWithNDoses(1);
    const out = renderLocalisedRefusalReasonSpine(rollup, {
      patientName: 'X',
      includePanelSize: true,
      bundle: ES,
    });
    expect(out.html).toContain('1 dosis');
  });

  it('uses Spanish defaultPatientName when no patientName given', () => {
    const rollup = rollupWithNDoses(2);
    const out = renderLocalisedRefusalReasonSpine(rollup, {
      includePanelSize: true,
      bundle: ES,
    });
    expect(out.html).toContain('Padrón de motivos de rechazo');
  });
});

describe('renderLocalisedRefusalReasonSpine — French (fr-FR)', () => {
  const FR: RefusalReasonSpineI18nBundle = {
    locale: 'fr-FR',
    strings: REFUSAL_REASON_SPINE_I18N_FR_FR,
  };

  it('renders "3 doses" in French', () => {
    const rollup = rollupWithNDoses(3);
    const out = renderLocalisedRefusalReasonSpine(rollup, {
      patientName: 'Patient',
      includePanelSize: true,
      bundle: FR,
    });
    expect(out.html).toContain('3 doses');
  });

  it('renders "1 dose" singular in French', () => {
    const rollup = rollupWithNDoses(1);
    const out = renderLocalisedRefusalReasonSpine(rollup, {
      patientName: 'X',
      includePanelSize: true,
      bundle: FR,
    });
    expect(out.html).toContain('1 dose');
  });

  it('uses French defaultPatientName when no patientName given', () => {
    const rollup = rollupWithNDoses(2);
    const out = renderLocalisedRefusalReasonSpine(rollup, {
      includePanelSize: true,
      bundle: FR,
    });
    expect(out.html).toContain('Registre des motifs de refus');
  });
});

describe('renderLocalisedRefusalReasonSpine — German (de-DE)', () => {
  const DE: RefusalReasonSpineI18nBundle = {
    locale: 'de-DE',
    strings: REFUSAL_REASON_SPINE_I18N_DE_DE,
  };

  it('renders "3 Dosen" plural in German', () => {
    const rollup = rollupWithNDoses(3);
    const out = renderLocalisedRefusalReasonSpine(rollup, {
      patientName: 'Patient',
      includePanelSize: true,
      bundle: DE,
    });
    expect(out.html).toContain('3 Dosen');
  });

  it('renders "1 Dosis" singular in German', () => {
    const rollup = rollupWithNDoses(1);
    const out = renderLocalisedRefusalReasonSpine(rollup, {
      patientName: 'Patient',
      includePanelSize: true,
      bundle: DE,
    });
    expect(out.html).toContain('1 Dosis');
    expect(out.html).not.toContain('1 Dosen');
  });
});

describe('renderLocalisedRefusalReasonSpine — Hindi (hi-IN)', () => {
  const HI: RefusalReasonSpineI18nBundle = {
    locale: 'hi-IN',
    strings: REFUSAL_REASON_SPINE_I18N_HI_IN,
  };

  it('renders devanagari plural correctly', () => {
    const rollup = rollupWithNDoses(3);
    const out = renderLocalisedRefusalReasonSpine(rollup, {
      patientName: 'Patient',
      includePanelSize: true,
      bundle: HI,
    });
    expect(out.html).toContain('3 खुराकें');
  });

  it('uses Hindi defaultPatientName when no patientName given', () => {
    const rollup = rollupWithNDoses(2);
    const out = renderLocalisedRefusalReasonSpine(rollup, {
      includePanelSize: true,
      bundle: HI,
    });
    expect(out.html).toContain('इनकार कारण सूची');
  });
});

describe('renderLocalisedRefusalReasonSpine — fallback when bundle is partial', () => {
  it('falls back to English when dosesUnitSingular missing', () => {
    const partial: RefusalReasonSpineI18nBundle = {
      locale: 'fr-FR',
      strings: {
        dosesUnitPlural: 'doses',
        defaultPatientName: 'Registre',
      },
    };
    const rollup = rollupWithNDoses(1);
    const out = renderLocalisedRefusalReasonSpine(rollup, {
      includePanelSize: true,
      bundle: partial,
      patientName: 'X',
    });
    expect(out.fallbackUsedForAnyKey).toBe(true);
    expect(out.fallbackKeys).toContain('dosesUnitSingular');
    expect(out.html).toContain('1 dose'); // English singular fallback
  });

  it('falls back to English when dosesUnitPlural missing', () => {
    const partial: RefusalReasonSpineI18nBundle = {
      locale: 'es-419',
      strings: {
        dosesUnitSingular: 'dosis',
        defaultPatientName: 'X',
      },
    };
    const rollup = rollupWithNDoses(3);
    const out = renderLocalisedRefusalReasonSpine(rollup, {
      includePanelSize: true,
      bundle: partial,
      patientName: 'Y',
    });
    expect(out.fallbackKeys).toContain('dosesUnitPlural');
    expect(out.html).toContain('3 doses');
  });

  it('falls back to English defaultPatientName', () => {
    const partial: RefusalReasonSpineI18nBundle = {
      locale: 'de-DE',
      strings: {
        dosesUnitSingular: 'Dosis',
        dosesUnitPlural: 'Dosen',
      },
    };
    const rollup = rollupWithNDoses(2);
    const out = renderLocalisedRefusalReasonSpine(rollup, {
      includePanelSize: true,
      bundle: partial,
    });
    expect(out.fallbackKeys).toContain('defaultPatientName');
    expect(out.html).toContain('Refusal-reason roster');
  });

  it('reports no fallback when bundle is complete', () => {
    const rollup = rollupWithNDoses(1);
    const out = renderLocalisedRefusalReasonSpine(rollup, {
      patientName: 'X',
      includePanelSize: true,
      bundle: {
        locale: 'es-419',
        strings: REFUSAL_REASON_SPINE_I18N_ES_419,
      },
    });
    expect(out.fallbackUsedForAnyKey).toBe(false);
    expect(out.fallbackKeys).toEqual([]);
  });
});

describe('renderLocalisedRefusalReasonSpine — base spine behaviour preserved', () => {
  it('preserves widthCm / heightCm from the base renderer', () => {
    const rollup = rollupWithNDoses(2);
    const out = renderLocalisedRefusalReasonSpine(rollup, {
      patientName: 'X',
      sizePreset: '5x2cm',
    });
    expect(out.widthCm).toBe(5);
    expect(out.heightCm).toBe(2);
  });

  it('preserves rotationDegrees from the base renderer', () => {
    const rollup = rollupWithNDoses(1);
    const out = renderLocalisedRefusalReasonSpine(rollup, {
      patientName: 'X',
      rotationDegrees: 90,
    });
    expect(out.rotationDegrees).toBe(90);
  });

  it('preserves borderIncluded from the base renderer', () => {
    const rollup = rollupWithNDoses(1);
    const out = renderLocalisedRefusalReasonSpine(rollup, {
      patientName: 'X',
      includeBorder: false,
    });
    expect(out.borderIncluded).toBe(false);
  });

  it('uses the patient name passed in options (not the localised default)', () => {
    const rollup = rollupWithNDoses(1);
    const out = renderLocalisedRefusalReasonSpine(rollup, {
      patientName: 'Specifically Named',
      bundle: {
        locale: 'es-419',
        strings: REFUSAL_REASON_SPINE_I18N_ES_419,
      },
    });
    expect(out.html).toContain('Specifically Named');
    expect(out.html).not.toContain('Padrón de motivos de rechazo');
  });
});

describe('renderLocalisedRefusalReasonSpineByLocale', () => {
  it('picks the bundled es-419 strings for "es-419"', () => {
    const rollup = rollupWithNDoses(3);
    const out = renderLocalisedRefusalReasonSpineByLocale(rollup, 'es-419', {
      patientName: 'X',
      includePanelSize: true,
    });
    expect(out.locale).toBe('es-419');
    expect(out.html).toContain('3 dosis');
  });

  it('strips region and picks "es" when "es-XX" is unknown', () => {
    const rollup = rollupWithNDoses(2);
    const out = renderLocalisedRefusalReasonSpineByLocale(rollup, 'es-MX', {
      patientName: 'X',
      includePanelSize: true,
    });
    expect(out.locale).toBe('es-419');
    expect(out.html).toContain('2 dosis');
  });

  it('falls back to en-US for unknown locales', () => {
    const rollup = rollupWithNDoses(2);
    const out = renderLocalisedRefusalReasonSpineByLocale(rollup, 'xx-YY', {
      patientName: 'X',
      includePanelSize: true,
    });
    expect(out.locale).toBe('en-US');
    expect(out.html).toContain('2 doses');
  });

  it('honours "de" locale id (no region)', () => {
    const rollup = rollupWithNDoses(1);
    const out = renderLocalisedRefusalReasonSpineByLocale(rollup, 'de', {
      patientName: 'X',
      includePanelSize: true,
    });
    expect(out.html).toContain('1 Dosis');
  });
});

describe('pickBuiltInSpineBundle', () => {
  it('returns the en-US bundle for "en-US"', () => {
    const b = pickBuiltInSpineBundle('en-US');
    expect(b.locale).toBe('en-US');
    expect(b.strings.dosesUnitSingular).toBe('dose');
  });

  it('returns the es-419 bundle for "es"', () => {
    const b = pickBuiltInSpineBundle('es');
    expect(b.locale).toBe('es-419');
    expect(b.strings.dosesUnitPlural).toBe('dosis');
  });

  it('returns the fallback bundle for unknown locale', () => {
    const b = pickBuiltInSpineBundle('unknown-XX');
    expect(b.locale).toBe('en-US');
  });
});

describe('validateSpineI18nBundle', () => {
  it('returns empty array for a complete bundle', () => {
    const errors = validateSpineI18nBundle({
      locale: 'en-US',
      strings: REFUSAL_REASON_SPINE_I18N_EN,
    });
    expect(errors).toEqual([]);
  });

  it('reports missing dosesUnitSingular', () => {
    const errors = validateSpineI18nBundle({
      locale: 'x',
      strings: {
        dosesUnitPlural: 'doses',
        defaultPatientName: 'X',
      },
    });
    expect(errors).toEqual(['dosesUnitSingular']);
  });

  it('reports multiple missing keys', () => {
    const errors = validateSpineI18nBundle({
      locale: 'x',
      strings: {},
    });
    expect(errors.length).toBe(3);
  });
});

describe('summarizeLocalisedSpineResult', () => {
  it('reports no fallbacks', () => {
    const rollup = rollupWithNDoses(1);
    const out = renderLocalisedRefusalReasonSpine(rollup, {
      patientName: 'X',
      bundle: {
        locale: 'es-419',
        strings: REFUSAL_REASON_SPINE_I18N_ES_419,
      },
    });
    expect(summarizeLocalisedSpineResult(out)).toBe(
      'Localised spine: es-419 (no fallbacks).',
    );
  });

  it('reports the specific fallback keys', () => {
    const rollup = rollupWithNDoses(1);
    const out = renderLocalisedRefusalReasonSpine(rollup, {
      patientName: 'X',
      bundle: { locale: 'de-DE', strings: { dosesUnitPlural: 'Dosen' } },
    });
    const summary = summarizeLocalisedSpineResult(out);
    expect(summary).toContain('de-DE');
    expect(summary).toContain('dosesUnitSingular');
    expect(summary).toContain('defaultPatientName');
  });
});

describe('determinism', () => {
  it('produces byte-identical HTML for same input + bundle', () => {
    const rollup = rollupWithNDoses(3);
    const a = renderLocalisedRefusalReasonSpine(rollup, {
      patientName: 'X',
      includePanelSize: true,
      bundle: { locale: 'es-419', strings: REFUSAL_REASON_SPINE_I18N_ES_419 },
    });
    const b = renderLocalisedRefusalReasonSpine(rollup, {
      patientName: 'X',
      includePanelSize: true,
      bundle: { locale: 'es-419', strings: REFUSAL_REASON_SPINE_I18N_ES_419 },
    });
    expect(a.html).toBe(b.html);
  });
});
