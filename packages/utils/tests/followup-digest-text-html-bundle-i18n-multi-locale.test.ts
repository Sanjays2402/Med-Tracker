import { describe, it, expect } from 'vitest';
import {
  buildMultiLocaleFollowupDigest,
  extractMultiLocaleBundles,
  filterUniqueLocales,
  summarizeMultiLocaleCoverage,
} from '../src/followup-digest-text-html-bundle-i18n-multi-locale';
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

function esBundle(overrides: Partial<FollowupDigestI18nTable> = {}): FollowupDigestI18nBundle {
  return {
    locale: 'es-419',
    strings: {
      'subject.overdueOne': '{who}: 1 cita atrasada ({oldestTitle})',
      'subject.overdueMany': '{who}: {overdueCount} citas atrasadas, la más antigua: {oldestTitle}',
      'subject.dueSoonOne': '{who}: 1 cita próxima',
      'subject.dueSoonMany': '{who}: {dueSoonCount} citas próximas',
      'subject.upcomingOne': '{who}: 1 cita por venir',
      'subject.upcomingMany': '{who}: {upcomingCount} citas por venir',
      'opener.overdueOne': '{patient} tiene 1 cita pendiente.{oldestSuffix}',
      'opener.overdueMany': '{patient} tiene {overdueCount} citas pendientes.{oldestSuffix}',
      'opener.dueSoonOne': '{patient} tiene 1 cita próxima.',
      'opener.dueSoonMany': '{patient} tiene {dueSoonCount} citas próximas.',
      'opener.upcomingOne': '{patient} tiene 1 cita por venir.',
      'opener.upcomingMany': '{patient} tiene {upcomingCount} citas por venir.',
      'opener.coverage': 'Período de cobertura: {weekStart} a {weekEnd}.',
      'opener.expiredAdvisory': 'Aviso: el equipo clínico podría requerir referencia.',
      'section.overdue': 'Atrasadas',
      'section.dueSoon': 'Próximas',
      'section.upcoming': 'Por venir',
      'section.kind.visit': 'Visita',
      'section.kind.lab': 'Laboratorio',
      'section.kind.imaging': 'Imagen',
      'section.kind.referral': 'Referencia',
      'section.kind.vaccination': 'Vacunación',
      'section.kind.procedure': 'Procedimiento',
      'section.kind.other': 'Otro',
      'row.overdueChip': 'ATRASADA {days}d',
      'row.dueSoonChip': 'EN {days}d',
      'row.upcomingChip': 'POR VENIR',
      'portal.cta': 'Para marcar o cancelar ítems: {portalUrl}',
      'footer.unsub': 'Para detener: pida al paciente que revoque su acceso.',
      ...overrides,
    },
  };
}

function frBundle(overrides: Partial<FollowupDigestI18nTable> = {}): FollowupDigestI18nBundle {
  return {
    locale: 'fr-FR',
    strings: {
      'subject.overdueOne': '{who}: 1 rendez-vous en retard ({oldestTitle})',
      'subject.overdueMany': '{who}: {overdueCount} rendez-vous en retard, le plus ancien: {oldestTitle}',
      'subject.dueSoonOne': '{who}: 1 rendez-vous proche',
      'subject.dueSoonMany': '{who}: {dueSoonCount} rendez-vous proches',
      'opener.overdueOne': '{patient} a 1 rendez-vous en retard.{oldestSuffix}',
      'opener.overdueMany': '{patient} a {overdueCount} rendez-vous en retard.{oldestSuffix}',
      'section.overdue': 'En retard',
      'section.dueSoon': 'Prochainement',
      'row.overdueChip': 'EN RETARD {days}j',
      'row.dueSoonChip': 'DANS {days}j',
      'footer.unsub': 'Pour arrêter, demandez au patient de révoquer votre accès.',
      ...overrides,
    },
  };
}

