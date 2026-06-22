import { describe, it, expect } from 'vitest';
import {
  renderRefusalReasonExplanation,
  localiseRefusalReasonResult,
  validateRefusalReasonI18nTable,
  REFUSAL_REASON_I18N_EN,
  type RefusalReasonI18nBundle,
  type RefusalReasonI18nTable,
} from '../src/refusal-reason-suggest-i18n';
import type {
  RefusalReasonSuggestion,
  RefusalReasonSuggestResult,
} from '../src/refusal-reason-suggest';

const ES: RefusalReasonI18nTable = {
  'npo-window': 'La fecha programada cae dentro de una ventana NPO conocida{reasonSuffix}.',
  'prescriber-pause':
    'El prescriptor pauso este medicamento para la ventana actual{reasonSuffix}.',
  'out-of-supply': 'No queda suministro de este medicamento en la fecha de la dosis.',
  'sleeping-window':
    'La hora programada {time} cae dentro de la ventana de sueno del paciente ({start}\u2013{end}).',
  'recent-pattern':
    'El paciente rechazo este medicamento {count} vez(es) en los ultimos {days} dias citando "{reason}".',
};

const EN_BUNDLE: RefusalReasonI18nBundle = {
  locale: 'en-US',
  strings: REFUSAL_REASON_I18N_EN,
};
const ES_BUNDLE: RefusalReasonI18nBundle = {
  locale: 'es-419',
  strings: ES,
};

function suggestion(
  source: RefusalReasonSuggestion['source'],
  explanation: string,
  reason: RefusalReasonSuggestion['reason'] = 'declined',
  confidence = 0.7,
): RefusalReasonSuggestion {
  return { source, reason, confidence, explanation };
}

describe('renderRefusalReasonExplanation — English fallback', () => {
  it('renders English template for npo-window with no reason', () => {
    const s = suggestion(
      'npo-window',
      'Scheduled date falls inside a known NPO window.',
      'npo',
      0.95,
    );
    const out = renderRefusalReasonExplanation(s, EN_BUNDLE);
    expect(out.fallback).toBe(false);
    expect(out.locale).toBe('en-US');
    expect(out.text).toBe('Scheduled date falls inside a known NPO window.');
    expect(out.missingPlaceholders).toEqual([]);
  });

  it('renders English template for npo-window with a reason', () => {
    const s = suggestion(
      'npo-window',
      'Scheduled date falls inside a known NPO window (colonoscopy).',
      'npo',
      0.95,
    );
    const out = renderRefusalReasonExplanation(s, EN_BUNDLE);
    expect(out.text).toBe(
      'Scheduled date falls inside a known NPO window (colonoscopy).',
    );
  });

  it('renders English template for sleeping-window', () => {
    const s = suggestion(
      'sleeping-window',
      "Scheduled time 03:30 falls inside the patient's sleep window (22:00\u201307:00).",
      'sleeping',
      0.7,
    );
    const out = renderRefusalReasonExplanation(s, EN_BUNDLE);
    expect(out.text).toContain('03:30');
    expect(out.text).toContain('(22:00\u201307:00)');
  });

  it('renders English template for recent-pattern', () => {
    const s = suggestion(
      'recent-pattern',
      'Patient refused this medication 4 times in the last 30 days citing "nausea".',
      'nausea',
      0.6,
    );
    const out = renderRefusalReasonExplanation(s, EN_BUNDLE);
    expect(out.text).toContain('4');
    expect(out.text).toContain('30');
    expect(out.text).toContain('nausea');
  });

  it('renders English template for recent-pattern with singular count', () => {
    const s = suggestion(
      'recent-pattern',
      'Patient refused this medication 1 time in the last 30 days citing "side-effect".',
      'side-effect',
      0.45,
    );
    const out = renderRefusalReasonExplanation(s, EN_BUNDLE);
    expect(out.text).toContain('1 time(s)');
  });

  it('renders English template for out-of-supply (no placeholders)', () => {
    const s = suggestion(
      'out-of-supply',
      'No supply remaining for this medication on the dose date.',
      'out-of-supply',
      0.85,
    );
    const out = renderRefusalReasonExplanation(s, EN_BUNDLE);
    expect(out.fallback).toBe(false);
    expect(out.text).toBe(
      'No supply remaining for this medication on the dose date.',
    );
  });

  it('renders English template for prescriber-pause with reason', () => {
    const s = suggestion(
      'prescriber-pause',
      'Prescriber paused this medication for the current window (hold for INR).',
      'prescriber-paused',
      0.9,
    );
    const out = renderRefusalReasonExplanation(s, EN_BUNDLE);
    expect(out.text).toBe(
      'Prescriber paused this medication for the current window (hold for INR).',
    );
  });
});

