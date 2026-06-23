import { describe, it, expect } from 'vitest';
import {
  renderBccTierPolicyCoverageWarningsHtmlPrint,
  summarizeBccTierPolicyCoverageWarningsHtmlPrint,
  extractBccTierPolicyCoverageWarningsHtmlPrintLines,
} from '../src/followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report-warnings-html-print';
import type { FollowupDigestBccTierPolicyCoverageReport } from '../src/followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report';

// Test helpers --------------------------------------------------------

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

// Happy path tests ---------------------------------------------------

describe('renderBccTierPolicyCoverageWarningsHtmlPrint — happy path', () => {
  it('renders a full HTML document by default with monochrome chip stack', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrint(
      buildReport({ tierIsAlwaysCritical: true }),
    );
    expect(r.html).toMatch(/^<!DOCTYPE html>/);
    expect(r.html).toContain('@page { size: 8.5in 11in');
    // Overlay CSS rules.
    expect(r.html).toContain('background: #ffffff !important');
    expect(r.html).toContain('color: #000000 !important');
    expect(r.html).toContain('border-color: #000000 !important');
    expect(r.html).toContain('flex-direction: column !important');
  });

  it('honours the A4 paper preset', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrint(
      buildReport({ tierIsAlwaysCritical: true }),
      { paper: 'a4' },
    );
    expect(r.html).toContain('@page { size: 210mm 297mm');
    expect(r.paper).toBe('a4');
  });

  it('emits fragment when wrapHtmlDocument=false', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrint(
      buildReport({ tierIsAlwaysCritical: true }),
      { wrapHtmlDocument: false },
    );
    expect(r.html.startsWith('<!DOCTYPE')).toBe(false);
    expect(r.html).toContain('<section class="cov-warn-wrapper">');
  });

  it('mirrors chips + counts from the base render', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrint(
      buildReport({
        tierIsAlwaysCritical: true,
        unusedDestinations: ['admin@example.com', 'backup@example.com'],
      }),
    );
    expect(r.chips.length).toBeGreaterThan(0);
    expect(r.countsBySeverity['always-critical']).toBeGreaterThan(0);
    expect(r.countsBySeverity['unused-destination']).toBe(2);
  });
});

// Severity badge tests -----------------------------------------------

describe('renderBccTierPolicyCoverageWarningsHtmlPrint — severity badges', () => {
  it('prepends [CRITICAL] badge for always-critical warnings', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrint(
      buildReport({ tierIsAlwaysCritical: true }),
    );
    expect(r.html).toContain('[CRITICAL]');
  });

  it('prepends [CAUTION] badge for always-tier warnings', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrint(
      buildReport({ tierIsAlwaysRoutine: true }),
    );
    expect(r.html).toContain('[CAUTION]');
  });

  it('prepends [INFO] badge for unused-destination warnings', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrint(
      buildReport({ unusedDestinations: ['admin@example.com'] }),
    );
    expect(r.html).toContain('[INFO]');
  });

  it('suppresses badge prefix when suppressBadgePrefix=true', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrint(
      buildReport({ tierIsAlwaysCritical: true }),
      { suppressBadgePrefix: true },
    );
    expect(r.html).not.toContain('[CRITICAL]');
    expect(r.html).not.toContain('[CAUTION]');
    expect(r.html).not.toContain('[INFO]');
  });

  it('uses thicker borders for higher-severity chips', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrint(
      buildReport({ tierIsAlwaysCritical: true }),
    );
    // always-critical -> 3px border.
    expect(r.html).toMatch(/border:3px solid/);
  });

  it('uses 1px border for unused-destination chips', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrint(
      buildReport({ unusedDestinations: ['admin@example.com'] }),
    );
    expect(r.html).toMatch(/border:1px solid/);
  });
});

// Empty-state tests --------------------------------------------------

describe('renderBccTierPolicyCoverageWarningsHtmlPrint — empty state', () => {
  it('renders the empty-state chip when no warnings', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrint(buildReport());
    expect(r.isEmpty).toBe(true);
    expect(r.html).toContain('All checks passed');
  });

  it('empty state still gets the monochrome treatment', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrint(buildReport());
    expect(r.html).toContain('background: #ffffff !important');
  });

  it('returns empty html when suppressEmptyState=true and no warnings', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrint(buildReport(), {
      suppressEmptyState: true,
    });
    expect(r.html).toMatch(/<body>(<style>.*?<\/style>)?<\/body>/s);
    expect(r.isEmpty).toBe(true);
  });
});

