import { describe, it, expect } from 'vitest';
import {
  buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy,
  defaultClassifyFollowupDigestTier,
  filterEnvelopesByTier,
  summarizeBccTierPolicy,
  buildPcpAdminEscalationTierDestinations,
} from '../src/followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-tier-policy';
import type { FollowupDigestHtmlMailerBccEnvelope } from '../src/followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc';
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

function patientWithOneOverdue(patientId: string, name: string) {
  return patientSlice(patientId, name, [
    req({ dueAt: '2026-06-01', title: 'Cardiology overdue' }),
  ]);
}

function silentPatient(patientId: string, name: string) {
  return patientSlice(patientId, name, []);
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
  localeBundles: FollowupDigestI18nBundle[] = [ENGLISH_BUNDLE],
) {
  return buildFollowupDigestCronBatch(patients, caregivers, { localeBundles });
}

describe('defaultClassifyFollowupDigestTier — heuristic', () => {
  it('classifies an envelope with overdue text as critical', () => {
    const env: FollowupDigestHtmlMailerBccEnvelope = {
      caregiverId: 'cg-1',
      caregiverName: 'Carer',
      to: 'c@example.com',
      locale: 'en-US',
      subject: 'Weekly digest',
      text: 'Cardiology: overdue since 2026-06-01.',
      html: '<p>Overdue cardiology</p>',
      patientIds: ['p-1'],
      bcc: [],
    };
    expect(defaultClassifyFollowupDigestTier(env)).toBe('critical');
  });

  it('classifies an envelope with "no follow-ups requiring attention" as routine', () => {
    const env: FollowupDigestHtmlMailerBccEnvelope = {
      caregiverId: 'cg-1',
      caregiverName: 'Carer',
      to: 'c@example.com',
      locale: 'en-US',
      subject: 'Weekly digest',
      text: 'No follow-ups requiring attention this week.',
      html: '<p>Quiet</p>',
      patientIds: ['p-1'],
      bcc: [],
    };
    expect(defaultClassifyFollowupDigestTier(env)).toBe('routine');
  });

  it('classifies anything else as actionable', () => {
    const env: FollowupDigestHtmlMailerBccEnvelope = {
      caregiverId: 'cg-1',
      caregiverName: 'Carer',
      to: 'c@example.com',
      locale: 'en-US',
      subject: 'Weekly digest',
      text: 'Cardiology due soon.',
      html: '<p>Due soon</p>',
      patientIds: ['p-1'],
      bcc: [],
    };
    expect(defaultClassifyFollowupDigestTier(env)).toBe('actionable');
  });
});

describe('buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy — tier-aware BCC filtering', () => {
  it('produces one envelope per caregiver', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg-a', 'A carer', 'en-US', ['p-1'], 'a@example.com')],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b);
    expect(out.envelopes).toHaveLength(1);
  });

  it('classifies an overdue envelope as critical', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg-a', 'A carer', 'en-US', ['p-1'], 'a@example.com')],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b);
    expect(out.envelopes[0]?.tier).toBe('critical');
  });

  it('includes a BCC address when its eligibleTiers covers the envelope tier', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg-a', 'A carer', 'en-US', ['p-1'], 'a@example.com')],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b, {
      bccDestinations: [
        { address: 'pcp@example.com', eligibleTiers: ['actionable', 'critical'] },
      ],
    });
    expect(out.envelopes[0]?.bcc).toContain('pcp@example.com');
  });

  it('drops a BCC address when its eligibleTiers excludes the envelope tier', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg-a', 'A carer', 'en-US', ['p-1'], 'a@example.com')],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b, {
      bccDestinations: [
        { address: 'admin@example.com', eligibleTiers: ['routine'] },
      ],
    });
    expect(out.envelopes[0]?.tier).toBe('critical');
    expect(out.envelopes[0]?.bcc).not.toContain('admin@example.com');
  });

  it('includes a BCC with no eligibleTiers on every tier', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg-a', 'A carer', 'en-US', ['p-1'], 'a@example.com')],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b, {
      bccDestinations: [{ address: 'admin@example.com' }],
    });
    expect(out.envelopes[0]?.bcc).toContain('admin@example.com');
  });

  it('honours forCaregiverIds scope alongside tier filter', () => {
    const b = batch(
      [
        patientWithOneOverdue('p-1', 'Alice'),
        patientWithOneOverdue('p-2', 'Bob'),
      ],
      [
        caregiver('cg-a', 'A carer', 'en-US', ['p-1'], 'a@example.com'),
        caregiver('cg-b', 'B carer', 'en-US', ['p-2'], 'b@example.com'),
      ],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b, {
      bccDestinations: [
        {
          address: 'pcp@example.com',
          eligibleTiers: ['critical'],
          forCaregiverIds: ['cg-a'],
        },
      ],
    });
    const a = out.envelopes.find((e) => e.caregiverId === 'cg-a');
    const bEnv = out.envelopes.find((e) => e.caregiverId === 'cg-b');
    expect(a?.bcc).toContain('pcp@example.com');
    expect(bEnv?.bcc).not.toContain('pcp@example.com');
  });

  it('honours excludeCaregiverIds scope alongside tier filter', () => {
    const b = batch(
      [
        patientWithOneOverdue('p-1', 'Alice'),
        patientWithOneOverdue('p-2', 'Bob'),
      ],
      [
        caregiver('cg-a', 'A carer', 'en-US', ['p-1'], 'a@example.com'),
        caregiver('cg-b', 'B carer', 'en-US', ['p-2'], 'b@example.com'),
      ],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b, {
      bccDestinations: [
        {
          address: 'pcp@example.com',
          eligibleTiers: ['critical'],
          excludeCaregiverIds: ['cg-a'],
        },
      ],
    });
    const a = out.envelopes.find((e) => e.caregiverId === 'cg-a');
    const bEnv = out.envelopes.find((e) => e.caregiverId === 'cg-b');
    expect(a?.bcc).not.toContain('pcp@example.com');
    expect(bEnv?.bcc).toContain('pcp@example.com');
  });

  it('uses a custom classifier when provided', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg-a', 'A carer', 'en-US', ['p-1'], 'a@example.com')],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b, {
      classifyTier: () => 'routine',
      bccDestinations: [{ address: 'pcp@example.com', eligibleTiers: ['routine'] }],
    });
    expect(out.envelopes[0]?.tier).toBe('routine');
    expect(out.envelopes[0]?.bcc).toContain('pcp@example.com');
  });
});

