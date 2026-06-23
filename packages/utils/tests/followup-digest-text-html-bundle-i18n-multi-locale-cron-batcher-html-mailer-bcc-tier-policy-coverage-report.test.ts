import { describe, it, expect } from 'vitest';
import { buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy } from '../src/followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy';
import {
  buildBccTierPolicyCoverageReport,
  detectBccTierPolicyCoverageWarnings,
  summarizeBccTierPolicyCoverageReport,
} from '../src/followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy-coverage-report';
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
  return patientSlice(id, name, [req({ dueAt: '2026-06-01', title: 'Cardiology overdue' })]);
}
function patientWithDueSoon(id: string, name: string) {
  return patientSlice(id, name, [req({ dueAt: '2026-06-25', title: 'Visit due soon' })]);
}
function silentPatient(id: string, name: string) {
  return patientSlice(id, name, []);
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

describe('buildBccTierPolicyCoverageReport — shape', () => {
  it('reports envelopeCount = total envelopes', () => {
    const b = batch(
      [patientWithOverdue('p-1', 'Alice'), patientWithOverdue('p-2', 'Bob')],
      [
        caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com'),
        caregiver('cg-b', 'B', 'en-US', ['p-2'], 'b@example.com'),
      ],
    );
    const tier = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b);
    const report = buildBccTierPolicyCoverageReport(tier);
    expect(report.envelopeCount).toBe(2);
  });

  it('mirrors countsByTier from the underlying coverage', () => {
    const b = batch(
      [patientWithOverdue('p-1', 'Alice'), patientWithDueSoon('p-2', 'Bob')],
      [
        caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com'),
        caregiver('cg-b', 'B', 'en-US', ['p-2'], 'b@example.com'),
      ],
    );
    const tier = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b);
    const report = buildBccTierPolicyCoverageReport(tier);
    expect(report.countsByTier.critical).toBe(1);
    expect(report.countsByTier.actionable).toBe(1);
    expect(report.countsByTier.routine).toBe(0);
  });

  it('mirrors bccEnvelopeCountByTier from the underlying coverage', () => {
    const b = batch(
      [patientWithOverdue('p-1', 'Alice')],
      [caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const tier = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b, {
      bccDestinations: [{ address: 'pcp@example.com', eligibleTiers: ['critical'] }],
    });
    const report = buildBccTierPolicyCoverageReport(tier);
    expect(report.bccEnvelopeCountByTier.critical).toBe(1);
  });
});

describe('buildBccTierPolicyCoverageReport — distribution', () => {
  it('computes per-tier ratios summing to ~1', () => {
    const b = batch(
      [
        patientWithOverdue('p-1', 'A'),
        patientWithOverdue('p-2', 'B'),
        patientWithDueSoon('p-3', 'C'),
        silentPatient('p-4', 'D'),
      ],
      [
        caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com'),
        caregiver('cg-b', 'B', 'en-US', ['p-2'], 'b@example.com'),
        caregiver('cg-c', 'C', 'en-US', ['p-3'], 'c@example.com'),
        caregiver('cg-d', 'D', 'en-US', ['p-4'], 'd@example.com'),
      ],
    );
    const tier = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b);
    const report = buildBccTierPolicyCoverageReport(tier);
    const sum =
      report.tierDistribution.routine +
      report.tierDistribution.actionable +
      report.tierDistribution.critical;
    expect(Math.abs(sum - 1)).toBeLessThan(0.001);
  });

  it('distribution is zero across the board when envelopeCount is zero', () => {
    const b = batch([], []);
    const tier = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b);
    const report = buildBccTierPolicyCoverageReport(tier);
    expect(report.tierDistribution.routine).toBe(0);
    expect(report.tierDistribution.actionable).toBe(0);
    expect(report.tierDistribution.critical).toBe(0);
  });
});

