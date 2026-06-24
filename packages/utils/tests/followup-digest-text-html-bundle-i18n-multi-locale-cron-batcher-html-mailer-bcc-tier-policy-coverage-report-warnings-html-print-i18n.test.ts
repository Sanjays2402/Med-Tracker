import { describe, it, expect } from 'vitest';
import {
  renderBccTierPolicyCoverageWarningsHtmlPrintI18n,
  summarizeBccTierPolicyCoverageWarningsHtmlPrintI18n,
  detectBccTierPolicyCoverageWarningsHtmlPrintI18nCoverage,
  extractBccTierPolicyCoverageWarningsHtmlPrintI18nLines,
  BCC_TIER_POLICY_COVERAGE_WARNINGS_HTML_PRINT_I18N_EN,
  type BccTierPolicyCoverageWarningsHtmlPrintI18nBundle,
} from '../src/followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report-warnings-html-print-i18n';
import type { FollowupDigestBccTierPolicyCoverageReport } from '../src/followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report';

// Test helpers -------------------------------------------------------

function buildReport(
  options: {
    envelopeCount?: number;
    tierIsAlwaysRoutine?: boolean;
    tierIsAlwaysActionable?: boolean;
    tierIsAlwaysCritical?: boolean;
    unusedDestinations?: string[];
    fanOutByAddress?: { address: string; count: number }[];
  } = {},
): FollowupDigestBccTierPolicyCoverageReport {
  return {
    envelopeCount: options.envelopeCount ?? 5,
    countsByTier: { routine: 0, actionable: 0, critical: 0 },
    bccEnvelopeCountByTier: { routine: 0, actionable: 0, critical: 0 },
    tierDistribution: { routine: 0, actionable: 0, critical: 0 },
    totalBccHeadersShipped: 0,
    distinctBccAddressCount: 0,
    fanOutByAddress: options.fanOutByAddress ?? [],
    fanOutByTier: { routine: [], actionable: [], critical: [] },
    unusedDestinations: options.unusedDestinations ?? [],
    escalationOnlyAddresses: [],
    topFanoutAddress: null,
    topFanoutCount: 0,
    dominantTier: null,
    tierIsAlwaysRoutine: options.tierIsAlwaysRoutine ?? false,
    tierIsAlwaysActionable: options.tierIsAlwaysActionable ?? false,
    tierIsAlwaysCritical: options.tierIsAlwaysCritical ?? false,
  };
}

const ES_BUNDLE: BccTierPolicyCoverageWarningsHtmlPrintI18nBundle = {
  locale: 'es-419',
  strings: {
    badgePrefix: {
      'always-critical': '[CRÍTICO]',
      'always-tier': '[ATENCIÓN]',
      'unused-destination': '[INFO]',
    },
    severityLabel: {
      'always-critical': 'Siempre crítico',
      'always-tier': 'Siempre un solo nivel',
      'unused-destination': 'Destino no usado',
    },
    emptyStateLabel: 'Todo correcto',
    printedPrefix: 'Impreso',
    defaultFooterText:
      'Resumen de alertas — no se actualiza después de imprimir.',
    emptyStateBadge: 'Sin alertas',
  },
};

const PARTIAL_JA_BUNDLE: BccTierPolicyCoverageWarningsHtmlPrintI18nBundle = {
  locale: 'ja-JP',
  strings: {
    badgePrefix: {
      'always-critical': '【重要】',
      // 'always-tier' + 'unused-destination' missing
    },
    severityLabel: {
      'always-critical': '常に重要',
      // others missing
    },
    // emptyStateLabel, printedPrefix, defaultFooterText, emptyStateBadge missing
  },
};

// Happy path tests ---------------------------------------------------

