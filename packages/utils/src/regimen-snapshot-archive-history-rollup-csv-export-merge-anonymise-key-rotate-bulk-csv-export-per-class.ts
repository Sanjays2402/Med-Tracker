/**
 * Regimen snapshot archive history rollup — CSV export merge,
 * anonymisation key-rotation BULK CSV export, PER-CLASS variant.
 *
 * `regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk-csv-export`
 * produces a single chains CSV containing every patient in the
 * cohort. That's right for a security-audit hand-off, but it's
 * WRONG for a cardiology clinic that only wants to see patients on
 * cardiovascular medications — they have to wade through the entire
 * sheet to find their own column.
 *
 * Real downstream consumers want a PER-CLASS view:
 *
 *   - one CSV per drug class (statin.csv, beta-blocker.csv, ...);
 *   - each per-class CSV contains only patients whose regimen
 *     includes at least one medication in that class;
 *   - a manifest CSV at the top level lists every per-class file
 *     with patientCount + transitionsCount for at-a-glance audit;
 *   - a parallel "unclassified" CSV captures patients who don't fit
 *     any class (preserves the audit trail — no patient is dropped).
 *
 * The caller supplies a `patientClasses` map keyed on patientId,
 * giving the set of drug classes that patient is on; this module
 * groups + re-exports the chain CSV per class.
 *
 * Reuses the SAME column shape + sort + escaping rules as the
 * underlying bulk-csv-export module, so a clinician comparing the
 * full CSV against the cardiology-only CSV sees byte-identical
 * rows (just fewer of them).
 *
 * Pure / deterministic. No I/O.
 *
 * Composes:
 *   - exportAnonymiseKeyRotateBulkCsv (the underlying per-cohort CSV)
 *   - DrugClassCode (the drug-class taxonomy used elsewhere in @med/utils)
 */

import type {
  RegimenHistoryAnonymiseKeyRotateBulkResult,
  RegimenHistoryAnonymiseKeyRotateBulkPatientChain,
} from './regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk';
import type { DrugClassCode } from './drug-class-coverage';
import {
  exportAnonymiseKeyRotateBulkCsv,
  type AnonymiseKeyRotateBulkCsvExportOptions,
  type AnonymiseKeyRotateBulkCsvExportResult,
} from './regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk-csv-export';

export interface AnonymiseKeyRotateBulkCsvExportPerClassOptions
  extends AnonymiseKeyRotateBulkCsvExportOptions {
  /**
   * Map keyed on original patientId, giving the set of drug-class
   * codes that patient is on. Patients NOT in this map (or with an
   * empty set) land in the unclassified group.
   *
   * Strings outside the DrugClassCode union are tolerated (they show
   * up in `classesEmitted` and produce their own CSV) so callers can
   * extend the taxonomy with custom class codes without forking this
   * module.
   */
  patientClasses: ReadonlyMap<string, ReadonlySet<DrugClassCode | string>>;
  /**
   * Restrict the output to this subset of class codes. Other classes
   * present in the input are dropped (their patients fall through to
   * unclassified iff they ALSO don't match any of the restricted
   * classes). Default: emit every class observed in patientClasses.
   */
  classesToEmit?: ReadonlyArray<DrugClassCode | string>;
  /**
   * Include the `unclassified` CSV in the output. Default true. Turn
   * off when the caller is certain every patient has at least one
   * class and an unclassified bucket would just confuse the auditor.
   */
  includeUnclassified?: boolean;
  /** Class-bucket file basename pattern. Default "{class}". */
  basenameTemplate?: string;
  /** Unclassified bucket basename. Default "unclassified". */
  unclassifiedBasename?: string;
}

export interface AnonymiseKeyRotateBulkCsvExportPerClassBucket {
  /**
   * Drug class code (string). One of DrugClassCode for the built-in
   * taxonomy, or a caller-supplied custom string.
   */
  classCode: string;
  /** File basename suggestion (no extension). */
  basename: string;
  /** Patient count actually emitted in this bucket. */
  patientCount: number;
  /** The underlying CSV export for this bucket only. */
  csvExport: AnonymiseKeyRotateBulkCsvExportResult;
}

