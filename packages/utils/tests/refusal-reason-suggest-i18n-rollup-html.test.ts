import { describe, it, expect } from 'vitest';
import {
  renderRefusalReasonI18nRollupHtml,
  renderRefusalReasonI18nRollupTableOnly,
} from '../src/refusal-reason-suggest-i18n-rollup-html';
import {
  rollupLocalisedRefusalSuggestions,
} from '../src/refusal-reason-suggest-i18n-rollup';
import {
  REFUSAL_REASON_I18N_EN,
  type RefusalReasonI18nBundle,
} from '../src/refusal-reason-suggest-i18n';
import type { RefusalReasonSuggestInput } from '../src/refusal-reason-suggest';
import type { Dose } from '@med/types';

const MED_ID = 'med-1';
const NOW = new Date(2026, 5, 21, 12, 0);

function dose(id: string, o: Partial<Dose> & { dueAt: string }): Dose {
  return {
    id,
    medicationId: o.medicationId ?? MED_ID,
    scheduleId: o.scheduleId ?? 's-1',
    dueAt: o.dueAt,
    takenAt: o.takenAt ?? null,
    status: o.status ?? 'missed',
  } as Dose;
}

function ctx(o: Partial<Omit<RefusalReasonSuggestInput, 'dose'>> = {}): Omit<RefusalReasonSuggestInput, 'dose'> {
  return {
    medication: o.medication ?? { id: MED_ID, supplyRemaining: 30 },
    now: o.now ?? NOW,
    ...(o.sleeping !== undefined ? { sleeping: o.sleeping } : {}),
    ...(o.npoWindows !== undefined ? { npoWindows: o.npoWindows } : {}),
    ...(o.prescriberPauses !== undefined ? { prescriberPauses: o.prescriberPauses } : {}),
    ...(o.recentRefusals !== undefined ? { recentRefusals: o.recentRefusals } : {}),
  };
}

const EN_BUNDLE: RefusalReasonI18nBundle = {
  locale: 'en-US',
  strings: REFUSAL_REASON_I18N_EN,
};

const ES_BUNDLE: RefusalReasonI18nBundle = {
  locale: 'es-419',
  strings: {
    'npo-window': 'La fecha programada cae dentro de una ventana NPO conocida{reasonSuffix}.',
    'prescriber-pause':
      'El prescriptor pausó este medicamento durante la ventana actual{reasonSuffix}.',
    'out-of-supply': 'No hay suministro restante para este medicamento en la fecha de la dosis.',
    'sleeping-window':
      'La hora programada {time} cae dentro de la ventana de sueño del paciente ({start}\u2013{end}).',
    'recent-pattern':
      'El paciente rechazó este medicamento {count} vez(ces) en los últimos {days} días citando "{reason}".',
  },
};

describe('renderRefusalReasonI18nRollupHtml — basic shape', () => {
  it('renders header + coverage strip + per-source sections', () => {
    const doses = [
      dose('d-npo', { dueAt: '2026-06-21T08:00:00.000' }),
      dose('d-supply', { dueAt: '2026-06-22T08:00:00.000' }),
    ];
    const rollup = rollupLocalisedRefusalSuggestions(
      doses,
      ctx({
        medication: { id: MED_ID, supplyRemaining: 0 },
        npoWindows: [{ startDate: '2026-06-21', endDate: '2026-06-21' }],
      }),
      EN_BUNDLE,
    );
    const html = renderRefusalReasonI18nRollupHtml(rollup);
    expect(html.html).toContain('Refusal-reason adjudication');
    expect(html.html).toContain('NPO WINDOW (1)');
    expect(html.html).toContain('OUT OF SUPPLY (1)');
    expect(html.html).toContain('2/2 suggested');
    expect(html.shownSuggestionCount).toBe(2);
    expect(html.hiddenSuggestionCount).toBe(0);
  });

  it('renders patient name in the header when provided', () => {
    const doses = [dose('d-1', { dueAt: '2026-06-21T08:00:00.000' })];
    const rollup = rollupLocalisedRefusalSuggestions(
      doses,
      ctx({ npoWindows: [{ startDate: '2026-06-21', endDate: '2026-06-21' }] }),
      EN_BUNDLE,
    );
    const html = renderRefusalReasonI18nRollupHtml(rollup, { patientName: 'Jane Doe' });
    expect(html.html).toContain('Jane Doe — refusal-reason adjudication');
  });

  it('renders the localised explanation in the row body', () => {
    const doses = [dose('d-1', { dueAt: '2026-06-21T08:00:00.000' })];
    const rollup = rollupLocalisedRefusalSuggestions(
      doses,
      ctx({ npoWindows: [{ startDate: '2026-06-21', endDate: '2026-06-21', reason: 'colonoscopia' }] }),
      ES_BUNDLE,
    );
    const html = renderRefusalReasonI18nRollupHtml(rollup);
    expect(html.html).toContain('ventana NPO conocida');
    expect(html.html).toContain('Locale: es-419');
  });

  it('shows FALLBACK badge when the i18n layer used the English fallback', () => {
    const emptyBundle: RefusalReasonI18nBundle = { locale: 'fr-FR', strings: {} };
    const doses = [dose('d-1', { dueAt: '2026-06-21T08:00:00.000' })];
    const rollup = rollupLocalisedRefusalSuggestions(
      doses,
      ctx({ npoWindows: [{ startDate: '2026-06-21', endDate: '2026-06-21' }] }),
      emptyBundle,
    );
    const html = renderRefusalReasonI18nRollupHtml(rollup);
    expect(html.html).toContain('FALLBACK');
    expect(html.html).toContain('1 fallback');
  });
});

