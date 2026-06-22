/**
 * Regimen snapshot archive history rollup — HTML render.
 *
 * `regimen-snapshot-archive-history-rollup` produces a structured
 * RegimenHistoryRollup: per-medication add/remove/strength-change
 * timeline + per-snapshot itemCount + cycled medication list. The
 * de-prescribing review needs to LOOK at that timeline — a table view
 * that shows tenure at a glance, every strength change in chronologic
 * order, and obvious chips for cycled medications.
 *
 * This module is the HTML render of RegimenHistoryRollup. Structural
 * decisions deliberately mirror followup-digest-html so the
 * de-prescribing screen and the follow-up screen share visual
 * vocabulary (chip colours, table layout, font stack).
 *
 * Sort modes:
 *   - 'tenure'      (default): longest-tenure medications first; the
 *                              clinician's natural sort for
 *                              de-prescribing — long-term meds with
 *                              no recent strength changes are the
 *                              first candidates for review.
 *   - 'event-count': most-events first; highlights the meds with the
 *                    busiest titration / cycle history (titrate up,
 *                    titrate down, switched off and back on).
 *   - 'recent':     most-recently changed first; the \"what just
 *                   moved\" view for a fresh dashboard pull.
 *
 * The HTML fragment has no <html>/<body> envelope (the email /
 * portal layer wraps); all styles inline so Gmail + Outlook render
 * correctly without a <style> block.
 *
 * Pure / deterministic. No I/O.
 */

import type {
  RegimenHistoryEvent,
  RegimenHistoryRollup,
  RegimenMedicationHistory,
  RegimenSnapshotTimelineEntry,
} from './regimen-snapshot-archive-history-rollup';

export type RegimenHistoryRollupHtmlSort = 'tenure' | 'event-count' | 'recent';

export interface RegimenHistoryRollupHtmlOptions {
  /**
   * Patient display name used in the title (\"Jane Doe's regimen
   * history\"). Empty / undefined renders a generic title.
   */
  patientName?: string;
  /** Sort order for the per-medication table. Default 'tenure'. */
  sort?: RegimenHistoryRollupHtmlSort;
  /**
   * Cap on the number of medications listed. Default 50. Extras
   * collapse into a \"...and N more\" row.
   */
  medicationLimit?: number;
  /**
   * Cap on events shown per medication. Default 8 (covers a typical
   * titration history in one row). Extras collapse to \"...and N
   * earlier\".
   */
  eventsPerMedicationLimit?: number;
  /** Override the cell font-family. Inline because Gmail strips <style>. */
  fontFamily?: string;
  /**
   * Brand colour used for the table-header underline. Default
   * '#0f766e'. null disables the accent.
   */
  brandColor?: string | null;
  /**
   * Include the cross-snapshot timeline strip at the top. Default
   * true. Disable for very narrow portal layouts where the timeline
   * would wrap awkwardly.
   */
  includeTimeline?: boolean;
}

export interface RegimenHistoryRollupHtml {
  /** Body HTML fragment (no <html>/<body>). */
  html: string;
  /** Order the medications actually appear in (post-sort, post-limit). */
  medicationOrder: string[];
  /** Count of rows truncated by medicationLimit. */
  medicationOverflow: number;
}

