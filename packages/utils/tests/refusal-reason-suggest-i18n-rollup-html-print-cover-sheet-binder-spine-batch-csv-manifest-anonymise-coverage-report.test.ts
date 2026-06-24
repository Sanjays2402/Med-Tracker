import { describe, it, expect } from 'vitest';
import {
  buildSpineBatchCsvManifestAnonymiseCoverageReport,
  summarizeSpineBatchCsvManifestAnonymiseCoverage,
  detectSpineBatchCsvManifestAnonymiseCoverageLeakWarnings,
  aggregateSpineBatchCsvManifestAnonymiseCoverageReports,
  extractSpineBatchCsvManifestAnonymiseRedactedLookupRows,
} from '../src/refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch-csv-manifest-anonymise-coverage-report';
import type {
  SpineBatchCsvManifestAnonymiseResult,
  SpineBatchCsvManifestAnonymiseOptions,
  SpineBatchCsvManifestAnonymiseLookupRow,
} from '../src/refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch-csv-manifest-anonymise';

// Test helpers -------------------------------------------------------

function buildResult(options: {
  distinctPatientCount?: number;
  manifestRowCount?: number;
  collisionDetected?: boolean;
  lookupRows?: SpineBatchCsvManifestAnonymiseLookupRow[];
}): SpineBatchCsvManifestAnonymiseResult {
  const lookupRows = options.lookupRows ?? [];
  return {
    manifestCsv: '',
    sheetSummaryCsv: '',
    nameLookupCsv: '',
    manifestRows: [],
    lookupRows,
    source: {
      manifestCsv: '',
      sheetSummaryCsv: '',
      manifestRows: [],
      sheetSummaryRows: [],
      manifestRowCount: options.manifestRowCount ?? 0,
      sheetSummaryRowCount: 0,
    },
    manifestRowCount: options.manifestRowCount ?? 0,
    distinctPatientCount:
      options.distinctPatientCount ?? lookupRows.length,
    collisionDetected: options.collisionDetected ?? false,
  };
}

const STANDARD_OPTIONS: SpineBatchCsvManifestAnonymiseOptions = {
  hmacSecret: 'a-very-long-test-secret-with-32-chars-min',
  hashHexLength: 16,
  hashPrefix: 'spine-',
  nameStrategy: 'hashed',
};

// Happy-path tests ---------------------------------------------------

