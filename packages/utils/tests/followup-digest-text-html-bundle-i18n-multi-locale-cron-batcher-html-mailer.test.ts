import { describe, it, expect } from 'vitest';
import {
  buildFollowupDigestHtmlMailerEnvelopes,
  buildFollowupDigestHtmlMailerEnvelopeForEntry,
  filterEnvelopesWithDestination,
  summarizeFollowupDigestHtmlMailer,
} from '../src/followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher-html-mailer';
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

const ES_BUNDLE: FollowupDigestI18nBundle = {
  locale: 'es-419',
  strings: {
    'subject.overdueOne': '{who}: 1 cita atrasada ({oldestTitle})',
    'subject.overdueMany': '{who}: {overdueCount} citas atrasadas',
    'opener.overdueOne': '{patient} tiene 1 cita pendiente.{oldestSuffix}',
  },
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

function patientSilent(patientId: string, name: string) {
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

describe('buildFollowupDigestHtmlMailerEnvelopes — happy path', () => {
  it('emits one envelope per deliverable caregiver in input order', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice'), patientWithOneOverdue('p-2', 'Bob')],
      [
        caregiver('cg-a', 'Adult child A', 'en-US', ['p-1'], 'a@example.com'),
        caregiver('cg-b', 'Adult child B', 'en-US', ['p-2'], 'b@example.com'),
      ],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopes(b);
    expect(out.envelopes).toHaveLength(2);
    expect(out.envelopes.map((e) => e.caregiverId)).toEqual(['cg-a', 'cg-b']);
  });

  it('to field mirrors caregiver destination', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg-a', 'Adult child A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopes(b);
    expect(out.envelopes[0]!.to).toBe('a@example.com');
  });

  it('subject uses default English template with caregiver name + date label', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg-a', 'Adult child A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopes(b, {
      dateLabel: 'week of 2026-06-22',
    });
    expect(out.envelopes[0]!.subject).toBe(
      'Med-Tracker follow-up digest for Adult child A (week of 2026-06-22)',
    );
  });

  it('subject collapses empty parens when dateLabel is empty', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg-a', 'Adult child A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopes(b);
    expect(out.envelopes[0]!.subject).toBe(
      'Med-Tracker follow-up digest for Adult child A',
    );
  });

  it('locale-specific subject template overrides default', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg-es', 'Familia es', 'es-419', ['p-1'], 'es@example.com')],
      [ENGLISH_BUNDLE, ES_BUNDLE],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopes(b, {
      dateLabel: 'semana del 2026-06-22',
      subjectTemplates: [
        { locale: 'es-419', template: 'Med-Tracker digesto de seguimiento para {caregiverName} ({dateLabel})' },
      ],
    });
    expect(out.envelopes[0]!.subject).toBe(
      'Med-Tracker digesto de seguimiento para Familia es (semana del 2026-06-22)',
    );
  });

  it('custom defaultSubjectTemplate is honoured when locale has no override', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg-a', 'Adult child A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopes(b, {
      defaultSubjectTemplate: 'Weekly health update: {caregiverName}',
    });
    expect(out.envelopes[0]!.subject).toBe('Weekly health update: Adult child A');
  });

  it('text body concatenates per-patient digests with default separator', () => {
    const b = batch(
      [
        patientWithOneOverdue('p-1', 'Alice'),
        patientWithOneOverdue('p-2', 'Bob'),
      ],
      [caregiver('cg', 'Family', 'en-US', ['p-1', 'p-2'], 'fam@example.com')],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopes(b);
    const env = out.envelopes[0]!;
    // Contains both patient headings
    expect(env.text).toContain('Patient: p-1');
    expect(env.text).toContain('Patient: p-2');
    // Contains the separator between them
    expect(env.text).toContain('-'.repeat(10));
  });

  it('text body uses patientLabels override for headings', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg', 'Family', 'en-US', ['p-1'], 'fam@example.com')],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopes(b, {
      patientLabels: new Map([['p-1', 'Alice (mom)']]),
    });
    expect(out.envelopes[0]!.text).toContain('Patient: Alice (mom)');
    expect(out.envelopes[0]!.text).not.toContain('Patient: p-1\n');
  });

  it('includePatientHeadings=false drops the headings entirely', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg', 'Family', 'en-US', ['p-1'], 'fam@example.com')],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopes(b, {
      includePatientHeadings: false,
    });
    expect(out.envelopes[0]!.text).not.toContain('Patient:');
    expect(out.envelopes[0]!.html).not.toContain('Patient:');
  });

  it('custom textPatientSeparator overrides the default rule', () => {
    const b = batch(
      [
        patientWithOneOverdue('p-1', 'Alice'),
        patientWithOneOverdue('p-2', 'Bob'),
      ],
      [caregiver('cg', 'Family', 'en-US', ['p-1', 'p-2'], 'fam@example.com')],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopes(b, {
      textPatientSeparator: '\n\n===\n\n',
    });
    expect(out.envelopes[0]!.text).toContain('\n\n===\n\n');
    expect(out.envelopes[0]!.text).not.toContain('-'.repeat(40));
  });

  it('html body wraps each patient in a <section> with bottom border', () => {
    const b = batch(
      [
        patientWithOneOverdue('p-1', 'Alice'),
        patientWithOneOverdue('p-2', 'Bob'),
      ],
      [caregiver('cg', 'Family', 'en-US', ['p-1', 'p-2'], 'fam@example.com')],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopes(b);
    const env = out.envelopes[0]!;
    expect(env.html.match(/<section /g)).toHaveLength(2);
    expect(env.html).toContain('border-bottom');
    // Last section's border is reset via the trailing style block.
    expect(env.html).toContain('section:last-child');
  });

  it('html body escapes patient label HTML characters', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg', 'Family', 'en-US', ['p-1'], 'fam@example.com')],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopes(b, {
      patientLabels: new Map([['p-1', '<Alice & Bob>']]),
    });
    expect(out.envelopes[0]!.html).toContain('&lt;Alice &amp; Bob&gt;');
    expect(out.envelopes[0]!.html).not.toContain('<Alice');
  });

  it('patientIds list mirrors entry order', () => {
    const b = batch(
      [
        patientWithOneOverdue('p-1', 'Alice'),
        patientWithOneOverdue('p-2', 'Bob'),
      ],
      [caregiver('cg', 'Family', 'en-US', ['p-1', 'p-2'], 'fam@example.com')],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopes(b);
    expect(out.envelopes[0]!.patientIds).toEqual(['p-1', 'p-2']);
  });

  it('byCaregiverId map indexes envelopes for direct lookup', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [
        caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com'),
      ],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopes(b);
    expect(out.byCaregiverId.get('cg-a')).toBeDefined();
    expect(out.byCaregiverId.get('cg-a')!.subject).toContain('A');
  });

  it('locale field on envelope reflects post-fallback locale used by cron batcher', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg', 'Family', 'ja-JP', ['p-1'], 'jp@example.com')],
      [ENGLISH_BUNDLE], // ja-JP not registered -> falls back to en-US
    );
    const out = buildFollowupDigestHtmlMailerEnvelopes(b);
    expect(out.envelopes[0]!.locale).toBe('en-US');
  });
});