const ENGLISH_BUNDLE: FollowupDigestI18nBundle = {
  locale: 'en-US',
  strings: FOLLOWUP_DIGEST_I18N_EN,
};

describe('buildMultiLocaleFollowupDigest — null short-circuit', () => {
  it('returns null when the underlying digest is null', () => {
    const report = reportWith([]);
    const out = buildMultiLocaleFollowupDigest(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      [esBundle(), frBundle()],
    );
    expect(out).toBeNull();
  });
});

describe('buildMultiLocaleFollowupDigest — happy path', () => {
  it('renders all requested locales in input order', () => {
    const report = reportWith([
      req({ dueAt: '2026-06-01', title: 'Cardiology' }),
      req({ dueAt: '2026-06-05', title: 'INR draw', kind: 'lab' }),
    ]);
    const out = buildMultiLocaleFollowupDigest(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      [esBundle(), frBundle(), ENGLISH_BUNDLE],
    );
    expect(out).not.toBeNull();
    expect(out!.entries).toHaveLength(3);
    expect(out!.entries.map((e) => e.locale)).toEqual(['es-419', 'fr-FR', 'en-US']);
    expect(out!.coverage.renderedCount).toBe(3);
    expect(out!.coverage.requestedCount).toBe(3);
  });

  it('produces distinct subject lines per locale', () => {
    const report = reportWith([req({ dueAt: '2026-06-01', title: 'Cardiology' })]);
    const out = buildMultiLocaleFollowupDigest(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      [esBundle(), frBundle()],
    );
    expect(out!.byLocale.get('es-419')!.subject).toContain('1 cita atrasada');
    expect(out!.byLocale.get('fr-FR')!.subject).toContain('1 rendez-vous en retard');
  });

  it('builds a byLocale lookup map', () => {
    const report = reportWith([req({ dueAt: '2026-06-01', title: 'Cardiology' })]);
    const out = buildMultiLocaleFollowupDigest(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      [esBundle(), frBundle()],
    );
    expect(out!.byLocale.has('es-419')).toBe(true);
    expect(out!.byLocale.has('fr-FR')).toBe(true);
    expect(out!.byLocale.has('ja-JP')).toBe(false);
  });

  it('localises HTML body chips per locale', () => {
    const report = reportWith([req({ dueAt: '2026-06-01', title: 'Cardiology' })]);
    const out = buildMultiLocaleFollowupDigest(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      [esBundle(), frBundle()],
    );
    expect(out!.byLocale.get('es-419')!.html).toContain('ATRASADA');
    expect(out!.byLocale.get('fr-FR')!.html).toContain('EN RETARD');
  });
});

describe('buildMultiLocaleFollowupDigest — dedup / last-wins', () => {
  it('deduplicates by locale id with last-wins semantics', () => {
    const report = reportWith([req({ dueAt: '2026-06-01', title: 'Cardiology' })]);
    const overrideBundle = esBundle({
      'subject.overdueOne': '{who}: override',
    });
    const out = buildMultiLocaleFollowupDigest(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      [esBundle(), overrideBundle],
    );
    expect(out!.entries).toHaveLength(1);
    expect(out!.byLocale.get('es-419')!.subject).toContain('override');
  });

  it('preserves the original encounter order for the first sighting of each locale', () => {
    const report = reportWith([req({ dueAt: '2026-06-01', title: 'Cardiology' })]);
    const out = buildMultiLocaleFollowupDigest(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      [esBundle(), frBundle(), esBundle()],
    );
    expect(out!.entries.map((e) => e.locale)).toEqual(['es-419', 'fr-FR']);
  });
});