describe('buildSpineBatchCsvManifestAnonymiseCoverageReport — ship-safe', () => {
  it('produces a ship-safe verdict with no collisions or redactions', () => {
    const lookupRows: SpineBatchCsvManifestAnonymiseLookupRow[] = [
      { originalPatientName: 'Alice Adams', pseudonymousPatientName: 'spine-aaaa1111' },
      { originalPatientName: 'Bob Baker', pseudonymousPatientName: 'spine-bbbb2222' },
    ];
    const result = buildResult({
      distinctPatientCount: 2,
      manifestRowCount: 4,
      lookupRows,
    });
    const report = buildSpineBatchCsvManifestAnonymiseCoverageReport(
      result,
      STANDARD_OPTIONS,
    );
    expect(report.verdict).toBe('ship-safe');
    expect(report.collisionDetected).toBe(false);
    expect(report.redactedRowCount).toBe(0);
    expect(report.redactedSamples).toEqual([]);
    expect(report.distinctPatientCount).toBe(2);
    expect(report.manifestRowCount).toBe(4);
    expect(report.lookupRowCount).toBe(2);
    expect(report.nameStrategy).toBe('hashed');
    expect(report.hashHexLength).toBe(16);
    expect(report.hashPrefix).toBe('spine-');
  });

  it('preserves preserveDateLabel / preservePanelLabel as true by default', () => {
    const report = buildSpineBatchCsvManifestAnonymiseCoverageReport(
      buildResult({ distinctPatientCount: 1, manifestRowCount: 1, lookupRows: [{ originalPatientName: 'X', pseudonymousPatientName: 'spine-x' }] }),
      STANDARD_OPTIONS,
    );
    expect(report.preserveDateLabel).toBe(true);
    expect(report.preservePanelLabel).toBe(true);
  });

  it('honours explicit preserve flags', () => {
    const report = buildSpineBatchCsvManifestAnonymiseCoverageReport(
      buildResult({ distinctPatientCount: 1, manifestRowCount: 1, lookupRows: [{ originalPatientName: 'X', pseudonymousPatientName: 'spine-x' }] }),
      { ...STANDARD_OPTIONS, preserveDateLabel: false, preservePanelLabel: true },
    );
    expect(report.preserveDateLabel).toBe(false);
    expect(report.preservePanelLabel).toBe(true);
  });

  it('clamps hashHexLength to [4, 64]', () => {
    const a = buildSpineBatchCsvManifestAnonymiseCoverageReport(
      buildResult({ distinctPatientCount: 0, manifestRowCount: 0, lookupRows: [] }),
      { ...STANDARD_OPTIONS, hashHexLength: 2 },
    );
    expect(a.hashHexLength).toBe(4);
    const b = buildSpineBatchCsvManifestAnonymiseCoverageReport(
      buildResult({ distinctPatientCount: 0, manifestRowCount: 0, lookupRows: [] }),
      { ...STANDARD_OPTIONS, hashHexLength: 999 },
    );
    expect(b.hashHexLength).toBe(64);
    const c = buildSpineBatchCsvManifestAnonymiseCoverageReport(
      buildResult({ distinctPatientCount: 0, manifestRowCount: 0, lookupRows: [] }),
      { ...STANDARD_OPTIONS, hashHexLength: undefined },
    );
    expect(c.hashHexLength).toBe(16);
  });

  it('defaults nameStrategy to "hashed" and hashPrefix to "spine-"', () => {
    const minimalOptions: SpineBatchCsvManifestAnonymiseOptions = {
      hmacSecret: 'a-very-long-test-secret-with-32-chars-min',
    };
    const report = buildSpineBatchCsvManifestAnonymiseCoverageReport(
      buildResult({ distinctPatientCount: 0, manifestRowCount: 0, lookupRows: [] }),
      minimalOptions,
    );
    expect(report.nameStrategy).toBe('hashed');
    expect(report.hashPrefix).toBe('spine-');
    expect(report.hashHexLength).toBe(16);
  });
});

describe('buildSpineBatchCsvManifestAnonymiseCoverageReport — verdicts', () => {
  it('flags review-collisions when collisionDetected is true', () => {
    const lookupRows: SpineBatchCsvManifestAnonymiseLookupRow[] = [
      { originalPatientName: 'A', pseudonymousPatientName: 'spine-deadbeef' },
      { originalPatientName: 'B', pseudonymousPatientName: 'spine-deadbeef' },
    ];
    const report = buildSpineBatchCsvManifestAnonymiseCoverageReport(
      buildResult({ distinctPatientCount: 2, manifestRowCount: 4, lookupRows, collisionDetected: true }),
      STANDARD_OPTIONS,
    );
    expect(report.verdict).toBe('review-collisions');
    expect(report.collisionDetected).toBe(true);
  });

  it('flags review-redacted when one or more lookup rows are REDACTED', () => {
    const lookupRows: SpineBatchCsvManifestAnonymiseLookupRow[] = [
      { originalPatientName: 'A', pseudonymousPatientName: 'spine-aaaa' },
      { originalPatientName: 'B', pseudonymousPatientName: 'REDACTED' },
    ];
    const report = buildSpineBatchCsvManifestAnonymiseCoverageReport(
      buildResult({ distinctPatientCount: 2, manifestRowCount: 4, lookupRows }),
      STANDARD_OPTIONS,
    );
    expect(report.verdict).toBe('review-redacted');
    expect(report.redactedRowCount).toBe(1);
    expect(report.redactedSamples).toEqual([
      { pseudonymousPatientName: 'REDACTED', originalPatientName: 'B' },
    ]);
  });

  it('collisions outrank redactions (worst-wins)', () => {
    const lookupRows: SpineBatchCsvManifestAnonymiseLookupRow[] = [
      { originalPatientName: 'A', pseudonymousPatientName: 'REDACTED' },
    ];
    const report = buildSpineBatchCsvManifestAnonymiseCoverageReport(
      buildResult({ distinctPatientCount: 1, manifestRowCount: 1, lookupRows, collisionDetected: true }),
      STANDARD_OPTIONS,
    );
    expect(report.verdict).toBe('review-collisions');
  });

  it('flags empty-cohort when manifestRowCount is 0', () => {
    const report = buildSpineBatchCsvManifestAnonymiseCoverageReport(
      buildResult({ distinctPatientCount: 0, manifestRowCount: 0, lookupRows: [] }),
      STANDARD_OPTIONS,
    );
    expect(report.verdict).toBe('empty-cohort');
  });

  it('redactions outrank empty-cohort', () => {
    // Synthetic: manifest is empty but a lookup row got REDACTED.
    const lookupRows: SpineBatchCsvManifestAnonymiseLookupRow[] = [
      { originalPatientName: 'A', pseudonymousPatientName: 'REDACTED' },
    ];
    const report = buildSpineBatchCsvManifestAnonymiseCoverageReport(
      buildResult({ distinctPatientCount: 1, manifestRowCount: 0, lookupRows }),
      STANDARD_OPTIONS,
    );
    expect(report.verdict).toBe('review-redacted');
  });
});

