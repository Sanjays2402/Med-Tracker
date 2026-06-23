import { describe, it, expect } from 'vitest';
import {
  renderQuietHoursCalendarHtmlPrintableI18n,
  summarizeQuietHoursCalendarHtmlPrintableI18n,
  extractQuietHoursCalendarHtmlPrintableI18nLines,
  detectQuietHoursCalendarPrintableI18nCoverage,
  QUIET_HOURS_CALENDAR_PRINTABLE_I18N_EN,
  type QuietHoursCalendarPrintableI18nBundle,
} from '../src/dose-export-csv-import-roundtrip-validator-summary-text-slack-thread-batcher-quiet-hours-calendar-html-printable-i18n';

// Test helpers --------------------------------------------------------

const ES_419_BUNDLE: QuietHoursCalendarPrintableI18nBundle = {
  locale: 'es-419',
  strings: {
    days: {
      mon: 'Lun',
      tue: 'Mar',
      wed: 'Mié',
      thu: 'Jue',
      fri: 'Vie',
      sat: 'Sáb',
      sun: 'Dom',
    },
    rules: {
      'default': 'Predeterminado',
      'override:window': 'Ventana personalizada',
      'override:all-day': 'Silencio todo el día',
      'override:none': 'Sin horario de silencio',
    },
    printedPrefix: 'Impreso',
    defaultFooterText:
      'Esta página es una instantánea de las reglas de horario de silencio configuradas y no se actualiza una vez impresa.',
  },
};

const JA_JP_BUNDLE: QuietHoursCalendarPrintableI18nBundle = {
  locale: 'ja-JP',
  strings: {
    days: {
      mon: '月',
      tue: '火',
      wed: '水',
      thu: '木',
      fri: '金',
      sat: '土',
      sun: '日',
    },
    rules: {
      'default': 'デフォルト',
      'override:window': 'カスタムウィンドウ',
      'override:all-day': '終日サイレント',
      'override:none': 'サイレント時間なし',
    },
    printedPrefix: '印刷',
    defaultFooterText:
      'このページは構成された静かな時間ルールのスナップショットであり、印刷後は更新されません。',
  },
};

const PARTIAL_BUNDLE: QuietHoursCalendarPrintableI18nBundle = {
  locale: 'fr-FR',
  strings: {
    days: {
      mon: 'Lun',
      tue: 'Mar',
      wed: 'Mer',
      thu: 'Jeu',
      fri: 'Ven',
      // sat, sun left missing -> EN fallback
    },
    rules: {
      'default': 'Par défaut',
      // others missing
    },
    printedPrefix: 'Imprimé',
    // defaultFooterText missing
  },
};

// Happy path tests ---------------------------------------------------

describe('renderQuietHoursCalendarHtmlPrintableI18n — happy path', () => {
  it('renders day labels in the requested locale', () => {
    const r = renderQuietHoursCalendarHtmlPrintableI18n({
      locale: 'es-419',
      bundle: ES_419_BUNDLE,
    });
    expect(r.html).toContain('Lun');
    expect(r.html).toContain('Mar');
    expect(r.html).toContain('Mié');
    expect(r.html).toContain('Dom');
    expect(r.html).not.toContain('>Mon<');
    expect(r.html).not.toContain('>Tue<');
  });

  it('renders rule labels in the requested locale', () => {
    const r = renderQuietHoursCalendarHtmlPrintableI18n({
      locale: 'es-419',
      bundle: ES_419_BUNDLE,
    });
    expect(r.html).toContain('Predeterminado');
    expect(r.html).not.toContain('>Default<');
  });

  it('renders the printed-on prefix in the requested locale', () => {
    const r = renderQuietHoursCalendarHtmlPrintableI18n({
      locale: 'es-419',
      bundle: ES_419_BUNDLE,
      printedAt: new Date('2026-06-23T12:00:00Z'),
      printedAtTimezone: 'America/Los_Angeles',
    });
    expect(r.html).toContain('Impreso ');
    expect(r.html).not.toContain('Printed ');
  });

  it('renders the default footer in the requested locale', () => {
    const r = renderQuietHoursCalendarHtmlPrintableI18n({
      locale: 'es-419',
      bundle: ES_419_BUNDLE,
    });
    expect(r.html).toContain('Esta página');
    expect(r.html).not.toContain('This page is a snapshot');
  });

  it('renders ja-JP day + rule labels with full-width characters', () => {
    const r = renderQuietHoursCalendarHtmlPrintableI18n({
      locale: 'ja-JP',
      bundle: JA_JP_BUNDLE,
    });
    expect(r.html).toContain('月');
    expect(r.html).toContain('デフォルト');
    expect(r.fallbackUsed).toBe(false);
    expect(r.missingKeys).toEqual([]);
  });

  it('preserves the printedAtIso in the structured result', () => {
    const r = renderQuietHoursCalendarHtmlPrintableI18n({
      locale: 'es-419',
      bundle: ES_419_BUNDLE,
      printedAt: new Date('2026-06-23T12:00:00Z'),
      printedAtTimezone: 'America/Los_Angeles',
    });
    expect(r.printedAtIso).toBe('2026-06-23');
  });

  it('keeps cell datum English (downstream typed consumers stay stable)', () => {
    const r = renderQuietHoursCalendarHtmlPrintableI18n({
      locale: 'es-419',
      bundle: ES_419_BUNDLE,
    });
    // cells[].dayOfWeek is the structured key (mon/tue/...), NOT the
    // localised label, because it's part of the typed datum.
    expect(r.cells.map((c) => c.dayOfWeek)).toContain('mon');
    expect(r.cells.map((c) => c.dayOfWeek)).toContain('sun');
  });
});

