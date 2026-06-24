import { describe, it, expect } from 'vitest';
import {
  exportAnonymiseKeyRotateBulkCliSummaryAsPrometheus,
  listAnonymiseKeyRotateBulkCliSummaryPrometheusMetricNames,
  summarizeAnonymiseKeyRotateBulkCliSummaryPrometheus,
} from '../src/regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk-cli-summary-prometheus';
import type { AnonymiseKeyRotateBulkCliSummaryJson } from '../src/regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate-bulk-cli-summary-json';

const SAMPLE: AnonymiseKeyRotateBulkCliSummaryJson = {
  transitions: [
    {
      tag: '[key-rotate epoch=secret-2022->secret-2023]',
      fromEpoch: 0,
      toEpoch: 1,
      fromEpochLabel: 'secret-2022',
      toEpochLabel: 'secret-2023',
      patients: 14,
      reshuffled: 14,
      collisions: 0,
      verdict: 'ship-safe',
    },
    {
      tag: '[key-rotate epoch=secret-2023->secret-2024]',
      fromEpoch: 1,
      toEpoch: 2,
      fromEpochLabel: 'secret-2023',
      toEpochLabel: 'secret-2024',
      patients: 14,
      reshuffled: 0,
      collisions: 0,
      verdict: 'no-op',
    },
    {
      tag: '[key-rotate epoch=secret-2024->secret-2025]',
      fromEpoch: 2,
      toEpoch: 3,
      fromEpochLabel: 'secret-2024',
      toEpochLabel: 'secret-2025',
      patients: 14,
      reshuffled: 14,
      collisions: 2,
      verdict: 'widen-hash',
    },
  ],
  batch: {
    tag: '[key-rotate-bulk]',
    epochs: 4,
    transitions: 3,
    patients: 14,
    noOpTransitions: 1,
    collisionsTotal: 2,
    verdict: 'widen-hash',
  },
};

const EMPTY_BATCH: AnonymiseKeyRotateBulkCliSummaryJson = {
  transitions: [],
  batch: {
    tag: '[key-rotate-bulk]',
    epochs: 0,
    transitions: 0,
    patients: 0,
    noOpTransitions: 0,
    collisionsTotal: 0,
    verdict: 'no-op',
  },
};