// Printed-at footer tests --------------------------------------------

describe('renderBccTierPolicyCoverageWarningsHtmlPrint — printed-on stamp', () => {
  it('appends "Printed YYYY-MM-DD" when printedAt set', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrint(
      buildReport({ tierIsAlwaysCritical: true }),
      {
        printedAt: new Date('2026-06-23T12:00:00Z'),
        printedAtTimezone: 'America/Los_Angeles',
      },
    );
    expect(r.html).toContain('Printed 2026-06-23');
    expect(r.printedAtIso).toBe('2026-06-23');
  });

  it('omits stamp when printedAt undefined', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrint(
      buildReport({ tierIsAlwaysCritical: true }),
    );
    expect(r.html).not.toContain('Printed ');
    expect(r.printedAtIso).toBeNull();
  });

  it('omits stamp when suppressPrintedAt=true even if printedAt set', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrint(
      buildReport({ tierIsAlwaysCritical: true }),
      {
        printedAt: new Date('2026-06-23T12:00:00Z'),
        suppressPrintedAt: true,
      },
    );
    expect(r.html).not.toContain('Printed ');
    expect(r.printedAtIso).toBeNull();
  });

  it('formats date in the specified timezone', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrint(
      buildReport({ tierIsAlwaysCritical: true }),
      {
        printedAt: new Date('2026-06-23T03:00:00Z'),
        printedAtTimezone: 'America/Los_Angeles',
      },
    );
    // Pacific is UTC-7 in June, so 03:00 UTC = 20:00 prior day.
    expect(r.printedAtIso).toBe('2026-06-22');
  });
});

// Footer text tests --------------------------------------------------

describe('renderBccTierPolicyCoverageWarningsHtmlPrint — footer text', () => {
  it('emits default footer text', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrint(
      buildReport({ tierIsAlwaysCritical: true }),
    );
    expect(r.html).toContain('Coverage warnings snapshot');
  });

  it('honours footer text override', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrint(
      buildReport({ tierIsAlwaysCritical: true }),
      { footerText: 'Custom footer' },
    );
    expect(r.html).toContain('Custom footer');
    expect(r.html).not.toContain('Coverage warnings snapshot');
  });

  it('suppresses footer when footerText is empty string', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrint(
      buildReport({ tierIsAlwaysCritical: true }),
      { footerText: '' },
    );
    expect(r.html).not.toContain('<div class="cov-warn-print-footer">');
  });
});

// Address span tests -------------------------------------------------

describe('renderBccTierPolicyCoverageWarningsHtmlPrint — address span', () => {
  it('renders unused-destination addresses with hairline border (no background)', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrint(
      buildReport({
        unusedDestinations: ['admin@example.com'],
      }),
    );
    expect(r.html).toContain('background: transparent !important');
    expect(r.html).toContain('border: 1px solid #9ca3af !important');
    expect(r.html).toContain('admin@example.com');
  });

  it('preserves multiple unused-destination addresses', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrint(
      buildReport({
        unusedDestinations: [
          'admin@example.com',
          'backup@example.com',
          'oncall@example.com',
        ],
      }),
    );
    expect(r.html).toContain('admin@example.com');
    expect(r.html).toContain('backup@example.com');
    expect(r.html).toContain('oncall@example.com');
  });
});

// summarize tests ----------------------------------------------------