describe('renderBccTierPolicyCoverageWarningsHtmlPrintI18n — happy path', () => {
  it('renders a full HTML document with localised badge + label for a critical chip', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrintI18n(
      buildReport({ tierIsAlwaysCritical: true }),
      { locale: 'es-419', bundle: ES_BUNDLE },
    );
    expect(r.resolvedLocale).toBe('es-419');
    expect(r.fallbackUsed).toBe(false);
    expect(r.missingKeys).toEqual([]);
    // Badge prefix + severity label, both localised.
    expect(r.html).toContain('[CRÍTICO] Siempre crítico');
    // Old English not present.
    expect(r.html).not.toContain('[CRITICAL] Always critical');
  });

  it('localises the unused-destination badge + label', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrintI18n(
      buildReport({
        envelopeCount: 5,
        unusedDestinations: ['admin@example.com'],
      }),
      { locale: 'es-419', bundle: ES_BUNDLE },
    );
    expect(r.html).toContain('[INFO] Destino no usado');
    expect(r.html).not.toContain('Unused destination');
  });

  it('localises the "Printed YYYY-MM-DD" prefix when a printedAt is supplied', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrintI18n(
      buildReport({ tierIsAlwaysCritical: true }),
      {
        locale: 'es-419',
        bundle: ES_BUNDLE,
        printedAt: new Date(Date.UTC(2026, 5, 23, 12, 0, 0)),
        printedAtTimezone: 'America/Los_Angeles',
      },
    );
    expect(r.html).toContain('Impreso 2026-06-23');
    expect(r.html).not.toContain('Printed 2026-06-23');
  });

  it('localises the default footer text', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrintI18n(
      buildReport({ tierIsAlwaysCritical: true }),
      { locale: 'es-419', bundle: ES_BUNDLE },
    );
    expect(r.html).toContain(
      'Resumen de alertas \u2014 no se actualiza después de imprimir.',
    );
    expect(r.html).not.toContain('Coverage warnings snapshot');
  });

  it('honours a caller-supplied footerText verbatim (no i18n at this layer)', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrintI18n(
      buildReport({ tierIsAlwaysCritical: true }),
      {
        locale: 'es-419',
        bundle: ES_BUNDLE,
        footerText: 'Custom footer (verbatim)',
      },
    );
    expect(r.html).toContain('Custom footer (verbatim)');
    expect(r.html).not.toContain('Resumen de alertas');
  });

  it('localises the empty-state chip badge + label', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrintI18n(buildReport(), {
      locale: 'es-419',
      bundle: ES_BUNDLE,
    });
    expect(r.isEmpty).toBe(true);
    expect(r.html).toContain('Sin alertas');
    expect(r.html).toContain('Todo correcto');
    expect(r.html).not.toContain('All clear');
    expect(r.html).not.toContain('All checks passed');
  });
});

// Fallback tests -----------------------------------------------------

describe('renderBccTierPolicyCoverageWarningsHtmlPrintI18n — locale fallback', () => {
  it('falls back to English for missing badge prefixes', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrintI18n(
      buildReport({
        envelopeCount: 5,
        unusedDestinations: ['admin@example.com'],
      }),
      { locale: 'ja-JP', bundle: PARTIAL_JA_BUNDLE },
    );
    // The unused-destination badge is missing in the partial bundle —
    // fallback to English.
    expect(r.html).toContain('[INFO]');
    expect(r.fallbackUsed).toBe(true);
    expect(r.missingKeys).toContain('badgePrefix.unused-destination');
    expect(r.missingKeys).toContain('severityLabel.unused-destination');
  });

  it('uses the supplied JA badge when present', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrintI18n(
      buildReport({ tierIsAlwaysCritical: true }),
      { locale: 'ja-JP', bundle: PARTIAL_JA_BUNDLE },
    );
    expect(r.html).toContain('【重要】');
    expect(r.html).toContain('常に重要');
  });

  it('reports missing emptyStateLabel + emptyStateBadge for empty reports', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrintI18n(buildReport(), {
      locale: 'ja-JP',
      bundle: PARTIAL_JA_BUNDLE,
    });
    expect(r.missingKeys).toContain('emptyStateLabel');
    expect(r.missingKeys).toContain('emptyStateBadge');
    // English fallback fills both for the rendered chip.
    expect(r.html).toContain('All clear');
    expect(r.html).toContain('All checks passed');
  });

  it('resolvedLocale always equals the requested locale, even on partial fill', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrintI18n(
      buildReport({ tierIsAlwaysCritical: true }),
      { locale: 'ja-JP', bundle: PARTIAL_JA_BUNDLE },
    );
    expect(r.resolvedLocale).toBe('ja-JP');
    expect(r.fallbackUsed).toBe(true);
  });

  it('handles a completely empty bundle by filling everything from English', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrintI18n(
      buildReport({ tierIsAlwaysCritical: true }),
      { locale: 'pt-BR', bundle: { locale: 'pt-BR', strings: {} } },
    );
    expect(r.html).toContain('[CRITICAL] Always critical');
    expect(r.fallbackUsed).toBe(true);
    expect(r.missingKeys.length).toBeGreaterThan(5);
  });
});

