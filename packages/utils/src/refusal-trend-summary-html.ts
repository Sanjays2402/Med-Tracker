/**
 * Refusal trend summary HTML.
 *
 * `medication-refusal-trend` computes rolling-window refusal density
 * with per-medication directions (rising / falling / stable /
 * insufficient) and a tolerability sub-stream. The trend ITSELF is
 * pure data — the dashboard needs to render it into something the
 * caregiver can scan in three seconds.
 *
 * This module produces:
 *
 *   1. A chart-component-ready PAYLOAD for each medication. The
 *      dashboard chart component (Recharts, Apex, anything that
 *      takes a `data: { x, y }[]`) consumes the per-medication
 *      `sparkline` field directly with no further shape work.
 *      Both density (refusals/day) and tolerability density series
 *      are produced.
 *
 *   2. A self-contained HTML summary fragment with direction chips,
 *      headline messages, and an inline ASCII-bar sparkline as a
 *      fallback for plain-text consumers (alt text on the chart
 *      image; readable in email previews where canvas-based charts
 *      can't render).
 *
 * No external charting library is required to RENDER the HTML —
 * the inline sparkline is a 1D bar chart drawn in HTML divs with
 * inline styles. The chart payload is provided alongside so the
 * dashboard can render a richer Recharts/Apex/etc chart when it
 * wants.
 *
 * Pure / deterministic. No I/O.
 */

import type {
  MedicationRefusalTrend,
  RefusalTrendDirection,
  RefusalTrendReport,
  RefusalWindowDensity,
} from './medication-refusal-trend';

export interface RefusalTrendChartPoint {
  /** Window length in days (X axis). */
  x: number;
  /** Total refusal density per day (Y axis). */
  y: number;
  /** Tolerability density per day (Y axis secondary). */
  yTolerability: number;
  /** True when window had zero refusals (chart can dim point). */
  empty: boolean;
  /** Inclusive ISO measurement start. */
  measurementStart: string;
  /** Inclusive ISO measurement end. */
  measurementEnd: string;
}

export interface RefusalTrendSparkline {
  medicationId: string;
  medicationName?: string;
  /** Direction chip label (RISING / STABLE / FALLING / INSUFFICIENT). */
  directionLabel: string;
  /** Chart-ready data points, one per window, smallest -> largest. */
  data: RefusalTrendChartPoint[];
  /** ASCII bar fallback (one block per window) keyed to densityPerDay. */
  ascii: string;
}

export interface RefusalTrendSummaryHtmlOptions {
  /**
   * When false, render every medication regardless of direction.
   * Default true — caregivers only want the actionable rows
   * (rising overall OR rising tolerability lead flag).
   */
  actionableOnly?: boolean;
  /** Override the font family used in inline styles. */
  fontFamily?: string;
  /**
   * Maximum medications shown in the HTML body. Default 10 — keeps
   * the email under one screen on mobile. Extras get an
   * "...and N more" line.
   */
  medicationLimit?: number;
  /** Brand accent colour. Default '#0f766e'. Pass null to disable. */
  brandColor?: string | null;
}

export interface RefusalTrendSummaryHtml {
  /** Self-contained HTML body fragment. */
  html: string;
  /** Sparkline + chart payload for every medication in the report
   *  (regardless of actionableOnly — payload is full so a separate
   *  consumer can render every chart). */
  sparklines: RefusalTrendSparkline[];
  /** Medications actually rendered into the HTML body. */
  rendered: MedicationRefusalTrend[];
  /** How many medications were dropped by actionableOnly + limit. */
  hiddenCount: number;
}

const DIRECTION_LABEL: Record<RefusalTrendDirection, string> = {
  rising: 'RISING',
  falling: 'FALLING',
  stable: 'STABLE',
  insufficient: 'INSUFFICIENT',
};

const DIRECTION_BG: Record<RefusalTrendDirection, string> = {
  rising: '#fee2e2', // red-100
  falling: '#dcfce7', // green-100
  stable: '#f3f4f6', // gray-100
  insufficient: '#fef3c7', // amber-100
};

const DIRECTION_FG: Record<RefusalTrendDirection, string> = {
  rising: '#991b1b', // red-800
  falling: '#166534', // green-800
  stable: '#374151', // gray-700
  insufficient: '#854d0e', // amber-800
};