describe('renderRefusalReasonI18nRollupHtml — empty / filtered states', () => {
  it('renders an empty-state message when no suggestions exist', () => {
    const doses = [dose('d-1', { dueAt: '2026-06-22T08:00:00.000' })];
    const rollup = rollupLocalisedRefusalSuggestions(doses, ctx(), EN_BUNDLE);
    const html = renderRefusalReasonI18nRollupHtml(rollup);
    expect(html.html).toContain('No suggestions to review.');
    expect(html.shownSuggestionCount).toBe(0);
  });

  it('omits doses with suggestion=null from rendered rows', () => {
    const doses = [
      dose('d-none', { dueAt: '2026-06-22T08:00:00.000' }),
      dose('d-npo', { dueAt: '2026-06-21T08:00:00.000' }),
    ];
    const rollup = rollupLocalisedRefusalSuggestions(
      doses,
      ctx({ npoWindows: [{ startDate: '2026-06-21', endDate: '2026-06-21' }] }),
      EN_BUNDLE,
    );
    const html = renderRefusalReasonI18nRollupHtml(rollup);
    expect(html.html).toContain('d-npo');
    expect(html.html).not.toContain('d-none');
  });

  it('filters to one source group when sourceFilter is set', () => {
    const doses = [
      dose('d-npo', { dueAt: '2026-06-21T08:00:00.000' }),
      dose('d-supply', { dueAt: '2026-06-22T08:00:00.000' }),
    ];
    const rollup = rollupLocalisedRefusalSuggestions(
      doses,
      ctx({
        medication: { id: MED_ID, supplyRemaining: 0 },
        npoWindows: [{ startDate: '2026-06-21', endDate: '2026-06-21' }],
      }),
      EN_BUNDLE,
    );
    const html = renderRefusalReasonI18nRollupHtml(rollup, { sourceFilter: 'npo-window' });
    expect(html.html).toContain('NPO WINDOW');
    expect(html.html).not.toContain('OUT OF SUPPLY');
    expect(html.shownSuggestionCount).toBe(1);
    expect(html.hiddenSuggestionCount).toBe(1);
  });

  it('caps rows per source group and reports overflow', () => {
    const doses = Array.from({ length: 8 }, (_, i) =>
      dose(`d-${i}`, { dueAt: '2026-06-21T08:00:00.000' }),
    );
    const rollup = rollupLocalisedRefusalSuggestions(
      doses,
      ctx({ npoWindows: [{ startDate: '2026-06-21', endDate: '2026-06-21' }] }),
      EN_BUNDLE,
    );
    const html = renderRefusalReasonI18nRollupHtml(rollup, { rowsPerSourceLimit: 3 });
    expect(html.html).toContain('NPO WINDOW (8)');
    expect(html.html).toContain('…and 5 more npo window suggestions not shown');
    expect(html.shownSuggestionCount).toBe(3);
    expect(html.hiddenSuggestionCount).toBe(5);
  });
});

describe('renderRefusalReasonI18nRollupHtml — controls', () => {
  it('renders accept / reject checkboxes by default', () => {
    const doses = [dose('d-1', { dueAt: '2026-06-21T08:00:00.000' })];
    const rollup = rollupLocalisedRefusalSuggestions(
      doses,
      ctx({ npoWindows: [{ startDate: '2026-06-21', endDate: '2026-06-21' }] }),
      EN_BUNDLE,
    );
    const html = renderRefusalReasonI18nRollupHtml(rollup);
    expect(html.html).toContain('name="accept" value="d-1"');
    expect(html.html).toContain('name="reject" value="d-1"');
  });

  it('omits controls when interactive=false', () => {
    const doses = [dose('d-1', { dueAt: '2026-06-21T08:00:00.000' })];
    const rollup = rollupLocalisedRefusalSuggestions(
      doses,
      ctx({ npoWindows: [{ startDate: '2026-06-21', endDate: '2026-06-21' }] }),
      EN_BUNDLE,
    );
    const html = renderRefusalReasonI18nRollupHtml(rollup, { interactive: false });
    expect(html.html).not.toContain('type="checkbox"');
  });
});