describe('buildSpineBatchCsvManifestAnonymiseCoverageReport — redacted sample limit', () => {
  it('caps the sample list at 5 by default', () => {
    const lookupRows: SpineBatchCsvManifestAnonymiseLookupRow[] = [];
    for (let i = 0; i < 10; i++) {
      lookupRows.push({
        originalPatientName: `Patient ${i}`,
        pseudonymousPatientName: 'REDACTED',
      });
    }
    const report = buildSpineBatchCsvManifestAnonymiseCoverageReport(
      buildResult({ distinctPatientCount: 10, manifestRowCount: 10, lookupRows }),
      { ...STANDARD_OPTIONS, nameStrategy: 'redacted' },
    );
    expect(report.redactedRowCount).toBe(10);
    expect(report.redactedSamples.length).toBe(5);
    expect(report.redactedSamples.map((s) => s.originalPatientName)).toEqual([
      'Patient 0',
      'Patient 1',
      'Patient 2',
      'Patient 3',
      'Patient 4',
    ]);
  });

  it('honours a per-call sample limit clamped to [0, 100]', () => {
    const lookupRows: SpineBatchCsvManifestAnonymiseLookupRow[] = [];
    for (let i = 0; i < 10; i++) {
      lookupRows.push({
        originalPatientName: `Patient ${i}`,
        pseudonymousPatientName: 'REDACTED',
      });
    }
    const limit0 = buildSpineBatchCsvManifestAnonymiseCoverageReport(
      buildResult({ distinctPatientCount: 10, manifestRowCount: 10, lookupRows }),
      STANDARD_OPTIONS,
      { redactedSampleLimit: 0 },
    );
    expect(limit0.redactedSamples).toEqual([]);
    expect(limit0.redactedRowCount).toBe(10);

    const limit3 = buildSpineBatchCsvManifestAnonymiseCoverageReport(
      buildResult({ distinctPatientCount: 10, manifestRowCount: 10, lookupRows }),
      STANDARD_OPTIONS,
      { redactedSampleLimit: 3 },
    );
    expect(limit3.redactedSamples.length).toBe(3);

    const limitBig = buildSpineBatchCsvManifestAnonymiseCoverageReport(
      buildResult({ distinctPatientCount: 10, manifestRowCount: 10, lookupRows }),
      STANDARD_OPTIONS,
      { redactedSampleLimit: 999 },
    );
    expect(limitBig.redactedSamples.length).toBe(10);

    const negative = buildSpineBatchCsvManifestAnonymiseCoverageReport(
      buildResult({ distinctPatientCount: 10, manifestRowCount: 10, lookupRows }),
      STANDARD_OPTIONS,
      { redactedSampleLimit: -5 },
    );
    expect(negative.redactedSamples).toEqual([]);
  });
});