describe('buildFollowupDigestHtmlMailerEnvelopes — silent / suppressed caregivers', () => {
  it('reports silent-week caregivers in the silent list', () => {
    const b = batch(
      [patientSilent('p-1', 'Alice')],
      [caregiver('cg', 'Family', 'en-US', ['p-1'], 'fam@example.com')],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopes(b);
    expect(out.envelopes).toHaveLength(0);
    expect(out.silent).toHaveLength(1);
    expect(out.silent[0]!.caregiverId).toBe('cg');
    expect(out.silent[0]!.reason).toBe('silent-week');
  });

  it('reports unknown-locale-skipped caregivers separately', () => {
    const result = buildFollowupDigestCronBatch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg', 'Family', 'ja-JP', ['p-1'], 'jp@example.com')],
      { localeBundles: [ENGLISH_BUNDLE], unknownLocalePolicy: 'skip' },
    );
    const out = buildFollowupDigestHtmlMailerEnvelopes(result);
    expect(out.envelopes).toHaveLength(0);
    expect(out.silent).toHaveLength(1);
    expect(out.silent[0]!.reason).toBe('unknown-locale-skipped');
  });

  it('mixed: deliverable + silent in same batch are split correctly', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice'), patientSilent('p-2', 'Bob')],
      [
        caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com'),
        caregiver('cg-b', 'B', 'en-US', ['p-2'], 'b@example.com'),
      ],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopes(b);
    expect(out.envelopes).toHaveLength(1);
    expect(out.envelopes[0]!.caregiverId).toBe('cg-a');
    expect(out.silent).toHaveLength(1);
    expect(out.silent[0]!.caregiverId).toBe('cg-b');
  });
});

