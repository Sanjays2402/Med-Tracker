import { describe, it, expect } from 'vitest';
import { buildAnonymiseKeyRotateBulk } from '../src/regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk';
import {
  exportAnonymiseKeyRotateBulkCsv,
  exportAnonymiseKeyRotateBulkTerminalCsv,
  summarizeAnonymiseKeyRotateBulkCsvExport,
} from '../src/regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk-csv-export';

const EPOCH_SECRETS = [
  'secret-2022-this-is-long-enough-to-pass-min-key-len',
  'secret-2023-this-is-long-enough-to-pass-min-key-len',
  'secret-2024-this-is-long-enough-to-pass-min-key-len',
  'secret-2025-this-is-long-enough-to-pass-min-key-len',
  'secret-2026-this-is-long-enough-to-pass-min-key-len',
];

const PATIENTS = [
  { patientId: 'p-alpha', patientName: 'Alpha Sibling' },
  { patientId: 'p-beta', patientName: 'Beta Sibling' },
  { patientId: 'p-gamma', patientName: 'Gamma Sibling' },
];

function csvLines(csv: string): string[] {
  return csv.split('\n');
}

describe('exportAnonymiseKeyRotateBulkCsv — shape', () => {
  it('returns BOTH chainsCsv and transitionsCsv', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsv(bulk);
    expect(out.chainsCsv.length).toBeGreaterThan(0);
    expect(out.transitionsCsv.length).toBeGreaterThan(0);
  });

  it('chainRowCount equals patientChain count', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsv(bulk);
    expect(out.chainRowCount).toBe(PATIENTS.length);
  });

  it('transitionRowCount equals transitionCount', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsv(bulk);
    expect(out.transitionRowCount).toBe(EPOCH_SECRETS.length - 1);
  });

  it('chainsCsv has header row + N body rows', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsv(bulk);
    const lines = csvLines(out.chainsCsv);
    expect(lines).toHaveLength(1 + PATIENTS.length);
  });

  it('transitionsCsv has header row + N body rows', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsv(bulk);
    const lines = csvLines(out.transitionsCsv);
    expect(lines).toHaveLength(1 + (EPOCH_SECRETS.length - 1));
  });
});

describe('exportAnonymiseKeyRotateBulkCsv — chain columns', () => {
  it('emits epoch_id + epoch_name columns by default (ids-and-names)', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsv(bulk);
    // 5 epochs * 2 cols = 10 columns
    expect(out.chainColumns).toHaveLength(10);
    expect(out.chainColumns).toEqual([
      'epoch-0_id', 'epoch-0_name',
      'epoch-1_id', 'epoch-1_name',
      'epoch-2_id', 'epoch-2_name',
      'epoch-3_id', 'epoch-3_name',
      'epoch-4_id', 'epoch-4_name',
    ]);
  });

  it('emits only id columns when epochColumns=ids-only', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsv(bulk, { epochColumns: 'ids-only' });
    expect(out.chainColumns).toHaveLength(5);
    expect(out.chainColumns.every((c) => c.endsWith('_id'))).toBe(true);
  });

  it('emits only name columns when epochColumns=names-only', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsv(bulk, { epochColumns: 'names-only' });
    expect(out.chainColumns).toHaveLength(5);
    expect(out.chainColumns.every((c) => c.endsWith('_name'))).toBe(true);
  });

  it('prepends originalPatientId + originalPatientName when includeOriginalIds=true', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsv(bulk, { includeOriginalIds: true });
    expect(out.chainColumns[0]).toBe('originalPatientId');
    expect(out.chainColumns[1]).toBe('originalPatientName');
    // + 5 epochs * 2 cols
    expect(out.chainColumns).toHaveLength(2 + 10);
  });

  it('OMITS originalPatient columns by default (PHI safe harbour)', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsv(bulk);
    expect(out.chainColumns).not.toContain('originalPatientId');
    expect(out.chainColumns).not.toContain('originalPatientName');
  });

  it('uses custom epochLabels when supplied', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, {
      secrets: EPOCH_SECRETS,
      epochLabels: ['2022', '2023', '2024', '2025', '2026'],
    });
    const out = exportAnonymiseKeyRotateBulkCsv(bulk, { epochColumns: 'ids-only' });
    expect(out.chainColumns).toEqual([
      '2022_id', '2023_id', '2024_id', '2025_id', '2026_id',
    ]);
  });
});

