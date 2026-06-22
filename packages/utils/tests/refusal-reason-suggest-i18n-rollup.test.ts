import { describe, it, expect } from 'vitest';
import {
  rollupLocalisedRefusalSuggestions,
  summarizeI18nRollupCoverage,
  filterSuggestedOnly,
  groupBySource,
} from '../src/refusal-reason-suggest-i18n-rollup';
import {
  REFUSAL_REASON_I18N_EN,
  type RefusalReasonI18nBundle,
} from '../src/refusal-reason-suggest-i18n';
import type { RefusalReasonSuggestInput } from '../src/refusal-reason-suggest';
import type { NormalizedRefusal } from '../src/medication-refusal-log';
import type { Dose } from '@med/types';

const MED_ID = 'med-1';
const OTHER_MED_ID = 'med-2';
const NOW = new Date(2026, 5, 21, 12, 0); // 2026-06-21 12:00 local

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

function refusal(o: Partial<NormalizedRefusal> & { reason: NormalizedRefusal['reason']; daysAgo?: number }): NormalizedRefusal {
  const ms = NOW.getTime() - (o.daysAgo ?? 0) * 86_400_000;
  const iso = new Date(ms).toISOString();
  const tol = o.reason === 'nausea' || o.reason === 'side-effect';
  return {
    id: o.id ?? `r-${Math.random()}`,
    medicationId: o.medicationId ?? MED_ID,
    dueAt: o.dueAt ?? iso,
    loggedAt: o.loggedAt ?? iso,
    reason: o.reason,
    excludedFromAdherence: o.excludedFromAdherence ?? false,
    tolerabilitySignal: o.tolerabilitySignal ?? tol,
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

const EMPTY_BUNDLE: RefusalReasonI18nBundle = {
  locale: 'fr-FR',
  strings: {},
};

describe('rollupLocalisedRefusalSuggestions — basic shape', () => {
  it('returns one entry per input dose preserving order', () => {
    const doses = [
      dose('d-1', { dueAt: '2026-06-21T08:00:00.000' }),
      dose('d-2', { dueAt: '2026-06-21T20:00:00.000' }),
      dose('d-3', { dueAt: '2026-06-22T08:00:00.000' }),
    ];
    const rollup = rollupLocalisedRefusalSuggestions(doses, ctx(), EN_BUNDLE);
    expect(rollup.suggestions).toHaveLength(3);
    expect(rollup.suggestions[0]!.doseId).toBe('d-1');
    expect(rollup.suggestions[1]!.doseId).toBe('d-2');
    expect(rollup.suggestions[2]!.doseId).toBe('d-3');
  });

  it('populates byDoseId map with same entries', () => {
    const doses = [dose('d-1', { dueAt: '2026-06-21T08:00:00.000' })];
    const rollup = rollupLocalisedRefusalSuggestions(doses, ctx(), EN_BUNDLE);
    expect(rollup.byDoseId.size).toBe(1);
    expect(rollup.byDoseId.get('d-1')).toBe(rollup.suggestions[0]);
  });

  it('handles empty input gracefully', () => {
    const rollup = rollupLocalisedRefusalSuggestions([], ctx(), EN_BUNDLE);
    expect(rollup.suggestions).toEqual([]);
    expect(rollup.byDoseId.size).toBe(0);
    expect(rollup.coverage.doseCount).toBe(0);
    expect(rollup.coverage.suggestedCount).toBe(0);
  });
});

describe('rollupLocalisedRefusalSuggestions — no-suggestion entries preserved', () => {
  it('keeps doses with no suggestion in the result with suggestion=null', () => {
    // No context provided -> nothing fires
    const doses = [dose('d-1', { dueAt: '2026-06-21T08:00:00.000' })];
    const rollup = rollupLocalisedRefusalSuggestions(doses, ctx(), EN_BUNDLE);
    expect(rollup.suggestions).toHaveLength(1);
    expect(rollup.suggestions[0]!.suggestion).toBeNull();
    expect(rollup.suggestions[0]!.source).toBeNull();
    expect(rollup.suggestions[0]!.alternatives).toEqual([]);
  });

  it('mixes null and non-null entries when only some doses have signals', () => {
    const doses = [
      dose('d-no', { dueAt: '2026-06-22T08:00:00.000' }),
      dose('d-npo', { dueAt: '2026-06-21T08:00:00.000' }),
    ];
    const rollup = rollupLocalisedRefusalSuggestions(
      doses,
      ctx({ npoWindows: [{ startDate: '2026-06-21', endDate: '2026-06-21' }] }),
      EN_BUNDLE,
    );
    expect(rollup.suggestions[0]!.suggestion).toBeNull();
    expect(rollup.suggestions[1]!.suggestion).not.toBeNull();
    expect(rollup.suggestions[1]!.source).toBe('npo-window');
  });
});

describe('rollupLocalisedRefusalSuggestions — localisation', () => {
  it('localises explanation strings via the bundle', () => {
    const doses = [dose('d-1', { dueAt: '2026-06-21T08:00:00.000' })];
    const rollup = rollupLocalisedRefusalSuggestions(
      doses,
      ctx({ npoWindows: [{ startDate: '2026-06-21', endDate: '2026-06-21', reason: 'colonoscopia' }] }),
      ES_BUNDLE,
    );
    const entry = rollup.suggestions[0]!;
    expect(entry.suggestion).not.toBeNull();
    expect(entry.suggestion!.text).toContain('ventana NPO conocida');
    expect(entry.suggestion!.locale).toBe('es-419');
    expect(entry.suggestion!.fallback).toBe(false);
  });

  it('falls back to English explanation when bundle is empty', () => {
    const doses = [dose('d-1', { dueAt: '2026-06-21T08:00:00.000' })];
    const rollup = rollupLocalisedRefusalSuggestions(
      doses,
      ctx({ npoWindows: [{ startDate: '2026-06-21', endDate: '2026-06-21' }] }),
      EMPTY_BUNDLE,
    );
    const entry = rollup.suggestions[0]!;
    expect(entry.suggestion).not.toBeNull();
    expect(entry.suggestion!.fallback).toBe(true);
    expect(entry.suggestion!.text).toContain('NPO');
  });

  it('localises alternatives separately from the primary suggestion', () => {
    // Two rules fire: npo (priority 1) and out-of-supply (priority 3)
    const doses = [dose('d-1', { dueAt: '2026-06-21T08:00:00.000' })];
    const rollup = rollupLocalisedRefusalSuggestions(
      doses,
      ctx({
        medication: { id: MED_ID, supplyRemaining: 0 },
        npoWindows: [{ startDate: '2026-06-21', endDate: '2026-06-21' }],
      }),
      ES_BUNDLE,
    );
    const entry = rollup.suggestions[0]!;
    expect(entry.source).toBe('npo-window');
    expect(entry.alternatives.length).toBe(1); // out-of-supply
    expect(entry.alternatives[0]!.text).toContain('No hay suministro');
  });
});

describe('rollupLocalisedRefusalSuggestions — coverage', () => {
  it('counts doseCount and suggestedCount correctly', () => {
    const doses = [
      dose('d-npo', { dueAt: '2026-06-21T08:00:00.000' }),
      dose('d-none', { dueAt: '2026-06-22T08:00:00.000' }),
      dose('d-other', { dueAt: '2026-06-22T08:00:00.000' }),
    ];
    const rollup = rollupLocalisedRefusalSuggestions(
      doses,
      ctx({
        // Supply present; only NPO can fire
        medication: { id: MED_ID, supplyRemaining: 30 },
        npoWindows: [{ startDate: '2026-06-21', endDate: '2026-06-21' }],
      }),
      EN_BUNDLE,
    );
    expect(rollup.coverage.doseCount).toBe(3);
    // d-npo: npo-window fires; d-none / d-other: no rule
    expect(rollup.coverage.suggestedCount).toBe(1);
  });

  it('counts fallbackCount when bundle missing keys', () => {
    const doses = [
      dose('d-1', { dueAt: '2026-06-21T08:00:00.000' }),
      dose('d-2', { dueAt: '2026-06-22T08:00:00.000' }),
    ];
    const rollup = rollupLocalisedRefusalSuggestions(
      doses,
      ctx({
        medication: { id: MED_ID, supplyRemaining: 0 },
      }),
      EMPTY_BUNDLE,
    );
    expect(rollup.coverage.suggestedCount).toBe(2);
    expect(rollup.coverage.fallbackCount).toBe(2);
  });

  it('counts zero fallbackCount when bundle has all keys', () => {
    const doses = [dose('d-1', { dueAt: '2026-06-21T08:00:00.000' })];
    const rollup = rollupLocalisedRefusalSuggestions(
      doses,
      ctx({ npoWindows: [{ startDate: '2026-06-21', endDate: '2026-06-21' }] }),
      ES_BUNDLE,
    );
    expect(rollup.coverage.fallbackCount).toBe(0);
  });

  it('produces bySource map keyed on i18n source', () => {
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
    // d-1 -> npo-window (higher priority than supply)
    // d-2 -> out-of-supply (no NPO match)
    expect(rollup.coverage.bySource.get('npo-window')?.suggested).toBe(1);
    expect(rollup.coverage.bySource.get('out-of-supply')?.suggested).toBe(1);
  });

  it('bySource fallback counts track per source independently', () => {
    const doses = [
      dose('d-1', { dueAt: '2026-06-21T08:00:00.000' }),
      dose('d-2', { dueAt: '2026-06-22T08:00:00.000' }),
    ];
    // ES_BUNDLE has all keys; EMPTY_BUNDLE has none
    const rollupEmpty = rollupLocalisedRefusalSuggestions(
      doses,
      ctx({
        medication: { id: MED_ID, supplyRemaining: 0 },
        npoWindows: [{ startDate: '2026-06-21', endDate: '2026-06-21' }],
      }),
      EMPTY_BUNDLE,
    );
    expect(rollupEmpty.coverage.bySource.get('npo-window')?.fallback).toBe(1);
    expect(rollupEmpty.coverage.bySource.get('out-of-supply')?.fallback).toBe(1);
  });

  it('aggregates missingPlaceholders across suggestions + alternatives', () => {
    // Bad ES bundle: removes the {reasonSuffix} placeholder from npo template
    const badBundle: RefusalReasonI18nBundle = {
      locale: 'es-419',
      strings: {
        'npo-window': 'NPO {unknownPlaceholder}',
      },
    };
    const doses = [dose('d-1', { dueAt: '2026-06-21T08:00:00.000' })];
    const rollup = rollupLocalisedRefusalSuggestions(
      doses,
      ctx({ npoWindows: [{ startDate: '2026-06-21', endDate: '2026-06-21' }] }),
      badBundle,
    );
    expect(rollup.coverage.missingPlaceholders).toContain('unknownPlaceholder');
  });

  it('missingPlaceholders empty in the happy path', () => {
    const doses = [dose('d-1', { dueAt: '2026-06-21T08:00:00.000' })];
    const rollup = rollupLocalisedRefusalSuggestions(
      doses,
      ctx({ npoWindows: [{ startDate: '2026-06-21', endDate: '2026-06-21' }] }),
      EN_BUNDLE,
    );
    expect(rollup.coverage.missingPlaceholders).toEqual([]);
  });

  it('missingPlaceholders sorted alphabetically', () => {
    // Test stable sort by injecting two missing placeholders
    const badBundle: RefusalReasonI18nBundle = {
      locale: 'es-419',
      strings: {
        'npo-window': 'NPO {zBad} {aBad}',
      },
    };
    const doses = [dose('d-1', { dueAt: '2026-06-21T08:00:00.000' })];
    const rollup = rollupLocalisedRefusalSuggestions(
      doses,
      ctx({ npoWindows: [{ startDate: '2026-06-21', endDate: '2026-06-21' }] }),
      badBundle,
    );
    expect(rollup.coverage.missingPlaceholders).toEqual(['aBad', 'zBad']);
  });
});

describe('rollupLocalisedRefusalSuggestions — pattern rule integration', () => {
  it('localises pattern-source suggestions with count + days substitution', () => {
    const refusals = [
      refusal({ reason: 'nausea', daysAgo: 2 }),
      refusal({ reason: 'nausea', daysAgo: 4 }),
    ];
    const doses = [dose('d-1', { dueAt: '2026-06-21T12:00:00.000' })];
    const rollup = rollupLocalisedRefusalSuggestions(
      doses,
      ctx({ recentRefusals: refusals }),
      ES_BUNDLE,
    );
    const entry = rollup.suggestions[0]!;
    expect(entry.source).toBe('recent-pattern');
    expect(entry.suggestion!.text).toContain('nausea');
    expect(entry.suggestion!.text).toContain('30 días');
  });
});

describe('summarizeI18nRollupCoverage', () => {
  it('produces a readable summary string', () => {
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
    const summary = summarizeI18nRollupCoverage(rollup.coverage);
    expect(summary).toContain('2/2 suggested');
    expect(summary).toContain('0 fallback');
    expect(summary).toContain('Top source:');
    expect(summary).toContain('Missing placeholders: none.');
  });

  it('reports zero / none when nothing happened', () => {
    const rollup = rollupLocalisedRefusalSuggestions([], ctx(), EN_BUNDLE);
    const summary = summarizeI18nRollupCoverage(rollup.coverage);
    expect(summary).toContain('0/0 suggested');
    expect(summary).toContain('Top source: none');
  });

  it('lists missingPlaceholders when present', () => {
    const badBundle: RefusalReasonI18nBundle = {
      locale: 'es-419',
      strings: { 'npo-window': 'NPO {oops}' },
    };
    const doses = [dose('d-1', { dueAt: '2026-06-21T08:00:00.000' })];
    const rollup = rollupLocalisedRefusalSuggestions(
      doses,
      ctx({ npoWindows: [{ startDate: '2026-06-21', endDate: '2026-06-21' }] }),
      badBundle,
    );
    const summary = summarizeI18nRollupCoverage(rollup.coverage);
    expect(summary).toContain('oops');
  });
});

describe('filterSuggestedOnly', () => {
  it('returns only entries with a non-null suggestion', () => {
    const doses = [
      dose('d-none', { dueAt: '2026-06-22T08:00:00.000' }),
      dose('d-npo', { dueAt: '2026-06-21T08:00:00.000' }),
      dose('d-none2', { dueAt: '2026-06-23T08:00:00.000' }),
    ];
    const rollup = rollupLocalisedRefusalSuggestions(
      doses,
      ctx({ npoWindows: [{ startDate: '2026-06-21', endDate: '2026-06-21' }] }),
      EN_BUNDLE,
    );
    const filtered = filterSuggestedOnly(rollup);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.doseId).toBe('d-npo');
  });

  it('returns empty array when no doses had suggestions', () => {
    const doses = [dose('d-1', { dueAt: '2026-06-21T08:00:00.000' })];
    const rollup = rollupLocalisedRefusalSuggestions(doses, ctx(), EN_BUNDLE);
    expect(filterSuggestedOnly(rollup)).toEqual([]);
  });
});

describe('groupBySource', () => {
  it('groups suggestions by their i18n source key', () => {
    const doses = [
      dose('d-npo-1', { dueAt: '2026-06-21T08:00:00.000' }),
      dose('d-npo-2', { dueAt: '2026-06-21T20:00:00.000' }),
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
    const grouped = groupBySource(rollup);
    expect(grouped.get('npo-window')!.length).toBe(2);
    expect(grouped.get('out-of-supply')!.length).toBe(1);
  });

  it('absent sources are not in the map', () => {
    const doses = [dose('d-1', { dueAt: '2026-06-21T08:00:00.000' })];
    const rollup = rollupLocalisedRefusalSuggestions(
      doses,
      ctx({ npoWindows: [{ startDate: '2026-06-21', endDate: '2026-06-21' }] }),
      EN_BUNDLE,
    );
    const grouped = groupBySource(rollup);
    expect(grouped.has('npo-window')).toBe(true);
    expect(grouped.has('out-of-supply')).toBe(false);
    expect(grouped.has('sleeping-window')).toBe(false);
  });

  it('skips doses without a suggestion', () => {
    const doses = [
      dose('d-none', { dueAt: '2026-06-22T08:00:00.000' }),
      dose('d-npo', { dueAt: '2026-06-21T08:00:00.000' }),
    ];
    const rollup = rollupLocalisedRefusalSuggestions(
      doses,
      ctx({ npoWindows: [{ startDate: '2026-06-21', endDate: '2026-06-21' }] }),
      EN_BUNDLE,
    );
    const grouped = groupBySource(rollup);
    expect(grouped.get('npo-window')).toHaveLength(1);
    expect(grouped.get('npo-window')![0]!.doseId).toBe('d-npo');
  });

  it('preserves order within each source group', () => {
    const doses = [
      dose('d-npo-a', { dueAt: '2026-06-21T08:00:00.000' }),
      dose('d-npo-b', { dueAt: '2026-06-21T20:00:00.000' }),
      dose('d-npo-c', { dueAt: '2026-06-21T22:00:00.000' }),
    ];
    const rollup = rollupLocalisedRefusalSuggestions(
      doses,
      ctx({ npoWindows: [{ startDate: '2026-06-21', endDate: '2026-06-21' }] }),
      EN_BUNDLE,
    );
    const grouped = groupBySource(rollup);
    const ids = grouped.get('npo-window')!.map((s) => s.doseId);
    expect(ids).toEqual(['d-npo-a', 'd-npo-b', 'd-npo-c']);
  });
});