// suppressBadgePrefix tests ------------------------------------------

describe('renderBccTierPolicyCoverageWarningsHtmlPrintI18n — suppressBadgePrefix', () => {
  it('emits only the localised label when suppressBadgePrefix=true', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrintI18n(
      buildReport({ tierIsAlwaysCritical: true }),
      {
        locale: 'es-419',
        bundle: ES_BUNDLE,
        suppressBadgePrefix: true,
      },
    );
    // Localised label present.
    expect(r.html).toContain('Siempre crítico');
    // Localised badge prefix NOT present.
    expect(r.html).not.toContain('[CRÍTICO]');
    // English badge prefix also not present.
    expect(r.html).not.toContain('[CRITICAL]');
  });
});

// HTML escaping ------------------------------------------------------

describe('renderBccTierPolicyCoverageWarningsHtmlPrintI18n — HTML escaping', () => {
  it('escapes HTML in localised badge prefixes', () => {
    const trickyBundle: BccTierPolicyCoverageWarningsHtmlPrintI18nBundle = {
      locale: 'xss-test',
      strings: {
        badgePrefix: {
          'always-critical': '<script>',
          'always-tier': 'safe',
          'unused-destination': 'safe',
        },
      },
    };
    const r = renderBccTierPolicyCoverageWarningsHtmlPrintI18n(
      buildReport({ tierIsAlwaysCritical: true }),
      { locale: 'xss-test', bundle: trickyBundle },
    );
    expect(r.html).toContain('&lt;script&gt;');
    expect(r.html).not.toContain('<script>');
  });

  it('escapes HTML in localised footer text', () => {
    const trickyBundle: BccTierPolicyCoverageWarningsHtmlPrintI18nBundle = {
      locale: 'xss-test',
      strings: {
        defaultFooterText: '<img src=x onerror=alert(1)>',
      },
    };
    const r = renderBccTierPolicyCoverageWarningsHtmlPrintI18n(
      buildReport({ tierIsAlwaysCritical: true }),
      { locale: 'xss-test', bundle: trickyBundle },
    );
    expect(r.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(r.html).not.toContain('<img src=x');
  });

  it('escapes HTML in localised printed prefix', () => {
    const trickyBundle: BccTierPolicyCoverageWarningsHtmlPrintI18nBundle = {
      locale: 'xss-test',
      strings: { printedPrefix: '<b>P</b>' },
    };
    const r = renderBccTierPolicyCoverageWarningsHtmlPrintI18n(
      buildReport({ tierIsAlwaysCritical: true }),
      {
        locale: 'xss-test',
        bundle: trickyBundle,
        printedAt: new Date(Date.UTC(2026, 5, 23, 12, 0, 0)),
        printedAtTimezone: 'America/Los_Angeles',
      },
    );
    expect(r.html).toContain('&lt;b&gt;P&lt;/b&gt; 2026-06-23');
  });
});

// detectCoverage tests -----------------------------------------------

describe('detectBccTierPolicyCoverageWarningsHtmlPrintI18nCoverage', () => {
  it('reports complete coverage for the EN reference bundle', () => {
    const bundle: BccTierPolicyCoverageWarningsHtmlPrintI18nBundle = {
      locale: 'en-US',
      strings: { ...BCC_TIER_POLICY_COVERAGE_WARNINGS_HTML_PRINT_I18N_EN },
    };
    const cov = detectBccTierPolicyCoverageWarningsHtmlPrintI18nCoverage(bundle);
    expect(cov.isComplete).toBe(true);
    expect(cov.coverage).toBe(1);
    expect(cov.missingKeys).toEqual([]);
    // 3 badges + 3 severity labels + emptyStateLabel + printedPrefix +
    // defaultFooterText + emptyStateBadge = 10
    expect(cov.expectedKeys).toBe(10);
    expect(cov.providedKeys).toBe(10);
  });

  it('flags the partial JA bundle as incomplete', () => {
    const cov = detectBccTierPolicyCoverageWarningsHtmlPrintI18nCoverage(PARTIAL_JA_BUNDLE);
    expect(cov.isComplete).toBe(false);
    expect(cov.locale).toBe('ja-JP');
    expect(cov.coverage).toBeLessThan(1);
    expect(cov.missingKeys).toContain('badgePrefix.always-tier');
    expect(cov.missingKeys).toContain('badgePrefix.unused-destination');
    expect(cov.missingKeys).toContain('severityLabel.always-tier');
    expect(cov.missingKeys).toContain('emptyStateLabel');
    expect(cov.missingKeys).toContain('emptyStateBadge');
    expect(cov.missingKeys).toContain('printedPrefix');
    expect(cov.missingKeys).toContain('defaultFooterText');
  });

  it('reports zero coverage for an empty bundle', () => {
    const cov = detectBccTierPolicyCoverageWarningsHtmlPrintI18nCoverage({
      locale: 'pt-BR',
      strings: {},
    });
    expect(cov.providedKeys).toBe(0);
    expect(cov.coverage).toBe(0);
    expect(cov.missingKeys.length).toBe(cov.expectedKeys);
  });
});

// summarize / extract tests ------------------------------------------

describe('summarizeBccTierPolicyCoverageWarningsHtmlPrintI18n', () => {
  it('uses the localised printed prefix lowercase in the summary', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrintI18n(
      buildReport({ tierIsAlwaysCritical: true }),
      {
        locale: 'es-419',
        bundle: ES_BUNDLE,
        printedAt: new Date(Date.UTC(2026, 5, 23, 12, 0, 0)),
        printedAtTimezone: 'America/Los_Angeles',
      },
    );
    const s = summarizeBccTierPolicyCoverageWarningsHtmlPrintI18n(r, ES_BUNDLE);
    expect(s).toContain('print es-419');
    expect(s).toContain('impreso 2026-06-23');
  });

  it('mentions the fallback count when keys are missing', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrintI18n(
      buildReport({ tierIsAlwaysCritical: true }),
      { locale: 'ja-JP', bundle: PARTIAL_JA_BUNDLE },
    );
    const s = summarizeBccTierPolicyCoverageWarningsHtmlPrintI18n(r, PARTIAL_JA_BUNDLE);
    expect(s).toMatch(/\(fallback: \d+ keys?\)/);
  });

  it('omits the fallback parenthetical on complete bundles', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrintI18n(
      buildReport({ tierIsAlwaysCritical: true }),
      { locale: 'es-419', bundle: ES_BUNDLE },
    );
    const s = summarizeBccTierPolicyCoverageWarningsHtmlPrintI18n(r, ES_BUNDLE);
    expect(s).not.toMatch(/fallback/);
  });

  it('summarises an empty report with the all-checks-passed body', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrintI18n(buildReport(), {
      locale: 'es-419',
      bundle: ES_BUNDLE,
    });
    const s = summarizeBccTierPolicyCoverageWarningsHtmlPrintI18n(r, ES_BUNDLE);
    expect(s).toContain('(all checks passed)');
    expect(s).toContain('print es-419');
  });
});

