import { describe, it, expect } from 'vitest';
import {
  buildDoseCsvExport,
  parseDoseCsvExport,
} from '../src/dose-export-csv';
import type { Dose, Medication } from '@med/types';

const USER_ID = '22222222-2222-2222-2222-222222222222';

function med(overrides: Partial<Medication> = {}): Medication {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    userId: USER_ID,
    drugId: 'metformin-500',
    name: 'Metformin',
    strength: '500 mg',
    form: 'tablet',
    startDate: '2026-01-01',
    active: true,
    supplyRemaining: 60,
    dosesPerRefill: 30,
    ...overrides,
  };
}

function dose(overrides: Partial<Dose> = {}): Dose {
  return {
    id: '33333333-3333-3333-3333-333333333333',
    medicationId: '11111111-1111-1111-1111-111111111111',
    scheduleId: '44444444-4444-4444-4444-444444444444',
    dueAt: '2026-06-15T08:00:00.000Z',
    takenAt: '2026-06-15T08:05:00.000Z',
    status: 'taken',
    ...overrides,
  };
}

describe('buildDoseCsvExport — header + envelope', () => {
  it('emits the MED_TRACKER columns by default', () => {
    const r = buildDoseCsvExport({
      userId: USER_ID,
      medications: [med()],
      doses: [dose()],
    });
    expect(r.layout).toBe('MED_TRACKER');
    expect(r.columns).toEqual([
      'dose_id',
      'medication_id',
      'medication_name',
      'medication_strength',
      'medication_form',
      'schedule_id',
      'due_at',
      'taken_at',
      'status',
      'note',
    ]);
    const firstLine = r.csv.split('\r\n')[0];
    expect(firstLine).toBe(
      'dose_id,medication_id,medication_name,medication_strength,medication_form,schedule_id,due_at,taken_at,status,note',
    );
  });

  it('emits WALGREENS columns when requested', () => {
    const r = buildDoseCsvExport({
      userId: USER_ID,
      medications: [med()],
      doses: [dose()],
      options: { layout: 'WALGREENS' },
    });
    expect(r.columns).toEqual([
      'member_id',
      'rx_number',
      'drug_name',
      'strength',
      'dosage_form',
      'due_datetime',
      'taken_datetime',
      'outcome',
      'notes',
    ]);
  });

  it('emits CVS columns when requested', () => {
    const r = buildDoseCsvExport({
      userId: USER_ID,
      medications: [med()],
      doses: [dose()],
      options: { layout: 'CVS' },
    });
    expect(r.columns).toEqual([
      'patientId',
      'prescriptionId',
      'drugName',
      'strength',
      'form',
      'scheduledDateTime',
      'administeredDateTime',
      'status',
      'notes',
    ]);
  });

  it('defaults to CRLF line separator (Excel-friendly)', () => {
    const r = buildDoseCsvExport({
      userId: USER_ID,
      medications: [med()],
      doses: [dose()],
    });
    expect(r.csv.includes('\r\n')).toBe(true);
    // Body terminator is CRLF too.
    expect(r.csv.endsWith('\r\n')).toBe(true);
  });

  it('honours LF line separator when requested', () => {
    const r = buildDoseCsvExport({
      userId: USER_ID,
      medications: [med()],
      doses: [dose()],
      options: { lineSeparator: '\n' },
    });
    expect(r.csv.includes('\r\n')).toBe(false);
    expect(r.csv.endsWith('\n')).toBe(true);
  });

  it('prefixes BOM when bom=true', () => {
    const r = buildDoseCsvExport({
      userId: USER_ID,
      medications: [med()],
      doses: [dose()],
      options: { bom: true },
    });
    expect(r.csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('omits BOM by default', () => {
    const r = buildDoseCsvExport({
      userId: USER_ID,
      medications: [med()],
      doses: [dose()],
    });
    expect(r.csv.charCodeAt(0)).not.toBe(0xfeff);
  });

  it('header is emitted even when there are zero rows', () => {
    const r = buildDoseCsvExport({
      userId: USER_ID,
      medications: [],
      doses: [],
    });
    expect(r.rowCount).toBe(0);
    expect(r.csv.split('\r\n')[0]).toBe(
      'dose_id,medication_id,medication_name,medication_strength,medication_form,schedule_id,due_at,taken_at,status,note',
    );
  });
});

describe('buildDoseCsvExport — body content', () => {
  it('renders a MED_TRACKER row with all native columns populated', () => {
    const r = buildDoseCsvExport({
      userId: USER_ID,
      medications: [med({ name: 'Lisinopril', strength: '10 mg' })],
      doses: [dose({ note: 'after dinner' })],
    });
    const bodyLine = r.csv.split('\r\n')[1];
    expect(bodyLine).toContain('Lisinopril');
    expect(bodyLine).toContain('10 mg');
    expect(bodyLine).toContain('after dinner');
    expect(bodyLine).toContain('taken');
  });

  it('maps DoseStatus to pharmacy labels for WALGREENS layout', () => {
    const r = buildDoseCsvExport({
      userId: USER_ID,
      medications: [med()],
      doses: [
        dose({ id: '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', status: 'taken' }),
        dose({ id: '22222222-aaaa-aaaa-aaaa-aaaaaaaaaaaa', status: 'late', dueAt: '2026-06-16T08:00:00.000Z', takenAt: '2026-06-16T09:00:00.000Z' }),
        dose({ id: '33333333-aaaa-aaaa-aaaa-aaaaaaaaaaaa', status: 'missed', dueAt: '2026-06-17T08:00:00.000Z', takenAt: null }),
        dose({ id: '44444444-aaaa-aaaa-aaaa-aaaaaaaaaaaa', status: 'skipped', dueAt: '2026-06-18T08:00:00.000Z', takenAt: null }),
      ],
      options: { layout: 'WALGREENS' },
    });
    const cols = r.csv.split('\r\n');
    const outcomeIdx = 7;
    expect(cols[1]!.split(',')[outcomeIdx]).toBe('TAKEN');
    expect(cols[2]!.split(',')[outcomeIdx]).toBe('TAKEN-LATE');
    expect(cols[3]!.split(',')[outcomeIdx]).toBe('MISSED');
    expect(cols[4]!.split(',')[outcomeIdx]).toBe('SKIPPED');
  });

  it('uses memberId option when set instead of userId for pharmacy layouts', () => {
    const r = buildDoseCsvExport({
      userId: USER_ID,
      medications: [med()],
      doses: [dose()],
      options: { layout: 'WALGREENS', memberId: 'WG-12345' },
    });
    const cells = r.csv.split('\r\n')[1]!.split(',');
    expect(cells[0]).toBe('WG-12345');
  });

  it('calls resolveRxNumber to fill rx_number / prescriptionId', () => {
    const r = buildDoseCsvExport({
      userId: USER_ID,
      medications: [med()],
      doses: [dose()],
      options: {
        layout: 'CVS',
        resolveRxNumber: (mid) => (mid === '11111111-1111-1111-1111-111111111111' ? 'RX-9876' : null),
      },
    });
    const cells = r.csv.split('\r\n')[1]!.split(',');
    expect(cells[1]).toBe('RX-9876');
  });

  it('leaves taken_at blank for missed doses', () => {
    const r = buildDoseCsvExport({
      userId: USER_ID,
      medications: [med()],
      doses: [dose({ status: 'missed', takenAt: null })],
    });
    const cells = r.csv.split('\r\n')[1]!.split(',');
    expect(cells[7]).toBe('');
  });
});

describe('buildDoseCsvExport — CSV quoting + special chars', () => {
  it('quotes cells containing commas', () => {
    const r = buildDoseCsvExport({
      userId: USER_ID,
      medications: [med({ name: 'Brand A, generic B' })],
      doses: [dose()],
    });
    expect(r.csv).toContain('"Brand A, generic B"');
  });

  it('quotes cells containing quotes and doubles internal quotes', () => {
    const r = buildDoseCsvExport({
      userId: USER_ID,
      medications: [med()],
      doses: [dose({ note: 'patient said "later"' })],
    });
    expect(r.csv).toContain('"patient said ""later"""');
  });

  it('quotes cells containing CR or LF', () => {
    const r = buildDoseCsvExport({
      userId: USER_ID,
      medications: [med()],
      doses: [dose({ note: 'first line\nsecond line' })],
    });
    expect(r.csv).toContain('"first line\nsecond line"');
  });

  it('renders empty cells without quotes', () => {
    const r = buildDoseCsvExport({
      userId: USER_ID,
      medications: [med()],
      doses: [dose({ status: 'missed', takenAt: null })],
    });
    // taken_at column should be `,,` not `,"",`.
    expect(r.csv).not.toContain('""');
  });
});

describe('buildDoseCsvExport — filtering', () => {
  it('skips doses with no matching medication and counts them', () => {
    const r = buildDoseCsvExport({
      userId: USER_ID,
      medications: [med({ id: 'has-this-one' as never })],
      doses: [
        dose({ medicationId: 'has-this-one' as never }),
        dose({ id: 'other-id' as never, medicationId: 'missing-med' as never }),
      ],
    });
    expect(r.rowCount).toBe(1);
    expect(r.skippedMissingMedication).toBe(1);
  });

  it('drops scheduled doses by default', () => {
    const r = buildDoseCsvExport({
      userId: USER_ID,
      medications: [med()],
      doses: [
        dose({ id: 'a' as never, status: 'taken' }),
        dose({ id: 'b' as never, status: 'scheduled', takenAt: null }),
      ],
    });
    expect(r.rowCount).toBe(1);
    expect(r.skippedScheduled).toBe(1);
  });

  it('keeps scheduled doses when includeScheduled=true', () => {
    const r = buildDoseCsvExport({
      userId: USER_ID,
      medications: [med()],
      doses: [
        dose({ id: 'a' as never, status: 'taken' }),
        dose({ id: 'b' as never, status: 'scheduled', takenAt: null }),
      ],
      options: { includeScheduled: true },
    });
    expect(r.rowCount).toBe(2);
    expect(r.skippedScheduled).toBe(0);
  });

  it('honours rangeStart / rangeEnd', () => {
    const r = buildDoseCsvExport({
      userId: USER_ID,
      medications: [med()],
      doses: [
        dose({ id: 'a' as never, dueAt: '2026-05-01T08:00:00.000Z', takenAt: '2026-05-01T08:00:00.000Z' }),
        dose({ id: 'b' as never, dueAt: '2026-06-15T08:00:00.000Z', takenAt: '2026-06-15T08:00:00.000Z' }),
        dose({ id: 'c' as never, dueAt: '2026-07-15T08:00:00.000Z', takenAt: '2026-07-15T08:00:00.000Z' }),
      ],
      options: {
        rangeStart: '2026-06-01T00:00:00.000Z',
        rangeEnd: '2026-06-30T23:59:59.000Z',
      },
    });
    expect(r.rowCount).toBe(1);
    expect(r.skippedOutOfRange).toBe(2);
  });
});

describe('buildDoseCsvExport — sorting', () => {
  it('sorts rows by effective datetime ascending', () => {
    const r = buildDoseCsvExport({
      userId: USER_ID,
      medications: [med()],
      doses: [
        dose({ id: 'b' as never, dueAt: '2026-06-02T08:00:00.000Z', takenAt: '2026-06-02T08:00:00.000Z' }),
        dose({ id: 'a' as never, dueAt: '2026-06-01T08:00:00.000Z', takenAt: '2026-06-01T08:00:00.000Z' }),
        dose({ id: 'c' as never, dueAt: '2026-06-03T08:00:00.000Z', takenAt: '2026-06-03T08:00:00.000Z' }),
      ],
    });
    const lines = r.csv.split('\r\n').slice(1, 4);
    expect(lines[0]?.startsWith('a,')).toBe(true);
    expect(lines[1]?.startsWith('b,')).toBe(true);
    expect(lines[2]?.startsWith('c,')).toBe(true);
  });

  it('breaks ties on dose id', () => {
    const r = buildDoseCsvExport({
      userId: USER_ID,
      medications: [med()],
      doses: [
        dose({ id: 'b' as never, dueAt: '2026-06-01T08:00:00.000Z', takenAt: '2026-06-01T08:00:00.000Z' }),
        dose({ id: 'a' as never, dueAt: '2026-06-01T08:00:00.000Z', takenAt: '2026-06-01T08:00:00.000Z' }),
      ],
    });
    const lines = r.csv.split('\r\n').slice(1, 3);
    expect(lines[0]?.startsWith('a,')).toBe(true);
    expect(lines[1]?.startsWith('b,')).toBe(true);
  });
});

describe('parseDoseCsvExport — round trip (MED_TRACKER)', () => {
  it('round-trips a MED_TRACKER CSV losslessly', () => {
    const doses: Dose[] = [
      dose({ id: '11111111-1111-1111-1111-111111111111', note: 'after dinner' }),
      dose({
        id: '22222222-2222-2222-2222-222222222222',
        status: 'missed',
        takenAt: null,
        dueAt: '2026-06-16T08:00:00.000Z',
      }),
    ];
    const r = buildDoseCsvExport({
      userId: USER_ID,
      medications: [med()],
      doses,
    });
    const parsed = parseDoseCsvExport(r.csv);
    expect(parsed.skipped).toEqual([]);
    expect(parsed.doses).toHaveLength(2);
    expect(parsed.doses[0]?.id).toBe('11111111-1111-1111-1111-111111111111');
    expect(parsed.doses[0]?.takenAt).toBe('2026-06-15T08:05:00.000Z');
    expect((parsed.doses[0] as Dose & { note?: string }).note).toBe('after dinner');
    expect(parsed.doses[1]?.takenAt).toBeNull();
    expect(parsed.doses[1]?.status).toBe('missed');
  });

  it('round-trips through BOM + LF without losing data', () => {
    const r = buildDoseCsvExport({
      userId: USER_ID,
      medications: [med()],
      doses: [dose()],
      options: { bom: true, lineSeparator: '\n' },
    });
    const parsed = parseDoseCsvExport(r.csv);
    expect(parsed.skipped).toEqual([]);
    expect(parsed.doses).toHaveLength(1);
  });

  it('skips rows with unknown statuses but keeps the good ones', () => {
    const csv =
      'dose_id,medication_id,schedule_id,due_at,status\n' +
      'a,med-a,sch-a,2026-06-01T08:00:00.000Z,taken\n' +
      'b,med-b,sch-b,2026-06-02T08:00:00.000Z,??? unknown\n' +
      'c,med-c,sch-c,2026-06-03T08:00:00.000Z,missed\n';
    const parsed = parseDoseCsvExport(csv);
    expect(parsed.doses.map((d) => d.id)).toEqual(['a', 'c']);
    expect(parsed.skipped).toEqual([{ row: 2, reason: 'invalid-status:??? unknown' }]);
  });

  it('rejects CSVs missing a required column', () => {
    const csv = 'dose_id,medication_id,due_at,status\n';
    const parsed = parseDoseCsvExport(csv);
    expect(parsed.doses).toEqual([]);
    expect(parsed.skipped[0]?.reason).toBe('missing-column:schedule_id');
  });

  it('handles quoted commas and doubled quotes', () => {
    const csv =
      'dose_id,medication_id,schedule_id,due_at,status,note\n' +
      'a,med-a,sch-a,2026-06-01T08:00:00.000Z,taken,"with ""scare"" quotes"\n';
    const parsed = parseDoseCsvExport(csv);
    expect((parsed.doses[0] as Dose & { note?: string }).note).toBe('with "scare" quotes');
  });

  it('handles CR+LF and bare LF line endings interchangeably', () => {
    const csv =
      'dose_id,medication_id,schedule_id,due_at,status\r\n' +
      'a,med-a,sch-a,2026-06-01T08:00:00.000Z,taken\r\n' +
      'b,med-b,sch-b,2026-06-02T08:00:00.000Z,taken\n';
    const parsed = parseDoseCsvExport(csv);
    expect(parsed.doses.map((d) => d.id)).toEqual(['a', 'b']);
  });

  it('ignores trailing blank lines', () => {
    const csv =
      'dose_id,medication_id,schedule_id,due_at,status\n' +
      'a,med-a,sch-a,2026-06-01T08:00:00.000Z,taken\n' +
      '\n\n';
    const parsed = parseDoseCsvExport(csv);
    expect(parsed.doses).toHaveLength(1);
  });
});
