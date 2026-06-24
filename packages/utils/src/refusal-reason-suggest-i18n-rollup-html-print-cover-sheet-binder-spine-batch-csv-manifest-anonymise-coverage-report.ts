/**
 * Refusal reason suggest i18n rollup HTML print cover sheet binder
 * spine BATCH CSV MANIFEST ANONYMISE — COVERAGE REPORT.
 *
 * `refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch-csv-manifest-anonymise`
 * runs the spine batch through an HMAC-keyed name hash and emits a
 * third-party-safe CSV manifest. The result exposes a few discrete
 * QA signals (`collisionDetected`, `distinctPatientCount`,
 * `manifestRowCount`, `lookupRows[]`) but a clinic auditing the
 * batch wants ONE pre-flight document that summarises every signal
 * the on-call needs to sign off before mailing the manifest to the
 * third-party printer.
 *
 * This module is the standalone coverage-report companion. Given an
 * `SpineBatchCsvManifestAnonymiseResult` + the options it was built
 * with, it produces a single structured object capturing:
 *
 *   - the anonymisation strategy ('hashed' or 'redacted');
 *   - the hash truncation in use (hashHexLength) clamped to [4, 64];
 *   - the hash prefix ('spine-' by default);
 *   - the collision flag + collision-aware verdict;
 *   - the redacted-row count + first-N samples (for QA gate
 *     review);
 *   - the distinct-patient count + manifest row count + total
 *     unique-spine rows;
 *   - the PHI-column preservation flags (preserveDateLabel /
 *     preservePanelLabel) so a reviewer sees at a glance whether
 *     those columns leak;
 *   - a "ship-ready" verdict ('ship-safe' / 'review-collisions' /
 *     'review-redacted' / 'empty-cohort') for the cron audit log.
 *
 * Verdict precedence (worst-wins): review-collisions >
 * review-redacted > empty-cohort > ship-safe. The reviewer reads the
 * verdict first and the supporting metrics second.
 *
 * Pure / deterministic. No I/O.
 *
 * Composes:
 *   - SpineBatchCsvManifestAnonymiseResult (input)
 *   - SpineBatchCsvManifestAnonymiseOptions (input metadata)
 *   - SpineBatchCsvManifestAnonymiseNameStrategy (enum)
 */

import type {
  SpineBatchCsvManifestAnonymiseResult,
  SpineBatchCsvManifestAnonymiseOptions,
  SpineBatchCsvManifestAnonymiseNameStrategy,
  SpineBatchCsvManifestAnonymiseLookupRow,
} from './refusal-reason-suggest-i18n-rollup-html-print-cover-sheet-binder-spine-batch-csv-manifest-anonymise';

export type SpineBatchCsvManifestAnonymiseCoverageVerdict =
  /** No issues; ship to the third-party printer. */
  | 'ship-safe'
  /** One or more hash collisions; MUST widen hashHexLength. */
  | 'review-collisions'
  /** Redacted rows present; reviewer must confirm jurisdiction allows. */
  | 'review-redacted'
  /** Zero rows; no batch to ship. */
  | 'empty-cohort';

export interface SpineBatchCsvManifestAnonymiseCoverageRedactedSample {
  /** Pseudonym in the manifest (will be the literal "REDACTED"). */
  pseudonymousPatientName: string;
  /** Original patient name (in-house only — PHI). */
  originalPatientName: string;
}

export interface SpineBatchCsvManifestAnonymiseCoverageReport {
  /** Resolved name strategy. */
  nameStrategy: SpineBatchCsvManifestAnonymiseNameStrategy;
  /** Hash truncation in use, clamped to [4, 64]. */
  hashHexLength: number;
  /** Hash prefix (defaults to 'spine-'). */
  hashPrefix: string;
  /**
   * Distinct source patient names anonymised (mirrors the underlying
   * result; surfaced here for the audit log).
   */
  distinctPatientCount: number;
  /** Manifest row count (mirrors manifestRowCount). */
  manifestRowCount: number;
  /** Lookup row count (= distinct source names; mirrors lookupRows.length). */
  lookupRowCount: number;
  /** True when any two source names mapped to the same pseudonym. */
  collisionDetected: boolean;
  /**
   * Number of distinct lookup rows whose pseudonym is the literal
   * "REDACTED" (either strategy === 'redacted' OR an upstream
   * fallback that mapped a missing source name to REDACTED).
   */
  redactedRowCount: number;
  /**
   * Up to N sample redacted entries for the QA reviewer (default 5;
   * configurable via options.redactedSampleLimit).
   */
  redactedSamples: SpineBatchCsvManifestAnonymiseCoverageRedactedSample[];
  /** True when preserveDateLabel was implicit or explicitly true. */
  preserveDateLabel: boolean;
  /** True when preservePanelLabel was implicit or explicitly true. */
  preservePanelLabel: boolean;
  /**
   * Composite ship-or-review verdict. Worst-wins:
   *   review-collisions > review-redacted > empty-cohort > ship-safe.
   */
  verdict: SpineBatchCsvManifestAnonymiseCoverageVerdict;
}

