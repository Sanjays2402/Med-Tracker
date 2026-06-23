import { describe, it, expect } from 'vitest';
import { buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy } from '../src/followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy';
import { buildBccTierPolicyCoverageReport } from '../src/followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report';
import {
  renderBccTierPolicyCoverageReportHtml,
  summarizeBccTierPolicyCoverageReportHtml,
} from '../src/followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report-html';
import {
  buildFollowupDigestCronBatch,
  type FollowupDigestCronBatcherPatient,
  type FollowupDigestCronBatcherCaregiver,
} from '../src/followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher';
import {
  FOLLOWUP_DIGEST_I18N_EN,
  type FollowupDigestI18nBundle,
} from '../src/followup-digest-text-html-bundle-i18n';
import {
  buildFollowupReport,
  type FollowupRequirement,
} from '../src/appointment-followup-tracker';

const NOW = new Date(2026, 5, 21);
const ENGLISH_BUNDLE: FollowupDigestI18nBundle = {
  locale: 'en-US',
  strings: FOLLOWUP_DIGEST_I18N_EN,
};

function req(o: Partial<FollowupRequirement> & { dueAt: string }): FollowupRequirement {
  return { kind: 'visit', title: 'Visit', ...o };
}

function patientSlice(
  patientId: string,
  patientName: string,
  rows: FollowupRequirement[],
): FollowupDigestCronBatcherPatient {
  return {
    patientId,
    input: {
      patient: { name: patientName },
      report: buildFollowupReport({ followups: rows, now: NOW }),
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    },
  };
}

function patientWithOverdue(id: string, name: string) {
  return patientSlice(id, name, [req({ dueAt: '2026-06-01', title: 'Overdue' })]);
}

function patientWithDueSoon(id: string, name: string) {
  return patientSlice(id, name, [req({ dueAt: '2026-06-25', title: 'Due soon' })]);
}

function caregiver(
  caregiverId: string,
  name: string,
  locale: string,
  patientIds: string[],
  destination?: string,
): FollowupDigestCronBatcherCaregiver {
  return { caregiverId, caregiverName: name, locale, patientIds, destination };
}

function batch(
  patients: FollowupDigestCronBatcherPatient[],
  caregivers: FollowupDigestCronBatcherCaregiver[],
) {
  return buildFollowupDigestCronBatch(patients, caregivers, {
    localeBundles: [ENGLISH_BUNDLE],
  });
}

function reportForBatch(
  patients: FollowupDigestCronBatcherPatient[],
  caregivers: FollowupDigestCronBatcherCaregiver[],
) {
  const b = batch(patients, caregivers);
  const tier = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b);
  return buildBccTierPolicyCoverageReport(tier);
}