describe('summarizeSpineBatchCsvManifestAnonymiseCoverage', () => {
  it('summarises a ship-safe report in one line', () => {
    const lookupRows: SpineBatchCsvManifestAnonymiseLookupRow[] = [
      { originalPatientName: 'A', pseudonymousPatientName: 'spine-aaaa' },
    ];
    const report = buildSpineBatchCsvManifestAnonymiseCoverageReport(
      buildResult({ distinctPatientCount: 1, manifestRowCount: 3, lookupRows }),
      STANDARD_OPTIONS,
    );
    expect(summarizeSpineBatchCsvManifestAnonymiseCoverage(report)).toBe(
      'Spine manifest anonymise coverage: 1 patient, 3 manifest rows, hashed (hex=16, prefix=spine-); ship-safe.',
    );
  });

  it('summarises a collision-detected report with widen-hash advice', () => {
    const lookupRows: SpineBatchCsvManifestAnonymiseLookupRow[] = [
      { originalPatientName: 'A', pseudonymousPatientName: 'spine-deadbeef' },
      { originalPatientName: 'B', pseudonymousPatientName: 'spine-deadbeef' },
    ];
    const report = buildSpineBatchCsvManifestAnonymiseCoverageReport(
      buildResult({ distinctPatientCount: 2, manifestRowCount: 4, lookupRows, collisionDetected: true }),
      { ...STANDARD_OPTIONS, hashHexLength: 4 },
    );
    expect(summarizeSpineBatchCsvManifestAnonymiseCoverage(report)).toBe(
      'Spine manifest anonymise coverage: 2 patients, 4 manifest rows, hashed (hex=4, prefix=spine-); review-collisions (collisions detected \u2014 widen hashHexLength).',
    );
  });

  it('summarises a redacted-rows report with the redacted count', () => {
    const lookupRows: SpineBatchCsvManifestAnonymiseLookupRow[] = [
      { originalPatientName: 'A', pseudonymousPatientName: 'REDACTED' },
      { originalPatientName: 'B', pseudonymousPatientName: 'REDACTED' },
    ];
    const report = buildSpineBatchCsvManifestAnonymiseCoverageReport(
      buildResult({ distinctPatientCount: 2, manifestRowCount: 2, lookupRows }),
      { ...STANDARD_OPTIONS, nameStrategy: 'redacted' },
    );
    expect(summarizeSpineBatchCsvManifestAnonymiseCoverage(report)).toBe(
      'Spine manifest anonymise coverage: 2 patients, 2 manifest rows, redacted (hex=16, prefix=spine-); review-redacted (2 redacted rows).',
    );
  });

  it('summarises an empty cohort succinctly', () => {
    const report = buildSpineBatchCsvManifestAnonymiseCoverageReport(
      buildResult({ distinctPatientCount: 0, manifestRowCount: 0, lookupRows: [] }),
      STANDARD_OPTIONS,
    );
    expect(summarizeSpineBatchCsvManifestAnonymiseCoverage(report)).toBe(
      'Spine manifest anonymise coverage: 0 patients; empty-cohort.',
    );
  });

  it('uses singular forms for 1 row / 1 patient', () => {
    const lookupRows: SpineBatchCsvManifestAnonymiseLookupRow[] = [
      { originalPatientName: 'A', pseudonymousPatientName: 'REDACTED' },
    ];
    const report = buildSpineBatchCsvManifestAnonymiseCoverageReport(
      buildResult({ distinctPatientCount: 1, manifestRowCount: 1, lookupRows }),
      { ...STANDARD_OPTIONS, nameStrategy: 'redacted' },
    );
    expect(summarizeSpineBatchCsvManifestAnonymiseCoverage(report)).toBe(
      'Spine manifest anonymise coverage: 1 patient, 1 manifest row, redacted (hex=16, prefix=spine-); review-redacted (1 redacted row).',
    );
  });
});

