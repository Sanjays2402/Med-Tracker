import { describe, it, expect } from 'vitest';
import {
  buildFollowupDigestHtmlMailerEnvelopesWithBcc,
  filterEnvelopesWithAnyRecipient,
  summarizeBccFanOut,
  collectAllBccAddresses,
} from '../src/followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer-bcc';
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
  localeBundles: FollowupDigestI18nBundle[] = [ENGLISH_BUNDLE],
) {
  return buildFollowupDigestCronBatch(patients, caregivers, { localeBundles });
}

describe('buildFollowupDigestHtmlMailerEnvelopesWithBcc — base envelope pass-through', () => {
  it('produces one envelope per cron-batch entry with no BCC by default', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice'), patientWithOneOverdue('p-2', 'Bob')],
      [
        caregiver('cg-a', 'Alice carer', 'en-US', ['p-1'], 'a@example.com'),
        caregiver('cg-b', 'Bob carer', 'en-US', ['p-2'], 'b@example.com'),
      ],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithBcc(b);
    expect(out.envelopes).toHaveLength(2);
    for (const env of out.envelopes) {
      expect(env.bcc).toEqual([]);
    }
  });

  it('forwards silent caregivers from the base mailer', () => {
    const b = batch(
      [patientSlice('p-silent', 'Quiet', [])],
      [
        caregiver('cg-silent', 'Silent carer', 'en-US', ['p-silent'], 'q@example.com'),
      ],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithBcc(b);
    expect(out.silent.find((s) => s.caregiverId === 'cg-silent')).toBeDefined();
  });

  it('byCaregiverId map is keyed on caregiverId', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg-a', 'Alice carer', 'en-US', ['p-1'], 'a@example.com')],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithBcc(b);
    expect(out.byCaregiverId.get('cg-a')?.caregiverId).toBe('cg-a');
  });
});

describe('buildFollowupDigestHtmlMailerEnvelopesWithBcc — global BCC', () => {
  it('a global BCC destination is applied to every envelope', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice'), patientWithOneOverdue('p-2', 'Bob')],
      [
        caregiver('cg-a', 'Alice carer', 'en-US', ['p-1'], 'a@example.com'),
        caregiver('cg-b', 'Bob carer', 'en-US', ['p-2'], 'b@example.com'),
      ],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithBcc(b, {
      bccDestinations: [{ address: 'pcp@example.com' }],
    });
    for (const env of out.envelopes) {
      expect(env.bcc).toEqual(['pcp@example.com']);
    }
  });

  it('multiple global BCC destinations preserve declared order', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg-a', 'Alice carer', 'en-US', ['p-1'], 'a@example.com')],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithBcc(b, {
      bccDestinations: [
        { address: 'pcp@example.com' },
        { address: 'admin@example.com' },
      ],
    });
    expect(out.envelopes[0]?.bcc).toEqual(['pcp@example.com', 'admin@example.com']);
  });

  it('duplicate global BCC addresses are deduped per envelope', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg-a', 'Alice carer', 'en-US', ['p-1'], 'a@example.com')],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithBcc(b, {
      bccDestinations: [
        { address: 'pcp@example.com' },
        { address: 'pcp@example.com' },
      ],
    });
    expect(out.envelopes[0]?.bcc).toEqual(['pcp@example.com']);
  });
});

describe('buildFollowupDigestHtmlMailerEnvelopesWithBcc — per-caregiver scoping', () => {
  it("forCaregiverIds limits a destination to only the listed caregivers", () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice'), patientWithOneOverdue('p-2', 'Bob')],
      [
        caregiver('cg-a', 'Alice carer', 'en-US', ['p-1'], 'a@example.com'),
        caregiver('cg-b', 'Bob carer', 'en-US', ['p-2'], 'b@example.com'),
      ],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithBcc(b, {
      bccDestinations: [{ address: 'pcp@example.com', forCaregiverIds: ['cg-a'] }],
    });
    expect(out.byCaregiverId.get('cg-a')?.bcc).toEqual(['pcp@example.com']);
    expect(out.byCaregiverId.get('cg-b')?.bcc).toEqual([]);
  });

  it('excludeCaregiverIds removes a destination for the listed caregivers', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice'), patientWithOneOverdue('p-2', 'Bob')],
      [
        caregiver('cg-a', 'Alice carer', 'en-US', ['p-1'], 'a@example.com'),
        caregiver('cg-b', 'Bob carer', 'en-US', ['p-2'], 'b@example.com'),
      ],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithBcc(b, {
      bccDestinations: [
        { address: 'pcp@example.com', excludeCaregiverIds: ['cg-b'] },
      ],
    });
    expect(out.byCaregiverId.get('cg-a')?.bcc).toEqual(['pcp@example.com']);
    expect(out.byCaregiverId.get('cg-b')?.bcc).toEqual([]);
  });

  it('excludeCaregiverIds takes precedence over forCaregiverIds', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg-a', 'Alice carer', 'en-US', ['p-1'], 'a@example.com')],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithBcc(b, {
      bccDestinations: [
        {
          address: 'pcp@example.com',
          forCaregiverIds: ['cg-a'],
          excludeCaregiverIds: ['cg-a'],
        },
      ],
    });
    expect(out.byCaregiverId.get('cg-a')?.bcc).toEqual([]);
  });
});

