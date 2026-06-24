/**
 * Regimen snapshot archive history rollup CSV export merge anonymise
 * key-rotate BULK CLI summary — PROMETHEUS-text-format exporter.
 *
 * `regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk-cli-summary-json`
 * exposes the bulk rotation as a typed JSON shape ideal for analytics
 * pipelines. A different consumer wants the same data as
 * `/metrics`-scrape-able Prometheus text:
 *
 *   - the cron pipeline already greps the cli-summary log file for
 *     ad-hoc alerts;
 *   - the same data should ALSO surface as Prometheus counters /
 *     gauges so the on-call dashboard's existing scrape job
 *     (`/metrics`) covers the rotation health without grep;
 *   - per-verdict gauges + per-transition counters let the existing
 *     PromQL alert rules fire on `med_tracker_key_rotate_collisions_total > 0`
 *     without re-implementing the alerting language for cron logs.
 *
 * This module is the Prometheus companion. Given an
 * `AnonymiseKeyRotateBulkCliSummaryJson` (already produced by the
 * cron tick), it emits a single Prometheus-text-format string ready
 * to surface from a `/metrics` endpoint:
 *
 *   # HELP med_tracker_key_rotate_patients Total patients in the cohort being rotated.
 *   # TYPE med_tracker_key_rotate_patients gauge
 *   med_tracker_key_rotate_patients{batch="[key-rotate-bulk]"} 14
 *
 *   # HELP med_tracker_key_rotate_epochs Total epochs in the rotation chain.
 *   # TYPE med_tracker_key_rotate_epochs gauge
 *   med_tracker_key_rotate_epochs{batch="[key-rotate-bulk]"} 4
 *
 *   # HELP med_tracker_key_rotate_collisions_total Sum of hash collisions across every transition.
 *   # TYPE med_tracker_key_rotate_collisions_total counter
 *   med_tracker_key_rotate_collisions_total{batch="[key-rotate-bulk]"} 2
 *
 *   # HELP med_tracker_key_rotate_transitions Per-transition reshuffle + collision data.
 *   # TYPE med_tracker_key_rotate_transitions counter
 *   med_tracker_key_rotate_transitions{batch="[key-rotate-bulk]",from_epoch="secret-2022",to_epoch="secret-2023",verdict="ship-safe"} 14
 *   ...
 *
 *   # HELP med_tracker_key_rotate_verdict_status Per-verdict status (1 = current batch verdict, 0 = not).
 *   # TYPE med_tracker_key_rotate_verdict_status gauge
 *   med_tracker_key_rotate_verdict_status{batch="[key-rotate-bulk]",verdict="widen-hash"} 1
 *   med_tracker_key_rotate_verdict_status{batch="[key-rotate-bulk]",verdict="empty-cohort"} 0
 *   ...
 *
 * Strict Prometheus text format: HELP + TYPE before each metric;
 * single space separators; one metric per line; trailing newline.
 *
 * Label values are escaped per the Prometheus exposition spec (`\\`,
 * `"`, `\n` only).
 *
 * Pure / deterministic.
 *
 * Composes:
 *   - AnonymiseKeyRotateBulkCliSummaryJson (input)
 *   - AnonymiseKeyRotateCliVerdict (enum)
 */

import type {
  AnonymiseKeyRotateBulkCliSummaryJson,
  AnonymiseKeyRotateBulkCliSummaryJsonTransitionEntry,
} from './regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk-cli-summary-json';
import type { AnonymiseKeyRotateCliVerdict } from './regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-cli-summary';

/**
 * Metric-name prefix. Default 'med_tracker_key_rotate'. Override to
 * disambiguate when the same exporter surfaces multiple cohorts on
 * one /metrics endpoint (the per-cohort tag is also exposed as a
 * label).
 */
const DEFAULT_METRIC_PREFIX = 'med_tracker_key_rotate';

const ALL_VERDICTS: AnonymiseKeyRotateCliVerdict[] = [
  'widen-hash',
  'empty-cohort',
  'ship-safe',
  'no-op',
];

export interface AnonymiseKeyRotateBulkCliSummaryPrometheusOptions {
  /**
   * Metric-name prefix. Default 'med_tracker_key_rotate'. MUST match
   * the Prometheus naming rules (letters, digits, underscores; first
   * char letter or underscore). Validated.
   */
  metricPrefix?: string;
  /**
   * Optional extra labels added to every metric (e.g.
   * { service: 'med-tracker-cron', tenant: 'clinic-001' }). Keys
   * MUST match the Prometheus label-name rules (letters, digits,
   * underscores; first char letter or underscore). Values are
   * Prometheus-escaped.
   */
  extraLabels?: Record<string, string>;
}

export interface AnonymiseKeyRotateBulkCliSummaryPrometheusResult {
  /** Full /metrics-ready Prometheus text-format payload. */
  text: string;
  /** Number of metric families emitted. */
  metricFamilyCount: number;
  /** Number of sample lines emitted (datapoints, not HELP/TYPE). */
  sampleCount: number;
  /** Resolved metric prefix used. */
  metricPrefix: string;
}