export interface AnonymiseKeyRotateBulkCsvExportPerClassResult {
  /** Per-class buckets, sorted by classCode ASC. */
  buckets: AnonymiseKeyRotateBulkCsvExportPerClassBucket[];
  /**
   * Bucket for patients that didn't match any emitted class.
   * Null when includeUnclassified=false OR when no patient was
   * unclassified.
   */
  unclassifiedBucket: AnonymiseKeyRotateBulkCsvExportPerClassBucket | null;
  /**
   * Manifest CSV with columns: classCode, basename, patientCount,
   * transitionCount. One row per emitted bucket (classes +
   * unclassified, if any).
   */
  manifestCsv: string;
  /** Manifest row count (excludes header). */
  manifestRowCount: number;
  /** Classes actually emitted, sorted ASC. */
  classesEmitted: string[];
  /** Patient count actually classified (sum across non-empty class buckets). */
  classifiedPatientCount: number;
  /** Patients in the unclassified bucket. 0 when no unclassified or excluded. */
  unclassifiedPatientCount: number;
  /** Mirror of total cohort size. */
  totalPatientCount: number;
}

const BOM = '\uFEFF';
const MANIFEST_HEADER = ['classCode', 'basename', 'patientCount', 'transitionCount'];

function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'number' ? String(value) : value;
  if (s === '') return '';
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function joinRow(values: (string | number | null | undefined)[]): string {
  return values.map(escapeCsvCell).join(',');
}

function resolveBasename(template: string, classCode: string): string {
  return template.replace(/\{class\}/g, classCode);
}

function filterBulkToPatients(
  source: RegimenHistoryAnonymiseKeyRotateBulkResult,
  patientChains: RegimenHistoryAnonymiseKeyRotateBulkPatientChain[],
): RegimenHistoryAnonymiseKeyRotateBulkResult {
  // Build a new bulk result restricted to the supplied chains. The
  // transitions are shared (the per-transition mappings count is
  // measured by `mappings.length` in exportAnonymiseKeyRotateBulkCsv
  // — we mirror that into a synthetic shape that points at filtered
  // mappings, so the underlying CSV exporter writes the right
  // patientCount per transition).
  const allowedIds = new Set(patientChains.map((c) => c.originalPatientId));
  const filteredTransitions = source.transitions.map((t) => {
    const filteredMappings = t.result.mappings.filter((m) =>
      allowedIds.has(m.originalPatientId),
    );
    return {
      fromEpoch: t.fromEpoch,
      toEpoch: t.toEpoch,
      fromEpochLabel: t.fromEpochLabel,
      toEpochLabel: t.toEpochLabel,
      result: {
        ...t.result,
        mappings: filteredMappings,
      },
    };
  });
  const filteredTerminals = source.terminals.filter((tm) =>
    allowedIds.has(tm.originalPatientId),
  );
  const noOpInBucket = filteredTransitions.filter((t) => {
    const m = t.result.mappings;
    if (m.length === 0) return false;
    return m.every((entry) => entry.oldPseudonymousId === entry.newPseudonymousId);
  }).length;
  return {
    transitions: filteredTransitions,
    patientChains,
    terminals: filteredTerminals,
    epochCount: source.epochCount,
    transitionCount: source.transitionCount,
    noOpTransitionCount: noOpInBucket,
    collisionDetectedAtAnyEpoch: source.collisionDetectedAtAnyEpoch,
    epochLabels: [...source.epochLabels],
  };
}

/**
 * Group a bulk-rotation result by drug class and emit one CSV per
 * class plus a manifest.
 *
 * Patients whose class set is empty (or absent from `patientClasses`)
 * land in the optional `unclassified` bucket. Empty class buckets are
 * skipped — no manifest row, no CSV — to keep the auditor's file
 * list focussed.
 *
 * Pure / deterministic.
 */