describe('buildBccTierPolicyCoverageReport — fanOut (JSON-friendly)', () => {
  it('emits fanOutByAddress as a sorted array (desc by count)', () => {
    const b = batch(
      [patientWithOverdue('p-1', 'Alice'), patientWithOverdue('p-2', 'Bob')],
      [
        caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com'),
        caregiver('cg-b', 'B', 'en-US', ['p-2'], 'b@example.com'),
      ],
    );
    const tier = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b, {
      bccDestinations: [
        { address: 'admin@example.com' },
        { address: 'pcp@example.com', eligibleTiers: ['critical'] },
      ],
    });
    const report = buildBccTierPolicyCoverageReport(tier);
    expect(Array.isArray(report.fanOutByAddress)).toBe(true);
    // admin BCC'd on every envelope (no eligible filter); pcp BCC'd
    // on every critical envelope. Both = 2 envelopes => same count;
    // sort breaks ties alphabetically.
    expect(report.fanOutByAddress[0]?.count).toBe(2);
  });

  it('emits totalBccHeadersShipped as the sum of fan-out counts', () => {
    const b = batch(
      [patientWithOverdue('p-1', 'Alice'), patientWithOverdue('p-2', 'Bob')],
      [
        caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com'),
        caregiver('cg-b', 'B', 'en-US', ['p-2'], 'b@example.com'),
      ],
    );
    const tier = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b, {
      bccDestinations: [{ address: 'admin@example.com' }],
    });
    const report = buildBccTierPolicyCoverageReport(tier);
    expect(report.totalBccHeadersShipped).toBe(2);
  });

  it('emits per-tier fan-out for the relevant tiers', () => {
    const b = batch(
      [patientWithOverdue('p-1', 'A'), patientWithDueSoon('p-2', 'B')],
      [
        caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com'),
        caregiver('cg-b', 'B', 'en-US', ['p-2'], 'b@example.com'),
      ],
    );
    const tier = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b, {
      bccDestinations: [
        { address: 'pcp@example.com', eligibleTiers: ['critical'] },
        { address: 'admin@example.com' },
      ],
    });
    const report = buildBccTierPolicyCoverageReport(tier);
    expect(report.fanOutByTier.critical.find((e) => e.address === 'pcp@example.com')?.count).toBe(1);
    expect(report.fanOutByTier.critical.find((e) => e.address === 'admin@example.com')?.count).toBe(1);
    expect(report.fanOutByTier.actionable.find((e) => e.address === 'admin@example.com')?.count).toBe(1);
    expect(report.fanOutByTier.actionable.find((e) => e.address === 'pcp@example.com')).toBeUndefined();
  });
});

describe('buildBccTierPolicyCoverageReport — escalation-only', () => {
  it('flags addresses that only fire on a single tier as escalation-only', () => {
    const b = batch(
      [patientWithOverdue('p-1', 'A'), patientWithDueSoon('p-2', 'B')],
      [
        caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com'),
        caregiver('cg-b', 'B', 'en-US', ['p-2'], 'b@example.com'),
      ],
    );
    const tier = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b, {
      bccDestinations: [
        { address: 'pcp@example.com', eligibleTiers: ['critical'] },
        { address: 'admin@example.com' }, // every tier
      ],
    });
    const report = buildBccTierPolicyCoverageReport(tier);
    expect(report.escalationOnlyAddresses).toContain('pcp@example.com');
    expect(report.escalationOnlyAddresses).not.toContain('admin@example.com');
  });

  it('returns empty escalation-only list when every address fires on every tier', () => {
    const b = batch(
      [patientWithOverdue('p-1', 'A')],
      [caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const tier = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b, {
      bccDestinations: [{ address: 'admin@example.com' }],
    });
    const report = buildBccTierPolicyCoverageReport(tier);
    // Only one tier exists (critical); admin fires on it, so 1
    // tier-membership-count = escalation-only.
    expect(report.escalationOnlyAddresses).toContain('admin@example.com');
  });
});