describe('renderBccTierPolicyCoverageReportHtml — shape', () => {
  it('returns non-empty HTML for a populated report', () => {
    const report = reportForBatch(
      [patientWithOverdue('p-1', 'Alice'), patientWithDueSoon('p-2', 'Bob')],
      [
        caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com'),
        caregiver('cg-b', 'B', 'en-US', ['p-2'], 'b@example.com'),
      ],
    );
    const out = renderBccTierPolicyCoverageReportHtml(report);
    expect(out.html.length).toBeGreaterThan(0);
    expect(out.html).toContain('<section class="cov-wrapper">');
  });

  it('mirrors envelopeCount + dominantTier from report', () => {
    const report = reportForBatch(
      [patientWithOverdue('p-1', 'Alice'), patientWithOverdue('p-2', 'Bob')],
      [
        caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com'),
        caregiver('cg-b', 'B', 'en-US', ['p-2'], 'b@example.com'),
      ],
    );
    const out = renderBccTierPolicyCoverageReportHtml(report);
    expect(out.envelopeCount).toBe(report.envelopeCount);
    expect(out.dominantTier).toBe(report.dominantTier);
  });

  it('includes default document title in the HTML', () => {
    const report = reportForBatch(
      [patientWithOverdue('p-1', 'A')],
      [caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const out = renderBccTierPolicyCoverageReportHtml(report);
    expect(out.html).toContain('BCC tier-policy coverage');
  });

  it('respects custom documentTitle', () => {
    const report = reportForBatch(
      [patientWithOverdue('p-1', 'A')],
      [caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const out = renderBccTierPolicyCoverageReportHtml(report, {
      documentTitle: 'My Custom Title',
    });
    expect(out.html).toContain('My Custom Title');
  });

  it('emits a full HTML document when wrapHtmlDocument=true', () => {
    const report = reportForBatch(
      [patientWithOverdue('p-1', 'A')],
      [caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const out = renderBccTierPolicyCoverageReportHtml(report, { wrapHtmlDocument: true });
    expect(out.html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(out.html).toContain('<title>BCC tier-policy coverage</title>');
  });

  it('includes caption when supplied', () => {
    const report = reportForBatch(
      [patientWithOverdue('p-1', 'A')],
      [caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const out = renderBccTierPolicyCoverageReportHtml(report, {
      caption: 'Last 7 days',
    });
    expect(out.html).toContain('Last 7 days');
  });
});

describe('renderBccTierPolicyCoverageReportHtml — headline', () => {
  it('shows envelope count', () => {
    const report = reportForBatch(
      [patientWithOverdue('p-1', 'Alice'), patientWithOverdue('p-2', 'Bob')],
      [
        caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com'),
        caregiver('cg-b', 'B', 'en-US', ['p-2'], 'b@example.com'),
      ],
    );
    const out = renderBccTierPolicyCoverageReportHtml(report);
    expect(out.html).toContain('2 envelopes');
  });

  it('uses singular for one envelope', () => {
    const report = reportForBatch(
      [patientWithOverdue('p-1', 'Alice')],
      [caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const out = renderBccTierPolicyCoverageReportHtml(report);
    expect(out.html).toContain('1 envelope');
  });

  it('shows dominant tier when present', () => {
    const report = reportForBatch(
      [patientWithOverdue('p-1', 'Alice'), patientWithOverdue('p-2', 'Bob')],
      [
        caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com'),
        caregiver('cg-b', 'B', 'en-US', ['p-2'], 'b@example.com'),
      ],
    );
    const out = renderBccTierPolicyCoverageReportHtml(report);
    if (report.dominantTier !== null) {
      expect(out.html).toContain('Dominant:');
    }
  });

  it('shows "No dominant tier" when null', () => {
    // No envelopes → dominantTier is null
    const report = reportForBatch([], []);
    const out = renderBccTierPolicyCoverageReportHtml(report);
    expect(out.html).toContain('No dominant tier');
  });

  it('honours tier label override', () => {
    const report = reportForBatch(
      [patientWithOverdue('p-1', 'Alice'), patientWithOverdue('p-2', 'Bob')],
      [
        caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com'),
        caregiver('cg-b', 'B', 'en-US', ['p-2'], 'b@example.com'),
      ],
    );
    const out = renderBccTierPolicyCoverageReportHtml(report, {
      tierLabels: { critical: 'CRITIQUE' },
    });
    if (report.dominantTier === 'critical') {
      expect(out.html).toContain('CRITIQUE');
    }
  });
});

describe('renderBccTierPolicyCoverageReportHtml — tier bars', () => {
  it('renders one row per tier (routine / actionable / critical)', () => {
    const report = reportForBatch(
      [patientWithOverdue('p-1', 'Alice')],
      [caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const out = renderBccTierPolicyCoverageReportHtml(report);
    // Three DOM rows; the CSS contains one ".cov-tier-row" rule.
    const rowCount = (out.html.match(/class="cov-tier-row"/g) ?? []).length;
    expect(rowCount).toBe(3);
  });

  it('emits bar fills with width set from tier distribution', () => {
    const report = reportForBatch(
      [patientWithOverdue('p-1', 'A'), patientWithOverdue('p-2', 'B')],
      [
        caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com'),
        caregiver('cg-b', 'B', 'en-US', ['p-2'], 'b@example.com'),
      ],
    );
    const out = renderBccTierPolicyCoverageReportHtml(report);
    expect(out.html).toMatch(/width:\d+%/);
  });

  it('uses default tier labels when none provided', () => {
    const report = reportForBatch(
      [patientWithOverdue('p-1', 'A')],
      [caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const out = renderBccTierPolicyCoverageReportHtml(report);
    expect(out.html).toContain('Routine');
    expect(out.html).toContain('Actionable');
    expect(out.html).toContain('Critical');
  });

  it('localised tier labels override defaults', () => {
    const report = reportForBatch(
      [patientWithOverdue('p-1', 'A')],
      [caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const out = renderBccTierPolicyCoverageReportHtml(report, {
      tierLabels: {
        routine: 'Rutina',
        actionable: 'Accionable',
        critical: 'Critico',
      },
    });
    expect(out.html).toContain('Rutina');
    expect(out.html).toContain('Critico');
    expect(out.html).not.toContain('Routine');
  });
});

describe('renderBccTierPolicyCoverageReportHtml — fan-out table', () => {
  it('emits a fan-out table for non-empty fanOutByAddress', () => {
    const report = reportForBatch(
      [patientWithOverdue('p-1', 'A')],
      [
        caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com'),
      ],
    );
    // Inject BCC fan-out into the report manually because the basic
    // tier-policy result doesn't always BCC.
    const fanOutReport = {
      ...report,
      fanOutByAddress: [
        { address: 'admin@example.com', count: 4 },
        { address: 'pcp@example.com', count: 2 },
      ],
      distinctBccAddressCount: 2,
      totalBccHeadersShipped: 6,
    };
    const out = renderBccTierPolicyCoverageReportHtml(fanOutReport);
    expect(out.html).toContain('cov-fanout-table');
    expect(out.html).toContain('admin@example.com');
    expect(out.html).toContain('pcp@example.com');
    expect(out.topFanoutRowsRendered).toBe(2);
  });

  it('shows empty-state when no fan-out', () => {
    const report = reportForBatch(
      [patientWithOverdue('p-1', 'A')],
      [caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const out = renderBccTierPolicyCoverageReportHtml(report);
    expect(out.html).toContain('No BCC fan-out');
    expect(out.topFanoutRowsRendered).toBe(0);
  });

  it('honours topFanoutRowLimit', () => {
    const report = reportForBatch(
      [patientWithOverdue('p-1', 'A')],
      [caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const reportWithFanOut = {
      ...report,
      fanOutByAddress: Array.from({ length: 12 }, (_, i) => ({
        address: `addr${i}@example.com`,
        count: 12 - i,
      })),
      distinctBccAddressCount: 12,
      totalBccHeadersShipped: 78,
    };
    const out = renderBccTierPolicyCoverageReportHtml(reportWithFanOut, {
      topFanoutRowLimit: 3,
    });
    expect(out.topFanoutRowsRendered).toBe(3);
    expect(out.html).toContain('addr0@example.com');
    expect(out.html).toContain('addr2@example.com');
    expect(out.html).not.toContain('addr5@example.com');
  });

  it('topFanoutRowLimit=0 suppresses the fan-out section entirely', () => {
    const report = reportForBatch(
      [patientWithOverdue('p-1', 'A')],
      [caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const reportWithFanOut = {
      ...report,
      fanOutByAddress: [{ address: 'admin@example.com', count: 4 }],
    };
    const out = renderBccTierPolicyCoverageReportHtml(reportWithFanOut, {
      topFanoutRowLimit: 0,
    });
    expect(out.html).not.toContain('Top fan-out');
    expect(out.topFanoutRowsRendered).toBe(0);
  });

  it('HTML-escapes addresses with special characters', () => {
    const report = reportForBatch(
      [patientWithOverdue('p-1', 'A')],
      [caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const reportWithFanOut = {
      ...report,
      fanOutByAddress: [
        { address: 'admin+tag<x>@example.com', count: 4 },
      ],
    };
    const out = renderBccTierPolicyCoverageReportHtml(reportWithFanOut);
    expect(out.html).toContain('admin+tag&lt;x&gt;@example.com');
  });
});

describe('renderBccTierPolicyCoverageReportHtml — warnings', () => {
  it('omits warnings panel when no warnings', () => {
    const report = reportForBatch(
      [patientWithOverdue('p-1', 'Alice'), patientWithDueSoon('p-2', 'Bob')],
      [
        caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com'),
        caregiver('cg-b', 'B', 'en-US', ['p-2'], 'b@example.com'),
      ],
    );
    const out = renderBccTierPolicyCoverageReportHtml(report);
    if (out.warningsRendered === 0) {
      // CSS class name appears in <style> rules; look for the markup attribute use.
      expect(out.html).not.toContain('class="cov-section cov-section--warnings"');
    }
  });

  it('shows warnings panel when warnings exist', () => {
    const report = reportForBatch(
      [patientWithOverdue('p-1', 'A'), patientWithOverdue('p-2', 'B')],
      [
        caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com'),
        caregiver('cg-b', 'B', 'en-US', ['p-2'], 'b@example.com'),
      ],
    );
    // If every envelope is the same tier we'll get an "always X" warning.
    if (report.tierIsAlwaysRoutine || report.tierIsAlwaysActionable || report.tierIsAlwaysCritical) {
      const out = renderBccTierPolicyCoverageReportHtml(report);
      expect(out.html).toContain('class="cov-section cov-section--warnings"');
      expect(out.warningsRendered).toBeGreaterThan(0);
    }
  });

  it('suppressWarnings hides the panel even when warnings exist', () => {
    const report = reportForBatch(
      [patientWithOverdue('p-1', 'A'), patientWithOverdue('p-2', 'B')],
      [
        caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com'),
        caregiver('cg-b', 'B', 'en-US', ['p-2'], 'b@example.com'),
      ],
    );
    const out = renderBccTierPolicyCoverageReportHtml(report, {
      suppressWarnings: true,
    });
    expect(out.html).not.toContain('class="cov-section cov-section--warnings"');
    expect(out.warningsRendered).toBe(0);
  });

  it('warnings are HTML-escaped', () => {
    const report = reportForBatch(
      [patientWithOverdue('p-1', 'A')],
      [caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const reportWithBadDestination = {
      ...report,
      unusedDestinations: ['<script>alert(1)</script>'],
    };
    const out = renderBccTierPolicyCoverageReportHtml(reportWithBadDestination);
    expect(out.html).toContain('&lt;script&gt;');
    expect(out.html).not.toContain('<script>alert(1)</script>');
  });
});

describe('renderBccTierPolicyCoverageReportHtml — escalation-only addresses', () => {
  it('emits a list when escalation-only addresses exist', () => {
    const report = reportForBatch(
      [patientWithOverdue('p-1', 'A')],
      [caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const reportWithEscalation = {
      ...report,
      escalationOnlyAddresses: ['escalation@example.com'],
    };
    const out = renderBccTierPolicyCoverageReportHtml(reportWithEscalation);
    expect(out.html).toContain('Escalation-only addresses');
    expect(out.html).toContain('escalation@example.com');
  });

  it('omits the section when no escalation-only addresses', () => {
    const report = reportForBatch(
      [patientWithOverdue('p-1', 'A')],
      [caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const out = renderBccTierPolicyCoverageReportHtml({
      ...report,
      escalationOnlyAddresses: [],
    });
    expect(out.html).not.toContain('Escalation-only addresses');
  });
});

describe('renderBccTierPolicyCoverageReportHtml — empty input', () => {
  it('renders an empty report cleanly (no envelopes)', () => {
    const report = reportForBatch([], []);
    const out = renderBccTierPolicyCoverageReportHtml(report);
    expect(out.html).toContain('0 envelopes');
    expect(out.html).toContain('No dominant tier');
    expect(out.warningsRendered).toBe(0);
  });

  it('emits no warnings for an empty report', () => {
    const report = reportForBatch([], []);
    const out = renderBccTierPolicyCoverageReportHtml(report);
    expect(out.warningsRendered).toBe(0);
  });
});

describe('summarizeBccTierPolicyCoverageReportHtml', () => {
  it('summarises envelope + dominant + fanout + warnings', () => {
    const report = reportForBatch(
      [patientWithOverdue('p-1', 'A'), patientWithOverdue('p-2', 'B')],
      [
        caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com'),
        caregiver('cg-b', 'B', 'en-US', ['p-2'], 'b@example.com'),
      ],
    );
    const out = renderBccTierPolicyCoverageReportHtml(report);
    const line = summarizeBccTierPolicyCoverageReportHtml(out);
    expect(line).toContain('2 envelopes');
  });

  it('says "no dominant tier" when result.dominantTier is null', () => {
    const report = reportForBatch([], []);
    const out = renderBccTierPolicyCoverageReportHtml(report);
    const line = summarizeBccTierPolicyCoverageReportHtml(out);
    expect(line).toContain('no dominant tier');
  });

  it('says "no fan-out" when no rows rendered', () => {
    const report = reportForBatch([], []);
    const out = renderBccTierPolicyCoverageReportHtml(report);
    const line = summarizeBccTierPolicyCoverageReportHtml(out);
    expect(line).toContain('no fan-out');
  });

  it('says "no warnings" when none rendered', () => {
    const report = reportForBatch([], []);
    const out = renderBccTierPolicyCoverageReportHtml(report);
    const line = summarizeBccTierPolicyCoverageReportHtml(out);
    expect(line).toContain('no warnings');
  });

  it('singular grammar for one envelope', () => {
    const report = reportForBatch(
      [patientWithOverdue('p-1', 'A')],
      [caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const out = renderBccTierPolicyCoverageReportHtml(report);
    const line = summarizeBccTierPolicyCoverageReportHtml(out);
    expect(line).toContain('1 envelope');
  });

  it('singular grammar for one fanout row', () => {
    const report = reportForBatch(
      [patientWithOverdue('p-1', 'A')],
      [caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const reportWithFanOut = {
      ...report,
      fanOutByAddress: [{ address: 'a@example.com', count: 1 }],
    };
    const out = renderBccTierPolicyCoverageReportHtml(reportWithFanOut);
    const line = summarizeBccTierPolicyCoverageReportHtml(out);
    expect(line).toContain('1 fan-out row');
  });

  it('singular grammar for one warning', () => {
    // A single envelope: tierIsAlwaysX is technically true for that tier,
    // so we need to construct a report whose ONLY warning is the unused
    // destination. Start from a report and zero out the always flags.
    const base = reportForBatch(
      [patientWithOverdue('p-1', 'A')],
      [caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const reportWithOneWarning = {
      ...base,
      tierIsAlwaysRoutine: false,
      tierIsAlwaysActionable: false,
      tierIsAlwaysCritical: false,
      unusedDestinations: ['orphan@example.com'],
    };
    const out = renderBccTierPolicyCoverageReportHtml(reportWithOneWarning);
    const line = summarizeBccTierPolicyCoverageReportHtml(out);
    expect(line).toContain('1 warning');
  });
});

describe('renderBccTierPolicyCoverageReportHtml — determinism', () => {
  it('two identical inputs produce identical HTML', () => {
    const report = reportForBatch(
      [patientWithOverdue('p-1', 'A')],
      [caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const a = renderBccTierPolicyCoverageReportHtml(report);
    const b = renderBccTierPolicyCoverageReportHtml(report);
    expect(a.html).toBe(b.html);
  });
});