export function exportAnonymiseKeyRotateBulkCsvPerClass(
  result: RegimenHistoryAnonymiseKeyRotateBulkResult,
  options: AnonymiseKeyRotateBulkCsvExportPerClassOptions,
): AnonymiseKeyRotateBulkCsvExportPerClassResult {
  const includeBom = options.includeBom ?? false;
  const includeUnclassified = options.includeUnclassified ?? true;
  const basenameTemplate = options.basenameTemplate ?? '{class}';
  const unclassifiedBasename = options.unclassifiedBasename ?? 'unclassified';

  // 1. Build the set of classes to emit. If classesToEmit is supplied
  //    we use it verbatim (deduplicated, sorted); otherwise we use
  //    every class observed in patientClasses.
  const observed = new Set<string>();
  for (const set of options.patientClasses.values()) {
    for (const c of set) observed.add(c);
  }
  const classesEmitted: string[] = options.classesToEmit
    ? [...new Set(options.classesToEmit)].sort()
    : [...observed].sort();
  const allowedSet = new Set(classesEmitted);

  // 2. Bucket chains by class. A patient appears in every class
  //    they're on; a patient on zero matching classes (or absent from
  //    the map) lands in unclassified.
  const byClass = new Map<string, RegimenHistoryAnonymiseKeyRotateBulkPatientChain[]>();
  for (const cls of classesEmitted) byClass.set(cls, []);
  const unclassified: RegimenHistoryAnonymiseKeyRotateBulkPatientChain[] = [];

  for (const chain of result.patientChains) {
    const classes = options.patientClasses.get(chain.originalPatientId);
    let matchedAny = false;
    if (classes) {
      for (const c of classes) {
        if (allowedSet.has(c)) {
          byClass.get(c)!.push(chain);
          matchedAny = true;
        }
      }
    }
    if (!matchedAny) unclassified.push(chain);
  }

  // 3. Build per-class buckets, skipping empty classes.
  const exportOptions: AnonymiseKeyRotateBulkCsvExportOptions = {};
  if (options.includeBom !== undefined) exportOptions.includeBom = options.includeBom;
  if (options.includeOriginalIds !== undefined) {
    exportOptions.includeOriginalIds = options.includeOriginalIds;
  }
  if (options.epochColumns !== undefined) exportOptions.epochColumns = options.epochColumns;
  if (options.sortBy !== undefined) exportOptions.sortBy = options.sortBy;

  const buckets: AnonymiseKeyRotateBulkCsvExportPerClassBucket[] = [];
  for (const cls of classesEmitted) {
    const chains = byClass.get(cls)!;
    if (chains.length === 0) continue;
    const filteredBulk = filterBulkToPatients(result, chains);
    const csvExport = exportAnonymiseKeyRotateBulkCsv(filteredBulk, exportOptions);
    buckets.push({
      classCode: cls,
      basename: resolveBasename(basenameTemplate, cls),
      patientCount: chains.length,
      csvExport,
    });
  }

  let unclassifiedBucket: AnonymiseKeyRotateBulkCsvExportPerClassBucket | null = null;
  if (includeUnclassified && unclassified.length > 0) {
    const filteredBulk = filterBulkToPatients(result, unclassified);
    const csvExport = exportAnonymiseKeyRotateBulkCsv(filteredBulk, exportOptions);
    unclassifiedBucket = {
      classCode: '__unclassified__',
      basename: unclassifiedBasename,
      patientCount: unclassified.length,
      csvExport,
    };
  }

  // 4. Build the manifest CSV.
  const manifestRows: (string | number)[][] = [];
  for (const b of buckets) {
    manifestRows.push([
      b.classCode,
      b.basename,
      b.patientCount,
      b.csvExport.transitionRowCount,
    ]);
  }
  if (unclassifiedBucket !== null) {
    manifestRows.push([
      unclassifiedBucket.classCode,
      unclassifiedBucket.basename,
      unclassifiedBucket.patientCount,
      unclassifiedBucket.csvExport.transitionRowCount,
    ]);
  }
  const manifestBodyLines = manifestRows.map((r) => joinRow(r));
  const manifestCsv =
    (includeBom ? BOM : '') +
    [MANIFEST_HEADER.join(','), ...manifestBodyLines].join('\n');

  const classifiedPatientCount = buckets.reduce((sum, b) => sum + b.patientCount, 0);
  const unclassifiedPatientCount = unclassifiedBucket?.patientCount ?? 0;

  return {
    buckets,
    unclassifiedBucket,
    manifestCsv,
    manifestRowCount: manifestRows.length,
    classesEmitted,
    classifiedPatientCount,
    unclassifiedPatientCount,
    totalPatientCount: result.patientChains.length,
  };
}

