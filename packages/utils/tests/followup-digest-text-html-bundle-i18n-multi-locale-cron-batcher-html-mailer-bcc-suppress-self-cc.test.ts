import { describe, it, expect } from 'vitest';
import {
  buildFollowupDigestHtmlMailerEnvelopesWithSelfCcSuppression,
  summarizeSelfCcSuppression,
  collectPostSuppressionBccAddresses,
} from '../src/followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc-suppress-self-cc';
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
    req({ dueAt: '2026-06-01', title: 'Cardiology' }),
  ]);
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

describe('self-CC suppression — default policy (suppress-when-primary-elsewhere)', () => {
  it('removes a BCC entry that is a primary on another envelope', () => {
    // alice gets her envelope; admin is her BCC; admin is ALSO a
    // primary on his own envelope. The admin BCC on alice's envelope
    // is redundant — admin gets a primary on his own envelope.
    const b = batch(
      [
        patientWithOneOverdue('p-1', 'Alice'),
        patientWithOneOverdue('p-2', 'Admin patient'),
      ],
      [
        caregiver('cg-alice', 'Alice', 'en-US', ['p-1'], 'alice@example.com'),
        caregiver('cg-admin', 'Admin', 'en-US', ['p-2'], 'admin@example.com'),
      ],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithSelfCcSuppression(b, {
      bccDestinations: [{ address: 'admin@example.com' }],
    });
    const alice = out.byCaregiverId.get('cg-alice');
    const admin = out.byCaregiverId.get('cg-admin');
    expect(alice?.bcc).toEqual([]); // admin removed
    expect(admin?.bcc).toEqual([]); // dropPrimaryFromBcc already cleared
    expect(out.coverage.totalSelfCcSuppressions).toBeGreaterThanOrEqual(1);
  });

  it('does NOT suppress when the BCC address is not a primary anywhere', () => {
    const b = batch(
      [
        patientWithOneOverdue('p-1', 'Alice'),
        patientWithOneOverdue('p-2', 'Bob'),
      ],
      [
        caregiver('cg-alice', 'Alice', 'en-US', ['p-1'], 'alice@example.com'),
        caregiver('cg-bob', 'Bob', 'en-US', ['p-2'], 'bob@example.com'),
      ],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithSelfCcSuppression(b, {
      bccDestinations: [{ address: 'pcp-external@example.com' }],
    });
    for (const env of out.envelopes) {
      expect(env.bcc).toContain('pcp-external@example.com');
    }
    expect(out.coverage.totalSelfCcSuppressions).toBe(0);
  });

  it('preserves the BCC for an address explicitly in preserveAddresses', () => {
    const b = batch(
      [
        patientWithOneOverdue('p-1', 'Alice'),
        patientWithOneOverdue('p-2', 'Admin patient'),
      ],
      [
        caregiver('cg-alice', 'Alice', 'en-US', ['p-1'], 'alice@example.com'),
        caregiver('cg-admin', 'Admin', 'en-US', ['p-2'], 'admin@example.com'),
      ],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithSelfCcSuppression(b, {
      bccDestinations: [{ address: 'admin@example.com' }],
      preserveAddresses: ['admin@example.com'],
    });
    const alice = out.byCaregiverId.get('cg-alice');
    // Preserved: admin still appears as BCC on alice's envelope.
    expect(alice?.bcc).toEqual(['admin@example.com']);
    expect(out.coverage.preservedAddresses).toEqual(['admin@example.com']);
  });

  it('counts self-suppressions per address', () => {
    const b = batch(
      [
        patientWithOneOverdue('p-1', 'Alice'),
        patientWithOneOverdue('p-2', 'Bob'),
        patientWithOneOverdue('p-3', 'Carol'),
        patientWithOneOverdue('p-4', 'Admin patient'),
      ],
      [
        caregiver('cg-alice', 'Alice', 'en-US', ['p-1'], 'alice@example.com'),
        caregiver('cg-bob', 'Bob', 'en-US', ['p-2'], 'bob@example.com'),
        caregiver('cg-carol', 'Carol', 'en-US', ['p-3'], 'carol@example.com'),
        caregiver('cg-admin', 'Admin', 'en-US', ['p-4'], 'admin@example.com'),
      ],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithSelfCcSuppression(b, {
      bccDestinations: [{ address: 'admin@example.com' }],
    });
    // alice / bob / carol all had admin stripped (3 suppressions).
    // admin's own envelope: dropPrimaryFromBcc already cleared.
    expect(out.coverage.selfCcSuppressedByAddress.get('admin@example.com')).toBe(3);
    expect(out.coverage.totalSelfCcSuppressions).toBeGreaterThanOrEqual(3);
  });

  it('handles multiple primary addresses being suppressed in one batch', () => {
    const b = batch(
      [
        patientWithOneOverdue('p-1', 'Alice'),
        patientWithOneOverdue('p-2', 'Admin patient'),
        patientWithOneOverdue('p-3', 'PCP patient'),
      ],
      [
        caregiver('cg-alice', 'Alice', 'en-US', ['p-1'], 'alice@example.com'),
        caregiver('cg-admin', 'Admin', 'en-US', ['p-2'], 'admin@example.com'),
        caregiver('cg-pcp', 'PCP', 'en-US', ['p-3'], 'pcp@example.com'),
      ],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithSelfCcSuppression(b, {
      bccDestinations: [
        { address: 'admin@example.com' },
        { address: 'pcp@example.com' },
      ],
    });
    const alice = out.byCaregiverId.get('cg-alice');
    expect(alice?.bcc).toEqual([]); // both admin AND pcp suppressed
    expect(out.coverage.selfCcSuppressedByAddress.get('admin@example.com')).toBe(2); // alice + pcp
    expect(out.coverage.selfCcSuppressedByAddress.get('pcp@example.com')).toBe(2); // alice + admin
  });
});

describe('self-CC suppression — preserve-all policy', () => {
  it('leaves BCC arrays untouched under preserve-all', () => {
    const b = batch(
      [
        patientWithOneOverdue('p-1', 'Alice'),
        patientWithOneOverdue('p-2', 'Admin patient'),
      ],
      [
        caregiver('cg-alice', 'Alice', 'en-US', ['p-1'], 'alice@example.com'),
        caregiver('cg-admin', 'Admin', 'en-US', ['p-2'], 'admin@example.com'),
      ],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithSelfCcSuppression(b, {
      bccDestinations: [{ address: 'admin@example.com' }],
      selfSuppressPolicy: 'preserve-all',
    });
    const alice = out.byCaregiverId.get('cg-alice');
    expect(alice?.bcc).toEqual(['admin@example.com']);
    expect(out.coverage.totalSelfCcSuppressions).toBe(0);
    expect(out.coverage.selfCcSuppressedByAddress.size).toBe(0);
  });
});

describe('self-CC suppression — base interaction', () => {
  it('still drops the envelope-own primary from its OWN bcc (composes with dropPrimaryFromBcc)', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [
        caregiver(
          'cg-admin',
          'Admin',
          'en-US',
          ['p-1'],
          'admin@example.com',
        ),
      ],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithSelfCcSuppression(b, {
      bccDestinations: [{ address: 'admin@example.com' }],
    });
    expect(out.envelopes[0]?.bcc).toEqual([]);
  });

  it('forwards silent caregivers from the base mailer unchanged', () => {
    const b = batch(
      [patientSlice('p-silent', 'Quiet', [])],
      [
        caregiver(
          'cg-silent',
          'Silent carer',
          'en-US',
          ['p-silent'],
          'q@example.com',
        ),
      ],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithSelfCcSuppression(b);
    expect(out.silent.find((s) => s.caregiverId === 'cg-silent')).toBeDefined();
  });

  it('byCaregiverId map is keyed on caregiverId after suppression', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithSelfCcSuppression(b);
    expect(out.byCaregiverId.get('cg-a')?.caregiverId).toBe('cg-a');
  });

  it('recomputes fanOutByAddress to reflect post-suppression delivery counts', () => {
    const b = batch(
      [
        patientWithOneOverdue('p-1', 'Alice'),
        patientWithOneOverdue('p-2', 'Bob'),
        patientWithOneOverdue('p-3', 'Admin patient'),
      ],
      [
        caregiver('cg-alice', 'Alice', 'en-US', ['p-1'], 'alice@example.com'),
        caregiver('cg-bob', 'Bob', 'en-US', ['p-2'], 'bob@example.com'),
        caregiver('cg-admin', 'Admin', 'en-US', ['p-3'], 'admin@example.com'),
      ],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithSelfCcSuppression(b, {
      bccDestinations: [
        { address: 'admin@example.com' },
        { address: 'pcp-external@example.com' },
      ],
    });
    // pcp-external isn't a primary anywhere; survives on all 3 envelopes.
    expect(out.coverage.fanOutByAddress.get('pcp-external@example.com')).toBe(3);
    // admin gets stripped from all 3 envelopes (alice/bob via cross-primary,
    // admin via own primary).
    expect(out.coverage.fanOutByAddress.get('admin@example.com') ?? 0).toBe(0);
  });
});

describe('summarizeSelfCcSuppression', () => {
  it('reports none-applied when no suppressions fire', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithSelfCcSuppression(b);
    expect(summarizeSelfCcSuppression(out)).toBe(
      'Self-CC suppression: none applied.',
    );
  });

  it('reports the count + the per-address breakdown', () => {
    const b = batch(
      [
        patientWithOneOverdue('p-1', 'Alice'),
        patientWithOneOverdue('p-2', 'Bob'),
        patientWithOneOverdue('p-3', 'Admin patient'),
      ],
      [
        caregiver('cg-alice', 'Alice', 'en-US', ['p-1'], 'alice@example.com'),
        caregiver('cg-bob', 'Bob', 'en-US', ['p-2'], 'bob@example.com'),
        caregiver('cg-admin', 'Admin', 'en-US', ['p-3'], 'admin@example.com'),
      ],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithSelfCcSuppression(b, {
      bccDestinations: [{ address: 'admin@example.com' }],
    });
    const s = summarizeSelfCcSuppression(out);
    expect(s).toContain('admin@example.com');
    expect(s).toContain('Self-CC suppression');
    expect(s).toMatch(/entries? suppressed/);
  });

  it('flags preserve-all policy via summary tag', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithSelfCcSuppression(b, {
      selfSuppressPolicy: 'preserve-all',
    });
    expect(
      summarizeSelfCcSuppression(out, { policyTag: 'preserve-all' }),
    ).toContain('preserve-all');
  });

  it('mentions preserved addresses in the summary when suppressions also fire', () => {
    // Three envelopes: alice, bob, admin. PreserveAddresses contains admin,
    // so admin BCCs survive. But pcp@... is also a primary elsewhere via
    // cg-pcp, so the pcp BCCs ARE suppressed (giving us a non-zero count).
    const b = batch(
      [
        patientWithOneOverdue('p-1', 'Alice'),
        patientWithOneOverdue('p-2', 'Admin patient'),
        patientWithOneOverdue('p-3', 'PCP patient'),
      ],
      [
        caregiver('cg-alice', 'Alice', 'en-US', ['p-1'], 'alice@example.com'),
        caregiver('cg-admin', 'Admin', 'en-US', ['p-2'], 'admin@example.com'),
        caregiver('cg-pcp', 'PCP', 'en-US', ['p-3'], 'pcp@example.com'),
      ],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithSelfCcSuppression(b, {
      bccDestinations: [
        { address: 'admin@example.com' },
        { address: 'pcp@example.com' },
      ],
      preserveAddresses: ['admin@example.com'],
    });
    // pcp is suppressed because it's a primary on cg-pcp; admin preserved.
    expect(out.coverage.totalSelfCcSuppressions).toBeGreaterThan(0);
    expect(out.coverage.preservedAddresses).toContain('admin@example.com');
    const s = summarizeSelfCcSuppression(out);
    expect(s).toContain('preserved');
  });
});

describe('collectPostSuppressionBccAddresses', () => {
  it('returns the addresses that survive suppression', () => {
    const b = batch(
      [
        patientWithOneOverdue('p-1', 'Alice'),
        patientWithOneOverdue('p-2', 'Admin patient'),
      ],
      [
        caregiver('cg-alice', 'Alice', 'en-US', ['p-1'], 'alice@example.com'),
        caregiver('cg-admin', 'Admin', 'en-US', ['p-2'], 'admin@example.com'),
      ],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithSelfCcSuppression(b, {
      bccDestinations: [
        { address: 'admin@example.com' },
        { address: 'pcp-external@example.com' },
      ],
    });
    const addresses = collectPostSuppressionBccAddresses(out);
    expect(addresses).toContain('pcp-external@example.com');
    expect(addresses).not.toContain('admin@example.com');
  });

  it('returns a sorted list for stable downstream consumption', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg-a', 'A', 'en-US', ['p-1'], 'primary@example.com')],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithSelfCcSuppression(b, {
      bccDestinations: [
        { address: 'z@example.com' },
        { address: 'a@example.com' },
        { address: 'm@example.com' },
      ],
    });
    const addresses = collectPostSuppressionBccAddresses(out);
    expect(addresses).toEqual(['a@example.com', 'm@example.com', 'z@example.com']);
  });
});

describe('self-CC suppression — determinism', () => {
  it('is byte-identical for identical inputs', () => {
    const b = batch(
      [
        patientWithOneOverdue('p-1', 'Alice'),
        patientWithOneOverdue('p-2', 'Admin patient'),
      ],
      [
        caregiver('cg-alice', 'Alice', 'en-US', ['p-1'], 'alice@example.com'),
        caregiver('cg-admin', 'Admin', 'en-US', ['p-2'], 'admin@example.com'),
      ],
    );
    const opts = { bccDestinations: [{ address: 'admin@example.com' }] };
    const a = buildFollowupDigestHtmlMailerEnvelopesWithSelfCcSuppression(b, opts);
    const c = buildFollowupDigestHtmlMailerEnvelopesWithSelfCcSuppression(b, opts);
    expect(a.envelopes.length).toBe(c.envelopes.length);
    expect(a.coverage.totalSelfCcSuppressions).toBe(c.coverage.totalSelfCcSuppressions);
    expect(summarizeSelfCcSuppression(a)).toBe(summarizeSelfCcSuppression(c));
  });
});