const EVENT_CHIP: Record<RegimenHistoryEvent['kind'], { bg: string; fg: string; label: string }> = {
  added: { bg: '#dcfce7', fg: '#166534', label: 'ADDED' },
  removed: { bg: '#fee2e2', fg: '#991b1b', label: 'REMOVED' },
  'strength-change': { bg: '#fef3c7', fg: '#854d0e', label: 'CHANGE' },
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function dateOnly(iso: string): string {
  // Trim ISO 8601 to YYYY-MM-DD when present; otherwise return as-is.
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  return m ? m[1]! : iso;
}

function tenureDays(history: RegimenMedicationHistory): number {
  const a = Date.parse(history.firstSeenAt);
  const b = Date.parse(history.lastSeenAt);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

function mostRecentEventTime(history: RegimenMedicationHistory): number {
  const events = history.events;
  if (events.length === 0) return 0;
  const lastEvent = events[events.length - 1]!;
  const t = Date.parse(lastEvent.observedAt);
  return Number.isFinite(t) ? t : 0;
}

function sortHistories(
  perMedication: RegimenMedicationHistory[],
  sort: RegimenHistoryRollupHtmlSort,
): RegimenMedicationHistory[] {
  const copy = perMedication.slice();
  if (sort === 'tenure') {
    copy.sort((a, b) => {
      const td = tenureDays(b) - tenureDays(a);
      if (td !== 0) return td;
      return a.name.localeCompare(b.name);
    });
  } else if (sort === 'event-count') {
    copy.sort((a, b) => {
      const ec = b.events.length - a.events.length;
      if (ec !== 0) return ec;
      return a.name.localeCompare(b.name);
    });
  } else {
    // 'recent'
    copy.sort((a, b) => {
      const r = mostRecentEventTime(b) - mostRecentEventTime(a);
      if (r !== 0) return r;
      return a.name.localeCompare(b.name);
    });
  }
  return copy;
}

function chipFor(kind: RegimenHistoryEvent['kind']): string {
  const c = EVENT_CHIP[kind];
  return (
    `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;` +
    `background:${c.bg};color:${c.fg};font-size:11px;font-weight:600;letter-spacing:0.04em;">` +
    escapeHtml(c.label) +
    `</span>`
  );
}

function renderEventLine(event: RegimenHistoryEvent, fontFamily: string): string {
  const chip = chipFor(event.kind);
  let detail = '';
  if (event.kind === 'strength-change') {
    detail = ` ${escapeHtml(event.before ?? '?')} → ${escapeHtml(event.after ?? '?')}`;
  } else if (event.kind === 'added' && event.after) {
    detail = ` ${escapeHtml(event.after)}`;
  }
  return (
    `<div style="font-family:${fontFamily};font-size:12px;color:#374151;margin:2px 0;">` +
    chip +
    `<span style="margin-left:8px;color:#6b7280;">${escapeHtml(dateOnly(event.observedAt))}</span>` +
    `<span style="margin-left:4px;color:#111827;">${detail}</span>` +
    `</div>`
  );
}

function renderMedicationRow(
  history: RegimenMedicationHistory,
  fontFamily: string,
  eventsPerMedicationLimit: number,
  cycled: boolean,
): string {
  const tenure = tenureDays(history);
  // Most-recent events FIRST in the cell so the freshest signal is at the top.
  const eventsDesc = history.events.slice().reverse();
  const shown = eventsDesc.slice(0, eventsPerMedicationLimit);
  const overflow = eventsDesc.length - shown.length;
  const eventBlock =
    shown.map((e) => renderEventLine(e, fontFamily)).join('') +
    (overflow > 0
      ? `<div style="font-family:${fontFamily};font-size:11px;color:#9ca3af;margin-top:4px;font-style:italic;">…and ${overflow} earlier</div>`
      : '');
  const statusChip = history.removed
    ? `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;background:#fee2e2;color:#991b1b;font-size:10px;font-weight:600;letter-spacing:0.04em;margin-left:6px;">REMOVED</span>`
    : `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;background:#dbeafe;color:#1e3a8a;font-size:10px;font-weight:600;letter-spacing:0.04em;margin-left:6px;">ACTIVE</span>`;
  const cycledChip = cycled
    ? `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;background:#ede9fe;color:#5b21b6;font-size:10px;font-weight:600;letter-spacing:0.04em;margin-left:6px;">CYCLED</span>`
    : '';
  return (
    `<tr>` +
    `<td style="padding:10px 12px 10px 0;font-family:${fontFamily};font-size:14px;color:#111827;border-top:1px solid #e5e7eb;vertical-align:top;">` +
    `<div style="font-weight:600;">${escapeHtml(history.name)}${statusChip}${cycledChip}</div>` +
    `<div style="font-size:11px;color:#6b7280;margin-top:2px;">${escapeHtml(dateOnly(history.firstSeenAt))} → ${escapeHtml(dateOnly(history.lastSeenAt))} &middot; ${tenure}d tenure &middot; ${history.events.length} event${history.events.length === 1 ? '' : 's'}</div>` +
    `</td>` +
    `<td style="padding:10px 12px 10px 0;font-family:${fontFamily};font-size:12px;color:#374151;border-top:1px solid #e5e7eb;vertical-align:top;">` +
    (eventBlock || `<span style="color:#9ca3af;">no events</span>`) +
    `</td>` +
    `</tr>`
  );
}

function renderTimelineStrip(
  timeline: RegimenSnapshotTimelineEntry[],
  fontFamily: string,
): string {
  if (timeline.length === 0) return '';
  const max = timeline.reduce((m, e) => Math.max(m, e.itemCount), 0);
  const denom = max === 0 ? 1 : max;
  const bars = timeline
    .map((e) => {
      const height = Math.max(2, Math.round((e.itemCount / denom) * 32));
      const deltaTag =
        e.delta > 0
          ? `<span style="color:#166534;">+${e.delta}</span>`
          : e.delta < 0
            ? `<span style="color:#991b1b;">${e.delta}</span>`
            : `<span style="color:#9ca3af;">±0</span>`;
      return (
        `<td style="text-align:center;vertical-align:bottom;padding:0 4px;">` +
        `<div style="height:${height}px;width:14px;background:#0f766e;display:inline-block;border-radius:2px 2px 0 0;"></div>` +
        `<div style="font-size:10px;color:#6b7280;margin-top:4px;font-family:${fontFamily};">${e.itemCount}</div>` +
        `<div style="font-size:10px;font-family:${fontFamily};">${deltaTag}</div>` +
        `<div style="font-size:9px;color:#9ca3af;font-family:${fontFamily};white-space:nowrap;">${escapeHtml(dateOnly(e.takenAt))}</div>` +
        `</td>`
      );
    })
    .join('');
  return (
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:18px;">` +
    `<tr><td colspan="${timeline.length}" style="font-family:${fontFamily};font-size:11px;color:#6b7280;padding-bottom:8px;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Regimen size over time</td></tr>` +
    `<tr>${bars}</tr>` +
    `</table>`
  );
}

/**
 * Render a RegimenHistoryRollup as an HTML fragment for the
 * de-prescribing review screen. Returns the fragment string plus the
 * post-sort medication ordering so callers can build a sticky-header
 * sidebar nav.
 */
export function renderRegimenHistoryRollupHtml(
  rollup: RegimenHistoryRollup,
  options: RegimenHistoryRollupHtmlOptions = {},
): RegimenHistoryRollupHtml {
  const sort = options.sort ?? 'tenure';
  const medicationLimit = Math.max(0, options.medicationLimit ?? 50);
  const eventsPerMedicationLimit = Math.max(1, options.eventsPerMedicationLimit ?? 8);
  const fontFamily =
    options.fontFamily ?? `system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
  const brand = options.brandColor === null ? null : options.brandColor ?? '#0f766e';
  const includeTimeline = options.includeTimeline ?? true;

  const cycledSet = new Set(rollup.cycledMedicationIds);
  const sortedHistories = sortHistories(rollup.perMedication, sort);
  const shownHistories = sortedHistories.slice(0, medicationLimit);
  const overflow = sortedHistories.length - shownHistories.length;

  const titleText = options.patientName
    ? `${options.patientName} — regimen history`
    : 'Regimen history';
  const accent = brand
    ? `border-bottom:3px solid ${brand};padding-bottom:4px;display:inline-block;`
    : '';

  const headerHtml =
    `<div style="font-family:${fontFamily};margin-bottom:12px;">` +
    `<div style="font-size:18px;font-weight:700;color:#111827;${accent}">${escapeHtml(titleText)}</div>` +
    `<div style="font-size:12px;color:#6b7280;margin-top:6px;">` +
    `${rollup.snapshotCount} snapshot${rollup.snapshotCount === 1 ? '' : 's'} &middot; ` +
    `${rollup.perMedication.length} medication${rollup.perMedication.length === 1 ? '' : 's'} &middot; ` +
    `${rollup.eventCount} event${rollup.eventCount === 1 ? '' : 's'} &middot; ` +
    `sort: ${escapeHtml(sort)}` +
    `</div>` +
    `</div>`;

  const cycledBanner =
    rollup.cycledMedicationIds.length > 0
      ? `<div style="font-family:${fontFamily};font-size:13px;color:#5b21b6;background:#ede9fe;border:1px solid #ddd6fe;padding:8px 12px;border-radius:6px;margin-bottom:14px;">` +
        `Note: ${rollup.cycledMedicationIds.length} medication${rollup.cycledMedicationIds.length === 1 ? ' was' : 's were'} removed and re-added in this window — clinical review recommended.` +
        `</div>`
      : '';

  const timelineHtml = includeTimeline ? renderTimelineStrip(rollup.timeline, fontFamily) : '';

  let tableHtml = '';
  if (shownHistories.length === 0) {
    tableHtml = `<div style="font-family:${fontFamily};font-size:13px;color:#6b7280;font-style:italic;">No medications in this rollup.</div>`;
  } else {
    const bodyRows = shownHistories
      .map((h) => renderMedicationRow(h, fontFamily, eventsPerMedicationLimit, cycledSet.has(h.medicationId)))
      .join('');
    const overflowRow =
      overflow > 0
        ? `<tr><td colspan="2" style="padding:10px 12px;font-family:${fontFamily};font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb;font-style:italic;">…and ${overflow} more medication${overflow === 1 ? '' : 's'} not shown</td></tr>`
        : '';
    tableHtml =
      `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;">` +
      `<thead><tr>` +
      `<th align="left" style="padding:6px 12px 6px 0;font-family:${fontFamily};font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid #e5e7eb;">Medication</th>` +
      `<th align="left" style="padding:6px 12px 6px 0;font-family:${fontFamily};font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid #e5e7eb;">Events</th>` +
      `</tr></thead>` +
      `<tbody>${bodyRows}${overflowRow}</tbody>` +
      `</table>`;
  }

  const html = headerHtml + cycledBanner + timelineHtml + tableHtml;
  return {
    html,
    medicationOrder: shownHistories.map((h) => h.medicationId),
    medicationOverflow: overflow,
  };
}

/**
 * Convenience: render only the per-medication table fragment, with no
 * header / timeline / cycled banner. Useful when the caller wants to
 * embed the table inside a larger dashboard widget that already has
 * its own header.
 */
export function renderRegimenHistoryRollupTableOnly(
  rollup: RegimenHistoryRollup,
  options: RegimenHistoryRollupHtmlOptions = {},
): RegimenHistoryRollupHtml {
  return renderRegimenHistoryRollupHtml(rollup, {
    ...options,
    includeTimeline: false,
  });
}