describe('buildBccTierPolicyCoverageReport — unused destinations', () => {
  it('reports declared addresses that never matched any envelope', () => {
    const b = batch(
      [patientWithDueSoon('p-1', 'Alice')], // actionable, no critical
      [caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const tier = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b, {
      bccDestinations: [
        { address: 'escalation@example.com', eligibleTiers: ['critical'] },
      ],
    });
    const report = buildBccTierPolicyCoverageReport(tier);
    expect(report.unusedDestinations).toContain('escalation@example.com');
  });

  it('sorts unusedDestinations ascending', () => {
    const b = batch(
      [patientWithDueSoon('p-1', 'Alice')],
      [caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const tier = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b, {
      bccDestinations: [
        { address: 'zeta@example.com', eligibleTiers: ['critical'] },
        { address: 'alpha@example.com', eligibleTiers: ['critical'] },
      ],
    });
    const report = buildBccTierPolicyCoverageReport(tier);
    expect(report.unusedDestinations).toEqual(['alpha@example.com', 'zeta@example.com']);
  });
});

describe('buildBccTierPolicyCoverageReport — dominantTier', () => {
  it('returns the tier with the most envelopes', () => {
    const b = batch(
      [
        patientWithOverdue('p-1', 'A'),
        patientWithOverdue('p-2', 'B'),
        patientWithDueSoon('p-3', 'C'),
      ],
      [
        caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com'),
        caregiver('cg-b', 'B', 'en-US', ['p-2'], 'b@example.com'),
        caregiver('cg-c', 'C', 'en-US', ['p-3'], 'c@example.com'),
      ],
    );
    const tier = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b);
    const report = buildBccTierPolicyCoverageReport(tier);
    expect(report.dominantTier).toBe('critical');
  });

  it('returns null on a tie', () => {
    const b = batch(
      [patientWithOverdue('p-1', 'A'), patientWithDueSoon('p-2', 'B')],
      [
        caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com'),
        caregiver('cg-b', 'B', 'en-US', ['p-2'], 'b@example.com'),
      ],
    );
    const tier = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b);
    const report = buildBccTierPolicyCoverageReport(tier);
    expect(report.dominantTier).toBeNull();
  });

  it('returns null on empty input', () => {
    const b = batch([], []);
    const tier = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b);
    const report = buildBccTierPolicyCoverageReport(tier);
    expect(report.dominantTier).toBeNull();
  });
});

describe('buildBccTierPolicyCoverageReport — always-* flags', () => {
  it('tierIsAlwaysCritical=true when every envelope is critical', () => {
    const b = batch(
      [patientWithOverdue('p-1', 'A'), patientWithOverdue('p-2', 'B')],
      [
        caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com'),
        caregiver('cg-b', 'B', 'en-US', ['p-2'], 'b@example.com'),
      ],
    );
    const tier = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b);
    const report = buildBccTierPolicyCoverageReport(tier);
    expect(report.tierIsAlwaysCritical).toBe(true);
    expect(report.tierIsAlwaysRoutine).toBe(false);
    expect(report.tierIsAlwaysActionable).toBe(false);
  });

  it('all-flags=false on a mixed mix', () => {
    const b = batch(
      [patientWithOverdue('p-1', 'A'), patientWithDueSoon('p-2', 'B')],
      [
        caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com'),
        caregiver('cg-b', 'B', 'en-US', ['p-2'], 'b@example.com'),
      ],
    );
    const tier = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b);
    const report = buildBccTierPolicyCoverageReport(tier);
    expect(report.tierIsAlwaysCritical).toBe(false);
    expect(report.tierIsAlwaysActionable).toBe(false);
    expect(report.tierIsAlwaysRoutine).toBe(false);
  });

  it('all-flags=false on empty input (counts==0 must NOT trigger always-*)', () => {
    const b = batch([], []);
    const tier = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b);
    const report = buildBccTierPolicyCoverageReport(tier);
    expect(report.tierIsAlwaysCritical).toBe(false);
    expect(report.tierIsAlwaysActionable).toBe(false);
    expect(report.tierIsAlwaysRoutine).toBe(false);
  });
});

describe('buildBccTierPolicyCoverageReport — topFanout', () => {
  it('returns the highest fan-out address', () => {
    const b = batch(
      [patientWithOverdue('p-1', 'A'), patientWithOverdue('p-2', 'B')],
      [
        caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com'),
        caregiver('cg-b', 'B', 'en-US', ['p-2'], 'b@example.com'),
      ],
    );
    const tier = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b, {
      bccDestinations: [
        { address: 'admin@example.com' }, // every tier
        { address: 'pcp@example.com', eligibleTiers: ['critical'] },
      ],
    });
    const report = buildBccTierPolicyCoverageReport(tier);
    // Both fan-out 2 (every envelope is critical). Tied; sort by address ASC.
    expect(report.topFanoutCount).toBe(2);
    expect(report.topFanoutAddress).toBe('admin@example.com');
  });

  it('topFanoutAddress is null when no BCC fired', () => {
    const b = batch(
      [patientWithDueSoon('p-1', 'Alice')],
      [caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const tier = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b);
    const report = buildBccTierPolicyCoverageReport(tier);
    expect(report.topFanoutAddress).toBeNull();
    expect(report.topFanoutCount).toBe(0);
  });
});