describe('detectSpineBatchCsvManifestAnonymiseCoverageLeakWarnings', () => {
  it('returns both warnings when both preserve flags are true', () => {
    const lookupRows: SpineBatchCsvManifestAnonymiseLookupRow[] = [
      { originalPatientName: 'A', pseudonymousPatientName: 'spine-aaaa' },
    ];
    const report = buildSpineBatchCsvManifestAnonymiseCoverageReport(
      buildResult({ distinctPatientCount: 1, manifestRowCount: 1, lookupRows }),
      STANDARD_OPTIONS,
    );
    expect(detectSpineBatchCsvManifestAnonymiseCoverageLeakWarnings(report)).toEqual([
      'preserveDateLabel-on',
      'preservePanelLabel-on',
    ]);
  });

  it('returns the single applicable warning when one preserve flag is false', () => {
    const lookupRows: SpineBatchCsvManifestAnonymiseLookupRow[] = [
      { originalPatientName: 'A', pseudonymousPatientName: 'spine-aaaa' },
    ];
    const report = buildSpineBatchCsvManifestAnonymiseCoverageReport(
      buildResult({ distinctPatientCount: 1, manifestRowCount: 1, lookupRows }),
      { ...STANDARD_OPTIONS, preserveDateLabel: false, preservePanelLabel: true },
    );
    expect(detectSpineBatchCsvManifestAnonymiseCoverageLeakWarnings(report)).toEqual([
      'preservePanelLabel-on',
    ]);
  });

  it('returns empty array when both flags are false', () => {
    const lookupRows: SpineBatchCsvManifestAnonymiseLookupRow[] = [
      { originalPatientName: 'A', pseudonymousPatientName: 'spine-aaaa' },
    ];
    const report = buildSpineBatchCsvManifestAnonymiseCoverageReport(
      buildResult({ distinctPatientCount: 1, manifestRowCount: 1, lookupRows }),
      { ...STANDARD_OPTIONS, preserveDateLabel: false, preservePanelLabel: false },
    );
    expect(detectSpineBatchCsvManifestAnonymiseCoverageLeakWarnings(report)).toEqual([]);
  });
});