describe('exportAnonymiseKeyRotateBulkCliSummaryAsPrometheus — happy path', () => {
  it('emits all nine metric families with HELP + TYPE headers', () => {
    const result = exportAnonymiseKeyRotateBulkCliSummaryAsPrometheus(SAMPLE);
    expect(result.metricFamilyCount).toBe(9);
    const families = listAnonymiseKeyRotateBulkCliSummaryPrometheusMetricNames(result);
    expect(families).toEqual([
      'med_tracker_key_rotate_patients',
      'med_tracker_key_rotate_epochs',
      'med_tracker_key_rotate_transitions_total',
      'med_tracker_key_rotate_collisions_total',
      'med_tracker_key_rotate_noop_transitions',
      'med_tracker_key_rotate_verdict_status',
      'med_tracker_key_rotate_transition_patients',
      'med_tracker_key_rotate_transition_reshuffled',
      'med_tracker_key_rotate_transition_collisions',
    ]);
  });

  it('emits the cohort patient gauge with the batch label', () => {
    const { text } = exportAnonymiseKeyRotateBulkCliSummaryAsPrometheus(SAMPLE);
    expect(text).toContain(
      '# HELP med_tracker_key_rotate_patients Total patients in the cohort being rotated.',
    );
    expect(text).toContain('# TYPE med_tracker_key_rotate_patients gauge');
    expect(text).toContain(
      'med_tracker_key_rotate_patients{batch="[key-rotate-bulk]"} 14',
    );
  });

  it('emits the collisions counter using the total from the batch', () => {
    const { text } = exportAnonymiseKeyRotateBulkCliSummaryAsPrometheus(SAMPLE);
    expect(text).toContain('# TYPE med_tracker_key_rotate_collisions_total counter');
    expect(text).toContain(
      'med_tracker_key_rotate_collisions_total{batch="[key-rotate-bulk]"} 2',
    );
  });

  it('emits per-verdict status with 1 for the current batch verdict and 0 for the rest', () => {
    const { text } = exportAnonymiseKeyRotateBulkCliSummaryAsPrometheus(SAMPLE);
    expect(text).toContain(
      'med_tracker_key_rotate_verdict_status{batch="[key-rotate-bulk]",verdict="widen-hash"} 1',
    );
    expect(text).toContain(
      'med_tracker_key_rotate_verdict_status{batch="[key-rotate-bulk]",verdict="empty-cohort"} 0',
    );
    expect(text).toContain(
      'med_tracker_key_rotate_verdict_status{batch="[key-rotate-bulk]",verdict="ship-safe"} 0',
    );
    expect(text).toContain(
      'med_tracker_key_rotate_verdict_status{batch="[key-rotate-bulk]",verdict="no-op"} 0',
    );
  });

  it('emits per-transition samples with from_epoch/to_epoch/verdict labels', () => {
    const { text } = exportAnonymiseKeyRotateBulkCliSummaryAsPrometheus(SAMPLE);
    expect(text).toContain(
      'med_tracker_key_rotate_transition_patients{batch="[key-rotate-bulk]",from_epoch="secret-2022",to_epoch="secret-2023",verdict="ship-safe"} 14',
    );
    expect(text).toContain(
      'med_tracker_key_rotate_transition_reshuffled{batch="[key-rotate-bulk]",from_epoch="secret-2023",to_epoch="secret-2024",verdict="no-op"} 0',
    );
    expect(text).toContain(
      'med_tracker_key_rotate_transition_collisions{batch="[key-rotate-bulk]",from_epoch="secret-2024",to_epoch="secret-2025",verdict="widen-hash"} 2',
    );
  });

  it('emits one sample per transition for each transition family', () => {
    const { sampleCount } = exportAnonymiseKeyRotateBulkCliSummaryAsPrometheus(SAMPLE);
    // 5 batch-level singletons (patients, epochs, transitions_total, collisions_total, noop_transitions)
    // + 4 verdict status samples (one per known verdict)
    // + 3 transitions x 3 per-transition families = 9
    // total = 5 + 4 + 9 = 18
    expect(sampleCount).toBe(18);
  });

  it('terminates the payload with a trailing newline (Prometheus convention)', () => {
    const { text } = exportAnonymiseKeyRotateBulkCliSummaryAsPrometheus(SAMPLE);
    expect(text.endsWith('\n')).toBe(true);
  });

  it('separates metric families by a blank line', () => {
    const { text } = exportAnonymiseKeyRotateBulkCliSummaryAsPrometheus(SAMPLE);
    expect(text).toContain('\n\n# HELP med_tracker_key_rotate_epochs');
    expect(text).toContain('\n\n# HELP med_tracker_key_rotate_collisions_total');
  });

  it('mirrors the metric prefix in the result', () => {
    const result = exportAnonymiseKeyRotateBulkCliSummaryAsPrometheus(SAMPLE);
    expect(result.metricPrefix).toBe('med_tracker_key_rotate');
  });
});

describe('exportAnonymiseKeyRotateBulkCliSummaryAsPrometheus — empty batch', () => {
  it('still emits all nine families but with zero values', () => {
    const result = exportAnonymiseKeyRotateBulkCliSummaryAsPrometheus(EMPTY_BATCH);
    expect(result.metricFamilyCount).toBe(9);
    // 5 batch-level + 4 verdict-status + 0 per-transition (no transitions)
    expect(result.sampleCount).toBe(9);
    expect(result.text).toContain(
      'med_tracker_key_rotate_patients{batch="[key-rotate-bulk]"} 0',
    );
    expect(result.text).toContain(
      'med_tracker_key_rotate_verdict_status{batch="[key-rotate-bulk]",verdict="no-op"} 1',
    );
  });

  it('emits HELP + TYPE for every family even when there are zero per-transition samples', () => {
    const result = exportAnonymiseKeyRotateBulkCliSummaryAsPrometheus(EMPTY_BATCH);
    const families = listAnonymiseKeyRotateBulkCliSummaryPrometheusMetricNames(result);
    expect(families).toContain('med_tracker_key_rotate_transition_patients');
    expect(families).toContain('med_tracker_key_rotate_transition_reshuffled');
    expect(families).toContain('med_tracker_key_rotate_transition_collisions');
  });
});