describe('exportAnonymiseKeyRotateBulkCsv — row data', () => {
  it('every body row has the same column count as the header', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsv(bulk);
    const lines = csvLines(out.chainsCsv);
    const headerCols = (lines[0] ?? '').split(',').length;
    for (let i = 1; i < lines.length; i++) {
      expect((lines[i] ?? '').split(',')).toHaveLength(headerCols);
    }
  });

  it('row pseudonym id matches the source chain at the same epoch', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsv(bulk, {
      epochColumns: 'ids-only',
      sortBy: 'input',
    });
    const lines = csvLines(out.chainsCsv);
    // row 1 (after header) is the first input patient.
    const row1 = (lines[1] ?? '').split(',');
    const chain = bulk.patientChains[0]?.pseudonymousIdChain ?? [];
    expect(row1).toEqual(chain);
  });

  it('originalPatientId column carries the input id verbatim', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsv(bulk, {
      includeOriginalIds: true,
      sortBy: 'input',
    });
    const lines = csvLines(out.chainsCsv);
    const row1 = (lines[1] ?? '').split(',');
    expect(row1[0]).toBe('p-alpha');
    expect(row1[1]).toBe('Alpha Sibling');
  });
});

describe('exportAnonymiseKeyRotateBulkCsv — sort', () => {
  it('default sortBy=first-epoch-pseudonym sorts lexically by chain[0]', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsv(bulk, { epochColumns: 'ids-only' });
    const lines = csvLines(out.chainsCsv);
    const firstCols = lines.slice(1).map((l) => (l.split(',')[0] ?? ''));
    const sorted = [...firstCols].sort((a, b) => a.localeCompare(b));
    expect(firstCols).toEqual(sorted);
  });

  it('sortBy=last-epoch-pseudonym sorts by chain[last]', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsv(bulk, {
      epochColumns: 'ids-only',
      sortBy: 'last-epoch-pseudonym',
    });
    const lines = csvLines(out.chainsCsv);
    const lastCols = lines.slice(1).map((l) => {
      const cols = l.split(',');
      return cols[cols.length - 1] ?? '';
    });
    const sorted = [...lastCols].sort((a, b) => a.localeCompare(b));
    expect(lastCols).toEqual(sorted);
  });

  it('sortBy=patient-id requires includeOriginalIds=true', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    expect(() =>
      exportAnonymiseKeyRotateBulkCsv(bulk, { sortBy: 'patient-id' }),
    ).toThrow(/includeOriginalIds/);
  });

  it('sortBy=patient-id sorts by originalPatientId lexically', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsv(bulk, {
      includeOriginalIds: true,
      sortBy: 'patient-id',
    });
    const lines = csvLines(out.chainsCsv);
    const idCols = lines.slice(1).map((l) => (l.split(',')[0] ?? ''));
    expect(idCols).toEqual(['p-alpha', 'p-beta', 'p-gamma']);
  });

  it('sortBy=input preserves input order', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsv(bulk, {
      includeOriginalIds: true,
      sortBy: 'input',
    });
    const lines = csvLines(out.chainsCsv);
    const idCols = lines.slice(1).map((l) => (l.split(',')[0] ?? ''));
    expect(idCols).toEqual(['p-alpha', 'p-beta', 'p-gamma']);
  });
});

describe('exportAnonymiseKeyRotateBulkCsv — transitions', () => {
  it('emits one row per epoch transition', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsv(bulk);
    expect(out.transitionRowCount).toBe(EPOCH_SECRETS.length - 1);
  });

  it('transitions header has the expected columns', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsv(bulk);
    expect(out.transitionColumns).toEqual([
      'fromEpoch',
      'toEpoch',
      'fromEpochLabel',
      'toEpochLabel',
      'patientCount',
      'noOpRotation',
      'collisionDetected',
    ]);
  });

  it('transition row 0 has fromEpoch=0 toEpoch=1 with the default labels', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsv(bulk);
    const lines = csvLines(out.transitionsCsv);
    const row1 = (lines[1] ?? '').split(',');
    expect(row1[0]).toBe('0');
    expect(row1[1]).toBe('1');
    expect(row1[2]).toBe('epoch-0');
    expect(row1[3]).toBe('epoch-1');
  });

  it('patientCount equals the input patient count for every transition', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsv(bulk);
    const lines = csvLines(out.transitionsCsv).slice(1);
    for (const l of lines) {
      const cols = l.split(',');
      expect(cols[4]).toBe(String(PATIENTS.length));
    }
  });

  it('noOpRotation column reads "false" for non-noop transitions', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsv(bulk);
    const lines = csvLines(out.transitionsCsv).slice(1);
    for (const l of lines) {
      const cols = l.split(',');
      expect(cols[5]).toBe('false');
    }
  });

  it('noOpRotation column reads "true" for a no-op rotation', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, {
      secrets: [EPOCH_SECRETS[0]!, EPOCH_SECRETS[0]!, EPOCH_SECRETS[1]!],
    });
    const out = exportAnonymiseKeyRotateBulkCsv(bulk);
    const lines = csvLines(out.transitionsCsv).slice(1);
    expect(lines[0]?.split(',')[5]).toBe('true');
    expect(lines[1]?.split(',')[5]).toBe('false');
  });
});