describe('aggregateSpineBatchCsvManifestAnonymiseCoverageReports', () => {
  function makeReport(overrides: {
    distinctPatientCount?: number;
    manifestRowCount?: number;
    lookupRows?: SpineBatchCsvManifestAnonymiseLookupRow[];
    collisionDetected?: boolean;
    options?: Partial<SpineBatchCsvManifestAnonymiseOptions>;
  }) {
    return buildSpineBatchCsvManifestAnonymiseCoverageReport(
      buildResult(overrides),
      { ...STANDARD_OPTIONS, ...overrides.options },
    );
  }

  it('sums counts across reports', () => {
    const reports = [
      makeReport({ distinctPatientCount: 3, manifestRowCount: 9, lookupRows: [{ originalPatientName: 'A', pseudonymousPatientName: 'spine-aaaa' }] }),
      makeReport({ distinctPatientCount: 2, manifestRowCount: 4, lookupRows: [{ originalPatientName: 'B', pseudonymousPatientName: 'spine-bbbb' }] }),
    ];
    const agg = aggregateSpineBatchCsvManifestAnonymiseCoverageReports(reports);
    expect(agg.distinctPatientCount).toBe(5);
    expect(agg.manifestRowCount).toBe(13);
    expect(agg.lookupRowCount).toBe(2);
    expect(agg.reportCount).toBe(2);
  });

  it('worst-wins verdict precedence: review-collisions beats review-redacted', () => {
    const reports = [
      makeReport({
        distinctPatientCount: 1,
        manifestRowCount: 1,
        lookupRows: [{ originalPatientName: 'A', pseudonymousPatientName: 'REDACTED' }],
      }),
      makeReport({
        distinctPatientCount: 1,
        manifestRowCount: 1,
        lookupRows: [{ originalPatientName: 'B', pseudonymousPatientName: 'spine-x' }],
        collisionDetected: true,
      }),
    ];
    const agg = aggregateSpineBatchCsvManifestAnonymiseCoverageReports(reports);
    expect(agg.verdict).toBe('review-collisions');
    expect(agg.collisionDetected).toBe(true);
    expect(agg.redactedRowCount).toBe(1);
  });

  it('suppresses empty-cohort verdict when at least one input shipped rows', () => {
    const reports = [
      makeReport({ distinctPatientCount: 0, manifestRowCount: 0, lookupRows: [] }),
      makeReport({
        distinctPatientCount: 1,
        manifestRowCount: 1,
        lookupRows: [{ originalPatientName: 'A', pseudonymousPatientName: 'spine-aaaa' }],
      }),
    ];
    const agg = aggregateSpineBatchCsvManifestAnonymiseCoverageReports(reports);
    expect(agg.verdict).toBe('ship-safe');
  });

  it('returns empty-cohort verdict when every input is empty', () => {
    const reports = [
      makeReport({ distinctPatientCount: 0, manifestRowCount: 0, lookupRows: [] }),
      makeReport({ distinctPatientCount: 0, manifestRowCount: 0, lookupRows: [] }),
    ];
    const agg = aggregateSpineBatchCsvManifestAnonymiseCoverageReports(reports);
    expect(agg.verdict).toBe('empty-cohort');
  });

  it('OR-aggregates the preserve flags (worst-wins for PHI leak)', () => {
    const reports = [
      makeReport({
        distinctPatientCount: 1,
        manifestRowCount: 1,
        lookupRows: [{ originalPatientName: 'A', pseudonymousPatientName: 'spine-aaaa' }],
        options: { preserveDateLabel: false, preservePanelLabel: false },
      }),
      makeReport({
        distinctPatientCount: 1,
        manifestRowCount: 1,
        lookupRows: [{ originalPatientName: 'B', pseudonymousPatientName: 'spine-bbbb' }],
        options: { preserveDateLabel: true, preservePanelLabel: false },
      }),
    ];
    const agg = aggregateSpineBatchCsvManifestAnonymiseCoverageReports(reports);
    expect(agg.preserveDateLabel).toBe(true);
    expect(agg.preservePanelLabel).toBe(false);
  });

  it('flags mixed nameStrategy when inputs disagree', () => {
    const reports = [
      makeReport({
        distinctPatientCount: 1,
        manifestRowCount: 1,
        lookupRows: [{ originalPatientName: 'A', pseudonymousPatientName: 'spine-aaaa' }],
        options: { nameStrategy: 'hashed' },
      }),
      makeReport({
        distinctPatientCount: 1,
        manifestRowCount: 1,
        lookupRows: [{ originalPatientName: 'B', pseudonymousPatientName: 'REDACTED' }],
        options: { nameStrategy: 'redacted' },
      }),
    ];
    const agg = aggregateSpineBatchCsvManifestAnonymiseCoverageReports(reports);
    expect(agg.nameStrategy).toBe('mixed');
  });

  it('flags null hashHexLength + hashPrefix when inputs disagree', () => {
    const reports = [
      makeReport({
        distinctPatientCount: 1,
        manifestRowCount: 1,
        lookupRows: [{ originalPatientName: 'A', pseudonymousPatientName: 'spine-aaaa' }],
        options: { hashHexLength: 16, hashPrefix: 'spine-' },
      }),
      makeReport({
        distinctPatientCount: 1,
        manifestRowCount: 1,
        lookupRows: [{ originalPatientName: 'B', pseudonymousPatientName: 'foo-bbbb' }],
        options: { hashHexLength: 32, hashPrefix: 'foo-' },
      }),
    ];
    const agg = aggregateSpineBatchCsvManifestAnonymiseCoverageReports(reports);
    expect(agg.hashHexLength).toBeNull();
    expect(agg.hashPrefix).toBeNull();
  });

  it('preserves consistent strategy / hex / prefix when inputs agree', () => {
    const reports = [
      makeReport({
        distinctPatientCount: 1,
        manifestRowCount: 1,
        lookupRows: [{ originalPatientName: 'A', pseudonymousPatientName: 'spine-aaaa' }],
      }),
      makeReport({
        distinctPatientCount: 1,
        manifestRowCount: 1,
        lookupRows: [{ originalPatientName: 'B', pseudonymousPatientName: 'spine-bbbb' }],
      }),
    ];
    const agg = aggregateSpineBatchCsvManifestAnonymiseCoverageReports(reports);
    expect(agg.nameStrategy).toBe('hashed');
    expect(agg.hashHexLength).toBe(16);
    expect(agg.hashPrefix).toBe('spine-');
  });

  it('returns zeroed defaults on empty input', () => {
    const agg = aggregateSpineBatchCsvManifestAnonymiseCoverageReports([]);
    expect(agg.reportCount).toBe(0);
    expect(agg.distinctPatientCount).toBe(0);
    expect(agg.manifestRowCount).toBe(0);
    expect(agg.verdict).toBe('empty-cohort');
    expect(agg.preserveDateLabel).toBe(false);
    expect(agg.preservePanelLabel).toBe(false);
    expect(agg.hashHexLength).toBeNull();
    expect(agg.hashPrefix).toBeNull();
    expect(agg.nameStrategy).toBe('hashed');
  });

  it('concatenates redactedSamples across reports', () => {
    const reports = [
      makeReport({
        distinctPatientCount: 1,
        manifestRowCount: 1,
        lookupRows: [{ originalPatientName: 'A', pseudonymousPatientName: 'REDACTED' }],
      }),
      makeReport({
        distinctPatientCount: 1,
        manifestRowCount: 1,
        lookupRows: [{ originalPatientName: 'B', pseudonymousPatientName: 'REDACTED' }],
      }),
    ];
    const agg = aggregateSpineBatchCsvManifestAnonymiseCoverageReports(reports);
    expect(agg.redactedSamples).toHaveLength(2);
    expect(agg.redactedSamples.map((s) => s.originalPatientName)).toEqual(['A', 'B']);
  });
});

