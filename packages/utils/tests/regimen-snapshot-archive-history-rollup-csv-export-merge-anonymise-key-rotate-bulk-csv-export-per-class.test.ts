import { describe, it, expect } from 'vitest';
import { buildAnonymiseKeyRotateBulk } from '../src/regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk';
import {
  exportAnonymiseKeyRotateBulkCsvPerClass,
  listAnonymiseKeyRotateBulkCsvExportPerClassFiles,
  summarizeAnonymiseKeyRotateBulkCsvExportPerClass,
} from '../src/regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk-csv-export-per-class';
import type { DrugClassCode } from '../src/drug-class-coverage';

const EPOCH_SECRETS = [
  'secret-2022-this-is-long-enough-to-pass-min-key-len',
  'secret-2023-this-is-long-enough-to-pass-min-key-len',
  'secret-2024-this-is-long-enough-to-pass-min-key-len',
];

const PATIENTS = [
  { patientId: 'p-1', patientName: 'Patient One' },
  { patientId: 'p-2', patientName: 'Patient Two' },
  { patientId: 'p-3', patientName: 'Patient Three' },
  { patientId: 'p-4', patientName: 'Patient Four' },
];

function classMap(
  entries: Array<[string, ReadonlyArray<DrugClassCode | string>]>,
): Map<string, ReadonlySet<DrugClassCode | string>> {
  const m = new Map<string, ReadonlySet<DrugClassCode | string>>();
  for (const [pid, classes] of entries) {
    m.set(pid, new Set(classes));
  }
  return m;
}

function csvLines(csv: string): string[] {
  return csv.split('\n');
}

describe('exportAnonymiseKeyRotateBulkCsvPerClass — shape', () => {
  it('returns a manifest CSV', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsvPerClass(bulk, {
      patientClasses: classMap([
        ['p-1', ['statin']],
        ['p-2', ['beta-blocker']],
      ]),
    });
    expect(out.manifestCsv.length).toBeGreaterThan(0);
    const lines = csvLines(out.manifestCsv);
    // header + 2 class rows + 1 unclassified row (p-3, p-4)
    expect(lines.length).toBeGreaterThanOrEqual(4);
  });

  it('manifest header columns match documented shape', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsvPerClass(bulk, {
      patientClasses: classMap([['p-1', ['statin']]]),
    });
    const header = csvLines(out.manifestCsv)[0];
    expect(header).toBe('classCode,basename,patientCount,transitionCount');
  });

  it('emits one bucket per non-empty class, sorted ASC', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsvPerClass(bulk, {
      patientClasses: classMap([
        ['p-1', ['statin']],
        ['p-2', ['beta-blocker']],
        ['p-3', ['arb']],
      ]),
    });
    expect(out.buckets.map((b) => b.classCode)).toEqual(['arb', 'beta-blocker', 'statin']);
  });

  it('classesEmitted is sorted ASC', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsvPerClass(bulk, {
      patientClasses: classMap([
        ['p-1', ['statin', 'beta-blocker']],
        ['p-2', ['ace-inhibitor']],
      ]),
    });
    const copy = [...out.classesEmitted];
    expect(out.classesEmitted).toEqual([...copy].sort());
  });

  it('reports classifiedPatientCount + unclassifiedPatientCount + totalPatientCount', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsvPerClass(bulk, {
      patientClasses: classMap([
        ['p-1', ['statin']],
        ['p-2', ['statin']],
      ]),
    });
    expect(out.totalPatientCount).toBe(4);
    expect(out.classifiedPatientCount).toBe(2);
    expect(out.unclassifiedPatientCount).toBe(2);
  });

  it('mirrors totalPatientCount from input cohort', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsvPerClass(bulk, {
      patientClasses: classMap([['p-1', ['statin']]]),
    });
    expect(out.totalPatientCount).toBe(PATIENTS.length);
  });
});

