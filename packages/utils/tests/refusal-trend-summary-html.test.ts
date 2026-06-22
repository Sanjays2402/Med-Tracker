import { describe, it, expect } from 'vitest';
import {
  buildRefusalTrendSummaryHtml,
  hasRefusalTrendActionable,
} from '../src/refusal-trend-summary-html';
import {
  computeRefusalTrend,
} from '../src/medication-refusal-trend';
import type { NormalizedRefusal, RefusalReasonCode } from '../src/medication-refusal-log';

const NOW = new Date(2026, 5, 21);
const DAY = 86_400_000;

function refusal(o: Partial<NormalizedRefusal> & { medicationId?: string; reason?: RefusalReasonCode; daysAgo?: number }): NormalizedRefusal {
  const ms = NOW.getTime() - (o.daysAgo ?? 0) * DAY;
  const iso = new Date(ms).toISOString();
  const reason = o.reason ?? 'declined';
  const tol = reason === 'nausea' || reason === 'side-effect';
  return {
    id: o.id ?? `r-${Math.random()}`,
    medicationId: o.medicationId ?? 'm1',
    dueAt: o.dueAt ?? iso,
    loggedAt: o.loggedAt ?? iso,
    reason,
    excludedFromAdherence: o.excludedFromAdherence ?? false,
    tolerabilitySignal: o.tolerabilitySignal ?? tol,
    ...(o.medicationName ? { medicationName: o.medicationName } : {}),
  };
}

// Helper: build a refusal stack that triggers a rising trend with
// NON-tolerability reasons so the RISING chip (not tolerability lead)
// is the one rendered.
function risingRefusals(med: string, name?: string): NormalizedRefusal[] {
  // Heavy concentration recently, sparse in the distant past.
  const recent = [0, 1, 2, 3, 4, 6, 8, 10, 12, 14].map((d) =>
    refusal({ medicationId: med, reason: 'declined', daysAgo: d, ...(name ? { medicationName: name } : {}) }),
  );
  const distant = [120, 150, 170].map((d) =>
    refusal({ medicationId: med, reason: 'declined', daysAgo: d, ...(name ? { medicationName: name } : {}) }),
  );
  return [...recent, ...distant];
}

// Helper: truly stable refusals — even spacing across 180 days such
// that the 30-day window and 180-day window have similar densities.
function stableRefusals(med: string, name?: string): NormalizedRefusal[] {
  // 6 refusals spread evenly across 180 days = 1 every 30 days. The
  // 30d window catches 1, the 90d catches 3, the 180d catches 6.
  // Densities: 0.033, 0.033, 0.033 — bang stable.
  const days = [0, 30, 60, 90, 120, 150];
  return days.map((d) =>
    refusal({ medicationId: med, reason: 'declined', daysAgo: d, ...(name ? { medicationName: name } : {}) }),
  );
}

describe('buildRefusalTrendSummaryHtml — sparkline payload', () => {
  it('produces a sparkline per medication regardless of actionableOnly', () => {
    const trend = computeRefusalTrend(
      [...risingRefusals('m1', 'Atorvastatin'), ...stableRefusals('m2', 'Lisinopril')],
      { asOf: NOW },
    );
    const html = buildRefusalTrendSummaryHtml(trend);
    expect(html.sparklines).toHaveLength(2);
    expect(html.sparklines.map((s) => s.medicationId).sort()).toEqual(['m1', 'm2']);
  });

  it('returns a chart point per window with both density series', () => {
    // Use a stack with a mix of tolerability + non-tolerability so
    // both series are non-zero.
    const refusals = [
      ...risingRefusals('m1'),
      refusal({ medicationId: 'm1', reason: 'nausea', daysAgo: 2 }),
      refusal({ medicationId: 'm1', reason: 'side-effect', daysAgo: 5 }),
    ];
    const trend = computeRefusalTrend(refusals, { asOf: NOW, windowsDays: [30, 90, 180] });
    const html = buildRefusalTrendSummaryHtml(trend);
    const spark = html.sparklines[0]!;
    expect(spark.data.map((d) => d.x)).toEqual([30, 90, 180]);
    expect(spark.data[0]?.y).toBeGreaterThan(0);
    expect(spark.data[0]?.yTolerability).toBeGreaterThan(0);
    expect(spark.data[0]).toMatchObject({
      measurementStart: expect.any(String),
      measurementEnd: expect.any(String),
      empty: expect.any(Boolean),
    });
  });

  it('marks zero-density windows as empty', () => {
    // No refusals at all -> every window empty.
    const trend = computeRefusalTrend([], { asOf: NOW });
    const html = buildRefusalTrendSummaryHtml(trend);
    expect(html.sparklines).toEqual([]);
  });

  it('produces an ASCII bar sparkline with one char per window', () => {
    const trend = computeRefusalTrend(risingRefusals('m1'), { asOf: NOW, windowsDays: [30, 90, 180] });
    const html = buildRefusalTrendSummaryHtml(trend);
    expect(html.sparklines[0]?.ascii.length).toBe(3);
  });

  it('encodes direction label on the sparkline payload', () => {
    const trend = computeRefusalTrend(risingRefusals('m1'), { asOf: NOW });
    const html = buildRefusalTrendSummaryHtml(trend);
    expect(html.sparklines[0]?.directionLabel).toBe('RISING');
  });
});