export interface SpineBatchCsvManifestAnonymiseCoverageOptions {
  /**
   * Maximum number of redacted sample entries to include for the QA
   * reviewer. Default 5. Clamped to [0, 100].
   */
  redactedSampleLimit?: number;
}

function clampHashHexLength(value: number | undefined): number {
  if (value === undefined) return 16;
  if (!Number.isFinite(value)) return 16;
  return Math.max(4, Math.min(64, Math.floor(value)));
}

function clampSampleLimit(value: number | undefined): number {
  if (value === undefined) return 5;
  if (!Number.isFinite(value)) return 5;
  return Math.max(0, Math.min(100, Math.floor(value)));
}

function pickVerdict(
  collisionDetected: boolean,
  redactedRowCount: number,
  manifestRowCount: number,
): SpineBatchCsvManifestAnonymiseCoverageVerdict {
  // Worst-wins precedence: collisions block shipping outright (a
  // collision means a downstream consumer cannot reverse-map a
  // pseudonym safely).
  if (collisionDetected) return 'review-collisions';
  if (redactedRowCount > 0) return 'review-redacted';
  if (manifestRowCount === 0) return 'empty-cohort';
  return 'ship-safe';
}

/**
 * Build the audit coverage report for an anonymised spine batch.
 *
 * Pure / deterministic.
 */
export function buildSpineBatchCsvManifestAnonymiseCoverageReport(
  result: SpineBatchCsvManifestAnonymiseResult,
  options: SpineBatchCsvManifestAnonymiseOptions,
  coverageOptions: SpineBatchCsvManifestAnonymiseCoverageOptions = {},
): SpineBatchCsvManifestAnonymiseCoverageReport {
  const nameStrategy = options.nameStrategy ?? 'hashed';
  const hashHexLength = clampHashHexLength(options.hashHexLength);
  const hashPrefix = options.hashPrefix ?? 'spine-';
  const sampleLimit = clampSampleLimit(coverageOptions.redactedSampleLimit);

  // Walk the lookup rows; count + sample the redacted entries.
  let redactedRowCount = 0;
  const redactedSamples: SpineBatchCsvManifestAnonymiseCoverageRedactedSample[] = [];
  for (const row of result.lookupRows) {
    if (row.pseudonymousPatientName === 'REDACTED') {
      redactedRowCount++;
      if (redactedSamples.length < sampleLimit) {
        redactedSamples.push({
          pseudonymousPatientName: row.pseudonymousPatientName,
          originalPatientName: row.originalPatientName,
        });
      }
    }
  }

  const preserveDateLabel = options.preserveDateLabel ?? true;
  const preservePanelLabel = options.preservePanelLabel ?? true;

  const verdict = pickVerdict(
    result.collisionDetected,
    redactedRowCount,
    result.manifestRowCount,
  );

  return {
    nameStrategy,
    hashHexLength,
    hashPrefix,
    distinctPatientCount: result.distinctPatientCount,
    manifestRowCount: result.manifestRowCount,
    lookupRowCount: result.lookupRows.length,
    collisionDetected: result.collisionDetected,
    redactedRowCount,
    redactedSamples,
    preserveDateLabel,
    preservePanelLabel,
    verdict,
  };
}

/**
 * Convenience: a one-line cron-log summary of the coverage report.
 *
 *   "Spine manifest anonymise coverage: 14 patients, 14 manifest rows,
 *    hashed (hex=16, prefix=spine-); ship-safe."
 *   "Spine manifest anonymise coverage: 14 patients, 14 manifest rows,
 *    hashed (hex=4, prefix=spine-); review-collisions (collisions detected — widen hashHexLength)."
 *   "Spine manifest anonymise coverage: 14 patients, 14 manifest rows,
 *    redacted (hex=16, prefix=spine-); review-redacted (14 redacted rows)."
 *   "Spine manifest anonymise coverage: 0 patients; empty-cohort."
 */