describe('exportAnonymiseKeyRotateBulkCsvPerClass — class filtering', () => {
  it('skips empty class buckets (no CSV, no manifest row)', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsvPerClass(bulk, {
      classesToEmit: ['statin', 'arb', 'beta-blocker'],
      patientClasses: classMap([['p-1', ['statin']]]),
    });
    expect(out.buckets.map((b) => b.classCode)).toEqual(['statin']);
    expect(out.manifestRowCount).toBe(2); // statin + unclassified
  });

  it('classesToEmit restricts the output to a subset', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsvPerClass(bulk, {
      classesToEmit: ['statin'],
      patientClasses: classMap([
        ['p-1', ['statin']],
        ['p-2', ['beta-blocker']],
        ['p-3', ['ace-inhibitor']],
      ]),
    });
    expect(out.buckets.map((b) => b.classCode)).toEqual(['statin']);
    // p-2, p-3, p-4 all land in unclassified
    expect(out.unclassifiedPatientCount).toBe(3);
  });

  it('classesToEmit deduplicates input', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsvPerClass(bulk, {
      classesToEmit: ['statin', 'statin', 'beta-blocker', 'statin'],
      patientClasses: classMap([['p-1', ['statin']], ['p-2', ['beta-blocker']]]),
    });
    expect(out.buckets.map((b) => b.classCode)).toEqual(['beta-blocker', 'statin']);
  });

  it('patients without entry in patientClasses land in unclassified', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsvPerClass(bulk, {
      patientClasses: classMap([['p-1', ['statin']]]),
    });
    expect(out.unclassifiedPatientCount).toBe(3);
    expect(out.unclassifiedBucket).not.toBeNull();
  });

  it('patients with empty class set land in unclassified', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsvPerClass(bulk, {
      patientClasses: classMap([
        ['p-1', []],
        ['p-2', ['statin']],
      ]),
    });
    expect(out.unclassifiedPatientCount).toBe(3); // p-1 (empty) + p-3 + p-4
  });

  it('patients on multiple classes appear in every matching bucket', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsvPerClass(bulk, {
      patientClasses: classMap([
        ['p-1', ['statin', 'beta-blocker']],
      ]),
    });
    const statin = out.buckets.find((b) => b.classCode === 'statin')!;
    const bb = out.buckets.find((b) => b.classCode === 'beta-blocker')!;
    expect(statin.patientCount).toBe(1);
    expect(bb.patientCount).toBe(1);
  });

  it('tolerates custom (non-DrugClassCode) class strings', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsvPerClass(bulk, {
      patientClasses: classMap([['p-1', ['custom-trial-arm-a']]]),
    });
    expect(out.buckets.map((b) => b.classCode)).toContain('custom-trial-arm-a');
  });
});

describe('exportAnonymiseKeyRotateBulkCsvPerClass — unclassified bucket', () => {
  it('includes unclassified by default when patients are uncategorised', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsvPerClass(bulk, {
      patientClasses: classMap([['p-1', ['statin']]]),
    });
    expect(out.unclassifiedBucket).not.toBeNull();
    expect(out.unclassifiedBucket?.patientCount).toBe(3);
  });

  it('drops unclassified when includeUnclassified=false', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsvPerClass(bulk, {
      includeUnclassified: false,
      patientClasses: classMap([['p-1', ['statin']]]),
    });
    expect(out.unclassifiedBucket).toBeNull();
    expect(out.unclassifiedPatientCount).toBe(0);
  });

  it('omits unclassified bucket when every patient is classified', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsvPerClass(bulk, {
      patientClasses: classMap([
        ['p-1', ['statin']],
        ['p-2', ['statin']],
        ['p-3', ['beta-blocker']],
        ['p-4', ['beta-blocker']],
      ]),
    });
    expect(out.unclassifiedBucket).toBeNull();
  });

  it('honours custom unclassifiedBasename', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsvPerClass(bulk, {
      unclassifiedBasename: 'other-meds',
      patientClasses: classMap([['p-1', ['statin']]]),
    });
    expect(out.unclassifiedBucket?.basename).toBe('other-meds');
  });

  it('honours custom basenameTemplate', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsvPerClass(bulk, {
      basenameTemplate: 'class-{class}',
      patientClasses: classMap([['p-1', ['statin']]]),
    });
    expect(out.buckets[0]?.basename).toBe('class-statin');
  });
});