describe('buildMultiLocaleFollowupDigest — coverage rollup', () => {
  it('reports rendered count + locales list', () => {
    const report = reportWith([req({ dueAt: '2026-06-01', title: 'Cardiology' })]);
    const out = buildMultiLocaleFollowupDigest(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      [esBundle(), frBundle(), ENGLISH_BUNDLE],
    );
    expect(out!.coverage.renderedCount).toBe(3);
    expect(out!.coverage.requestedCount).toBe(3);
    expect(out!.coverage.locales).toEqual(['es-419', 'fr-FR', 'en-US']);
  });

  it('flags locales whose output matches the English baseline as noopLocales', () => {
    const report = reportWith([req({ dueAt: '2026-06-01', title: 'Cardiology' })]);
    const emptyJa: FollowupDigestI18nBundle = { locale: 'ja-JP', strings: {} };
    const out = buildMultiLocaleFollowupDigest(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      [emptyJa, esBundle()],
    );
    expect(out!.coverage.noopLocales).toContain('ja-JP');
    expect(out!.coverage.noopLocales).not.toContain('es-419');
  });
});

describe('extractMultiLocaleBundles + filterUniqueLocales', () => {
  it('extractMultiLocaleBundles returns entries verbatim', () => {
    const report = reportWith([req({ dueAt: '2026-06-01', title: 'Cardiology' })]);
    const out = buildMultiLocaleFollowupDigest(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      [esBundle()],
    );
    expect(extractMultiLocaleBundles(out!)).toBe(out!.entries);
  });

  it('filterUniqueLocales drops noop locales', () => {
    const report = reportWith([req({ dueAt: '2026-06-01', title: 'Cardiology' })]);
    const emptyJa: FollowupDigestI18nBundle = { locale: 'ja-JP', strings: {} };
    const out = buildMultiLocaleFollowupDigest(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      [emptyJa, esBundle()],
    );
    const unique = filterUniqueLocales(out!);
    expect(unique.map((u) => u.locale)).toEqual(['es-419']);
  });
});

describe('summarizeMultiLocaleCoverage', () => {
  it('renders a one-line summary for the rendered locales', () => {
    const report = reportWith([req({ dueAt: '2026-06-01', title: 'Cardiology' })]);
    const out = buildMultiLocaleFollowupDigest(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      [esBundle(), frBundle()],
    );
    const line = summarizeMultiLocaleCoverage(out!.coverage);
    expect(line).toContain('2/2 rendered');
    expect(line).toContain('es-419');
    expect(line).toContain('fr-FR');
    expect(line).toContain('No-op locales: none.');
  });

  it('lists noop locales when present', () => {
    const report = reportWith([req({ dueAt: '2026-06-01', title: 'Cardiology' })]);
    const emptyJa: FollowupDigestI18nBundle = { locale: 'ja-JP', strings: {} };
    const out = buildMultiLocaleFollowupDigest(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      [emptyJa, esBundle()],
    );
    const line = summarizeMultiLocaleCoverage(out!.coverage);
    expect(line).toContain('No-op locales: ja-JP');
  });

  it('renders gracefully with no locales requested', () => {
    const line = summarizeMultiLocaleCoverage({
      requestedCount: 0,
      renderedCount: 0,
      locales: [],
      noopLocales: [],
    });
    expect(line).toContain('0/0 rendered (none)');
  });
});

describe('buildMultiLocaleFollowupDigest — determinism', () => {
  it('produces byte-identical outputs across two invocations', () => {
    const report = reportWith([
      req({ dueAt: '2026-06-01', title: 'Cardiology' }),
      req({ dueAt: '2026-06-05', title: 'INR draw', kind: 'lab' }),
    ]);
    const input = {
      patient: { name: 'Jane Doe' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    };
    const a = buildMultiLocaleFollowupDigest(input, [esBundle(), frBundle()]);
    const b = buildMultiLocaleFollowupDigest(input, [esBundle(), frBundle()]);
    expect(a!.entries[0]!.bundle.subject).toBe(b!.entries[0]!.bundle.subject);
    expect(a!.entries[0]!.bundle.text).toBe(b!.entries[0]!.bundle.text);
    expect(a!.entries[0]!.bundle.html).toBe(b!.entries[0]!.bundle.html);
  });
});