describe('extractBccTierPolicyCoverageWarningsHtmlPrintI18nLines', () => {
  it('emits localised badge + label lines for each chip', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrintI18n(
      buildReport({
        tierIsAlwaysCritical: true,
        unusedDestinations: ['admin@example.com'],
      }),
      { locale: 'es-419', bundle: ES_BUNDLE },
    );
    const lines = extractBccTierPolicyCoverageWarningsHtmlPrintI18nLines(r, ES_BUNDLE);
    expect(lines).toContain('[CRÍTICO] Siempre crítico');
    expect(
      lines.some((l) => l.startsWith('[INFO] Destino no usado') && l.includes('admin@example.com')),
    ).toBe(true);
  });

  it('emits a single empty-state line on empty reports', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrintI18n(buildReport(), {
      locale: 'es-419',
      bundle: ES_BUNDLE,
    });
    const lines = extractBccTierPolicyCoverageWarningsHtmlPrintI18nLines(r, ES_BUNDLE);
    expect(lines).toEqual(['Sin alertas \u2014 Todo correcto']);
  });

  it('falls back to English on missing keys', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrintI18n(
      buildReport({ tierIsAlwaysCritical: true, unusedDestinations: ['x@y.com'] }),
      { locale: 'ja-JP', bundle: PARTIAL_JA_BUNDLE },
    );
    const lines = extractBccTierPolicyCoverageWarningsHtmlPrintI18nLines(r, PARTIAL_JA_BUNDLE);
    // Critical chip uses provided JA labels.
    expect(lines.some((l) => l.includes('【重要】 常に重要'))).toBe(true);
    // Unused-destination chip falls back to English.
    expect(lines.some((l) => l.includes('[INFO] Unused destination'))).toBe(true);
  });
});