describe('exportAnonymiseKeyRotateBulkCliSummaryAsPrometheus — metric prefix override', () => {
  it('uses the caller-supplied prefix on every metric name', () => {
    const result = exportAnonymiseKeyRotateBulkCliSummaryAsPrometheus(SAMPLE, {
      metricPrefix: 'cohort_a_rotate',
    });
    expect(result.metricPrefix).toBe('cohort_a_rotate');
    expect(result.text).toContain('# TYPE cohort_a_rotate_patients gauge');
    expect(result.text).toContain('cohort_a_rotate_patients{batch="[key-rotate-bulk]"} 14');
    expect(result.text).not.toContain('med_tracker_key_rotate_');
  });

  it('rejects invalid metric prefixes', () => {
    expect(() =>
      exportAnonymiseKeyRotateBulkCliSummaryAsPrometheus(SAMPLE, {
        metricPrefix: '1bad',
      }),
    ).toThrow(/Invalid Prometheus metric name/);
    expect(() =>
      exportAnonymiseKeyRotateBulkCliSummaryAsPrometheus(SAMPLE, {
        metricPrefix: 'bad-dash',
      }),
    ).toThrow(/Invalid Prometheus metric name/);
    expect(() =>
      exportAnonymiseKeyRotateBulkCliSummaryAsPrometheus(SAMPLE, {
        metricPrefix: '',
      }),
    ).toThrow(/Invalid Prometheus metric name/);
  });
});

describe('exportAnonymiseKeyRotateBulkCliSummaryAsPrometheus — extra labels', () => {
  it('adds extra labels to every sample, sorted by name', () => {
    const { text } = exportAnonymiseKeyRotateBulkCliSummaryAsPrometheus(SAMPLE, {
      extraLabels: { tenant: 'clinic-001', service: 'med-tracker-cron' },
    });
    // Labels are emitted in sorted order: batch, service, tenant.
    expect(text).toContain(
      'med_tracker_key_rotate_patients{batch="[key-rotate-bulk]",service="med-tracker-cron",tenant="clinic-001"} 14',
    );
    // Verdict-status label list is sorted too.
    expect(text).toContain(
      'med_tracker_key_rotate_verdict_status{batch="[key-rotate-bulk]",service="med-tracker-cron",tenant="clinic-001",verdict="widen-hash"} 1',
    );
  });

  it('rejects extra labels that clash with reserved labels', () => {
    expect(() =>
      exportAnonymiseKeyRotateBulkCliSummaryAsPrometheus(SAMPLE, {
        extraLabels: { batch: 'overridden' },
      }),
    ).toThrow(/reserved label/);
    expect(() =>
      exportAnonymiseKeyRotateBulkCliSummaryAsPrometheus(SAMPLE, {
        extraLabels: { verdict: 'overridden' },
      }),
    ).toThrow(/reserved label/);
    expect(() =>
      exportAnonymiseKeyRotateBulkCliSummaryAsPrometheus(SAMPLE, {
        extraLabels: { from_epoch: 'overridden' },
      }),
    ).toThrow(/reserved label/);
  });

  it('rejects extra label names with invalid characters', () => {
    expect(() =>
      exportAnonymiseKeyRotateBulkCliSummaryAsPrometheus(SAMPLE, {
        extraLabels: { 'bad-name': 'x' },
      }),
    ).toThrow(/Invalid Prometheus label name/);
    expect(() =>
      exportAnonymiseKeyRotateBulkCliSummaryAsPrometheus(SAMPLE, {
        extraLabels: { '1leadingdigit': 'x' },
      }),
    ).toThrow(/Invalid Prometheus label name/);
  });
});

describe('exportAnonymiseKeyRotateBulkCliSummaryAsPrometheus — label-value escaping', () => {
  it('escapes backslashes, double-quotes, and newlines in label values', () => {
    const tricky: AnonymiseKeyRotateBulkCliSummaryJson = {
      ...SAMPLE,
      batch: { ...SAMPLE.batch, tag: 'tag-with-"quote"\\backslash\nnewline' },
    };
    const { text } = exportAnonymiseKeyRotateBulkCliSummaryAsPrometheus(tricky);
    expect(text).toContain('batch="tag-with-\\"quote\\"\\\\backslash\\nnewline"');
  });

  it('strips carriage returns from label values defensively', () => {
    const tricky: AnonymiseKeyRotateBulkCliSummaryJson = {
      ...SAMPLE,
      batch: { ...SAMPLE.batch, tag: 'tag\r\nwith-crlf' },
    };
    const { text } = exportAnonymiseKeyRotateBulkCliSummaryAsPrometheus(tricky);
    expect(text).toContain('batch="tag\\nwith-crlf"');
    expect(text).not.toContain('\r');
  });
});