describe('exportAnonymiseKeyRotateBulkCsvPerClass — CSV body', () => {
  it('per-class CSV header matches the underlying export', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsvPerClass(bulk, {
      epochColumns: 'ids-only',
      patientClasses: classMap([['p-1', ['statin']]]),
    });
    const statinChainsHeader = csvLines(out.buckets[0]!.csvExport.chainsCsv)[0]!;
    expect(statinChainsHeader).toContain('epoch-0_id');
    expect(statinChainsHeader).toContain('epoch-1_id');
    expect(statinChainsHeader).toContain('epoch-2_id');
    expect(statinChainsHeader).not.toContain('epoch-0_name');
  });

  it('honours includeOriginalIds in per-class CSVs', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsvPerClass(bulk, {
      includeOriginalIds: true,
      patientClasses: classMap([['p-1', ['statin']]]),
    });
    const statinChainsHeader = csvLines(out.buckets[0]!.csvExport.chainsCsv)[0]!;
    expect(statinChainsHeader.startsWith('originalPatientId,originalPatientName')).toBe(true);
  });

  it('per-class chain count equals filtered patient count', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsvPerClass(bulk, {
      patientClasses: classMap([
        ['p-1', ['statin']],
        ['p-2', ['statin']],
        ['p-3', ['beta-blocker']],
      ]),
    });
    const statin = out.buckets.find((b) => b.classCode === 'statin')!;
    const bb = out.buckets.find((b) => b.classCode === 'beta-blocker')!;
    expect(statin.csvExport.chainRowCount).toBe(2);
    expect(bb.csvExport.chainRowCount).toBe(1);
  });

  it('per-class transitions CSV row count equals transitions in bulk', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsvPerClass(bulk, {
      patientClasses: classMap([['p-1', ['statin']]]),
    });
    expect(out.buckets[0]?.csvExport.transitionRowCount).toBe(EPOCH_SECRETS.length - 1);
  });

  it('transition patientCount in per-class CSV equals filtered count', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsvPerClass(bulk, {
      patientClasses: classMap([
        ['p-1', ['statin']],
        ['p-2', ['statin']],
      ]),
    });
    // transitions CSV body: every row's patientCount should be 2 (filtered count)
    const transitionsLines = csvLines(out.buckets[0]!.csvExport.transitionsCsv);
    // skip header
    for (let i = 1; i < transitionsLines.length; i++) {
      const cols = transitionsLines[i]!.split(',');
      // patientCount is the 5th column (index 4)
      expect(cols[4]).toBe('2');
    }
  });

  it('includeBom prepends BOM to manifest and all per-class CSVs', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsvPerClass(bulk, {
      includeBom: true,
      patientClasses: classMap([['p-1', ['statin']]]),
    });
    expect(out.manifestCsv.startsWith('\uFEFF')).toBe(true);
    expect(out.buckets[0]?.csvExport.chainsCsv.startsWith('\uFEFF')).toBe(true);
    expect(out.buckets[0]?.csvExport.transitionsCsv.startsWith('\uFEFF')).toBe(true);
  });
});

describe('exportAnonymiseKeyRotateBulkCsvPerClass — manifest CSV', () => {
  it('manifest body row count equals total buckets emitted', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsvPerClass(bulk, {
      patientClasses: classMap([
        ['p-1', ['statin']],
        ['p-2', ['beta-blocker']],
      ]),
    });
    // 2 classes + unclassified
    expect(out.manifestRowCount).toBe(3);
  });

  it('manifest skips empty class buckets', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsvPerClass(bulk, {
      classesToEmit: ['statin', 'beta-blocker', 'ace-inhibitor'],
      includeUnclassified: false,
      patientClasses: classMap([['p-1', ['statin']]]),
    });
    expect(out.manifestRowCount).toBe(1);
  });

  it('manifest patientCount column matches the bucket patientCount', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsvPerClass(bulk, {
      patientClasses: classMap([
        ['p-1', ['statin']],
        ['p-2', ['statin']],
      ]),
    });
    const lines = csvLines(out.manifestCsv);
    // first body row should be statin with count 2
    const cols = lines[1]!.split(',');
    expect(cols[0]).toBe('statin');
    expect(cols[2]).toBe('2');
  });

  it('manifest has header even when no buckets emitted', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsvPerClass(bulk, {
      classesToEmit: [],
      includeUnclassified: false,
      patientClasses: classMap([]),
    });
    expect(csvLines(out.manifestCsv)).toEqual(['classCode,basename,patientCount,transitionCount']);
  });
});

