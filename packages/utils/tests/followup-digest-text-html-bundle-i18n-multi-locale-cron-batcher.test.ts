import { describe, it, expect } from 'vitest';
import {
  buildFollowupDigestCronBatch,
  summarizeFollowupDigestCronBatch,
  filterCronBatchByLocale,
  type FollowupDigestCronBatcherPatient,
  type FollowupDigestCronBatcherCaregiver,
} from '../src/followup-digest-text-html-bundle-i18n-multi-locale-cron-batcher';
import {
  FOLLOWUP_DIGEST_I18N_EN,
  type FollowupDigestI18nBundle,
  type FollowupDigestI18nTable,
} from '../src/followup-digest-text-html-bundle-i18n';
import {
  buildFollowupReport,
  type FollowupRequirement,
} from '../src/appointment-followup-tracker';

const NOW = new Date(2026, 5, 21);

function req(o: Partial<FollowupRequirement> & { dueAt: string }): FollowupRequirement {
  return {
    kind: 'visit',
    title: 'Visit',
    ...o,
  };
}

function reportWith(rows: FollowupRequirement[]) {
  return buildFollowupReport({ followups: rows, now: NOW });
}

const ENGLISH_BUNDLE: FollowupDigestI18nBundle = {
  locale: 'en-US',
  strings: FOLLOWUP_DIGEST_I18N_EN,
};

function esBundle(overrides: Partial<FollowupDigestI18nTable> = {}): FollowupDigestI18nBundle {
  return {
    locale: 'es-419',
    strings: {
      'subject.overdueOne': '{who}: 1 cita atrasada ({oldestTitle})',
      'subject.overdueMany': '{who}: {overdueCount} citas atrasadas',
      'opener.overdueOne': '{patient} tiene 1 cita pendiente.{oldestSuffix}',
      'opener.overdueMany': '{patient} tiene {overdueCount} citas pendientes.{oldestSuffix}',
      'section.overdue': 'Atrasadas',
      'row.overdueChip': 'ATRASADA {days}d',
      ...overrides,
    },
  };
}

function frBundle(overrides: Partial<FollowupDigestI18nTable> = {}): FollowupDigestI18nBundle {
  return {
    locale: 'fr-FR',
    strings: {
      'subject.overdueOne': '{who}: 1 rendez-vous en retard ({oldestTitle})',
      'subject.overdueMany': '{who}: {overdueCount} rendez-vous en retard',
      'opener.overdueOne': '{patient} a 1 rendez-vous en retard.{oldestSuffix}',
      'opener.overdueMany': '{patient} a {overdueCount} rendez-vous en retard.{oldestSuffix}',
      'section.overdue': 'En retard',
      'row.overdueChip': 'EN RETARD {days}j',
      ...overrides,
    },
  };
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
      report: reportWith(rows),
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

describe('buildFollowupDigestCronBatch — happy path', () => {
  it('builds one entry per caregiver in input order', () => {
    const result = buildFollowupDigestCronBatch(
      [patientWithOneOverdue('p-1', 'Alice'), patientWithOneOverdue('p-2', 'Bob')],
      [
        caregiver('cg-a', 'Adult child A', 'en-US', ['p-1']),
        caregiver('cg-b', 'Adult child B', 'es-419', ['p-2']),
      ],
      { localeBundles: [ENGLISH_BUNDLE, esBundle()] },
    );
    expect(result.entries.length).toBe(2);
    expect(result.entries[0]!.caregiverId).toBe('cg-a');
    expect(result.entries[1]!.caregiverId).toBe('cg-b');
  });

  it('groups multiple patients into a single caregiver entry', () => {
    const result = buildFollowupDigestCronBatch(
      [
        patientWithOneOverdue('p-1', 'Alice'),
        patientWithOneOverdue('p-2', 'Bob'),
      ],
      [
        caregiver('cg-watch-both', 'Family member', 'en-US', ['p-1', 'p-2']),
      ],
      { localeBundles: [ENGLISH_BUNDLE] },
    );
    expect(result.entries.length).toBe(1);
    expect(result.entries[0]!.patients.length).toBe(2);
    expect(result.entries[0]!.patients[0]!.patientId).toBe('p-1');
    expect(result.entries[0]!.patients[1]!.patientId).toBe('p-2');
  });

  it('renders each caregiver`s patient slices in the caregiver`s locale', () => {
    const result = buildFollowupDigestCronBatch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [
        caregiver('cg-en', 'EN caregiver', 'en-US', ['p-1']),
        caregiver('cg-es', 'ES caregiver', 'es-419', ['p-1']),
      ],
      { localeBundles: [ENGLISH_BUNDLE, esBundle()] },
    );
    const enBundle = result.entries[0]!.patients[0]!.bundle;
    const esBundleResult = result.entries[1]!.patients[0]!.bundle;
    expect(enBundle.text).not.toBe(esBundleResult.text);
    // ES output should mention "cita pendiente" or similar
    expect(esBundleResult.text).toMatch(/cita|pendient/i);
  });

  it('passes destination through unchanged', () => {
    const result = buildFollowupDigestCronBatch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [
        caregiver('cg-1', 'CG', 'en-US', ['p-1'], 'cg@example.com'),
      ],
      { localeBundles: [ENGLISH_BUNDLE] },
    );
    expect(result.entries[0]!.destination).toBe('cg@example.com');
  });
});