export function summarizeSpineBatchCsvManifestAnonymiseCoverage(
  report: SpineBatchCsvManifestAnonymiseCoverageReport,
): string {
  if (report.manifestRowCount === 0 && report.distinctPatientCount === 0) {
    return 'Spine manifest anonymise coverage: 0 patients; empty-cohort.';
  }
  const patientPart = `${report.distinctPatientCount} ${report.distinctPatientCount === 1 ? 'patient' : 'patients'}`;
  const rowPart = `${report.manifestRowCount} manifest ${report.manifestRowCount === 1 ? 'row' : 'rows'}`;
  const strategyPart = `${report.nameStrategy} (hex=${report.hashHexLength}, prefix=${report.hashPrefix})`;
  const verdictDetail = (() => {
    switch (report.verdict) {
      case 'review-collisions':
        return ' (collisions detected \u2014 widen hashHexLength)';
      case 'review-redacted':
        return ` (${report.redactedRowCount} redacted ${report.redactedRowCount === 1 ? 'row' : 'rows'})`;
      case 'empty-cohort':
        return '';
      case 'ship-safe':
        return '';
    }
  })();
  return `Spine manifest anonymise coverage: ${patientPart}, ${rowPart}, ${strategyPart}; ${report.verdict}${verdictDetail}.`;
}

/**
 * Convenience: extract the PHI-leak warnings — preserveDateLabel /
 * preservePanelLabel === true MAY leak PHI when the underlying
 * label columns carry e.g. DOB or family-plan names. Returns
 * structured warning strings ('preserveDateLabel-on' /
 * 'preservePanelLabel-on') that the cron audit log can promote to
 * the channel admin.
 *
 * Pure / deterministic.
 */
export type SpineBatchCsvManifestAnonymiseCoverageLeakWarning =
  | 'preserveDateLabel-on'
  | 'preservePanelLabel-on';

export function detectSpineBatchCsvManifestAnonymiseCoverageLeakWarnings(
  report: SpineBatchCsvManifestAnonymiseCoverageReport,
): SpineBatchCsvManifestAnonymiseCoverageLeakWarning[] {
  const out: SpineBatchCsvManifestAnonymiseCoverageLeakWarning[] = [];
  if (report.preserveDateLabel) out.push('preserveDateLabel-on');
  if (report.preservePanelLabel) out.push('preservePanelLabel-on');
  return out;
}

/**
 * Convenience: aggregate N coverage reports into a batch-of-batches
 * summary. Useful when one cron tick anonymises N separate spine
 * batches (one per ward / clinic / panel) and the audit log wants
 * one row across them.
 *
 * Aggregate rules:
 *   - distinctPatientCount, manifestRowCount, lookupRowCount,
 *     redactedRowCount are summed.
 *   - collisionDetected is OR-ed (any collision -> aggregate true).
 *   - verdict picks the worst across the inputs (precedence above).
 *   - nameStrategy / hashHexLength / hashPrefix are taken from the
 *     FIRST report; flagged 'mixed' on the result when the inputs
 *     disagree (so the auditor knows the aggregate doesn't represent
 *     a single rotation).
 *   - preserveDateLabel / preservePanelLabel are TRUE on the
 *     aggregate when ANY input is TRUE (worst-wins for PHI leak).
 *   - redactedSamples concatenated (capped at the FIRST report's
 *     sample limit).
 */
export interface SpineBatchCsvManifestAnonymiseCoverageAggregate {
  reportCount: number;
  distinctPatientCount: number;
  manifestRowCount: number;
  lookupRowCount: number;
  redactedRowCount: number;
  collisionDetected: boolean;
  /** Worst-wins verdict across the inputs. */
  verdict: SpineBatchCsvManifestAnonymiseCoverageVerdict;
  preserveDateLabel: boolean;
  preservePanelLabel: boolean;
  /** Aggregated redacted samples (concatenated, no dedup). */
  redactedSamples: SpineBatchCsvManifestAnonymiseCoverageRedactedSample[];
  /** First report's nameStrategy, OR 'mixed' when inputs disagree. */
  nameStrategy: SpineBatchCsvManifestAnonymiseNameStrategy | 'mixed';
  /** First report's hashHexLength, OR null when inputs disagree. */
  hashHexLength: number | null;
  /** First report's hashPrefix, OR null when inputs disagree. */
  hashPrefix: string | null;
}