// Fallback tests -----------------------------------------------------

describe('renderQuietHoursCalendarHtmlPrintableI18n — fallback', () => {
  it('falls back to EN for missing day keys (sat / sun)', () => {
    const r = renderQuietHoursCalendarHtmlPrintableI18n({
      locale: 'fr-FR',
      bundle: PARTIAL_BUNDLE,
    });
    // mon..fri come from the FR bundle.
    expect(r.html).toContain('Lun');
    // sat, sun fall back to EN.
    expect(r.html).toContain('Sat');
    expect(r.html).toContain('Sun');
    expect(r.fallbackUsed).toBe(true);
    expect(r.missingKeys).toContain('days.sat');
    expect(r.missingKeys).toContain('days.sun');
  });

  it('falls back to EN for missing rule keys', () => {
    const r = renderQuietHoursCalendarHtmlPrintableI18n({
      locale: 'fr-FR',
      bundle: PARTIAL_BUNDLE,
    });
    expect(r.html).toContain('Par défaut');
    // Other rules fall back to EN ones.
    expect(r.missingKeys).toContain('rules.override:window');
    expect(r.missingKeys).toContain('rules.override:all-day');
    expect(r.missingKeys).toContain('rules.override:none');
  });

  it('falls back to EN default footer when bundle lacks it', () => {
    const r = renderQuietHoursCalendarHtmlPrintableI18n({
      locale: 'fr-FR',
      bundle: PARTIAL_BUNDLE,
    });
    expect(r.missingKeys).toContain('defaultFooterText');
    expect(r.html).toContain('This page is a snapshot');
  });

  it('reports zero fallback for a fully complete bundle', () => {
    const r = renderQuietHoursCalendarHtmlPrintableI18n({
      locale: 'es-419',
      bundle: ES_419_BUNDLE,
    });
    expect(r.fallbackUsed).toBe(false);
    expect(r.missingKeys).toEqual([]);
  });

  it('falls back to EN printed prefix when bundle lacks it', () => {
    const bundle: QuietHoursCalendarPrintableI18nBundle = {
      locale: 'pt-BR',
      strings: { days: {}, rules: {} },
    };
    const r = renderQuietHoursCalendarHtmlPrintableI18n({
      locale: 'pt-BR',
      bundle,
      printedAt: new Date('2026-06-23T12:00:00Z'),
      printedAtTimezone: 'America/Los_Angeles',
    });
    expect(r.html).toContain('Printed 2026-06-23');
    expect(r.missingKeys).toContain('printedPrefix');
  });
});

// Footer override tests ----------------------------------------------