describe('buildFollowupDigestCronBatch — silent week handling', () => {
  it('drops silent patients from a caregiver`s patient list', () => {
    const result = buildFollowupDigestCronBatch(
      [
        patientWithOneOverdue('p-1', 'Alice'),
        patientSilent('p-2', 'Bob'),
      ],
      [caregiver('cg-1', 'CG', 'en-US', ['p-1', 'p-2'])],
      { localeBundles: [ENGLISH_BUNDLE] },
    );
    expect(result.entries.length).toBe(1);
    expect(result.entries[0]!.patients.length).toBe(1);
    expect(result.entries[0]!.patients[0]!.patientId).toBe('p-1');
  });

  it('marks a caregiver SILENT when all their patients are silent', () => {
    const result = buildFollowupDigestCronBatch(
      [patientSilent('p-1', 'Alice'), patientSilent('p-2', 'Bob')],
      [caregiver('cg-1', 'CG', 'en-US', ['p-1', 'p-2'])],
      { localeBundles: [ENGLISH_BUNDLE] },
    );
    expect(result.entries.length).toBe(0);
    expect(result.coverage.silentCaregiverIds).toContain('cg-1');
    expect(result.coverage.deliverableCount).toBe(0);
  });

  it('marks a caregiver SILENT when their patientIds list is empty', () => {
    const result = buildFollowupDigestCronBatch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg-empty', 'CG', 'en-US', [])],
      { localeBundles: [ENGLISH_BUNDLE] },
    );
    expect(result.coverage.silentCaregiverIds).toContain('cg-empty');
  });

  it('ignores unknown patient ids referenced by a caregiver', () => {
    const result = buildFollowupDigestCronBatch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg-1', 'CG', 'en-US', ['p-1', 'p-nonexistent'])],
      { localeBundles: [ENGLISH_BUNDLE] },
    );
    expect(result.entries[0]!.patients.length).toBe(1);
    expect(result.entries[0]!.patients[0]!.patientId).toBe('p-1');
  });
});

describe('buildFollowupDigestCronBatch — unknown locale policy', () => {
  it('falls back to en-US when policy=fallback-en (default)', () => {
    const result = buildFollowupDigestCronBatch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg-ja', 'JA caregiver', 'ja-JP', ['p-1'])],
      { localeBundles: [ENGLISH_BUNDLE] },
    );
    expect(result.entries[0]!.locale).toBe('en-US');
    expect(result.coverage.deliverableCount).toBe(1);
  });

  it('skips the caregiver when policy=skip', () => {
    const result = buildFollowupDigestCronBatch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [
        caregiver('cg-known', 'EN caregiver', 'en-US', ['p-1']),
        caregiver('cg-unknown', 'JA caregiver', 'ja-JP', ['p-1']),
      ],
      { localeBundles: [ENGLISH_BUNDLE], unknownLocalePolicy: 'skip' },
    );
    expect(result.entries.length).toBe(1);
    expect(result.entries[0]!.caregiverId).toBe('cg-known');
    expect(result.coverage.skippedCaregiverIds).toEqual(['cg-unknown']);
  });

  it('throws when policy=error and an unknown locale appears', () => {
    expect(() =>
      buildFollowupDigestCronBatch(
        [patientWithOneOverdue('p-1', 'Alice')],
        [caregiver('cg-unknown', 'JA caregiver', 'ja-JP', ['p-1'])],
        { localeBundles: [ENGLISH_BUNDLE], unknownLocalePolicy: 'error' },
      ),
    ).toThrow(/ja-JP/);
  });
});