const METRIC_NAME_RE = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;
const LABEL_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function validateMetricName(name: string): void {
  if (!METRIC_NAME_RE.test(name)) {
    throw new Error(
      `Invalid Prometheus metric name "${name}" — must match /^[a-zA-Z_:][a-zA-Z0-9_:]*$/.`,
    );
  }
}

function validateLabelName(name: string): void {
  if (!LABEL_NAME_RE.test(name)) {
    throw new Error(
      `Invalid Prometheus label name "${name}" — must match /^[a-zA-Z_][a-zA-Z0-9_]*$/.`,
    );
  }
}

/**
 * Escape a Prometheus label value per the exposition format spec:
 *   - backslash -> \\\\
 *   - double-quote -> \\"
 *   - newline -> \\n
 *
 * Carriage returns are NOT in the spec's required escapes (the parser
 * tolerates them when not embedded mid-line), but we still strip
 * them for defensive cleanliness.
 */
function escapeLabelValue(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

function buildLabelBlock(labels: Record<string, string>): string {
  const keys = Object.keys(labels).sort();
  if (keys.length === 0) return '';
  const parts: string[] = [];
  for (const k of keys) {
    parts.push(`${k}="${escapeLabelValue(labels[k]!)}"`);
  }
  return `{${parts.join(',')}}`;
}

/**
 * Build a single sample line: `<metric>{<labels>} <value>`.
 */
function buildSampleLine(
  metric: string,
  labels: Record<string, string>,
  value: number,
): string {
  return `${metric}${buildLabelBlock(labels)} ${value}`;
}

interface MetricFamily {
  name: string;
  help: string;
  type: 'gauge' | 'counter';
  samples: string[];
}

function emitFamily(family: MetricFamily): string {
  const headerLines = [
    `# HELP ${family.name} ${family.help}`,
    `# TYPE ${family.name} ${family.type}`,
  ];
  return [...headerLines, ...family.samples].join('\n');
}

/**
 * Build the Prometheus text-format payload from a bulk CLI summary
 * JSON.
 *
 * Emits five metric families:
 *   1. {prefix}_patients (gauge)  — total cohort size
 *   2. {prefix}_epochs (gauge)  — secret epochs in the chain
 *   3. {prefix}_transitions_total (gauge)  — emitted transition count
 *   4. {prefix}_collisions_total (counter) — sum of collisions
 *   5. {prefix}_noop_transitions (gauge) — no-op transition count
 *   6. {prefix}_verdict_status (gauge) — one sample per verdict, 1 for the
 *      current batch verdict, 0 for the others
 *   7. {prefix}_transition_patients (gauge) — per-transition patient count
 *   8. {prefix}_transition_reshuffled (gauge) — per-transition reshuffle count
 *   9. {prefix}_transition_collisions (counter) — per-transition collisions
 *
 * Pure / deterministic.
 */
export function exportAnonymiseKeyRotateBulkCliSummaryAsPrometheus(
  json: AnonymiseKeyRotateBulkCliSummaryJson,
  options: AnonymiseKeyRotateBulkCliSummaryPrometheusOptions = {},
): AnonymiseKeyRotateBulkCliSummaryPrometheusResult {
  const metricPrefix = options.metricPrefix ?? DEFAULT_METRIC_PREFIX;
  validateMetricName(metricPrefix);
  const extraLabels = options.extraLabels ?? {};
  for (const k of Object.keys(extraLabels)) {
    validateLabelName(k);
    if (k === 'batch' || k === 'verdict' || k === 'from_epoch' || k === 'to_epoch') {
      throw new Error(
        `extraLabels may not override the reserved label "${k}".`,
      );
    }
  }

  const batchLabels = { batch: json.batch.tag, ...extraLabels };

  // 1. Batch-level gauges.
  const patientsFamily: MetricFamily = {
    name: `${metricPrefix}_patients`,
    help: 'Total patients in the cohort being rotated.',
    type: 'gauge',
    samples: [
      buildSampleLine(`${metricPrefix}_patients`, batchLabels, json.batch.patients),
    ],
  };
  const epochsFamily: MetricFamily = {
    name: `${metricPrefix}_epochs`,
    help: 'Total epochs in the rotation chain.',
    type: 'gauge',
    samples: [
      buildSampleLine(`${metricPrefix}_epochs`, batchLabels, json.batch.epochs),
    ],
  };
  const transitionsTotalFamily: MetricFamily = {
    name: `${metricPrefix}_transitions_total`,
    help: 'Total transitions emitted in the rotation chain.',
    type: 'gauge',
    samples: [
      buildSampleLine(
        `${metricPrefix}_transitions_total`,
        batchLabels,
        json.batch.transitions,
      ),
    ],
  };
  const collisionsTotalFamily: MetricFamily = {
    name: `${metricPrefix}_collisions_total`,
    help: 'Sum of hash collisions across every transition.',
    type: 'counter',
    samples: [
      buildSampleLine(
        `${metricPrefix}_collisions_total`,
        batchLabels,
        json.batch.collisionsTotal,
      ),
    ],
  };
  const noopTransitionsFamily: MetricFamily = {
    name: `${metricPrefix}_noop_transitions`,
    help: 'Number of transitions whose verdict was no-op.',
    type: 'gauge',
    samples: [
      buildSampleLine(
        `${metricPrefix}_noop_transitions`,
        batchLabels,
        json.batch.noOpTransitions,
      ),
    ],
  };

  // 2. Per-verdict status gauge — one sample per known verdict.
  const verdictStatusSamples: string[] = ALL_VERDICTS.map((v) =>
    buildSampleLine(
      `${metricPrefix}_verdict_status`,
      { ...batchLabels, verdict: v },
      json.batch.verdict === v ? 1 : 0,
    ),
  );
  const verdictStatusFamily: MetricFamily = {
    name: `${metricPrefix}_verdict_status`,
    help: 'Per-verdict status (1 = current batch verdict, 0 = not).',
    type: 'gauge',
    samples: verdictStatusSamples,
  };

  // 3. Per-transition gauges + counter.
  const transitionLabelsOf = (
    t: AnonymiseKeyRotateBulkCliSummaryJsonTransitionEntry,
  ): Record<string, string> => ({
    ...batchLabels,
    from_epoch: t.fromEpochLabel,
    to_epoch: t.toEpochLabel,
    verdict: t.verdict,
  });

  const transitionPatientsSamples: string[] = json.transitions.map((t) =>
    buildSampleLine(
      `${metricPrefix}_transition_patients`,
      transitionLabelsOf(t),
      t.patients,
    ),
  );
  const transitionReshuffledSamples: string[] = json.transitions.map((t) =>
    buildSampleLine(
      `${metricPrefix}_transition_reshuffled`,
      transitionLabelsOf(t),
      t.reshuffled,
    ),
  );
  const transitionCollisionsSamples: string[] = json.transitions.map((t) =>
    buildSampleLine(
      `${metricPrefix}_transition_collisions`,
      transitionLabelsOf(t),
      t.collisions,
    ),
  );

  const transitionPatientsFamily: MetricFamily = {
    name: `${metricPrefix}_transition_patients`,
    help: 'Per-transition patient count.',
    type: 'gauge',
    samples: transitionPatientsSamples,
  };
  const transitionReshuffledFamily: MetricFamily = {
    name: `${metricPrefix}_transition_reshuffled`,
    help: 'Per-transition reshuffle count (patients whose pseudonym changed).',
    type: 'gauge',
    samples: transitionReshuffledSamples,
  };
  const transitionCollisionsFamily: MetricFamily = {
    name: `${metricPrefix}_transition_collisions`,
    help: 'Per-transition hash collisions.',
    type: 'counter',
    samples: transitionCollisionsSamples,
  };

  const families = [
    patientsFamily,
    epochsFamily,
    transitionsTotalFamily,
    collisionsTotalFamily,
    noopTransitionsFamily,
    verdictStatusFamily,
    transitionPatientsFamily,
    transitionReshuffledFamily,
    transitionCollisionsFamily,
  ];

  const text = families.map(emitFamily).join('\n\n') + '\n';
  const sampleCount = families.reduce((a, f) => a + f.samples.length, 0);

  return {
    text,
    metricFamilyCount: families.length,
    sampleCount,
    metricPrefix,
  };
}

/**
 * Convenience: extract the metric names emitted, in order. Useful
 * for tests that need to assert on the family set without parsing
 * the full payload.
 *
 * Pure / deterministic.
 */
export function listAnonymiseKeyRotateBulkCliSummaryPrometheusMetricNames(
  result: AnonymiseKeyRotateBulkCliSummaryPrometheusResult,
): string[] {
  const out: string[] = [];
  for (const line of result.text.split('\n')) {
    if (line.startsWith('# TYPE ')) {
      const rest = line.slice('# TYPE '.length);
      const sp = rest.indexOf(' ');
      if (sp !== -1) out.push(rest.slice(0, sp));
    }
  }
  return out;
}

/**
 * Convenience: a one-line cron-log summary of the exporter output.
 *
 *   "Prometheus export: 9 metric families, 17 samples (prefix
 *    med_tracker_key_rotate)."
 */
export function summarizeAnonymiseKeyRotateBulkCliSummaryPrometheus(
  result: AnonymiseKeyRotateBulkCliSummaryPrometheusResult,
): string {
  return (
    `Prometheus export: ${result.metricFamilyCount} metric ` +
    `${result.metricFamilyCount === 1 ? 'family' : 'families'}, ${result.sampleCount} ` +
    `${result.sampleCount === 1 ? 'sample' : 'samples'} (prefix ${result.metricPrefix}).`
  );
}