const ASCII_BLOCKS = [' ', '\u2581', '\u2582', '\u2583', '\u2584', '\u2585', '\u2586', '\u2587', '\u2588'];

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function asciiFromDensities(values: number[]): string {
  const max = values.reduce((m, v) => Math.max(m, v), 0);
  if (max === 0) return ASCII_BLOCKS[0]!.repeat(values.length);
  return values
    .map((v) => {
      const ratio = v / max;
      const idx = Math.min(ASCII_BLOCKS.length - 1, Math.max(0, Math.round(ratio * (ASCII_BLOCKS.length - 1))));
      return ASCII_BLOCKS[idx]!;
    })
    .join('');
}

function buildSparkline(trend: MedicationRefusalTrend): RefusalTrendSparkline {
  const data: RefusalTrendChartPoint[] = trend.windows.map((w: RefusalWindowDensity) => ({
    x: w.windowDays,
    y: w.densityPerDay,
    yTolerability: w.tolerabilityDensityPerDay,
    empty: w.empty,
    measurementStart: w.measurementStart,
    measurementEnd: w.measurementEnd,
  }));
  const ascii = asciiFromDensities(data.map((d) => d.y));
  const sparkline: RefusalTrendSparkline = {
    medicationId: trend.medicationId,
    directionLabel: DIRECTION_LABEL[trend.direction],
    data,
    ascii,
  };
  if (trend.medicationName) sparkline.medicationName = trend.medicationName;
  return sparkline;
}

function directionChip(trend: MedicationRefusalTrend, lead: boolean, fontFamily: string): string {
  const dir = trend.direction;
  const bg = lead ? '#fee2e2' : DIRECTION_BG[dir];
  const fg = lead ? '#7f1d1d' : DIRECTION_FG[dir];
  const label = lead ? 'TOLERABILITY LEAD' : DIRECTION_LABEL[dir];
  return (
    `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;background:${bg};color:${fg};` +
    `font-family:${fontFamily};font-size:11px;font-weight:600;letter-spacing:0.04em;">` +
    escapeHtml(label) +
    `</span>`
  );
}

function renderInlineSparklineHtml(spark: RefusalTrendSparkline, fontFamily: string): string {
  if (spark.data.length === 0) return '';
  const maxY = spark.data.reduce((m, p) => Math.max(m, p.y), 0);
  if (maxY === 0) {
    return (
      `<div style="font-family:${fontFamily};font-size:11px;color:#9ca3af;">No refusals in any tracked window.</div>`
    );
  }
  // Render as a flex row of inline-block bars, each scaled to maxY.
  const bars = spark.data
    .map((p) => {
      const ratio = p.y / maxY;
      const heightPx = Math.max(2, Math.round(ratio * 22));
      const opacity = p.empty ? '0.35' : '1';
      const title = `${p.x}d window: ${p.y.toFixed(3)}/day`;
      return (
        `<span title="${escapeHtml(title)}" style="display:inline-block;width:14px;height:24px;` +
        `vertical-align:bottom;text-align:center;margin-right:2px;">` +
        `<span style="display:inline-block;width:10px;height:${heightPx}px;` +
        `background:#0f766e;opacity:${opacity};border-radius:2px 2px 0 0;"></span>` +
        `</span>`
      );
    })
    .join('');
  const labels = spark.data
    .map(
      (p) =>
        `<span style="display:inline-block;width:14px;font-family:${fontFamily};font-size:9px;color:#6b7280;text-align:center;margin-right:2px;">${p.x}d</span>`,
    )
    .join('');
  return (
    `<div style="margin-top:4px;">${bars}</div>` +
    `<div>${labels}</div>`
  );
}