describe('renderQuietHoursCalendarHtmlPrintableI18n — footer override', () => {
  it('honours an explicit footerText override verbatim (no i18n at this layer)', () => {
    const r = renderQuietHoursCalendarHtmlPrintableI18n({
      locale: 'es-419',
      bundle: ES_419_BUNDLE,
      footerText: 'Custom footer override',
    });
    expect(r.html).toContain('Custom footer override');
    expect(r.html).not.toContain('Esta página es una instantánea');
  });

  it('suppresses footer when caller passes empty string', () => {
    const r = renderQuietHoursCalendarHtmlPrintableI18n({
      locale: 'es-419',
      bundle: ES_419_BUNDLE,
      footerText: '',
    });
    // The CSS block always declares the .qh-cal-print-footer class.
    // What we care about is that no DIV with that class is RENDERED.
    expect(r.html).not.toContain('<div class="qh-cal-print-footer">');
  });
});

// Bold-non-default + current-day tests --------------------------------

describe('renderQuietHoursCalendarHtmlPrintableI18n — base behaviours preserved', () => {
  it('bold non-default rule labels survive the i18n rewrite', () => {
    const r = renderQuietHoursCalendarHtmlPrintableI18n({
      locale: 'es-419',
      bundle: ES_419_BUNDLE,
      overrides: {
        sat: { kind: 'quiet-all-day' },
      },
    });
    // The base render wraps non-default rule labels in <strong>; the
    // i18n rewrite must preserve that bolding.
    expect(r.html).toMatch(/<strong>Silencio todo el día<\/strong>/);
  });

  it('suppresses bolding when caller passes suppressNonDefaultBold=true', () => {
    const r = renderQuietHoursCalendarHtmlPrintableI18n({
      locale: 'es-419',
      bundle: ES_419_BUNDLE,
      overrides: {
        sat: { kind: 'quiet-all-day' },
      },
      suppressNonDefaultBold: true,
    });
    expect(r.html).not.toMatch(/<strong>Silencio todo el día<\/strong>/);
    expect(r.html).toContain('Silencio todo el día');
  });
});

// summarize tests ----------------------------------------------------

describe('summarizeQuietHoursCalendarHtmlPrintableI18n', () => {
  it('uses localised rule labels in the body', () => {
    const r = renderQuietHoursCalendarHtmlPrintableI18n({
      locale: 'es-419',
      bundle: ES_419_BUNDLE,
    });
    const s = summarizeQuietHoursCalendarHtmlPrintableI18n(r, ES_419_BUNDLE);
    expect(s).toContain('Predeterminado');
    expect(s).toContain('printable es-419');
  });

  it('uses localised printed prefix lowercased', () => {
    const r = renderQuietHoursCalendarHtmlPrintableI18n({
      locale: 'es-419',
      bundle: ES_419_BUNDLE,
      printedAt: new Date('2026-06-23T12:00:00Z'),
      printedAtTimezone: 'America/Los_Angeles',
    });
    const s = summarizeQuietHoursCalendarHtmlPrintableI18n(r, ES_419_BUNDLE);
    expect(s).toContain('impreso 2026-06-23');
  });

  it('reports fallback key count when bundle is incomplete', () => {
    const r = renderQuietHoursCalendarHtmlPrintableI18n({
      locale: 'fr-FR',
      bundle: PARTIAL_BUNDLE,
    });
    const s = summarizeQuietHoursCalendarHtmlPrintableI18n(r, PARTIAL_BUNDLE);
    expect(s).toContain('fallback:');
    expect(s).toContain('keys');
  });

  it('omits the fallback parenthetical for a complete bundle', () => {
    const r = renderQuietHoursCalendarHtmlPrintableI18n({
      locale: 'es-419',
      bundle: ES_419_BUNDLE,
    });
    const s = summarizeQuietHoursCalendarHtmlPrintableI18n(r, ES_419_BUNDLE);
    expect(s).not.toContain('fallback:');
  });

  it('handles empty all-default day grid', () => {
    const r = renderQuietHoursCalendarHtmlPrintableI18n({
      locale: 'es-419',
      bundle: ES_419_BUNDLE,
    });
    const s = summarizeQuietHoursCalendarHtmlPrintableI18n(r, ES_419_BUNDLE);
    expect(s).toContain('7 Predeterminado');
  });
});

// extract lines tests ------------------------------------------------