describe('summarizeBccTierPolicyCoverageWarningsHtmlPrint', () => {
  it('reports total chip count + per-severity breakdown', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrint(
      buildReport({
        tierIsAlwaysCritical: true,
        unusedDestinations: ['admin@example.com'],
      }),
    );
    const s = summarizeBccTierPolicyCoverageWarningsHtmlPrint(r);
    expect(s).toContain('print, us-letter');
    expect(s).toContain('chips');
    expect(s).toContain('always-critical');
    expect(s).toContain('unused-destination');
  });

  it('reports empty state with "all checks passed"', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrint(buildReport());
    const s = summarizeBccTierPolicyCoverageWarningsHtmlPrint(r);
    expect(s).toContain('all checks passed');
  });

  it('includes printed date when set', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrint(
      buildReport({ tierIsAlwaysCritical: true }),
      {
        printedAt: new Date('2026-06-23T12:00:00Z'),
        printedAtTimezone: 'America/Los_Angeles',
      },
    );
    const s = summarizeBccTierPolicyCoverageWarningsHtmlPrint(r);
    expect(s).toContain('printed 2026-06-23');
  });

  it('reports paper preset in header', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrint(
      buildReport({ tierIsAlwaysCritical: true }),
      { paper: 'a4' },
    );
    const s = summarizeBccTierPolicyCoverageWarningsHtmlPrint(r);
    expect(s).toContain('print, a4');
  });

  it('singularises "chip" when count is 1', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrint(
      buildReport({ tierIsAlwaysCritical: true }),
    );
    const s = summarizeBccTierPolicyCoverageWarningsHtmlPrint(r);
    if (r.chips.length === 1) {
      expect(s).toContain('1 chip ');
    } else {
      expect(s).toContain('chips');
    }
  });
});

// extract lines tests ------------------------------------------------

describe('extractBccTierPolicyCoverageWarningsHtmlPrintLines', () => {
  it('produces one line per chip with badge + label', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrint(
      buildReport({ tierIsAlwaysCritical: true }),
    );
    const lines = extractBccTierPolicyCoverageWarningsHtmlPrintLines(r);
    expect(lines.length).toBe(r.chips.length);
    expect(lines.every((l) => l.startsWith('['))).toBe(true);
  });

  it('appends address with em-dash for unused-destination', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrint(
      buildReport({ unusedDestinations: ['admin@example.com'] }),
    );
    const lines = extractBccTierPolicyCoverageWarningsHtmlPrintLines(r);
    const unused = lines.find((l) => l.includes('admin@example.com'));
    expect(unused).toBeDefined();
    expect(unused).toContain('\u2014');
  });

  it('returns single empty-state line for no-warning report', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrint(buildReport());
    const lines = extractBccTierPolicyCoverageWarningsHtmlPrintLines(r);
    expect(lines).toEqual(['All clear \u2014 All checks passed']);
  });

  it('produces an INFO-prefixed line per unused destination', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrint(
      buildReport({
        unusedDestinations: ['a@x.com', 'b@x.com', 'c@x.com'],
      }),
    );
    const lines = extractBccTierPolicyCoverageWarningsHtmlPrintLines(r);
    const info = lines.filter((l) => l.startsWith('[INFO]'));
    expect(info).toHaveLength(3);
  });
});

// XSS safety tests ---------------------------------------------------

describe('renderBccTierPolicyCoverageWarningsHtmlPrint — XSS safety', () => {
  it('escapes unused-destination addresses', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrint(
      buildReport({
        unusedDestinations: ['<script>alert(1)</script>@example.com'],
      }),
    );
    expect(r.html).not.toContain('<script>alert(1)</script>@example.com');
    expect(r.html).toContain('&lt;script&gt;');
  });

  it('escapes footer text', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrint(
      buildReport({ tierIsAlwaysCritical: true }),
      { footerText: '<img src=x onerror=alert(1)>' },
    );
    expect(r.html).not.toContain('<img src=x');
    expect(r.html).toContain('&lt;img');
  });

  it('escapes document title', () => {
    const r = renderBccTierPolicyCoverageWarningsHtmlPrint(
      buildReport({ tierIsAlwaysCritical: true }),
      { documentTitle: '</title><script>x()</script>' },
    );
    expect(r.html).not.toContain('</title><script>');
  });
});

// Round-trip stability tests ------------------------------------------

describe('renderBccTierPolicyCoverageWarningsHtmlPrint — round-trip stability', () => {
  it('two renders of the same report produce identical HTML when timestamp suppressed', () => {
    const report = buildReport({ tierIsAlwaysCritical: true });
    const a = renderBccTierPolicyCoverageWarningsHtmlPrint(report);
    const b = renderBccTierPolicyCoverageWarningsHtmlPrint(report);
    expect(a.html).toBe(b.html);
  });

  it('different reports produce different HTML', () => {
    const a = renderBccTierPolicyCoverageWarningsHtmlPrint(
      buildReport({ tierIsAlwaysCritical: true }),
    );
    const b = renderBccTierPolicyCoverageWarningsHtmlPrint(
      buildReport({ tierIsAlwaysRoutine: true }),
    );
    expect(a.html).not.toBe(b.html);
  });
});
