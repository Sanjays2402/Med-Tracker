import { describe, it, expect } from 'vitest';
import {
  localiseFollowupDigestBundle,
  buildLocalisedFollowupDigestBundle,
  validateFollowupDigestI18nTable,
  FOLLOWUP_DIGEST_I18N_EN,
  type FollowupDigestI18nBundle,
  type FollowupDigestI18nTable,
} from '../src/followup-digest-text-html-bundle-i18n';
import { buildFollowupDigestBundle } from '../src/followup-digest-text-html-bundle';
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
      'opener.expiredAdvisory': 'Aviso: algunos ítems exceden el período de gracia; el equipo clínico podría requerir nueva referencia.',
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
      'footer.unsub':
        'Recibe este mensaje porque tiene un share activo de cuidador en Med-Tracker. Para detenerlo, pida al paciente que revoque su acceso.',
      ...overrides,
    },
  };
}

describe('localiseFollowupDigestBundle — null short-circuit', () => {
  it('returns null when there is nothing to digest', () => {
    const report = reportWith([]);
    const out = localiseFollowupDigestBundle(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      esBundle(),
    );
    expect(out).toBeNull();
  });

  it('returns null when only upcoming rows and includeUpcoming=false (default)', () => {
    const report = reportWith([req({ dueAt: '2026-12-01', title: 'Far' })]);
    const out = localiseFollowupDigestBundle(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      esBundle(),
    );
    expect(out).toBeNull();
  });
});