describe('detectBccTierPolicyCoverageWarnings', () => {
  it('flags tier-always-critical', () => {
    const b = batch(
      [patientWithOverdue('p-1', 'A')],
      [caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const tier = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b);
    const report = buildBccTierPolicyCoverageReport(tier);
    expect(detectBccTierPolicyCoverageWarnings(report)).toContain('Channel always critical');
  });

  it('flags every unused destination by address', () => {
    const b = batch(
      [patientWithDueSoon('p-1', 'Alice')],
      [caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const tier = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b, {
      bccDestinations: [
        { address: 'esc@example.com', eligibleTiers: ['critical'] },
      ],
    });
    const report = buildBccTierPolicyCoverageReport(tier);
    expect(detectBccTierPolicyCoverageWarnings(report)).toContain(
      'Unused destination: esc@example.com',
    );
  });

  it('returns empty array when nothing is amiss', () => {
    const b = batch(
      [patientWithOverdue('p-1', 'A'), patientWithDueSoon('p-2', 'B')],
      [
        caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com'),
        caregiver('cg-b', 'B', 'en-US', ['p-2'], 'b@example.com'),
      ],
    );
    const tier = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b);
    const report = buildBccTierPolicyCoverageReport(tier);
    expect(detectBccTierPolicyCoverageWarnings(report)).toEqual([]);
  });
});

describe('summarizeBccTierPolicyCoverageReport', () => {
  it('emits a one-line summary with envelope count + distribution', () => {
    const b = batch(
      [patientWithOverdue('p-1', 'A'), patientWithDueSoon('p-2', 'B')],
      [
        caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com'),
        caregiver('cg-b', 'B', 'en-US', ['p-2'], 'b@example.com'),
      ],
    );
    const tier = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b);
    const report = buildBccTierPolicyCoverageReport(tier);
    const line = summarizeBccTierPolicyCoverageReport(report);
    expect(line).toContain('BCC tier-policy coverage: 2 envelopes');
    expect(line).toMatch(/critical/);
    expect(line).not.toContain('\n');
  });

  it('reports dominant=none on a tie', () => {
    const b = batch(
      [patientWithOverdue('p-1', 'A'), patientWithDueSoon('p-2', 'B')],
      [
        caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com'),
        caregiver('cg-b', 'B', 'en-US', ['p-2'], 'b@example.com'),
      ],
    );
    const tier = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b);
    const report = buildBccTierPolicyCoverageReport(tier);
    const line = summarizeBccTierPolicyCoverageReport(report);
    expect(line).toContain('dominant=none');
  });

  it('singularises "envelope" / "destination" / "address" for 1', () => {
    const b = batch(
      [patientWithOverdue('p-1', 'A')],
      [caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const tier = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b, {
      bccDestinations: [
        { address: 'admin@example.com' },
        { address: 'unused@example.com', eligibleTiers: ['routine'] },
      ],
    });
    const report = buildBccTierPolicyCoverageReport(tier);
    const line = summarizeBccTierPolicyCoverageReport(report);
    expect(line).toContain('1 envelope');
    expect(line).toContain('1 unused destination');
    expect(line).toContain('1 escalation-only address');
  });

  it('reports "no BCC fan-out" when no BCC fired', () => {
    const b = batch(
      [patientWithOverdue('p-1', 'A')],
      [caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const tier = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b);
    const report = buildBccTierPolicyCoverageReport(tier);
    const line = summarizeBccTierPolicyCoverageReport(report);
    expect(line).toContain('no BCC fan-out');
  });
});

describe('buildBccTierPolicyCoverageReport — JSON serialisability', () => {
  it('the report round-trips through JSON.stringify / JSON.parse', () => {
    const b = batch(
      [patientWithOverdue('p-1', 'Alice'), patientWithDueSoon('p-2', 'Bob')],
      [
        caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com'),
        caregiver('cg-b', 'B', 'en-US', ['p-2'], 'b@example.com'),
      ],
    );
    const tier = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b, {
      bccDestinations: [
        { address: 'admin@example.com' },
        { address: 'pcp@example.com', eligibleTiers: ['critical'] },
      ],
    });
    const report = buildBccTierPolicyCoverageReport(tier);
    const json = JSON.stringify(report);
    const parsed = JSON.parse(json);
    expect(parsed.envelopeCount).toBe(report.envelopeCount);
    expect(parsed.countsByTier.critical).toBe(report.countsByTier.critical);
    expect(parsed.fanOutByAddress).toHaveLength(report.fanOutByAddress.length);
  });
});
