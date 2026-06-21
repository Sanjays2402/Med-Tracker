import { describe, it, expect } from 'vitest';
import {
  resolveMedicationConflict,
  resolveAll,
  summarizeResolution,
  DEFAULT_PRECEDENCE,
  SUBSTANTIVE_FIELDS,
  type MedicationRecord,
} from '../src/medication-conflict-resolver';

function rec(o: Partial<MedicationRecord>): MedicationRecord {
  return {
    source: o.source ?? 'pharmacy',
    recordedAt: o.recordedAt ?? '2026-06-01T12:00:00Z',
    medication: o.medication ?? {},
  };
}

describe('resolveMedicationConflict — base behaviour', () => {
  it('throws on empty record list', () => {
    expect(() => resolveMedicationConflict([])).toThrow(/no records/i);
  });

  it('returns single-source record unchanged', () => {
    const r = rec({
      source: 'pharmacy',
      medication: { id: 'm-1', drugId: 'd-1', name: 'Metformin', strength: '500 mg' },
    });
    const result = resolveMedicationConflict([r]);
    expect(result.medication.name).toBe('Metformin');
    expect(result.medication.strength).toBe('500 mg');
    expect(result.manualReview).toHaveLength(0);
    expect(result.sources).toEqual(['pharmacy']);
  });

  it('throws when records span different medicationIds', () => {
    expect(() =>
      resolveMedicationConflict([
        rec({ medication: { id: 'm-1', drugId: 'd-1' } }),
        rec({ medication: { id: 'm-2', drugId: 'd-1' } }),
      ]),
    ).toThrow(/multiple medication/i);
  });

  it('throws when records span different drugIds', () => {
    expect(() =>
      resolveMedicationConflict([
        rec({ medication: { id: 'm-1', drugId: 'd-1' } }),
        rec({ medication: { id: 'm-1', drugId: 'd-2' } }),
      ]),
    ).toThrow(/multiple drug/i);
  });
});

describe('resolveMedicationConflict — precedence picks', () => {
  it('pharmacy wins over manual for strength', () => {
    const result = resolveMedicationConflict([
      rec({ source: 'manual', medication: { id: 'm-1', drugId: 'd-1', strength: '250 mg' } }),
      rec({ source: 'pharmacy', medication: { id: 'm-1', drugId: 'd-1', strength: '500 mg' } }),
    ]);
    expect(result.medication.strength).toBe('500 mg');
    const choice = result.fieldChoices.find((c) => c.field === 'strength')!;
    expect(choice.source).toBe('pharmacy');
  });

  it('manual wins over EHR for the brand name when custom precedence puts it first', () => {
    const result = resolveMedicationConflict(
      [
        rec({ source: 'ehr', medication: { id: 'm-1', drugId: 'd-1', name: 'metformin HCl' } }),
        rec({ source: 'manual', medication: { id: 'm-1', drugId: 'd-1', name: 'Glucophage' } }),
      ],
      {
        fieldPrecedence: { name: ['ehr', 'manual'] },
      },
    );
    expect(result.medication.name).toBe('Glucophage');
  });

  it('non-empty value always beats empty value regardless of source priority', () => {
    // Pharmacy has empty notes, manual has notes. Pharmacy has higher
    // global priority but empty should not displace non-empty.
    const result = resolveMedicationConflict([
      rec({
        source: 'pharmacy',
        medication: { id: 'm-1', drugId: 'd-1', strength: '500 mg', instructions: '' },
      }),
      rec({
        source: 'manual',
        medication: { id: 'm-1', drugId: 'd-1', instructions: 'Take with food' },
      }),
    ]);
    expect(result.medication.instructions).toBe('Take with food');
  });

  it('falls back to most recent record when same-tier values disagree', () => {
    const result = resolveMedicationConflict([
      rec({
        source: 'pharmacy',
        recordedAt: '2026-06-01T12:00:00Z',
        medication: { id: 'm-1', drugId: 'd-1', strength: '250 mg' },
      }),
      rec({
        source: 'pharmacy',
        recordedAt: '2026-06-15T12:00:00Z',
        medication: { id: 'm-1', drugId: 'd-1', strength: '500 mg' },
      }),
    ]);
    expect(result.medication.strength).toBe('500 mg');
    expect(result.manualReview).toHaveLength(1);
    expect(result.manualReview[0]!.field).toBe('strength');
  });
});