// Determinism --------------------------------------------------------

describe('renderBccTierPolicyCoverageWarningsHtmlPrintI18n — determinism', () => {
  it('produces identical output for identical input', () => {
    const a = renderBccTierPolicyCoverageWarningsHtmlPrintI18n(
      buildReport({
        tierIsAlwaysCritical: true,
        unusedDestinations: ['x@y.com'],
      }),
      { locale: 'es-419', bundle: ES_BUNDLE },
    );
    const b = renderBccTierPolicyCoverageWarningsHtmlPrintI18n(
      buildReport({
        tierIsAlwaysCritical: true,
        unusedDestinations: ['x@y.com'],
      }),
      { locale: 'es-419', bundle: ES_BUNDLE },
    );
    expect(a.html).toBe(b.html);
    expect(a.missingKeys).toEqual(b.missingKeys);
  });
});

describe('renderBccTierPolicyCoverageWarningsHtmlPrintI18n — preserves base render fields', () => {
  it('inherits chips + countsBySeverity + isEmpty + paper + printedAtIso from the base', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrintI18n(
      buildReport({
        tierIsAlwaysCritical: true,
        unusedDestinations: ['x@y.com', 'z@y.com'],
      }),
      {
        locale: 'es-419',
        bundle: ES_BUNDLE,
        paper: 'a4',
        printedAt: new Date(Date.UTC(2026, 5, 23, 12, 0, 0)),
        printedAtTimezone: 'America/Los_Angeles',
      },
    );
    expect(r.paper).toBe('a4');
    expect(r.printedAtIso).toBe('2026-06-23');
    expect(r.countsBySeverity['unused-destination']).toBe(2);
    expect(r.isEmpty).toBe(false);
  });
});