describe('extractSpineBatchCsvManifestAnonymiseRedactedLookupRows', () => {
  it('returns only the REDACTED lookup rows', () => {
    const lookupRows: SpineBatchCsvManifestAnonymiseLookupRow[] = [
      { originalPatientName: 'A', pseudonymousPatientName: 'spine-aaaa' },
      { originalPatientName: 'B', pseudonymousPatientName: 'REDACTED' },
      { originalPatientName: 'C', pseudonymousPatientName: 'spine-cccc' },
      { originalPatientName: 'D', pseudonymousPatientName: 'REDACTED' },
    ];
    const redacted = extractSpineBatchCsvManifestAnonymiseRedactedLookupRows(lookupRows);
    expect(redacted.map((r) => r.originalPatientName)).toEqual(['B', 'D']);
  });

  it('returns empty array when there are no redacted rows', () => {
    const lookupRows: SpineBatchCsvManifestAnonymiseLookupRow[] = [
      { originalPatientName: 'A', pseudonymousPatientName: 'spine-aaaa' },
    ];
    expect(extractSpineBatchCsvManifestAnonymiseRedactedLookupRows(lookupRows)).toEqual([]);
  });

  it('returns empty array on empty input', () => {
    expect(extractSpineBatchCsvManifestAnonymiseRedactedLookupRows([])).toEqual([]);
  });
});

describe('buildSpineBatchCsvManifestAnonymiseCoverageReport — determinism', () => {
  it('produces identical output for identical input', () => {
    const lookupRows: SpineBatchCsvManifestAnonymiseLookupRow[] = [
      { originalPatientName: 'A', pseudonymousPatientName: 'spine-aaaa' },
      { originalPatientName: 'B', pseudonymousPatientName: 'REDACTED' },
    ];
    const a = buildSpineBatchCsvManifestAnonymiseCoverageReport(
      buildResult({ distinctPatientCount: 2, manifestRowCount: 4, lookupRows }),
      STANDARD_OPTIONS,
    );
    const b = buildSpineBatchCsvManifestAnonymiseCoverageReport(
      buildResult({ distinctPatientCount: 2, manifestRowCount: 4, lookupRows }),
      STANDARD_OPTIONS,
    );
    expect(a).toEqual(b);
  });
});