describe('exportAnonymiseKeyRotateBulkCsv — RFC 4180 escaping', () => {
  it('escapes patient names containing commas when includeOriginalIds=true', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(
      [{ patientId: 'p-1', patientName: 'Smith, John' }],
      { secrets: EPOCH_SECRETS },
    );
    const out = exportAnonymiseKeyRotateBulkCsv(bulk, { includeOriginalIds: true });
    expect(out.chainsCsv).toContain('"Smith, John"');
  });

  it('escapes patient names containing double quotes (doubled)', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(
      [{ patientId: 'p-1', patientName: 'O"Reilly' }],
      { secrets: EPOCH_SECRETS },
    );
    const out = exportAnonymiseKeyRotateBulkCsv(bulk, { includeOriginalIds: true });
    expect(out.chainsCsv).toContain('"O""Reilly"');
  });
});

describe('exportAnonymiseKeyRotateBulkCsv — BOM', () => {
  it('does not include a BOM by default', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsv(bulk);
    expect(out.chainsCsv.startsWith('\uFEFF')).toBe(false);
    expect(out.transitionsCsv.startsWith('\uFEFF')).toBe(false);
  });

  it('prepends a BOM to both files when includeBom=true', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsv(bulk, { includeBom: true });
    expect(out.chainsCsv.startsWith('\uFEFF')).toBe(true);
    expect(out.transitionsCsv.startsWith('\uFEFF')).toBe(true);
  });
});

describe('exportAnonymiseKeyRotateBulkCsv — empty input', () => {
  it('emits header-only chainsCsv for zero patients', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk([], { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsv(bulk);
    const lines = csvLines(out.chainsCsv);
    expect(lines).toHaveLength(1);
    expect(out.chainRowCount).toBe(0);
  });
});

describe('exportAnonymiseKeyRotateBulkTerminalCsv', () => {
  it('emits 4 columns by default (no original ids)', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkTerminalCsv(bulk);
    expect(out.columns).toHaveLength(4);
    expect(out.columns).toEqual([
      'firstEpochPseudonymousId',
      'firstEpochPseudonymousName',
      'lastEpochPseudonymousId',
      'lastEpochPseudonymousName',
    ]);
  });

  it('emits 6 columns when includeOriginalIds=true', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkTerminalCsv(bulk, { includeOriginalIds: true });
    expect(out.columns).toHaveLength(6);
    expect(out.columns[0]).toBe('originalPatientId');
  });

  it('emits one row per terminal mapping', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkTerminalCsv(bulk);
    expect(out.rowCount).toBe(PATIENTS.length);
  });

  it('terminal row first-epoch pseudonym matches the bulk terminals[]', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkTerminalCsv(bulk);
    const lines = csvLines(out.csv).slice(1);
    // Row order is preserved input order.
    for (let i = 0; i < bulk.terminals.length; i++) {
      const cols = (lines[i] ?? '').split(',');
      expect(cols[0]).toBe(bulk.terminals[i]?.firstEpochPseudonymousId);
    }
  });

  it('prepends a BOM when includeBom=true', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkTerminalCsv(bulk, { includeBom: true });
    expect(out.csv.startsWith('\uFEFF')).toBe(true);
  });
});

describe('summarizeAnonymiseKeyRotateBulkCsvExport', () => {
  it('produces a single line containing patient + epoch + transition counts', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsv(bulk);
    const summary = summarizeAnonymiseKeyRotateBulkCsvExport(out, bulk);
    expect(summary).toMatch(/^Bulk key-rotate CSV: \d+ patient chains over \d+ epochs/);
    expect(summary).toContain('no collisions');
    expect(summary).not.toContain('\n');
  });

  it('reports collisions when collisionDetectedAtAnyEpoch=true', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsv(bulk);
    // Force the collision flag for the summary check (does not affect csv).
    const bulkWithCol = { ...bulk, collisionDetectedAtAnyEpoch: true };
    const summary = summarizeAnonymiseKeyRotateBulkCsvExport(out, bulkWithCol);
    expect(summary).toContain('collisions detected at one or more epochs');
  });

  it('singularises "patient chain" / "epoch" / "transition" for 1', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(
      [{ patientId: 'only', patientName: 'Only Patient' }],
      { secrets: [EPOCH_SECRETS[0]!, EPOCH_SECRETS[1]!] },
    );
    const out = exportAnonymiseKeyRotateBulkCsv(bulk);
    const summary = summarizeAnonymiseKeyRotateBulkCsvExport(out, bulk);
    expect(summary).toContain('1 patient chain');
    expect(summary).toContain('2 epochs'); // 2 not 1
    expect(summary).toContain('1 transition');
  });
});
