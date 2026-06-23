import { describe, it, expect } from 'vitest';
import {
  renderBccTierPolicyCoverageWarningsHtml,
  summarizeBccTierPolicyCoverageWarningsHtml,
  extractBccTierPolicyCoverageUnusedDestinations,
} from '../src/followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report-warnings-html';
import type { FollowupDigestBccTierPolicyCoverageReport } from '../src/followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report';

// Builder helper ------------------------------------------------------

function report(
  overrides: Partial<FollowupDigestBccTierPolicyCoverageReport> = {},
): FollowupDigestBccTierPolicyCoverageReport {
  return {
    envelopeCount: overrides.envelopeCount ?? 6,
    countsByTier: overrides.countsByTier ?? {
      routine: 4,
      actionable: 1,
      critical: 1,
    },
    bccEnvelopeCountByTier: overrides.bccEnvelopeCountByTier ?? {
      routine: 4,
      actionable: 1,
      critical: 1,
    },
    tierDistribution: overrides.tierDistribution ?? {
      routine: 0.6667,
      actionable: 0.1667,
      critical: 0.1667,
    },
    totalBccHeadersShipped: overrides.totalBccHeadersShipped ?? 6,
    distinctBccAddressCount: overrides.distinctBccAddressCount ?? 3,
    fanOutByAddress: overrides.fanOutByAddress ?? [],
    fanOutByTier: overrides.fanOutByTier ?? {
      routine: [],
      actionable: [],
      critical: [],
    },
    unusedDestinations: overrides.unusedDestinations ?? [],
    escalationOnlyAddresses: overrides.escalationOnlyAddresses ?? [],
    topFanoutAddress: overrides.topFanoutAddress ?? null,
    topFanoutCount: overrides.topFanoutCount ?? 0,
    dominantTier: overrides.dominantTier ?? 'routine',
    tierIsAlwaysRoutine: overrides.tierIsAlwaysRoutine ?? false,
    tierIsAlwaysActionable: overrides.tierIsAlwaysActionable ?? false,
    tierIsAlwaysCritical: overrides.tierIsAlwaysCritical ?? false,
  };
}

// Empty state tests ---------------------------------------------------

describe('renderBccTierPolicyCoverageWarningsHtml — empty state', () => {
  it('emits "All checks passed" green chip when no warnings', () => {
    const r = renderBccTierPolicyCoverageWarningsHtml(report());
    expect(r.isEmpty).toBe(true);
    expect(r.chips).toEqual([]);
    expect(r.html).toContain('All checks passed');
    expect(r.html).toContain('cov-warn-chip--empty');
  });

  it('respects emptyStateLabel override', () => {
    const r = renderBccTierPolicyCoverageWarningsHtml(report(), {
      emptyStateLabel: 'No misconfigurations detected',
    });
    expect(r.html).toContain('No misconfigurations detected');
    expect(r.html).not.toContain('All checks passed');
  });

  it('suppressEmptyState=true emits empty string', () => {
    const r = renderBccTierPolicyCoverageWarningsHtml(report(), {
      suppressEmptyState: true,
    });
    expect(r.html).toBe('');
    expect(r.isEmpty).toBe(true);
    expect(r.chips).toEqual([]);
  });
});

// always-critical severity tests --------------------------------------

describe('renderBccTierPolicyCoverageWarningsHtml — always-critical', () => {
  it('emits a red always-critical chip', () => {
    const r = renderBccTierPolicyCoverageWarningsHtml(
      report({ tierIsAlwaysCritical: true }),
    );
    expect(r.chips.length).toBe(1);
    expect(r.chips[0]!.severity).toBe('always-critical');
    expect(r.chips[0]!.label).toBe('Channel always critical');
    expect(r.chips[0]!.address).toBeNull();
    expect(r.html).toContain('cov-warn-chip--always-critical');
    expect(r.html).toContain('#fef2f2'); // red background
  });

  it('counts the always-critical severity in countsBySeverity', () => {
    const r = renderBccTierPolicyCoverageWarningsHtml(
      report({ tierIsAlwaysCritical: true }),
    );
    expect(r.countsBySeverity['always-critical']).toBe(1);
    expect(r.countsBySeverity['always-tier']).toBe(0);
    expect(r.countsBySeverity['unused-destination']).toBe(0);
  });
});

// always-tier severity tests (routine / actionable) -------------------