describe('buildFollowupDigestHtmlMailerEnvelopeForEntry', () => {
  it('produces the same envelope shape as the batch path for a single entry', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg', 'Family', 'en-US', ['p-1'], 'fam@example.com')],
    );
    const fromBatch = buildFollowupDigestHtmlMailerEnvelopes(b).envelopes[0]!;
    const fromEntry = buildFollowupDigestHtmlMailerEnvelopeForEntry(b.entries[0]!);
    expect(fromEntry.caregiverId).toBe(fromBatch.caregiverId);
    expect(fromEntry.subject).toBe(fromBatch.subject);
    expect(fromEntry.text).toBe(fromBatch.text);
    expect(fromEntry.html).toBe(fromBatch.html);
  });
});

describe('filterEnvelopesWithDestination', () => {
  it('returns only envelopes whose to field is set', () => {
    const b = batch(
      [
        patientWithOneOverdue('p-1', 'Alice'),
        patientWithOneOverdue('p-2', 'Bob'),
      ],
      [
        caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com'),
        // no destination — should drop
        caregiver('cg-b', 'B', 'en-US', ['p-2']),
      ],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopes(b);
    const filtered = filterEnvelopesWithDestination(out);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.caregiverId).toBe('cg-a');
  });
});

describe('summarizeFollowupDigestHtmlMailer', () => {
  it('returns a single-line summary with envelope count and silent breakdown', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice'), patientSilent('p-2', 'Bob')],
      [
        caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com'),
        caregiver('cg-b', 'B', 'en-US', ['p-2'], 'b@example.com'),
      ],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopes(b);
    const line = summarizeFollowupDigestHtmlMailer(out);
    expect(line).toContain('Mailer fan-out');
    expect(line).toContain('1 envelopes ready');
    expect(line).toContain('1 silent');
    expect(line).toContain('silent-week');
  });

  it('reports "0 silent" when all caregivers are deliverable', () => {
    const b = batch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg-a', 'A', 'en-US', ['p-1'], 'a@example.com')],
    );
    const out = buildFollowupDigestHtmlMailerEnvelopes(b);
    const line = summarizeFollowupDigestHtmlMailer(out);
    expect(line).toContain('1 envelopes ready, 0 silent');
  });
});

describe('determinism', () => {
  it('produces byte-identical envelopes across runs with the same input', () => {
    const setup = () => {
      const b = batch(
        [patientWithOneOverdue('p-1', 'Alice')],
        [caregiver('cg', 'Family', 'en-US', ['p-1'], 'fam@example.com')],
      );
      return buildFollowupDigestHtmlMailerEnvelopes(b, { dateLabel: 'wk1' });
    };
    const a = setup();
    const c = setup();
    expect(a.envelopes[0]!.subject).toBe(c.envelopes[0]!.subject);
    expect(a.envelopes[0]!.text).toBe(c.envelopes[0]!.text);
    expect(a.envelopes[0]!.html).toBe(c.envelopes[0]!.html);
  });
});