describe('extractQuietHoursCalendarHtmlPrintableI18nLines', () => {
  it('uses localised day + rule labels in the per-day lines', () => {
    const r = renderQuietHoursCalendarHtmlPrintableI18n({
      locale: 'es-419',
      bundle: ES_419_BUNDLE,
      overrides: {
        sat: { kind: 'quiet-all-day' },
      },
    });
    const lines = extractQuietHoursCalendarHtmlPrintableI18nLines(
      r,
      ES_419_BUNDLE,
    );
    expect(lines.find((l) => l.startsWith('Lun:'))).toContain('Predeterminado');
    expect(
      lines.find((l) => l.startsWith('Sáb:')),
    ).toContain('Silencio todo el día');
  });

  it('falls back to EN labels for partial bundles', () => {
    const r = renderQuietHoursCalendarHtmlPrintableI18n({
      locale: 'fr-FR',
      bundle: PARTIAL_BUNDLE,
    });
    const lines = extractQuietHoursCalendarHtmlPrintableI18nLines(
      r,
      PARTIAL_BUNDLE,
    );
    // sat / sun are EN fallback day labels.
    expect(lines.find((l) => l.startsWith('Sat:'))).toBeDefined();
    expect(lines.find((l) => l.startsWith('Sun:'))).toBeDefined();
  });

  it('emits 7 lines for every render (one per weekday)', () => {
    const r = renderQuietHoursCalendarHtmlPrintableI18n({
      locale: 'ja-JP',
      bundle: JA_JP_BUNDLE,
    });
    const lines = extractQuietHoursCalendarHtmlPrintableI18nLines(
      r,
      JA_JP_BUNDLE,
    );
    expect(lines).toHaveLength(7);
  });
});

// Coverage helper tests ----------------------------------------------

describe('detectQuietHoursCalendarPrintableI18nCoverage', () => {
  it('reports 100% for the built-in EN bundle wrapper', () => {
    const c = detectQuietHoursCalendarPrintableI18nCoverage({
      locale: 'en-US',
      strings: QUIET_HOURS_CALENDAR_PRINTABLE_I18N_EN,
    });
    expect(c.isComplete).toBe(true);
    expect(c.coverage).toBe(1);
    expect(c.missingKeys).toEqual([]);
  });

  it('reports 100% for a fully translated es-419 bundle', () => {
    const c = detectQuietHoursCalendarPrintableI18nCoverage(ES_419_BUNDLE);
    expect(c.isComplete).toBe(true);
    expect(c.providedKeys).toBe(c.expectedKeys);
  });

  it('lists missing keys for a partial bundle', () => {
    const c = detectQuietHoursCalendarPrintableI18nCoverage(PARTIAL_BUNDLE);
    expect(c.isComplete).toBe(false);
    expect(c.missingKeys).toContain('days.sat');
    expect(c.missingKeys).toContain('days.sun');
    expect(c.missingKeys).toContain('rules.override:window');
    expect(c.missingKeys).toContain('defaultFooterText');
  });

  it('reports 0 coverage for an empty bundle', () => {
    const c = detectQuietHoursCalendarPrintableI18nCoverage({
      locale: 'xx-XX',
      strings: {},
    });
    expect(c.providedKeys).toBe(0);
    expect(c.coverage).toBe(0);
    expect(c.isComplete).toBe(false);
  });

  it('reports the locale field from the input', () => {
    const c = detectQuietHoursCalendarPrintableI18nCoverage(JA_JP_BUNDLE);
    expect(c.locale).toBe('ja-JP');
  });

  it('reports coverage ratio as a fraction', () => {
    const c = detectQuietHoursCalendarPrintableI18nCoverage(PARTIAL_BUNDLE);
    expect(c.coverage).toBeGreaterThan(0);
    expect(c.coverage).toBeLessThan(1);
  });
});

// Round-trip tests ---------------------------------------------------

describe('renderQuietHoursCalendarHtmlPrintableI18n — round-trip stability', () => {
  it('two consecutive renders with the same bundle produce identical HTML', () => {
    const a = renderQuietHoursCalendarHtmlPrintableI18n({
      locale: 'es-419',
      bundle: ES_419_BUNDLE,
    });
    const b = renderQuietHoursCalendarHtmlPrintableI18n({
      locale: 'es-419',
      bundle: ES_419_BUNDLE,
    });
    expect(a.html).toBe(b.html);
  });

  it('changes between bundles produce different HTML', () => {
    const a = renderQuietHoursCalendarHtmlPrintableI18n({
      locale: 'es-419',
      bundle: ES_419_BUNDLE,
    });
    const b = renderQuietHoursCalendarHtmlPrintableI18n({
      locale: 'ja-JP',
      bundle: JA_JP_BUNDLE,
    });
    expect(a.html).not.toBe(b.html);
  });
});