const VERDICT_RANK: Record<SpineBatchCsvManifestAnonymiseCoverageVerdict, number> = {
  'review-collisions': 4,
  'review-redacted': 3,
  'empty-cohort': 2,
  'ship-safe': 1,
};

export function aggregateSpineBatchCsvManifestAnonymiseCoverageReports(
  reports: SpineBatchCsvManifestAnonymiseCoverageReport[],
): SpineBatchCsvManifestAnonymiseCoverageAggregate {
  if (reports.length === 0) {
    return {
      reportCount: 0,
      distinctPatientCount: 0,
      manifestRowCount: 0,
      lookupRowCount: 0,
      redactedRowCount: 0,
      collisionDetected: false,
      verdict: 'empty-cohort',
      preserveDateLabel: false,
      preservePanelLabel: false,
      redactedSamples: [],
      nameStrategy: 'hashed',
      hashHexLength: null,
      hashPrefix: null,
    };
  }

  let distinctPatientCount = 0;
  let manifestRowCount = 0;
  let lookupRowCount = 0;
  let redactedRowCount = 0;
  let collisionDetected = false;
  let verdict: SpineBatchCsvManifestAnonymiseCoverageVerdict = 'ship-safe';
  let preserveDateLabel = false;
  let preservePanelLabel = false;
  const redactedSamples: SpineBatchCsvManifestAnonymiseCoverageRedactedSample[] = [];

  for (const r of reports) {
    distinctPatientCount += r.distinctPatientCount;
    manifestRowCount += r.manifestRowCount;
    lookupRowCount += r.lookupRowCount;
    redactedRowCount += r.redactedRowCount;
    if (r.collisionDetected) collisionDetected = true;
    if (VERDICT_RANK[r.verdict] > VERDICT_RANK[verdict]) verdict = r.verdict;
    if (r.preserveDateLabel) preserveDateLabel = true;
    if (r.preservePanelLabel) preservePanelLabel = true;
    redactedSamples.push(...r.redactedSamples);
  }

  // Empty-cohort suppression: when at least one input shipped rows,
  // the aggregate verdict can't be empty-cohort even if a single
  // input was empty.
  if (verdict === 'empty-cohort' && manifestRowCount > 0) {
    verdict = 'ship-safe';
  }

  // Mixed-strategy / mixed-options detection.
  const first = reports[0]!;
  const allSameStrategy = reports.every((r) => r.nameStrategy === first.nameStrategy);
  const allSameHex = reports.every((r) => r.hashHexLength === first.hashHexLength);
  const allSamePrefix = reports.every((r) => r.hashPrefix === first.hashPrefix);

  // Cap concatenated samples at the FIRST report's sample limit;
  // the limit isn't stored on the report shape (it was the input
  // option), so we use the first report's sample-list length as a
  // proxy when callers want a hard cap — otherwise we concatenate
  // every sample across reports.
  const aggregateRedactedSamples = redactedSamples;

  return {
    reportCount: reports.length,
    distinctPatientCount,
    manifestRowCount,
    lookupRowCount,
    redactedRowCount,
    collisionDetected,
    verdict,
    preserveDateLabel,
    preservePanelLabel,
    redactedSamples: aggregateRedactedSamples,
    nameStrategy: allSameStrategy ? first.nameStrategy : 'mixed',
    hashHexLength: allSameHex ? first.hashHexLength : null,
    hashPrefix: allSamePrefix ? first.hashPrefix : null,
  };
}

/**
 * Convenience helper for the in-house auditor: convert the lookup
 * rows of an anonymise result to a coverage-report-shaped redacted
 * sample list without computing the full report. Useful when the
 * caller wants just the redacted slice (for a focused review queue)
 * without re-deriving the rest of the report fields.
 *
 * Pure / deterministic.
 */
export function extractSpineBatchCsvManifestAnonymiseRedactedLookupRows(
  lookupRows: SpineBatchCsvManifestAnonymiseLookupRow[],
): SpineBatchCsvManifestAnonymiseLookupRow[] {
  return lookupRows.filter(
    (r) => r.pseudonymousPatientName === 'REDACTED',
  );
}