describe('renderRefusalReasonI18nRollupHtml — coverage strip', () => {
  it('omits coverage strip when includeCoverageStrip=false', () => {
    const doses = [dose('d-1', { dueAt: '2026-06-21T08:00:00.000' })];
    const rollup = rollupLocalisedRefusalSuggestions(
      doses,
      ctx({ npoWindows: [{ startDate: '2026-06-21', endDate: '2026-06-21' }] }),
      EN_BUNDLE,
    );
    const html = renderRefusalReasonI18nRollupHtml(rollup, { includeCoverageStrip: false });
    expect(html.html).not.toContain('Top source');
    expect(html.html).not.toContain('1/1 suggested');
  });

  it('surfaces missingPlaceholders in the coverage strip', () => {
    const badBundle: RefusalReasonI18nBundle = {
      locale: 'es-419',
      strings: { 'npo-window': 'NPO {brokenPlaceholder}' },
    };
    const doses = [dose('d-1', { dueAt: '2026-06-21T08:00:00.000' })];
    const rollup = rollupLocalisedRefusalSuggestions(
      doses,
      ctx({ npoWindows: [{ startDate: '2026-06-21', endDate: '2026-06-21' }] }),
      badBundle,
    );
    const html = renderRefusalReasonI18nRollupHtml(rollup);
    expect(html.html).toContain('Missing placeholders: brokenPlaceholder');
  });
});

describe('renderRefusalReasonI18nRollupHtml — security / escaping', () => {
  it('HTML-escapes dose ids in the row body and controls', () => {
    const doses = [dose('<script>', { dueAt: '2026-06-21T08:00:00.000' })];
    const rollup = rollupLocalisedRefusalSuggestions(
      doses,
      ctx({ npoWindows: [{ startDate: '2026-06-21', endDate: '2026-06-21' }] }),
      EN_BUNDLE,
    );
    const html = renderRefusalReasonI18nRollupHtml(rollup);
    expect(html.html).not.toContain('<script>');
    expect(html.html).toContain('&lt;script&gt;');
  });

  it('HTML-escapes patient name in the header', () => {
    const doses = [dose('d-1', { dueAt: '2026-06-21T08:00:00.000' })];
    const rollup = rollupLocalisedRefusalSuggestions(
      doses,
      ctx({ npoWindows: [{ startDate: '2026-06-21', endDate: '2026-06-21' }] }),
      EN_BUNDLE,
    );
    const html = renderRefusalReasonI18nRollupHtml(rollup, {
      patientName: 'Jane <Doe>',
    });
    expect(html.html).toContain('Jane &lt;Doe&gt;');
    expect(html.html).not.toContain('Jane <Doe>');
  });
});

describe('renderRefusalReasonI18nRollupHtml — determinism + shownBySource', () => {
  it('emits identical output across two invocations', () => {
    const doses = [
      dose('d-1', { dueAt: '2026-06-21T08:00:00.000' }),
      dose('d-2', { dueAt: '2026-06-22T08:00:00.000' }),
    ];
    const rollup = rollupLocalisedRefusalSuggestions(
      doses,
      ctx({
        medication: { id: MED_ID, supplyRemaining: 0 },
        npoWindows: [{ startDate: '2026-06-21', endDate: '2026-06-21' }],
      }),
      EN_BUNDLE,
    );
    const a = renderRefusalReasonI18nRollupHtml(rollup);
    const b = renderRefusalReasonI18nRollupHtml(rollup);
    expect(a.html).toBe(b.html);
  });

  it('reports per-source shown counts for caller telemetry', () => {
    const doses = [
      dose('d-1', { dueAt: '2026-06-21T08:00:00.000' }),
      dose('d-2', { dueAt: '2026-06-22T08:00:00.000' }),
    ];
    const rollup = rollupLocalisedRefusalSuggestions(
      doses,
      ctx({
        medication: { id: MED_ID, supplyRemaining: 0 },
        npoWindows: [{ startDate: '2026-06-21', endDate: '2026-06-21' }],
      }),
      EN_BUNDLE,
    );
    const html = renderRefusalReasonI18nRollupHtml(rollup);
    expect(html.shownBySource['npo-window']).toBe(1);
    expect(html.shownBySource['out-of-supply']).toBe(1);
    expect(html.shownBySource['prescriber-pause']).toBe(0);
  });
});

describe('renderRefusalReasonI18nRollupTableOnly', () => {
  it('omits the header but keeps source tables', () => {
    const doses = [dose('d-1', { dueAt: '2026-06-21T08:00:00.000' })];
    const rollup = rollupLocalisedRefusalSuggestions(
      doses,
      ctx({ npoWindows: [{ startDate: '2026-06-21', endDate: '2026-06-21' }] }),
      EN_BUNDLE,
    );
    const html = renderRefusalReasonI18nRollupTableOnly(rollup);
    expect(html.html).not.toContain('Refusal-reason adjudication');
    expect(html.html).toContain('NPO WINDOW');
  });
});