describe('buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy — coverage', () => {
  it('rolls up counts by tier', () => {
    const b = batch(
      [
        patientWithOneOverdue('p-1', 'Alice'),
        patientWithOneOverdue('p-2', 'Bob'),
      ],
      [
        caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com'),
        caregiver('cg-b', 'B', 'en-US', ['p-2'], 'b@example.com'),
      ],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b);
    expect(out.coverage.countsByTier.critical).toBe(2);
    expect(out.coverage.envelopeCount).toBe(2);
  });

  it('surfaces unused destinations (declared but never matched)', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b, {
      bccDestinations: [
        { address: 'used@example.com', eligibleTiers: ['critical'] },
        { address: 'unused@example.com', eligibleTiers: ['routine'] },
      ],
    });
    expect(out.coverage.unusedDestinations).toContain('unused@example.com');
    expect(out.coverage.unusedDestinations).not.toContain('used@example.com');
  });

  it('rolls up bccEnvelopeCountByTier per tier', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b, {
      bccDestinations: [
        { address: 'pcp@example.com', eligibleTiers: ['critical'] },
      ],
    });
    expect(out.coverage.bccEnvelopeCountByTier.critical).toBe(1);
    expect(out.coverage.bccEnvelopeCountByTier.routine).toBe(0);
  });

  it('tracks fanOutByAddress across tier filtering', () => {
    const b = batch(
      [
        patientWithOneOverdue('p-1', 'Alice'),
        patientWithOneOverdue('p-2', 'Bob'),
      ],
      [
        caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com'),
        caregiver('cg-b', 'B', 'en-US', ['p-2'], 'b@example.com'),
      ],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b, {
      bccDestinations: [{ address: 'pcp@example.com', eligibleTiers: ['critical'] }],
    });
    expect(out.coverage.fanOutByAddress.get('pcp@example.com')).toBe(2);
  });

  it('byCaregiverId map mirrors envelopes', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b);
    expect(out.byCaregiverId.get('cg-a')?.caregiverId).toBe('cg-a');
  });
});

describe('filterEnvelopesByTier', () => {
  it('returns only envelopes matching the requested tier', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b);
    const critical = filterEnvelopesByTier(out, 'critical');
    const routine = filterEnvelopesByTier(out, 'routine');
    expect(critical).toHaveLength(1);
    expect(routine).toHaveLength(0);
  });
});

describe('summarizeBccTierPolicy', () => {
  it('produces a one-line summary with tier counts', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b);
    const line = summarizeBccTierPolicy(out);
    expect(line).toContain('1 envelope');
    expect(line).toContain('1 critical');
    expect(line).toContain('no unused destinations');
  });

  it('notes unused destinations in the summary line', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b, {
      bccDestinations: [{ address: 'unused@example.com', eligibleTiers: ['routine'] }],
    });
    const line = summarizeBccTierPolicy(out);
    expect(line).toContain('1 unused destination');
  });
});

describe('buildPcpAdminEscalationTierDestinations', () => {
  it('produces three destinations with the canonical tier ordering', () => {
    const dests = buildPcpAdminEscalationTierDestinations(
      'pcp@example.com',
      'admin@example.com',
      'escalation@example.com',
    );
    expect(dests).toHaveLength(3);
    const admin = dests.find((d) => d.address === 'admin@example.com');
    const pcp = dests.find((d) => d.address === 'pcp@example.com');
    const esc = dests.find((d) => d.address === 'escalation@example.com');
    expect(admin?.eligibleTiers).toEqual(['routine', 'actionable', 'critical']);
    expect(pcp?.eligibleTiers).toEqual(['actionable', 'critical']);
    expect(esc?.eligibleTiers).toEqual(['critical']);
  });

  it('plugs into the tier policy builder cleanly', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const dests = buildPcpAdminEscalationTierDestinations(
      'pcp@example.com',
      'admin@example.com',
      'escalation@example.com',
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b, {
      bccDestinations: dests,
    });
    // Critical envelope -> all three addresses match.
    expect(out.envelopes[0]?.bcc).toContain('pcp@example.com');
    expect(out.envelopes[0]?.bcc).toContain('admin@example.com');
    expect(out.envelopes[0]?.bcc).toContain('escalation@example.com');
  });
});

describe('Silent caregivers forward through tier policy', () => {
  it('forwards silent caregivers from the base BCC mailer', () => {
    const b = batch(
      [silentPatient('p-silent', 'Quiet')],
      [caregiver('cg-silent', 'Silent', 'en-US', ['p-silent'], 'q@example.com')],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithBccTierPolicy(b);
    expect(out.silent.find((s) => s.caregiverId === 'cg-silent')).toBeDefined();
  });
});