describe('renderRefusalReasonExplanation — Spanish localisation', () => {
  it('renders Spanish template for npo-window', () => {
    const s = suggestion(
      'npo-window',
      'Scheduled date falls inside a known NPO window.',
      'npo',
    );
    const out = renderRefusalReasonExplanation(s, ES_BUNDLE);
    expect(out.locale).toBe('es-419');
    expect(out.fallback).toBe(false);
    expect(out.text).toBe('La fecha programada cae dentro de una ventana NPO conocida.');
  });

  it('renders Spanish template for npo-window with reason interpolation', () => {
    const s = suggestion(
      'npo-window',
      'Scheduled date falls inside a known NPO window (cirugia).',
      'npo',
    );
    const out = renderRefusalReasonExplanation(s, ES_BUNDLE);
    expect(out.text).toBe(
      'La fecha programada cae dentro de una ventana NPO conocida (cirugia).',
    );
  });

  it('renders Spanish template for sleeping-window with time/start/end', () => {
    const s = suggestion(
      'sleeping-window',
      "Scheduled time 03:30 falls inside the patient's sleep window (22:00\u201307:00).",
      'sleeping',
    );
    const out = renderRefusalReasonExplanation(s, ES_BUNDLE);
    expect(out.text).toContain('03:30');
    expect(out.text).toContain('22:00');
    expect(out.text).toContain('07:00');
  });

  it('renders Spanish template for recent-pattern with count/days/reason', () => {
    const s = suggestion(
      'recent-pattern',
      'Patient refused this medication 3 times in the last 30 days citing "nausea".',
      'nausea',
    );
    const out = renderRefusalReasonExplanation(s, ES_BUNDLE);
    expect(out.text).toContain('3');
    expect(out.text).toContain('30');
    expect(out.text).toContain('nausea');
  });

  it('renders Spanish for out-of-supply (no placeholders required)', () => {
    const s = suggestion(
      'out-of-supply',
      'No supply remaining for this medication on the dose date.',
      'out-of-supply',
    );
    const out = renderRefusalReasonExplanation(s, ES_BUNDLE);
    expect(out.text).toBe(
      'No queda suministro de este medicamento en la fecha de la dosis.',
    );
  });
});

describe('renderRefusalReasonExplanation — fallback paths', () => {
  it('falls back to the suggestion explanation when locale key missing', () => {
    const partial: RefusalReasonI18nBundle = {
      locale: 'fr-FR',
      strings: { 'out-of-supply': 'pas de stock' },
    };
    const s = suggestion('sleeping-window', 'whatever explanation text');
    const out = renderRefusalReasonExplanation(s, partial);
    expect(out.fallback).toBe(true);
    expect(out.locale).toBe('en-US');
    expect(out.text).toBe('whatever explanation text');
  });

  it('falls back when extraction fails for an unrecognised English template', () => {
    const s = suggestion('npo-window', 'totally non-matching string');
    const out = renderRefusalReasonExplanation(s, ES_BUNDLE);
    expect(out.fallback).toBe(true);
    expect(out.text).toBe('totally non-matching string');
  });

  it('records missing placeholders without crashing when a template uses unknown keys', () => {
    const buggy: RefusalReasonI18nBundle = {
      locale: 'qz-QZ',
      strings: {
        ...REFUSAL_REASON_I18N_EN,
        'sleeping-window': 'time={time} oddball={zzz}',
      },
    };
    const s = suggestion(
      'sleeping-window',
      "Scheduled time 09:00 falls inside the patient's sleep window (22:00\u201307:00).",
    );
    const out = renderRefusalReasonExplanation(s, buggy);
    expect(out.fallback).toBe(false);
    expect(out.text).toBe('time=09:00 oddball={zzz}');
    expect(out.missingPlaceholders).toEqual(['zzz']);
  });

  it('falls back when source value is not a known i18n key', () => {
    // simulate an upstream change adding a new source we don't yet know
    const s = {
      source: 'future-source' as RefusalReasonSuggestion['source'],
      reason: 'declined' as const,
      confidence: 0.3,
      explanation: 'something new entirely',
    } as RefusalReasonSuggestion;
    const out = renderRefusalReasonExplanation(s, EN_BUNDLE);
    expect(out.fallback).toBe(true);
    expect(out.text).toBe('something new entirely');
  });
});