describe('listAnonymiseKeyRotateBulkCliSummaryPrometheusMetricNames', () => {
  it('extracts names in emission order, deduplicated by TYPE header', () => {
    const result = exportAnonymiseKeyRotateBulkCliSummaryAsPrometheus(SAMPLE);
    const names = listAnonymiseKeyRotateBulkCliSummaryPrometheusMetricNames(result);
    expect(new Set(names).size).toBe(names.length);
    expect(names.length).toBe(9);
  });

  it('honours a custom prefix', () => {
    const result = exportAnonymiseKeyRotateBulkCliSummaryAsPrometheus(SAMPLE, {
      metricPrefix: 'foo_bar',
    });
    const names = listAnonymiseKeyRotateBulkCliSummaryPrometheusMetricNames(result);
    expect(names.every((n) => n.startsWith('foo_bar_'))).toBe(true);
  });
});

describe('summarizeAnonymiseKeyRotateBulkCliSummaryPrometheus', () => {
  it('summarises a populated batch in one line', () => {
    const result = exportAnonymiseKeyRotateBulkCliSummaryAsPrometheus(SAMPLE);
    expect(summarizeAnonymiseKeyRotateBulkCliSummaryPrometheus(result)).toBe(
      'Prometheus export: 9 metric families, 18 samples (prefix med_tracker_key_rotate).',
    );
  });

  it('uses singular form when there is exactly one family or sample', () => {
    // Force a synthetic one-sample, one-family case by faking the result.
    const fake = {
      text: '# HELP x x\n# TYPE x gauge\nx 1\n',
      metricFamilyCount: 1,
      sampleCount: 1,
      metricPrefix: 'x',
    };
    expect(summarizeAnonymiseKeyRotateBulkCliSummaryPrometheus(fake)).toBe(
      'Prometheus export: 1 metric family, 1 sample (prefix x).',
    );
  });

  it('mentions the prefix from the result rather than the default', () => {
    const result = exportAnonymiseKeyRotateBulkCliSummaryAsPrometheus(SAMPLE, {
      metricPrefix: 'cohort_a_rotate',
    });
    expect(summarizeAnonymiseKeyRotateBulkCliSummaryPrometheus(result)).toContain(
      'prefix cohort_a_rotate',
    );
  });
});

describe('exportAnonymiseKeyRotateBulkCliSummaryAsPrometheus — determinism', () => {
  it('produces identical output for identical input', () => {
    const a = exportAnonymiseKeyRotateBulkCliSummaryAsPrometheus(SAMPLE);
    const b = exportAnonymiseKeyRotateBulkCliSummaryAsPrometheus(SAMPLE);
    expect(a.text).toBe(b.text);
    expect(a.metricFamilyCount).toBe(b.metricFamilyCount);
    expect(a.sampleCount).toBe(b.sampleCount);
  });

  it('produces label order independent of extraLabels insertion order', () => {
    const a = exportAnonymiseKeyRotateBulkCliSummaryAsPrometheus(SAMPLE, {
      extraLabels: { tenant: 'clinic-001', service: 'cron' },
    });
    const b = exportAnonymiseKeyRotateBulkCliSummaryAsPrometheus(SAMPLE, {
      extraLabels: { service: 'cron', tenant: 'clinic-001' },
    });
    expect(a.text).toBe(b.text);
  });
});

describe('exportAnonymiseKeyRotateBulkCliSummaryAsPrometheus — single-transition batch', () => {
  it('handles a one-transition batch (no internal newline issues)', () => {
    const single: AnonymiseKeyRotateBulkCliSummaryJson = {
      transitions: [SAMPLE.transitions[0]!],
      batch: { ...SAMPLE.batch, epochs: 2, transitions: 1, noOpTransitions: 0, collisionsTotal: 0, verdict: 'ship-safe' },
    };
    const result = exportAnonymiseKeyRotateBulkCliSummaryAsPrometheus(single);
    // 5 batch + 4 verdict + 3 per-transition (1 sample x 3 families) = 12
    expect(result.sampleCount).toBe(12);
    expect(result.text).toContain(
      'med_tracker_key_rotate_verdict_status{batch="[key-rotate-bulk]",verdict="ship-safe"} 1',
    );
  });
});