describe('resolveMedicationConflict — manual review flagging', () => {
  it('flags substantive disagreement at the top tier', () => {
    const result = resolveMedicationConflict([
      rec({
        source: 'pharmacy',
        recordedAt: '2026-06-15T12:00:00Z',
        medication: { id: 'm-1', drugId: 'd-1', strength: '500 mg' },
      }),
      rec({
        source: 'pharmacy',
        recordedAt: '2026-06-01T12:00:00Z',
        medication: { id: 'm-1', drugId: 'd-1', strength: '850 mg' },
      }),
    ]);
    expect(result.manualReview).toHaveLength(1);
    expect(result.manualReview[0]!.field).toBe('strength');
    expect(result.manualReview[0]!.chosenSource).toBe('pharmacy');
    expect(result.manualReview[0]!.reason).toMatch(/different/);
  });

  it('does NOT flag identical values at the top tier', () => {
    const result = resolveMedicationConflict([
      rec({
        source: 'pharmacy',
        recordedAt: '2026-06-15T12:00:00Z',
        medication: { id: 'm-1', drugId: 'd-1', strength: '500 mg' },
      }),
      rec({
        source: 'pharmacy',
        recordedAt: '2026-06-01T12:00:00Z',
        medication: { id: 'm-1', drugId: 'd-1', strength: '500 mg' },
      }),
    ]);
    expect(result.manualReview).toHaveLength(0);
  });

  it('does NOT flag non-substantive field disagreement (e.g. name)', () => {
    const result = resolveMedicationConflict([
      rec({ source: 'pharmacy', recordedAt: '2026-06-15T12:00:00Z', medication: { id: 'm-1', drugId: 'd-1', name: 'METFORMIN' } }),
      rec({ source: 'pharmacy', recordedAt: '2026-06-01T12:00:00Z', medication: { id: 'm-1', drugId: 'd-1', name: 'Metformin' } }),
    ]);
    expect(result.manualReview).toHaveLength(0);
  });

  it('flags multiple substantive fields independently', () => {
    const result = resolveMedicationConflict([
      rec({
        source: 'pharmacy',
        recordedAt: '2026-06-15T12:00:00Z',
        medication: { id: 'm-1', drugId: 'd-1', strength: '500 mg', dosesPerRefill: 90 },
      }),
      rec({
        source: 'pharmacy',
        recordedAt: '2026-06-01T12:00:00Z',
        medication: { id: 'm-1', drugId: 'd-1', strength: '850 mg', dosesPerRefill: 30 },
      }),
    ]);
    expect(result.manualReview).toHaveLength(2);
    const fields = result.manualReview.map((m) => m.field).sort();
    expect(fields).toEqual(['dosesPerRefill', 'strength']);
  });

  it('lower-tier disagreement against a higher-tier authority does NOT flag', () => {
    // pharmacy (top) reports 500mg, manual (low) reports 250mg.
    // Pharmacy wins cleanly; no review needed.
    const result = resolveMedicationConflict([
      rec({ source: 'pharmacy', medication: { id: 'm-1', drugId: 'd-1', strength: '500 mg' } }),
      rec({ source: 'manual', medication: { id: 'm-1', drugId: 'd-1', strength: '250 mg' } }),
    ]);
    expect(result.manualReview).toHaveLength(0);
    expect(result.medication.strength).toBe('500 mg');
  });
});