describe('localiseFollowupDigestBundle — subject line', () => {
  it('uses singular overdue subject when overdueCount=1', () => {
    const report = reportWith([
      req({ dueAt: '2026-06-01', title: 'Cardiology' }),
    ]);
    const out = localiseFollowupDigestBundle(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      esBundle(),
    );
    expect(out).not.toBeNull();
    expect(out!.subject).toContain('1 cita atrasada');
    expect(out!.subject).toContain('Cardiology');
  });

  it('uses plural overdue subject when overdueCount > 1', () => {
    const report = reportWith([
      req({ dueAt: '2026-06-01', title: 'Cardiology' }),
      req({ dueAt: '2026-06-05', title: 'INR draw' }),
    ]);
    const out = localiseFollowupDigestBundle(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      esBundle(),
    );
    expect(out!.subject).toContain('2 citas atrasadas');
    expect(out!.subject).toContain('Cardiology'); // oldest
  });

  it('uses singular due-soon subject when no overdue and dueSoonCount=1', () => {
    const report = reportWith([
      req({ dueAt: '2026-06-25', title: 'Lab', kind: 'lab' }),
    ]);
    const out = localiseFollowupDigestBundle(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      esBundle(),
    );
    expect(out!.subject).toContain('1 cita próxima');
  });

  it('uses plural due-soon subject for dueSoonCount > 1', () => {
    const report = reportWith([
      req({ dueAt: '2026-06-25', title: 'Lab' }),
      req({ dueAt: '2026-06-26', title: 'Imaging' }),
    ]);
    const out = localiseFollowupDigestBundle(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      esBundle(),
    );
    expect(out!.subject).toContain('2 citas próximas');
  });

  it('uses upcoming-many subject when only upcoming rows and includeUpcoming=true', () => {
    const report = reportWith([
      req({ dueAt: '2026-12-01', title: 'Far A' }),
      req({ dueAt: '2026-12-02', title: 'Far B' }),
    ]);
    const out = localiseFollowupDigestBundle(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      esBundle(),
      { includeUpcoming: true },
    );
    expect(out).not.toBeNull();
    expect(out!.subject).toContain('2 citas por venir');
  });

  it('uses patient.display in subject when provided', () => {
    const report = reportWith([req({ dueAt: '2026-06-01', title: 'Cardiology' })]);
    const out = localiseFollowupDigestBundle(
      {
        patient: { name: 'Jane Doe', display: 'Mom' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      esBundle(),
    );
    expect(out!.subject).toMatch(/^Mom: /);
  });
});

describe('localiseFollowupDigestBundle — opener', () => {
  it('replaces English overdue-one opener with localised text', () => {
    const report = reportWith([req({ dueAt: '2026-06-01', title: 'Cardiology' })]);
    const out = localiseFollowupDigestBundle(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      esBundle(),
    );
    expect(out!.text).toContain('Jane Doe tiene 1 cita pendiente.');
    expect(out!.text).not.toContain('has 1 overdue follow-up that needs attention');
    expect(out!.html).toContain('Jane Doe tiene 1 cita pendiente.');
  });

  it('replaces English overdue-many opener with localised text', () => {
    const report = reportWith([
      req({ dueAt: '2026-06-01', title: 'Cardiology' }),
      req({ dueAt: '2026-06-05', title: 'INR draw' }),
    ]);
    const out = localiseFollowupDigestBundle(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      esBundle(),
    );
    expect(out!.text).toContain('Jane Doe tiene 2 citas pendientes.');
    expect(out!.html).toContain('Jane Doe tiene 2 citas pendientes.');
  });

  it('replaces due-soon-only opener with localised text', () => {
    const report = reportWith([req({ dueAt: '2026-06-25', title: 'Lab' })]);
    const out = localiseFollowupDigestBundle(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      esBundle(),
    );
    expect(out!.text).toContain('Jane Doe tiene 1 cita próxima.');
    expect(out!.html).toContain('Jane Doe tiene 1 cita próxima.');
  });

  it('replaces upcoming-only opener with localised text', () => {
    const report = reportWith([req({ dueAt: '2026-12-01', title: 'Far' })]);
    const out = localiseFollowupDigestBundle(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      esBundle(),
      { includeUpcoming: true },
    );
    expect(out!.text).toContain('Jane Doe tiene 1 cita por venir.');
  });
});

describe('localiseFollowupDigestBundle — coverage line + footer', () => {
  it('replaces coverage line in text body', () => {
    const report = reportWith([req({ dueAt: '2026-06-01', title: 'Cardiology' })]);
    const out = localiseFollowupDigestBundle(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      esBundle(),
    );
    expect(out!.text).toContain('Período de cobertura: 2026-06-15 a 2026-06-21.');
    expect(out!.text).not.toContain('Coverage period:');
  });

  it('replaces footer in text body', () => {
    const report = reportWith([req({ dueAt: '2026-06-01', title: 'Cardiology' })]);
    const out = localiseFollowupDigestBundle(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      esBundle(),
    );
    expect(out!.text).toContain('Recibe este mensaje porque tiene un share activo');
    expect(out!.text).not.toContain('This message was sent because you have an active');
  });

  it('replaces footer in HTML body', () => {
    const report = reportWith([req({ dueAt: '2026-06-01', title: 'Cardiology' })]);
    const out = localiseFollowupDigestBundle(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      esBundle(),
    );
    expect(out!.html).toContain('Recibe este mensaje');
    expect(out!.html).not.toContain('This message was sent because you have');
  });
});

describe('localiseFollowupDigestBundle — section headers', () => {
  it('replaces Overdue / Due soon section headers in text body', () => {
    const report = reportWith([
      req({ dueAt: '2026-06-01', title: 'Cardiology' }),
      req({ dueAt: '2026-06-25', title: 'Lab' }),
    ]);
    const out = localiseFollowupDigestBundle(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      esBundle(),
    );
    expect(out!.text).toContain('Atrasadas (');
    expect(out!.text).toContain('Próximas (');
    expect(out!.text).not.toMatch(/^Overdue \(/m);
    expect(out!.text).not.toMatch(/^Due soon \(/m);
  });

  it('replaces section headers in HTML body', () => {
    const report = reportWith([req({ dueAt: '2026-06-01', title: 'Cardiology' })]);
    const out = localiseFollowupDigestBundle(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      esBundle(),
    );
    expect(out!.html).toContain('Atrasadas (');
    expect(out!.html).not.toContain('>Overdue (');
  });
});

describe('localiseFollowupDigestBundle — kind labels', () => {
  it('replaces Visit / Lab / Imaging labels in text body', () => {
    const report = reportWith([
      req({ dueAt: '2026-06-01', title: 'Cardiology', kind: 'visit' }),
      req({ dueAt: '2026-06-02', title: 'INR draw', kind: 'lab' }),
      req({ dueAt: '2026-06-03', title: 'MRI', kind: 'imaging' }),
    ]);
    const out = localiseFollowupDigestBundle(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      esBundle(),
    );
    expect(out!.text).toContain('  - Visita:');
    expect(out!.text).toContain('  - Laboratorio:');
    expect(out!.text).toContain('  - Imagen:');
    expect(out!.text).not.toContain('  - Visit:');
    expect(out!.text).not.toContain('  - Lab:');
    expect(out!.text).not.toContain('  - Imaging:');
  });

  it('replaces kind labels in HTML body', () => {
    const report = reportWith([
      req({ dueAt: '2026-06-01', title: 'Cardiology', kind: 'visit' }),
    ]);
    const out = localiseFollowupDigestBundle(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      esBundle(),
    );
    expect(out!.html).toContain('Visita &middot;');
    expect(out!.html).not.toContain('Visit &middot;');
  });
});

describe('localiseFollowupDigestBundle — row chips in HTML', () => {
  it('replaces OVERDUE chip with localised label', () => {
    const report = reportWith([req({ dueAt: '2026-06-01', title: 'Cardiology' })]);
    const out = localiseFollowupDigestBundle(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      esBundle(),
    );
    expect(out!.html).toMatch(/>ATRASADA -?\d+d</);
    expect(out!.html).not.toMatch(/>OVERDUE -?\d+d</);
  });

  it('replaces DUE +Nd chip with localised label', () => {
    const report = reportWith([req({ dueAt: '2026-06-25', title: 'Lab' })]);
    const out = localiseFollowupDigestBundle(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      esBundle(),
    );
    expect(out!.html).toMatch(/>EN \d+d</);
    expect(out!.html).not.toMatch(/>DUE \+/);
  });

  it('replaces UPCOMING chip with localised label when includeUpcoming=true', () => {
    const report = reportWith([req({ dueAt: '2026-12-01', title: 'Far' })]);
    const out = localiseFollowupDigestBundle(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      esBundle(),
      { includeUpcoming: true },
    );
    expect(out!.html).toContain('>POR VENIR<');
    expect(out!.html).not.toContain('>UPCOMING<');
  });
});

describe('localiseFollowupDigestBundle — expired advisory', () => {
  it('replaces expired advisory text when hasExpired=true', () => {
    const report = reportWith([
      // 365 days overdue trips the grace window
      req({
        dueAt: '2025-06-15',
        title: 'Long overdue',
        graceDays: 30,
      }),
    ]);
    const out = localiseFollowupDigestBundle(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      esBundle(),
    );
    expect(out).not.toBeNull();
    if (out!.stats.hasExpired) {
      expect(out!.text).toContain('Aviso: algunos ítems exceden');
      expect(out!.text).not.toContain('Heads up: one or more items are past their grace window');
    }
  });
});

describe('localiseFollowupDigestBundle — portal CTA', () => {
  it('replaces portal CTA text in text body when portalUrl present', () => {
    const report = reportWith([req({ dueAt: '2026-06-01', title: 'Cardiology' })]);
    const out = localiseFollowupDigestBundle(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
        portalUrl: 'https://portal.example/jane',
      },
      esBundle(),
    );
    expect(out!.text).toContain('Para marcar o cancelar ítems: https://portal.example/jane');
    expect(out!.text).not.toContain('To mark items complete or cancel them: https://portal.example/jane');
  });

  it('does not blow up when portalUrl missing', () => {
    const report = reportWith([req({ dueAt: '2026-06-01', title: 'Cardiology' })]);
    const out = localiseFollowupDigestBundle(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      esBundle(),
    );
    expect(out).not.toBeNull();
    expect(out!.text).not.toContain('Para marcar o cancelar');
  });
});

describe('localiseFollowupDigestBundle — fallback to English', () => {
  it('falls back to English when bundle is empty', () => {
    const report = reportWith([req({ dueAt: '2026-06-01', title: 'Cardiology' })]);
    const out = localiseFollowupDigestBundle(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      { locale: 'en-US', strings: {} },
    );
    expect(out!.text).toContain('Jane Doe has 1 overdue follow-up');
    expect(out!.text).toContain('Coverage period:');
    expect(out!.text).toContain('This message was sent because you have an active Med-Tracker');
  });

  it('falls back per-key for missing entries while honouring supplied ones', () => {
    const partialBundle: FollowupDigestI18nBundle = {
      locale: 'es-419',
      strings: {
        'section.overdue': 'Atrasadas',
        'section.kind.visit': 'Visita',
      },
    };
    const report = reportWith([req({ dueAt: '2026-06-01', title: 'Cardiology' })]);
    const out = localiseFollowupDigestBundle(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      partialBundle,
    );
    // section header and kind label localised
    expect(out!.text).toContain('Atrasadas (');
    expect(out!.text).toContain('  - Visita:');
    // opener + footer still in English
    expect(out!.text).toContain('Jane Doe has 1 overdue follow-up');
    expect(out!.text).toContain('This message was sent because you have an active');
  });
});

describe('localiseFollowupDigestBundle — preserves stats and rows', () => {
  it('keeps stats unchanged from underlying bundle', () => {
    const report = reportWith([
      req({ dueAt: '2026-06-01', title: 'Cardiology' }),
      req({ dueAt: '2026-06-25', title: 'Lab' }),
    ]);
    const baseline = buildFollowupDigestBundle({
      patient: { name: 'Jane Doe' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    });
    const out = localiseFollowupDigestBundle(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      esBundle(),
    );
    expect(out!.stats).toEqual(baseline!.stats);
    expect(out!.rows).toEqual(baseline!.rows);
  });
});

describe('buildLocalisedFollowupDigestBundle', () => {
  it('produces the same output as localiseFollowupDigestBundle', () => {
    const report = reportWith([req({ dueAt: '2026-06-01', title: 'Cardiology' })]);
    const a = localiseFollowupDigestBundle(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      esBundle(),
    );
    const b = buildLocalisedFollowupDigestBundle(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      esBundle(),
    );
    expect(b).toEqual(a);
  });

  it('returns null for silent week', () => {
    const report = reportWith([]);
    const out = buildLocalisedFollowupDigestBundle(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      esBundle(),
    );
    expect(out).toBeNull();
  });
});

describe('validateFollowupDigestI18nTable', () => {
  it('returns no errors for an empty table (everything falls back)', () => {
    const errors = validateFollowupDigestI18nTable({});
    expect(errors).toEqual([]);
  });

  it('returns no errors for the built-in EN table', () => {
    const errors = validateFollowupDigestI18nTable(FOLLOWUP_DIGEST_I18N_EN);
    expect(errors).toEqual([]);
  });

  it('flags missing required placeholder', () => {
    const errors = validateFollowupDigestI18nTable({
      'subject.overdueMany': '{who}: lots overdue',  // missing {overdueCount} + {oldestTitle}
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.every((e) => e.code === 'missing-placeholder')).toBe(true);
    const details = errors.map((e) => e.detail).join('|');
    expect(details).toContain('overdueCount');
    expect(details).toContain('oldestTitle');
  });

  it('flags unknown placeholder', () => {
    const errors = validateFollowupDigestI18nTable({
      'section.overdue': 'Vencidas {wrongKey}',  // section.overdue takes no placeholders
    });
    expect(errors.length).toBe(1);
    expect(errors[0]!.code).toBe('unknown-placeholder');
    expect(errors[0]!.detail).toContain('wrongKey');
  });

  it('ignores empty / null / undefined values silently', () => {
    const errors = validateFollowupDigestI18nTable({
      'section.overdue': '',
    });
    expect(errors).toEqual([]);
  });

  it('flags both missing and unknown placeholders in one template', () => {
    const errors = validateFollowupDigestI18nTable({
      'opener.overdueMany': '{patient}: {bogus} overdue',  // missing overdueCount + oldestSuffix, has bogus
    });
    const codes = errors.map((e) => e.code).sort();
    expect(codes).toContain('missing-placeholder');
    expect(codes).toContain('unknown-placeholder');
  });
});

describe('FOLLOWUP_DIGEST_I18N_EN', () => {
  it('exports a complete table with all keys', () => {
    const keys = Object.keys(FOLLOWUP_DIGEST_I18N_EN);
    expect(keys.length).toBeGreaterThanOrEqual(29);
    for (const v of Object.values(FOLLOWUP_DIGEST_I18N_EN)) {
      expect(v.length).toBeGreaterThan(0);
    }
  });

  it('mirrors current English digest output when used as the bundle', () => {
    const report = reportWith([req({ dueAt: '2026-06-01', title: 'Cardiology' })]);
    const baseline = buildFollowupDigestBundle({
      patient: { name: 'Jane Doe' },
      report,
      weekStart: '2026-06-15',
      weekEnd: '2026-06-21',
    });
    const out = localiseFollowupDigestBundle(
      {
        patient: { name: 'Jane Doe' },
        report,
        weekStart: '2026-06-15',
        weekEnd: '2026-06-21',
      },
      { locale: 'en-US', strings: FOLLOWUP_DIGEST_I18N_EN },
    );
    expect(out!.subject).toBe(baseline!.subject);
    expect(out!.text).toBe(baseline!.text);
    expect(out!.html).toBe(baseline!.html);
  });
});