describe('listAnonymiseKeyRotateBulkCsvExportPerClassFiles', () => {
  it('emits chains + transitions per bucket plus the manifest', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsvPerClass(bulk, {
      patientClasses: classMap([['p-1', ['statin']]]),
    });
    const files = listAnonymiseKeyRotateBulkCsvExportPerClassFiles(out);
    // 1 statin (chains+transitions) + 1 unclassified (chains+transitions) + 1 manifest = 5
    expect(files).toHaveLength(5);
    expect(files.at(-1)!.kind).toBe('manifest');
  });

  it('manifest file lands last', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsvPerClass(bulk, {
      patientClasses: classMap([['p-1', ['statin']], ['p-2', ['beta-blocker']]]),
    });
    const files = listAnonymiseKeyRotateBulkCsvExportPerClassFiles(out);
    expect(files.at(-1)!.kind).toBe('manifest');
    expect(files.at(-1)!.classCode).toBeNull();
  });

  it('honours manifestBasename override', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsvPerClass(bulk, {
      patientClasses: classMap([['p-1', ['statin']]]),
    });
    const files = listAnonymiseKeyRotateBulkCsvExportPerClassFiles(out, {
      manifestBasename: 'INDEX',
    });
    expect(files.at(-1)!.basename).toBe('INDEX');
  });

  it('chains and transitions file basenames are distinct', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsvPerClass(bulk, {
      patientClasses: classMap([['p-1', ['statin']]]),
    });
    const files = listAnonymiseKeyRotateBulkCsvExportPerClassFiles(out);
    const basenames = files.map((f) => f.basename);
    expect(new Set(basenames).size).toBe(basenames.length);
  });
});

describe('summarizeAnonymiseKeyRotateBulkCsvExportPerClass', () => {
  it('summarises classified + unclassified counts', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsvPerClass(bulk, {
      patientClasses: classMap([
        ['p-1', ['statin']],
        ['p-2', ['statin']],
      ]),
    });
    const line = summarizeAnonymiseKeyRotateBulkCsvExportPerClass(out);
    expect(line).toContain('4 patients');
    expect(line).toContain('1 class');
    expect(line).toContain('2 classified');
    expect(line).toContain('2 unclassified');
    expect(line).toContain('Top class: statin');
  });

  it('reports top class with the highest patientCount', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsvPerClass(bulk, {
      patientClasses: classMap([
        ['p-1', ['statin']],
        ['p-2', ['statin']],
        ['p-3', ['beta-blocker']],
        ['p-4', ['beta-blocker']],
      ]),
    });
    const line = summarizeAnonymiseKeyRotateBulkCsvExportPerClass(out);
    // Statin and beta-blocker tied at 2; tie-break by classCode ASC ->
    // 'beta-blocker' wins.
    expect(line).toContain('Top class: beta-blocker');
  });

  it('handles zero-patient cohort', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk([], { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsvPerClass(bulk, {
      patientClasses: classMap([]),
    });
    const line = summarizeAnonymiseKeyRotateBulkCsvExportPerClass(out);
    expect(line).toBe('Per-class CSV: 0 patients (no classes emitted).');
  });

  it('handles no-classes-emitted with patients present', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsvPerClass(bulk, {
      patientClasses: classMap([]),
    });
    const line = summarizeAnonymiseKeyRotateBulkCsvExportPerClass(out);
    expect(line).toContain('no classes emitted');
    expect(line).toContain('4 unclassified');
  });

  it('singular grammar for single-class output', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const out = exportAnonymiseKeyRotateBulkCsvPerClass(bulk, {
      patientClasses: classMap([['p-1', ['statin']]]),
    });
    const line = summarizeAnonymiseKeyRotateBulkCsvExportPerClass(out);
    expect(line).toContain('1 class ');
    expect(line).toContain('(1 patient)');
  });
});

describe('exportAnonymiseKeyRotateBulkCsvPerClass — determinism', () => {
  it('two runs over the same inputs produce identical CSVs', async () => {
    const bulk = await buildAnonymiseKeyRotateBulk(PATIENTS, { secrets: EPOCH_SECRETS });
    const a = exportAnonymiseKeyRotateBulkCsvPerClass(bulk, {
      patientClasses: classMap([
        ['p-1', ['statin']],
        ['p-2', ['beta-blocker']],
      ]),
    });
    const b = exportAnonymiseKeyRotateBulkCsvPerClass(bulk, {
      patientClasses: classMap([
        ['p-1', ['statin']],
        ['p-2', ['beta-blocker']],
      ]),
    });
    expect(a.manifestCsv).toBe(b.manifestCsv);
    expect(a.buckets[0]?.csvExport.chainsCsv).toBe(b.buckets[0]?.csvExport.chainsCsv);
  });
});