describe('buildFollowupDigestHtmlMailerEnvelopesWithBcc — dropPrimaryFromBcc', () => {
  it('drops the primary destination from the BCC array by default', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg-a', 'Alice carer', 'en-US', ['p-1'], 'a@example.com')],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithBcc(b, {
      bccDestinations: [
        { address: 'a@example.com' }, // matches the primary
        { address: 'pcp@example.com' },
      ],
    });
    expect(out.byCaregiverId.get('cg-a')?.bcc).toEqual(['pcp@example.com']);
    expect(out.coverage.primaryDroppedFromBcc).toContain('cg-a');
  });

  it('keeps the primary destination in BCC when dropPrimaryFromBcc=false', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg-a', 'Alice carer', 'en-US', ['p-1'], 'a@example.com')],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithBcc(b, {
      bccDestinations: [{ address: 'a@example.com' }],
      dropPrimaryFromBcc: false,
    });
    expect(out.byCaregiverId.get('cg-a')?.bcc).toEqual(['a@example.com']);
    expect(out.coverage.primaryDroppedFromBcc).toEqual([]);
  });

  it('primaryDroppedFromBcc records only caregivers whose BCC was actually trimmed', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice'), patientWithOneOverdue('p-2', 'Bob')],
      [
        caregiver('cg-a', 'Alice carer', 'en-US', ['p-1'], 'a@example.com'),
        caregiver('cg-b', 'Bob carer', 'en-US', ['p-2'], 'b@example.com'),
      ],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithBcc(b, {
      bccDestinations: [{ address: 'a@example.com' }],
    });
    expect(out.coverage.primaryDroppedFromBcc).toEqual(['cg-a']);
  });
});

describe('buildFollowupDigestHtmlMailerEnvelopesWithBcc — coverage telemetry', () => {
  it('reports envelopeCount, bccEnvelopeCount, fanOutByAddress', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice'), patientWithOneOverdue('p-2', 'Bob')],
      [
        caregiver('cg-a', 'Alice carer', 'en-US', ['p-1'], 'a@example.com'),
        caregiver('cg-b', 'Bob carer', 'en-US', ['p-2'], 'b@example.com'),
      ],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithBcc(b, {
      bccDestinations: [
        { address: 'pcp@example.com' }, // both
        { address: 'admin@example.com', forCaregiverIds: ['cg-a'] }, // only A
      ],
    });
    expect(out.coverage.envelopeCount).toBe(2);
    expect(out.coverage.bccEnvelopeCount).toBe(2);
    expect(out.coverage.fanOutByAddress.get('pcp@example.com')).toBe(2);
    expect(out.coverage.fanOutByAddress.get('admin@example.com')).toBe(1);
  });

  it('envelopes with empty BCC do NOT count toward bccEnvelopeCount', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice'), patientWithOneOverdue('p-2', 'Bob')],
      [
        caregiver('cg-a', 'Alice carer', 'en-US', ['p-1'], 'a@example.com'),
        caregiver('cg-b', 'Bob carer', 'en-US', ['p-2'], 'b@example.com'),
      ],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithBcc(b, {
      bccDestinations: [{ address: 'pcp@example.com', forCaregiverIds: ['cg-a'] }],
    });
    expect(out.coverage.bccEnvelopeCount).toBe(1);
  });
});