describe('renderBccTierPolicyCoverageWarningsHtml — always-tier', () => {
  it('emits a yellow always-routine chip', () => {
    const r = renderBccTierPolicyCoverageWarningsHtml(
      report({ tierIsAlwaysRoutine: true }),
    );
    expect(r.chips.length).toBe(1);
    expect(r.chips[0]!.severity).toBe('always-tier');
    expect(r.chips[0]!.label).toBe('Channel always routine');
    expect(r.html).toContain('#fffbeb'); // yellow background
  });

  it('emits a yellow always-actionable chip', () => {
    const r = renderBccTierPolicyCoverageWarningsHtml(
      report({ tierIsAlwaysActionable: true }),
    );
    expect(r.chips.length).toBe(1);
    expect(r.chips[0]!.label).toBe('Channel always actionable');
    expect(r.chips[0]!.severity).toBe('always-tier');
  });
});

// unused-destination severity tests -----------------------------------

describe('renderBccTierPolicyCoverageWarningsHtml — unused-destination', () => {
  it('emits a grey chip per unused destination with the address split out', () => {
    const r = renderBccTierPolicyCoverageWarningsHtml(
      report({
        unusedDestinations: [
          'secondary@example.com',
          'tertiary@example.com',
        ],
      }),
    );
    expect(r.chips.length).toBe(2);
    expect(r.chips[0]!.severity).toBe('unused-destination');
    expect(r.chips[0]!.label).toBe('Unused destination');
    expect(r.chips[0]!.address).toBe('secondary@example.com');
    expect(r.chips[1]!.address).toBe('tertiary@example.com');
    expect(r.html).toContain('cov-warn-addr');
    expect(r.html).toContain('secondary@example.com');
    expect(r.html).toContain('tertiary@example.com');
  });

  it('counts unused-destination chips in countsBySeverity', () => {
    const r = renderBccTierPolicyCoverageWarningsHtml(
      report({
        unusedDestinations: ['a@example.com', 'b@example.com', 'c@example.com'],
      }),
    );
    expect(r.countsBySeverity['unused-destination']).toBe(3);
  });

  it('escapes HTML in the unused destination address', () => {
    const r = renderBccTierPolicyCoverageWarningsHtml(
      report({
        unusedDestinations: ['danger@<script>alert(1)</script>.com'],
      }),
    );
    expect(r.html).toContain(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
    expect(r.html).not.toContain('<script>alert(1)');
  });
});

// Mixed severity tests ------------------------------------------------

describe('renderBccTierPolicyCoverageWarningsHtml — mixed severities', () => {
  it('emits one chip per warning, severity classified independently', () => {
    const r = renderBccTierPolicyCoverageWarningsHtml(
      report({
        tierIsAlwaysCritical: true,
        unusedDestinations: ['a@example.com'],
      }),
    );
    expect(r.chips.length).toBe(2);
    expect(r.chips[0]!.severity).toBe('always-critical');
    expect(r.chips[1]!.severity).toBe('unused-destination');
    expect(r.countsBySeverity['always-critical']).toBe(1);
    expect(r.countsBySeverity['unused-destination']).toBe(1);
  });

  it('preserves source warning order in the chips array', () => {
    const r = renderBccTierPolicyCoverageWarningsHtml(
      report({
        tierIsAlwaysRoutine: true,
        unusedDestinations: ['z@example.com', 'a@example.com'],
      }),
    );
    expect(r.chips.length).toBe(3);
    expect(r.chips[0]!.severity).toBe('always-tier');
    // unused destinations come second + third in source order, NOT
    // pre-sorted by the warnings panel (sorting is the source report's
    // job, not the chip renderer's).
    expect(r.chips[1]!.address).toBe('z@example.com');
    expect(r.chips[2]!.address).toBe('a@example.com');
  });
});

// Severity label override tests ---------------------------------------

describe('renderBccTierPolicyCoverageWarningsHtml — severity label overrides', () => {
  it('respects per-severity label overrides', () => {
    const r = renderBccTierPolicyCoverageWarningsHtml(
      report({
        tierIsAlwaysCritical: true,
        unusedDestinations: ['a@example.com'],
      }),
      {
        severityLabels: {
          'always-critical': 'PAGE NOW',
          'unused-destination': 'Cleanup',
        },
      },
    );
    expect(r.html).toContain('PAGE NOW');
    expect(r.html).toContain('Cleanup');
    expect(r.html).not.toContain('ALWAYS CRITICAL');
  });

  it('falls back to default labels for unset overrides', () => {
    const r = renderBccTierPolicyCoverageWarningsHtml(
      report({
        tierIsAlwaysCritical: true,
        unusedDestinations: ['a@example.com'],
      }),
      {
        severityLabels: {
          'always-critical': 'PAGE NOW',
        },
      },
    );
    expect(r.html).toContain('PAGE NOW');
    expect(r.html).toContain('Unused destination');
  });
});

// Document wrapping tests ---------------------------------------------

describe('renderBccTierPolicyCoverageWarningsHtml — document wrapping', () => {
  it('emits a fragment by default (no <!DOCTYPE>)', () => {
    const r = renderBccTierPolicyCoverageWarningsHtml(report());
    expect(r.html.startsWith('<!DOCTYPE')).toBe(false);
    expect(r.html).toContain('<section class="cov-warn-wrapper">');
  });

  it('wraps in a full HTML document when wrapHtmlDocument=true', () => {
    const r = renderBccTierPolicyCoverageWarningsHtml(report(), {
      wrapHtmlDocument: true,
    });
    expect(r.html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(r.html).toContain('<title>BCC tier-policy coverage warnings</title>');
    expect(r.html).toContain('</html>');
  });

  it('respects documentTitle override', () => {
    const r = renderBccTierPolicyCoverageWarningsHtml(report(), {
      wrapHtmlDocument: true,
      documentTitle: 'Warnings panel',
    });
    expect(r.html).toContain('<title>Warnings panel</title>');
  });

  it('escapes HTML in caption', () => {
    const r = renderBccTierPolicyCoverageWarningsHtml(report(), {
      caption: '<malicious>&"',
    });
    expect(r.html).toContain(
      '&lt;malicious&gt;&amp;&quot;',
    );
    expect(r.html).not.toContain('<malicious>');
  });
});

// summarizeBccTierPolicyCoverageWarningsHtml tests --------------------

describe('summarizeBccTierPolicyCoverageWarningsHtml', () => {
  it('reports zero chips for empty state', () => {
    const r = renderBccTierPolicyCoverageWarningsHtml(report());
    const s = summarizeBccTierPolicyCoverageWarningsHtml(r);
    expect(s).toBe('Coverage warnings HTML: 0 chips (all checks passed).');
  });

  it('lists per-severity counts when chips exist', () => {
    const r = renderBccTierPolicyCoverageWarningsHtml(
      report({
        tierIsAlwaysCritical: true,
        unusedDestinations: ['a@example.com', 'b@example.com'],
      }),
    );
    const s = summarizeBccTierPolicyCoverageWarningsHtml(r);
    expect(s).toContain('3 chips');
    expect(s).toContain('1 always-critical');
    expect(s).toContain('2 unused-destination');
  });

  it('singular when one chip', () => {
    const r = renderBccTierPolicyCoverageWarningsHtml(
      report({ tierIsAlwaysCritical: true }),
    );
    const s = summarizeBccTierPolicyCoverageWarningsHtml(r);
    expect(s).toContain('1 chip ');
    expect(s).not.toContain('1 chips');
  });
});

// extractBccTierPolicyCoverageUnusedDestinations tests ----------------

describe('extractBccTierPolicyCoverageUnusedDestinations', () => {
  it('returns the unused destination addresses sorted alphabetically', () => {
    const r = renderBccTierPolicyCoverageWarningsHtml(
      report({
        unusedDestinations: ['z@example.com', 'b@example.com', 'a@example.com'],
      }),
    );
    const addrs = extractBccTierPolicyCoverageUnusedDestinations(r);
    expect(addrs).toEqual([
      'a@example.com',
      'b@example.com',
      'z@example.com',
    ]);
  });

  it('returns an empty array when no unused destinations', () => {
    const r = renderBccTierPolicyCoverageWarningsHtml(
      report({ tierIsAlwaysCritical: true }),
    );
    expect(extractBccTierPolicyCoverageUnusedDestinations(r)).toEqual([]);
  });

  it('skips non-unused-destination chips', () => {
    const r = renderBccTierPolicyCoverageWarningsHtml(
      report({
        tierIsAlwaysCritical: true,
        unusedDestinations: ['a@example.com'],
      }),
    );
    const addrs = extractBccTierPolicyCoverageUnusedDestinations(r);
    expect(addrs).toEqual(['a@example.com']);
  });
});