/**
 * Convenience: produce a flat array of {basename, csv} entries
 * suitable for direct write-to-zip / write-to-tar pipelines. Order
 * matches the manifest (classes ASC, then unclassified, then a final
 * "_manifest" row).
 *
 * Pure / deterministic.
 */
export interface AnonymiseKeyRotateBulkCsvExportPerClassFileEntry {
  basename: string;
  csv: string;
  /**
   * What this CSV contains: 'chains', 'transitions', or 'manifest'.
   * Each per-class bucket emits TWO files (chains + transitions);
   * the manifest is a third top-level file.
   */
  kind: 'chains' | 'transitions' | 'manifest';
  /** classCode (null for the manifest). */
  classCode: string | null;
}

export function listAnonymiseKeyRotateBulkCsvExportPerClassFiles(
  result: AnonymiseKeyRotateBulkCsvExportPerClassResult,
  options: { manifestBasename?: string } = {},
): AnonymiseKeyRotateBulkCsvExportPerClassFileEntry[] {
  const manifestBasename = options.manifestBasename ?? '_manifest';
  const out: AnonymiseKeyRotateBulkCsvExportPerClassFileEntry[] = [];
  for (const b of result.buckets) {
    out.push({
      basename: `${b.basename}-chains`,
      csv: b.csvExport.chainsCsv,
      kind: 'chains',
      classCode: b.classCode,
    });
    out.push({
      basename: `${b.basename}-transitions`,
      csv: b.csvExport.transitionsCsv,
      kind: 'transitions',
      classCode: b.classCode,
    });
  }
  if (result.unclassifiedBucket !== null) {
    out.push({
      basename: `${result.unclassifiedBucket.basename}-chains`,
      csv: result.unclassifiedBucket.csvExport.chainsCsv,
      kind: 'chains',
      classCode: result.unclassifiedBucket.classCode,
    });
    out.push({
      basename: `${result.unclassifiedBucket.basename}-transitions`,
      csv: result.unclassifiedBucket.csvExport.transitionsCsv,
      kind: 'transitions',
      classCode: result.unclassifiedBucket.classCode,
    });
  }
  out.push({
    basename: manifestBasename,
    csv: result.manifestCsv,
    kind: 'manifest',
    classCode: null,
  });
  return out;
}

/**
 * Convenience: a one-line cron-log summary of the per-class export.
 *
 *   "Per-class CSV: 14 patients across 4 classes (10 classified, 4
 *    unclassified). Top class: statin (8 patients)."
 *   "Per-class CSV: 7 patients across 2 classes (7 classified, 0
 *    unclassified). Top class: beta-blocker (4 patients)."
 *   "Per-class CSV: 0 patients (no classes emitted)."
 */
export function summarizeAnonymiseKeyRotateBulkCsvExportPerClass(
  result: AnonymiseKeyRotateBulkCsvExportPerClassResult,
): string {
  if (result.totalPatientCount === 0) {
    return 'Per-class CSV: 0 patients (no classes emitted).';
  }
  if (result.buckets.length === 0) {
    return `Per-class CSV: ${result.totalPatientCount} ${result.totalPatientCount === 1 ? 'patient' : 'patients'} (no classes emitted, ${result.unclassifiedPatientCount} unclassified).`;
  }
  const sortedByCount = [...result.buckets].sort((a, b) => {
    if (b.patientCount !== a.patientCount) return b.patientCount - a.patientCount;
    return a.classCode.localeCompare(b.classCode);
  });
  const top = sortedByCount[0]!;
  return (
    `Per-class CSV: ${result.totalPatientCount} ${result.totalPatientCount === 1 ? 'patient' : 'patients'} ` +
    `across ${result.buckets.length} ${result.buckets.length === 1 ? 'class' : 'classes'} ` +
    `(${result.classifiedPatientCount} classified, ${result.unclassifiedPatientCount} unclassified). ` +
    `Top class: ${top.classCode} (${top.patientCount} ${top.patientCount === 1 ? 'patient' : 'patients'}).`
  );
}