describe('filterEnvelopesWithAnyRecipient', () => {
  it('keeps envelopes with a primary `to`', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg-a', 'Alice carer', 'en-US', ['p-1'], 'a@example.com')],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithBcc(b);
    const kept = filterEnvelopesWithAnyRecipient(out);
    expect(kept).toHaveLength(1);
  });

  it('keeps envelopes that only have BCC (no primary `to`)', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg-a', 'Alice carer', 'en-US', ['p-1'])], // no destination
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithBcc(b, {
      bccDestinations: [{ address: 'pcp@example.com' }],
    });
    expect(out.envelopes[0]?.to).toBeUndefined();
    expect(out.envelopes[0]?.bcc).toEqual(['pcp@example.com']);
    expect(filterEnvelopesWithAnyRecipient(out)).toHaveLength(1);
  });

  it('drops envelopes with neither primary nor BCC', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg-a', 'Alice carer', 'en-US', ['p-1'])], // no destination
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithBcc(b); // no BCC
    expect(filterEnvelopesWithAnyRecipient(out)).toHaveLength(0);
  });
});

describe('summarizeBccFanOut', () => {
  it('reports envelope counts + fan-out totals', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice'), patientWithOneOverdue('p-2', 'Bob')],
      [
        caregiver('cg-a', 'Alice carer', 'en-US', ['p-1'], 'a@example.com'),
        caregiver('cg-b', 'Bob carer', 'en-US', ['p-2'], 'b@example.com'),
      ],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithBcc(b, {
      bccDestinations: [
        { address: 'pcp@example.com' },
        { address: 'admin@example.com', forCaregiverIds: ['cg-a'] },
      ],
    });
    const line = summarizeBccFanOut(out);
    expect(line).toContain('2/2 envelopes had at least one BCC');
    expect(line).toContain('3 BCC recipients total');
    expect(line).toContain('2 distinct addresses');
  });

  it("uses singular phrasing when the counts are 1", () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg-a', 'Alice carer', 'en-US', ['p-1'], 'a@example.com')],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithBcc(b, {
      bccDestinations: [{ address: 'pcp@example.com' }],
    });
    const line = summarizeBccFanOut(out);
    expect(line).toContain('1/1 envelopes had at least one BCC');
    expect(line).toContain('1 BCC recipient total');
    expect(line).toContain('1 distinct address');
  });

  it('reports zero BCC when no destinations are configured', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg-a', 'Alice carer', 'en-US', ['p-1'], 'a@example.com')],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithBcc(b);
    const line = summarizeBccFanOut(out);
    expect(line).toContain('0/1 envelopes had at least one BCC');
    expect(line).toContain('0 BCC recipients total');
    expect(line).toContain('0 distinct addresses');
  });
});

describe('collectAllBccAddresses', () => {
  it('returns a sorted deduped array of every BCC address in use', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice'), patientWithOneOverdue('p-2', 'Bob')],
      [
        caregiver('cg-a', 'Alice carer', 'en-US', ['p-1'], 'a@example.com'),
        caregiver('cg-b', 'Bob carer', 'en-US', ['p-2'], 'b@example.com'),
      ],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithBcc(b, {
      bccDestinations: [
        { address: 'pcp@example.com' },
        { address: 'admin@example.com' },
      ],
    });
    expect(collectAllBccAddresses(out)).toEqual([
      'admin@example.com',
      'pcp@example.com',
    ]);
  });

  it('returns an empty array when there are no BCCs', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg-a', 'Alice carer', 'en-US', ['p-1'], 'a@example.com')],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopesWithBcc(b);
    expect(collectAllBccAddresses(out)).toEqual([]);
  });
});

describe('determinism', () => {
  it('produces byte-identical envelopes on repeat runs with the same inputs', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg-a', 'Alice carer', 'en-US', ['p-1'], 'a@example.com')],
    );
    const a = buildFollowupDigestHtmlMailerEnvelopesWithBcc(b, {
      bccDestinations: [{ address: 'pcp@example.com' }],
    });
    const z = buildFollowupDigestHtmlMailerEnvelopesWithBcc(b, {
      bccDestinations: [{ address: 'pcp@example.com' }],
    });
    expect(a.envelopes[0]?.bcc).toEqual(z.envelopes[0]?.bcc);
    expect(a.envelopes[0]?.subject).toBe(z.envelopes[0]?.subject);
  });
});