describe('buildFollowupDigestCronBatch — coverage telemetry', () => {
  it('tracks localeUsage per resolved locale', () => {
    const result = buildFollowupDigestCronBatch(
      [patientWithOneOverdue('p-1', 'Alice'), patientWithOneOverdue('p-2', 'Bob')],
      [
        caregiver('cg-en-1', 'A', 'en-US', ['p-1']),
        caregiver('cg-en-2', 'B', 'en-US', ['p-2']),
        caregiver('cg-es-1', 'C', 'es-419', ['p-1']),
      ],
      { localeBundles: [ENGLISH_BUNDLE, esBundle()] },
    );
    expect(result.coverage.localeUsage.get('en-US')).toBe(2);
    expect(result.coverage.localeUsage.get('es-419')).toBe(1);
  });

  it('includes byCaregiverId map for direct lookup', () => {
    const result = buildFollowupDigestCronBatch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [caregiver('cg-1', 'CG', 'en-US', ['p-1'])],
      { localeBundles: [ENGLISH_BUNDLE] },
    );
    expect(result.byCaregiverId.get('cg-1')).toBeDefined();
    expect(result.byCaregiverId.get('cg-1')!.caregiverName).toBe('CG');
  });
});

describe('summarizeFollowupDigestCronBatch', () => {
  it('produces a one-line cron-log summary', () => {
    const result = buildFollowupDigestCronBatch(
      [
        patientWithOneOverdue('p-1', 'Alice'),
        patientSilent('p-2', 'Bob'),
      ],
      [
        caregiver('cg-en', 'EN', 'en-US', ['p-1']),
        caregiver('cg-silent', 'silent', 'en-US', ['p-2']),
      ],
      { localeBundles: [ENGLISH_BUNDLE] },
    );
    const summary = summarizeFollowupDigestCronBatch(result);
    expect(summary).toContain('1/2 deliverable');
    expect(summary).toContain('1 silent');
    expect(summary).toContain('en-US x 1');
  });

  it('shows "no locales" when the run is fully silent', () => {
    const result = buildFollowupDigestCronBatch(
      [patientSilent('p-1', 'Alice')],
      [caregiver('cg-1', 'CG', 'en-US', ['p-1'])],
      { localeBundles: [ENGLISH_BUNDLE] },
    );
    const summary = summarizeFollowupDigestCronBatch(result);
    expect(summary).toContain('no locales');
  });
});

describe('filterCronBatchByLocale', () => {
  it('returns entries matching a given locale only', () => {
    const result = buildFollowupDigestCronBatch(
      [patientWithOneOverdue('p-1', 'Alice')],
      [
        caregiver('cg-en', 'EN', 'en-US', ['p-1']),
        caregiver('cg-es', 'ES', 'es-419', ['p-1']),
      ],
      { localeBundles: [ENGLISH_BUNDLE, esBundle()] },
    );
    const enOnly = filterCronBatchByLocale(result, 'en-US');
    expect(enOnly.length).toBe(1);
    expect(enOnly[0]!.caregiverId).toBe('cg-en');
  });
});

describe('buildFollowupDigestCronBatch — determinism', () => {
  it('produces byte-stable output across two invocations', () => {
    const patients = [
      patientWithOneOverdue('p-1', 'Alice'),
      patientSilent('p-2', 'Bob'),
    ];
    const cgs = [
      caregiver('cg-en', 'EN', 'en-US', ['p-1', 'p-2']),
      caregiver('cg-es', 'ES', 'es-419', ['p-1']),
    ];
    const opts = { localeBundles: [ENGLISH_BUNDLE, esBundle()] };
    const a = buildFollowupDigestCronBatch(patients, cgs, opts);
    const b = buildFollowupDigestCronBatch(patients, cgs, opts);
    expect(JSON.stringify(a.entries.map((e) => ({ id: e.caregiverId, locale: e.locale, n: e.patients.length })))).toBe(
      JSON.stringify(b.entries.map((e) => ({ id: e.caregiverId, locale: e.locale, n: e.patients.length }))),
    );
    expect(a.entries[0]!.patients[0]!.bundle.text).toBe(b.entries[0]!.patients[0]!.bundle.text);
  });
});