describe('localiseRefusalReasonResult', () => {
  it('returns null when no suggestion fired', () => {
    const result: RefusalReasonSuggestResult = { suggested: null, alternatives: [] };
    const out = localiseRefusalReasonResult(result, ES_BUNDLE);
    expect(out).toBeNull();
  });

  it('localises suggested + alternatives', () => {
    const s1 = suggestion(
      'npo-window',
      'Scheduled date falls inside a known NPO window.',
      'npo',
      0.95,
    );
    const s2 = suggestion(
      'sleeping-window',
      "Scheduled time 03:30 falls inside the patient's sleep window (22:00\u201307:00).",
      'sleeping',
      0.7,
    );
    const result: RefusalReasonSuggestResult = {
      suggested: s1,
      alternatives: [s1, s2],
    };
    const out = localiseRefusalReasonResult(result, ES_BUNDLE);
    expect(out).not.toBeNull();
    if (!out) return;
    expect(out.reason).toBe('npo');
    expect(out.suggested.locale).toBe('es-419');
    expect(out.alternatives).toHaveLength(2);
    expect(out.alternatives[1]!.text).toContain('03:30');
  });
});

describe('validateRefusalReasonI18nTable', () => {
  it('returns no errors for the bundled English table', () => {
    const errors = validateRefusalReasonI18nTable(REFUSAL_REASON_I18N_EN);
    expect(errors).toEqual([]);
  });

  it('returns no errors for a complete Spanish table', () => {
    const errors = validateRefusalReasonI18nTable(ES);
    expect(errors).toEqual([]);
  });

  it('reports missing-key for an empty / undefined entry', () => {
    const t: Partial<RefusalReasonI18nTable> = { ...ES };
    delete t['npo-window'];
    const errors = validateRefusalReasonI18nTable(t);
    expect(errors).toContainEqual({
      key: 'npo-window',
      code: 'missing-key',
      detail: 'template for "npo-window" is empty',
    });
  });

  it('reports missing-placeholder when sleep template lacks time', () => {
    const t: RefusalReasonI18nTable = {
      ...ES,
      'sleeping-window': 'ventana sueno ({start}\u2013{end})',
    };
    const errors = validateRefusalReasonI18nTable(t);
    const found = errors.find((e) => e.code === 'missing-placeholder');
    expect(found).toBeTruthy();
    expect(found!.detail).toContain('"{time}"');
  });

  it('reports unknown-placeholder for a typo in the template', () => {
    const t: RefusalReasonI18nTable = {
      ...ES,
      'recent-pattern':
        'rechazo {count} vez(es) en los ultimos {dayz} dias citando "{reason}".',
    };
    const errors = validateRefusalReasonI18nTable(t);
    const unknown = errors.find((e) => e.code === 'unknown-placeholder');
    expect(unknown).toBeTruthy();
    expect(unknown!.detail).toContain('"{dayz}"');
    // It should ALSO report missing-placeholder for days.
    const missing = errors.find((e) => e.code === 'missing-placeholder');
    expect(missing!.detail).toContain('"{days}"');
  });

  it('reports missing-key for empty string entries (not just absent ones)', () => {
    const t: Partial<RefusalReasonI18nTable> = { ...ES, 'out-of-supply': '' };
    const errors = validateRefusalReasonI18nTable(t);
    expect(errors.some((e) => e.key === 'out-of-supply' && e.code === 'missing-key')).toBe(
      true,
    );
  });
});

describe('REFUSAL_REASON_I18N_EN parity with suggester', () => {
  it('every key in the English table is a known suggester source', () => {
    const keys = Object.keys(REFUSAL_REASON_I18N_EN);
    expect(keys.sort()).toEqual([
      'npo-window',
      'out-of-supply',
      'prescriber-pause',
      'recent-pattern',
      'sleeping-window',
    ]);
  });
});