function renderTrendRow(
  trend: MedicationRefusalTrend,
  spark: RefusalTrendSparkline,
  fontFamily: string,
): string {
  const name = escapeHtml(trend.medicationName ?? trend.medicationId);
  const message = escapeHtml(trend.message);
  const chip = directionChip(trend, trend.risingTolerability, fontFamily);
  const sparklineHtml = renderInlineSparklineHtml(spark, fontFamily);
  const ascii = escapeHtml(spark.ascii);
  return (
    `<tr>` +
    `<td style="padding:10px 12px 10px 0;border-top:1px solid #e5e7eb;vertical-align:top;">` +
    `<div style="font-family:${fontFamily};font-size:14px;color:#111827;font-weight:600;">${name}</div>` +
    `<div style="font-family:${fontFamily};font-size:12px;color:#6b7280;margin-top:2px;">${message}</div>` +
    `<div style="font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:11px;color:#374151;margin-top:6px;letter-spacing:0.05em;">${ascii}</div>` +
    sparklineHtml +
    `</td>` +
    `<td style="padding:10px 0 10px 8px;border-top:1px solid #e5e7eb;vertical-align:top;text-align:right;white-space:nowrap;">` +
    chip +
    `</td>` +
    `</tr>`
  );
}

function actionable(t: MedicationRefusalTrend): boolean {
  return t.direction === 'rising' || t.risingTolerability;
}

/**
 * Build sparkline payloads + an HTML summary fragment for a refusal
 * trend report. Sparklines are produced for EVERY medication in the
 * input regardless of `actionableOnly` — the chart payload is meant
 * to feed a separate dashboard consumer that may want a per-med
 * chart for every row. The HTML body honours `actionableOnly`
 * (default true) and `medicationLimit` (default 10).
 */
export function buildRefusalTrendSummaryHtml(
  report: RefusalTrendReport,
  options: RefusalTrendSummaryHtmlOptions = {},
): RefusalTrendSummaryHtml {
  const fontFamily =
    options.fontFamily ?? `system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  const limit = Math.max(0, options.medicationLimit ?? 10);
  const actionableOnly = options.actionableOnly ?? true;
  const brand = options.brandColor === null ? null : options.brandColor ?? '#0f766e';

  const sparklines = report.perMedication.map(buildSparkline);

  let rows = report.perMedication;
  if (actionableOnly) rows = rows.filter(actionable);
  const visible = rows.slice(0, limit);
  const overflow = rows.length - visible.length;
  const hiddenCount = report.perMedication.length - visible.length;

  if (rows.length === 0) {
    // Empty body (caller can choose to suppress entirely).
    const empty = renderHeader(report, fontFamily, brand) +
      `<div style="font-family:${fontFamily};font-size:13px;color:#6b7280;">No actionable refusal trends — nothing to flag.</div>`;
    return { html: empty, sparklines, rendered: [], hiddenCount };
  }

  const sparkById = new Map(sparklines.map((s) => [s.medicationId, s]));

  const bodyRows = visible
    .map((t) => renderTrendRow(t, sparkById.get(t.medicationId)!, fontFamily))
    .join('');
  const overflowRow =
    overflow > 0
      ? `<tr><td colspan="2" style="padding:8px 0;font-family:${fontFamily};font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb;font-style:italic;">…and ${overflow} more not shown</td></tr>`
      : '';

  const html =
    renderHeader(report, fontFamily, brand) +
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;">` +
    `<tbody>${bodyRows}${overflowRow}</tbody>` +
    `</table>`;

  return { html, sparklines, rendered: visible, hiddenCount };
}

function renderHeader(report: RefusalTrendReport, fontFamily: string, brand: string | null): string {
  const total = report.perMedication.length;
  const rising = report.rising.length;
  const tol = report.risingTolerability.length;
  const accent = brand
    ? `border-left:4px solid ${brand};padding-left:12px;`
    : `padding-left:0;`;
  const headline = `Refusal trend across ${total} medication${total === 1 ? '' : 's'}: ${rising} rising${tol > 0 ? `, ${tol} tolerability lead` : ''}.`;
  return (
    `<div style="font-family:${fontFamily};font-size:15px;color:#111827;${accent}margin-bottom:14px;">` +
    `<div>${escapeHtml(headline)}</div>` +
    `<div style="font-size:12px;color:#6b7280;margin-top:4px;">As of ${escapeHtml(report.asOf)} (windows: ${report.windowsDays.join('d, ')}d)</div>` +
    `</div>`
  );
}

/**
 * Cheap predicate: true when the report has at least one actionable
 * row (rising overall OR rising tolerability). Cron callers use it
 * to skip the SMTP call entirely when there's nothing to nudge.
 */
export function hasRefusalTrendActionable(report: RefusalTrendReport): boolean {
  return report.rising.length > 0 || report.risingTolerability.length > 0;
}
