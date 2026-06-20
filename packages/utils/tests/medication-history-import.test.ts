import { describe, it, expect } from 'vitest';
import {
  importMedicationHistory,
  parseCsv,
  validateColumnMap,
  type ImportColumnMap,
} from '../src/medication-history-import';

const COLS: ImportColumnMap = {
  dueAt: 'When',
  takenAt: 'Taken At',
  status: 'Status',
  medicationId: 'Medication',
};

describe('parseCsv', () => {
  it('parses a simple CSV', () => {
    const rows = parseCsv('a,b,c\n1,2,3\n');
    expect(rows).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });

  it('handles quoted cells with commas and quotes', () => {
    const rows = parseCsv('a,b\n"hello, world","say ""hi"""\n');
    expect(rows).toEqual([['a', 'b'], ['hello, world', 'say "hi"']]);
  });

  it('handles embedded newlines inside quotes', () => {
    const rows = parseCsv('a,b\n"line1\nline2",c\n');
    expect(rows).toEqual([['a', 'b'], ['line1\nline2', 'c']]);
  });

  it('handles CSV with no trailing newline', () => {
    const rows = parseCsv('a,b\n1,2');
    expect(rows).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('handles CRLF line endings', () => {
    const rows = parseCsv('a,b\r\n1,2\r\n');
    expect(rows).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('importMedicationHistory', () => {
  it('imports a clean CSV into DoseHistoryEntry records', () => {
    const csv = [
      'Medication,When,Taken At,Status',
      'm-1,2026-06-20T08:00:00Z,2026-06-20T08:02:00Z,taken',
      'm-1,2026-06-20T20:00:00Z,2026-06-20T20:15:00Z,taken',
    ].join('\n');
    const r = importMedicationHistory(csv, { columns: COLS });
    expect(r.entries).toHaveLength(2);
    expect(r.counts.imported).toBe(2);
    expect(r.counts.duplicate).toBe(0);
    expect(r.entries[0]!.medicationId).toBe('m-1');
    expect(r.entries[0]!.takenAt).toMatch(/^2026-06-20T08:02/);
  });

  it('dedupes rows within the default 5-minute tolerance', () => {
    const csv = [
      'Medication,When,Taken At,Status',
      'm-1,2026-06-20T08:00:00Z,2026-06-20T08:02:00Z,taken',
      // Same med, dueAt 3 minutes later -> duplicate.
      'm-1,2026-06-20T08:03:00Z,2026-06-20T08:04:00Z,taken',
    ].join('\n');
    const r = importMedicationHistory(csv, { columns: COLS });
    expect(r.entries).toHaveLength(1);
    expect(r.counts.imported).toBe(1);
    expect(r.counts.duplicate).toBe(1);
  });

  it('keeps both rows when dueAt gap exceeds tolerance', () => {
    const csv = [
      'Medication,When,Taken At,Status',
      'm-1,2026-06-20T08:00:00Z,,taken',
      'm-1,2026-06-20T08:30:00Z,,taken',
    ].join('\n');
    const r = importMedicationHistory(csv, {
      columns: COLS,
      dedupMinutes: 5,
    });
    expect(r.entries).toHaveLength(2);
  });

  it('honours a custom dedupMinutes window', () => {
    const csv = [
      'Medication,When,Taken At,Status',
      'm-1,2026-06-20T08:00:00Z,,taken',
      'm-1,2026-06-20T08:20:00Z,,taken',
    ].join('\n');
    const r = importMedicationHistory(csv, {
      columns: COLS,
      dedupMinutes: 30,
    });
    expect(r.entries).toHaveLength(1);
    expect(r.counts.duplicate).toBe(1);
  });

  it('merges duplicate rows by preferring the latest takenAt', () => {
    const csv = [
      'Medication,When,Taken At,Status',
      'm-1,2026-06-20T08:00:00Z,2026-06-20T08:02:00Z,taken',
      'm-1,2026-06-20T08:02:00Z,2026-06-20T08:10:00Z,taken',
    ].join('\n');
    const r = importMedicationHistory(csv, { columns: COLS });
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]!.takenAt).toMatch(/T08:10/);
  });

  it('fills takenAt from the row that has it when the other is empty', () => {
    const csv = [
      'Medication,When,Taken At,Status',
      'm-1,2026-06-20T08:00:00Z,,',
      'm-1,2026-06-20T08:01:00Z,2026-06-20T08:05:00Z,taken',
    ].join('\n');
    const r = importMedicationHistory(csv, { columns: COLS });
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]!.takenAt).toMatch(/T08:05/);
  });

  it('flags rows with missing medicationId or dueAt as invalid', () => {
    const csv = [
      'Medication,When,Taken At,Status',
      ',2026-06-20T08:00:00Z,2026-06-20T08:02:00Z,taken',
      'm-1,,2026-06-20T08:05:00Z,taken',
    ].join('\n');
    const r = importMedicationHistory(csv, { columns: COLS });
    expect(r.counts.invalid).toBe(2);
    expect(r.entries).toHaveLength(0);
  });

  it('flags rows with unparseable dueAt as invalid', () => {
    const csv = [
      'Medication,When,Taken At,Status',
      'm-1,not-a-date,,taken',
    ].join('\n');
    const r = importMedicationHistory(csv, { columns: COLS });
    expect(r.counts.invalid).toBe(1);
    expect(r.reports[0]!.reason).toMatch(/unparseable/);
  });

  it('honors custom takenVocab and skippedVocab', () => {
    const csv = [
      'Medication,When,Taken At,Status',
      'm-1,2026-06-20T08:00:00Z,,YEP',
      'm-1,2026-06-20T20:00:00Z,,NOPE',
    ].join('\n');
    const r = importMedicationHistory(csv, {
      columns: COLS,
      takenVocab: ['yep'],
      skippedVocab: ['nope'],
    });
    expect(r.entries).toHaveLength(2);
    expect(r.entries[0]!.takenAt).toBe(r.entries[0]!.dueAt);
    expect(r.entries[1]!.skipped).toBe(true);
    expect(r.entries[1]!.takenAt).toBeNull();
  });

  it('uses dueAt as takenAt when status says taken but no taken-time is present', () => {
    const csv = [
      'Medication,When,Taken At,Status',
      'm-1,2026-06-20T08:00:00Z,,taken',
    ].join('\n');
    const r = importMedicationHistory(csv, { columns: COLS });
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]!.takenAt).toBe('2026-06-20T08:00:00.000Z');
  });

  it('returns an empty result on empty CSV', () => {
    const r = importMedicationHistory('', { columns: COLS });
    expect(r.entries).toHaveLength(0);
    expect(r.reports).toHaveLength(0);
    expect(r.counts.imported).toBe(0);
  });

  it('marks every row invalid when required columns are missing', () => {
    const csv = [
      'wrong,headers',
      'a,b',
      'c,d',
    ].join('\n');
    const r = importMedicationHistory(csv, { columns: COLS });
    expect(r.counts.invalid).toBe(2);
    expect(r.reports[0]!.reason).toMatch(/required columns/);
  });

  it('produces stable per-row reports in row order', () => {
    const csv = [
      'Medication,When,Taken At,Status',
      'm-1,2026-06-20T08:00:00Z,2026-06-20T08:02:00Z,taken',
      'm-1,2026-06-20T08:03:00Z,2026-06-20T08:04:00Z,taken',
      'm-2,2026-06-20T09:00:00Z,2026-06-20T09:05:00Z,taken',
    ].join('\n');
    const r = importMedicationHistory(csv, { columns: COLS });
    expect(r.reports.map((x) => x.outcome)).toEqual([
      'imported',
      'duplicate',
      'imported',
    ]);
  });

  it('preserves quoted commas in medication names', () => {
    const csv = [
      'Medication,When,Taken At,Status',
      '"Apo-Metformin, 500mg",2026-06-20T08:00:00Z,2026-06-20T08:02:00Z,taken',
    ].join('\n');
    const r = importMedicationHistory(csv, { columns: COLS });
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]!.medicationId).toBe('Apo-Metformin, 500mg');
  });
});

describe('validateColumnMap', () => {
  it('returns ok when all required headers exist', () => {
    const csv = 'Medication,When,Taken At,Status\n';
    const v = validateColumnMap(csv, COLS);
    expect(v.ok).toBe(true);
    expect(v.missing).toEqual([]);
  });

  it('lists missing headers', () => {
    const csv = 'Med,Date\n';
    const v = validateColumnMap(csv, COLS);
    expect(v.ok).toBe(false);
    expect(v.missing.sort()).toEqual(['Medication', 'Status', 'Taken At', 'When'].sort());
  });

  it('returns the actual header row for the UI to inspect', () => {
    const csv = 'Med,Date\n';
    const v = validateColumnMap(csv, COLS);
    expect(v.headers).toEqual(['Med', 'Date']);
  });
});