describe('buildRefusalTrendSummaryHtml — HTML body', () => {
  it('includes the medication name when rendered', () => {
    const trend = computeRefusalTrend(risingRefusals('m1', 'Atorvastatin'), { asOf: NOW });
    const html = buildRefusalTrendSummaryHtml(trend);
    expect(html.html).toContain('Atorvastatin');
  });

  it('falls back to medicationId when name absent', () => {
    const trend = computeRefusalTrend(risingRefusals('m1'), { asOf: NOW });
    const html = buildRefusalTrendSummaryHtml(trend);
    expect(html.html).toContain('m1');
  });

  it('renders a RISING chip for rising medications', () => {
    const trend = computeRefusalTrend(risingRefusals('m1', 'Atorvastatin'), { asOf: NOW });
    const html = buildRefusalTrendSummaryHtml(trend);
    expect(html.html).toContain('RISING');
    expect(html.html).toContain('#991b1b'); // red-800 fg
  });

  it('renders a TOLERABILITY LEAD chip when the lead flag fires', () => {
    // 4 tolerability refusals recently — fires the lead flag.
    const refusals = [
      refusal({ medicationId: 'm1', reason: 'nausea', daysAgo: 1 }),
      refusal({ medicationId: 'm1', reason: 'nausea', daysAgo: 3 }),
      refusal({ medicationId: 'm1', reason: 'side-effect', daysAgo: 5 }),
      refusal({ medicationId: 'm1', reason: 'side-effect', daysAgo: 7 }),
    ];
    const trend = computeRefusalTrend(refusals, { asOf: NOW });
    const html = buildRefusalTrendSummaryHtml(trend);
    expect(html.html).toContain('TOLERABILITY LEAD');
  });

  it('includes the trend message in the row body', () => {
    const trend = computeRefusalTrend(risingRefusals('m1', 'Atorvastatin'), { asOf: NOW });
    const html = buildRefusalTrendSummaryHtml(trend);
    expect(html.html).toMatch(/Rising|Tolerability climbing/);
  });

  it('renders an inline sparkline (24px bar chart) when density > 0', () => {
    const trend = computeRefusalTrend(risingRefusals('m1'), { asOf: NOW });
    const html = buildRefusalTrendSummaryHtml(trend);
    expect(html.html).toContain('height:24px'); // bar slot
    expect(html.html).toContain('#0f766e'); // brand bar fill
  });

  it('emits an "...and N more" overflow row when truncating', () => {
    const refusals: NormalizedRefusal[] = [];
    for (let i = 0; i < 15; i++) {
      refusals.push(...risingRefusals(`m${i}`, `Med${i}`));
    }
    const trend = computeRefusalTrend(refusals, { asOf: NOW });
    const html = buildRefusalTrendSummaryHtml(trend, { medicationLimit: 3 });
    expect(html.html).toContain('and');
    expect(html.html).toContain('more not shown');
  });

  it('shows count of total medications + rising in the header', () => {
    const refusals = [...risingRefusals('m1'), ...stableRefusals('m2')];
    const trend = computeRefusalTrend(refusals, { asOf: NOW });
    const html = buildRefusalTrendSummaryHtml(trend);
    expect(html.html).toContain('2 medications');
  });
});

describe('buildRefusalTrendSummaryHtml — actionableOnly filtering', () => {
  it('default: only actionable medications appear in the body', () => {
    const refusals = [...risingRefusals('m1', 'A'), ...stableRefusals('m2', 'B')];
    const trend = computeRefusalTrend(refusals, { asOf: NOW });
    const html = buildRefusalTrendSummaryHtml(trend);
    expect(html.html).toContain('A');
    expect(html.html).not.toContain('>B<');
    // Sparklines payload still includes both.
    expect(html.sparklines).toHaveLength(2);
  });

  it('actionableOnly=false includes every medication in the body', () => {
    const refusals = [...risingRefusals('m1', 'A'), ...stableRefusals('m2', 'B')];
    const trend = computeRefusalTrend(refusals, { asOf: NOW });
    const html = buildRefusalTrendSummaryHtml(trend, { actionableOnly: false });
    expect(html.rendered.map((m) => m.medicationName).sort()).toEqual(['A', 'B']);
  });

  it('renders an empty-state body when no actionable rows exist', () => {
    const trend = computeRefusalTrend(stableRefusals('m1', 'Lisinopril'), { asOf: NOW });
    const html = buildRefusalTrendSummaryHtml(trend);
    expect(html.rendered).toEqual([]);
    expect(html.html).toContain('nothing to flag');
  });
});

describe('buildRefusalTrendSummaryHtml — HTML-escape', () => {
  it('escapes HTML metacharacters in medication name', () => {
    const refusals = risingRefusals('m1', '<script>alert(1)</script>');
    const trend = computeRefusalTrend(refusals, { asOf: NOW });
    const html = buildRefusalTrendSummaryHtml(trend);
    expect(html.html).not.toContain('<script>alert(1)</script>');
    expect(html.html).toContain('&lt;script&gt;');
  });
});

describe('hasRefusalTrendActionable', () => {
  it('false when no rising and no tolerability lead', () => {
    const trend = computeRefusalTrend(stableRefusals('m1'), { asOf: NOW });
    expect(hasRefusalTrendActionable(trend)).toBe(false);
  });

  it('true when at least one rising medication', () => {
    const trend = computeRefusalTrend(risingRefusals('m1'), { asOf: NOW });
    expect(hasRefusalTrendActionable(trend)).toBe(true);
  });

  it('true when at least one tolerability lead fires', () => {
    const refusals = [
      refusal({ medicationId: 'm1', reason: 'nausea', daysAgo: 1 }),
      refusal({ medicationId: 'm1', reason: 'nausea', daysAgo: 3 }),
      refusal({ medicationId: 'm1', reason: 'side-effect', daysAgo: 5 }),
    ];
    const trend = computeRefusalTrend(refusals, { asOf: NOW });
    expect(hasRefusalTrendActionable(trend)).toBe(true);
  });

  it('false on empty report', () => {
    const trend = computeRefusalTrend([], { asOf: NOW });
    expect(hasRefusalTrendActionable(trend)).toBe(false);
  });
});