describe('resolveMedicationConflict — field choice audit trail', () => {
  it('records every candidate for every field', () => {
    const result = resolveMedicationConflict([
      rec({ source: 'pharmacy', medication: { id: 'm-1', drugId: 'd-1', strength: '500 mg' } }),
      rec({ source: 'manual', medication: { id: 'm-1', drugId: 'd-1', strength: '250 mg' } }),
    ]);
    const choice = result.fieldChoices.find((c) => c.field === 'strength')!;
    expect(choice.candidates).toHaveLength(2);
    expect(choice.candidates.map((c) => c.source).sort()).toEqual(['manual', 'pharmacy']);
  });

  it('fieldChoices are sorted alphabetically for stable rendering', () => {
    const result = resolveMedicationConflict([
      rec({ source: 'pharmacy', medication: { id: 'm-1', drugId: 'd-1', strength: '500 mg', form: 'tablet', name: 'm', active: true } }),
    ]);
    const names = result.fieldChoices.map((c) => String(c.field));
    expect([...names].sort()).toEqual(names);
  });
});

describe('resolveAll', () => {
  it('groups records by medicationId and resolves each group', () => {
    const records: MedicationRecord[] = [
      rec({ source: 'pharmacy', medication: { id: 'm-1', drugId: 'd-1', strength: '500 mg' } }),
      rec({ source: 'manual', medication: { id: 'm-1', drugId: 'd-1', strength: '250 mg' } }),
      rec({ source: 'pharmacy', medication: { id: 'm-2', drugId: 'd-2', strength: '20 mg' } }),
    ];
    const results = resolveAll(records);
    expect(results).toHaveLength(2);
    const r1 = results.find((r) => r.key === 'm-1')!;
    expect(r1.result.medication.strength).toBe('500 mg');
  });

  it('groups by drugId when id is missing', () => {
    const records: MedicationRecord[] = [
      rec({ source: 'pharmacy', medication: { drugId: 'd-1', strength: '500 mg' } }),
      rec({ source: 'manual', medication: { drugId: 'd-1', strength: '500 mg' } }),
    ];
    const results = resolveAll(records);
    expect(results).toHaveLength(1);
    expect(results[0]!.key).toBe('drug:d-1');
  });

  it('skips records with no id and no drugId', () => {
    const records: MedicationRecord[] = [
      rec({ source: 'pharmacy', medication: { strength: '500 mg' } }),
    ];
    expect(resolveAll(records)).toHaveLength(0);
  });
});

describe('summarizeResolution', () => {
  it('reports a clean merge', () => {
    const result = resolveMedicationConflict([
      rec({ source: 'pharmacy', medication: { id: 'm-1', drugId: 'd-1', strength: '500 mg' } }),
      rec({ source: 'ehr', medication: { id: 'm-1', drugId: 'd-1', startDate: '2026-01-01' } }),
    ]);
    expect(summarizeResolution(result)).toMatch(/no conflicts/);
  });

  it('reports a conflicted merge', () => {
    const result = resolveMedicationConflict([
      rec({ source: 'pharmacy', recordedAt: '2026-06-15T12:00:00Z', medication: { id: 'm-1', drugId: 'd-1', strength: '500 mg' } }),
      rec({ source: 'pharmacy', recordedAt: '2026-06-01T12:00:00Z', medication: { id: 'm-1', drugId: 'd-1', strength: '850 mg' } }),
    ]);
    expect(summarizeResolution(result)).toMatch(/1 field needs review/);
  });
});

describe('exports', () => {
  it('DEFAULT_PRECEDENCE puts pharmacy at the top', () => {
    expect(DEFAULT_PRECEDENCE[DEFAULT_PRECEDENCE.length - 1]).toBe('pharmacy');
  });

  it('SUBSTANTIVE_FIELDS contains strength', () => {
    expect(SUBSTANTIVE_FIELDS).toContain('strength');
  });
});
