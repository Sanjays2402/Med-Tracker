/**
 * Dose export CSV import round-trip validator — HTML render.
 *
 * `dose-export-csv-import-roundtrip-validator` produces a
 * DoseRoundtripValidateResult: per-dose field-level diffs grouped by
 * risk tier (note-only / status-edit / structural / mixed) plus
 * added / removed / unchanged / parser-skip lists. The patient
 * adjudication UI needs to render that result as a TABLE the patient
 * can scan and accept-or-reject row-by-row.
 *
 * This module is the HTML render. Structural decisions mirror
 * followup-digest-html for visual consistency (chip colours, table
 * layout, font stack):
 *
 *   - structural   -> red chip (highest risk; structural fields
 *                      moved silently are how a pharmacy round-trip
 *                      can corrupt a regimen)
 *   - mixed        -> orange chip (multi-category; treat as
 *                      structural for accept-all decisions)
 *   - status-edit  -> yellow chip (patient re-asserting actual
 *                      adherence)
 *   - note-only    -> blue chip (low risk; the auto-accept toggle
 *                      bulk-applies this tier)
 *
 * Risk tiers render in priority order (structural first, then mixed,
 * status-edit, note-only) so the highest-risk rows are visually
 * dominant. Each diff row shows the per-field before -> after pair,
 * accept / reject checkbox markup the UI binds to, and a sticky-
 * scrollable layout.
 *
 * Pure / deterministic. No I/O. HTML fragment only — no <html>/<body>
 * envelope, all styles inline so Gmail / Outlook render correctly.
 */

import type {
  DoseRoundtripDiff,
  DoseRoundtripFieldChange,
  DoseRoundtripValidateResult,
} from './dose-export-csv-import-roundtrip-validator';

export type DoseRoundtripHtmlRiskFilter = 'all' | DoseRoundtripDiff['risk'];

export interface DoseRoundtripValidateHtmlOptions {
  /**
   * Cap on diff rows shown per risk tier. Default 25. Extras
   * collapse to a "...and N more" row inside that tier's section.
   */
  rowsPerRiskLimit?: number;
  /**
   * Show added / removed / parser-skip side panels. Default true.
   * Disable for a streamlined "diff-only" view.
   */
  includeAdjacentLists?: boolean;
  /**
   * Filter to one risk tier instead of rendering all four. Default
   * 'all'. Useful for the adjudication UI's per-tier drilldown.
   */
  riskFilter?: DoseRoundtripHtmlRiskFilter;
  /**
   * Render checkbox-bound accept / reject controls per row. Default
   * true. Disable for read-only audit views.
   */
  interactive?: boolean;
  /** Override the table cell font-family. */
  fontFamily?: string;
  /**
   * Optional patient name for the panel header. Empty / undefined
   * renders a generic title.
   */
  patientName?: string;
}

export interface DoseRoundtripValidateHtml {
  /** Body HTML fragment (no <html>/<body>). */
  html: string;
  /** Number of diffs actually rendered post-filter and post-limit. */
  shownDiffCount: number;
  /** Number of diffs hidden by limits or filter. */
  hiddenDiffCount: number;
}

const RISK_LABEL: Record<DoseRoundtripDiff['risk'], string> = {
  structural: 'STRUCTURAL',
  mixed: 'MIXED',
  'status-edit': 'STATUS EDIT',
  'note-only': 'NOTE ONLY',
};

const RISK_BG: Record<DoseRoundtripDiff['risk'], string> = {
  structural: '#fee2e2',
  mixed: '#ffedd5',
  'status-edit': '#fef3c7',
  'note-only': '#dbeafe',
};

const RISK_FG: Record<DoseRoundtripDiff['risk'], string> = {
  structural: '#991b1b',
  mixed: '#9a3412',
  'status-edit': '#854d0e',
  'note-only': '#1e3a8a',
};

const RISK_PRIORITY: DoseRoundtripDiff['risk'][] = [
  'structural',
  'mixed',
  'status-edit',
  'note-only',
];

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeCell(s: string | null): string {
  if (s === null || s === undefined) {
    return `<span style="color:#9ca3af;font-style:italic;">∅</span>`;
  }
  if (s === '') {
    return `<span style="color:#9ca3af;font-style:italic;">(empty)</span>`;
  }
  return escapeHtml(s);
}

function chipForRisk(risk: DoseRoundtripDiff['risk']): string {
  return (
    `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;` +
    `background:${RISK_BG[risk]};color:${RISK_FG[risk]};font-size:11px;font-weight:600;letter-spacing:0.04em;">` +
    escapeHtml(RISK_LABEL[risk]) +
    `</span>`
  );
}

function renderChangeRow(change: DoseRoundtripFieldChange, fontFamily: string): string {
  return (
    `<tr>` +
    `<td style="padding:4px 8px 4px 0;font-family:${fontFamily};font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;font-weight:600;vertical-align:top;width:90px;">` +
    escapeHtml(change.field) +
    `</td>` +
    `<td style="padding:4px 8px 4px 0;font-family:${fontFamily};font-size:12px;color:#374151;vertical-align:top;">` +
    `<div style="display:inline-block;background:#fee2e2;color:#991b1b;padding:2px 6px;border-radius:3px;text-decoration:line-through;">` +
    escapeCell(change.before) +
    `</div>` +
    `<span style="margin:0 6px;color:#9ca3af;">→</span>` +
    `<div style="display:inline-block;background:#dcfce7;color:#166534;padding:2px 6px;border-radius:3px;">` +
    escapeCell(change.after) +
    `</div>` +
    `</td>` +
    `</tr>`
  );
}

function renderDiffRow(
  diff: DoseRoundtripDiff,
  fontFamily: string,
  interactive: boolean,
): string {
  const changesTable =
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;">` +
    diff.changes.map((c) => renderChangeRow(c, fontFamily)).join('') +
    `</table>`;
  const controls = interactive
    ? `<div style="display:flex;gap:6px;margin-top:8px;">` +
      `<label style="display:inline-flex;align-items:center;gap:4px;font-family:${fontFamily};font-size:12px;color:#166534;">` +
      `<input type="checkbox" name="accept" value="${escapeHtml(diff.doseId)}" /> Accept` +
      `</label>` +
      `<label style="display:inline-flex;align-items:center;gap:4px;font-family:${fontFamily};font-size:12px;color:#991b1b;">` +
      `<input type="checkbox" name="reject" value="${escapeHtml(diff.doseId)}" /> Reject` +
      `</label>` +
      `</div>`
    : '';
  return (
    `<tr>` +
    `<td style="padding:10px 12px 10px 0;font-family:${fontFamily};font-size:13px;color:#111827;border-top:1px solid #e5e7eb;vertical-align:top;width:200px;">` +
    `<div style="font-weight:600;">${escapeHtml(diff.doseId)}</div>` +
    `<div style="margin-top:4px;">${chipForRisk(diff.risk)}</div>` +
    controls +
    `</td>` +
    `<td style="padding:10px 12px 10px 0;font-family:${fontFamily};font-size:12px;color:#374151;border-top:1px solid #e5e7eb;vertical-align:top;">` +
    changesTable +
    `</td>` +
    `</tr>`
  );
}

function renderRiskSection(
  risk: DoseRoundtripDiff['risk'],
  diffs: DoseRoundtripDiff[],
  fontFamily: string,
  rowsLimit: number,
  interactive: boolean,
): { html: string; shown: number; hidden: number } {
  if (diffs.length === 0) return { html: '', shown: 0, hidden: 0 };
  const shown = diffs.slice(0, rowsLimit);
  const overflow = diffs.length - shown.length;
  const bodyRows = shown.map((d) => renderDiffRow(d, fontFamily, interactive)).join('');
  const overflowRow =
    overflow > 0
      ? `<tr><td colspan="2" style="padding:8px 12px;font-family:${fontFamily};font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb;font-style:italic;">…and ${overflow} more ${escapeHtml(RISK_LABEL[risk].toLowerCase())} diff${overflow === 1 ? '' : 's'} not shown</td></tr>`
      : '';
  const headerLabel = `${escapeHtml(RISK_LABEL[risk])} (${diffs.length})`;
  const table =
    `<div style="margin-bottom:18px;">` +
    `<div style="font-family:${fontFamily};font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">${headerLabel}</div>` +
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;">` +
    `<tbody>${bodyRows}${overflowRow}</tbody>` +
    `</table>` +
    `</div>`;
  return { html: table, shown: shown.length, hidden: overflow };
}

function renderAdjacentList(
  title: string,
  ids: string[],
  fontFamily: string,
  badgeBg: string,
  badgeFg: string,
  limit: number,
): string {
  if (ids.length === 0) return '';
  const shown = ids.slice(0, limit);
  const overflow = ids.length - shown.length;
  const items = shown.map((id) => `<li style="margin:2px 0;">${escapeHtml(id)}</li>`).join('');
  const overflowLine =
    overflow > 0
      ? `<li style="margin:2px 0;color:#9ca3af;font-style:italic;">…and ${overflow} more</li>`
      : '';
  return (
    `<div style="margin-bottom:12px;">` +
    `<div style="font-family:${fontFamily};font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;">` +
    `${escapeHtml(title)} ` +
    `<span style="display:inline-block;background:${badgeBg};color:${badgeFg};padding:1px 6px;border-radius:9999px;font-size:11px;margin-left:4px;">${ids.length}</span>` +
    `</div>` +
    `<ul style="margin:0;padding-left:18px;font-family:${fontFamily};font-size:12px;color:#374151;">` +
    items +
    overflowLine +
    `</ul>` +
    `</div>`
  );
}

/**
 * Render a DoseRoundtripValidateResult as an HTML fragment for the
 * patient adjudication UI. Diffs are grouped by risk tier in priority
 * order (structural -> mixed -> status-edit -> note-only) so the
 * highest-risk rows visually dominate.
 *
 * Returns the fragment string plus shown / hidden diff counts so the
 * caller can render its own "showing X of Y" UI affordances.
 */
export function renderDoseRoundtripValidateHtml(
  result: DoseRoundtripValidateResult,
  options: DoseRoundtripValidateHtmlOptions = {},
): DoseRoundtripValidateHtml {
  const rowsLimit = Math.max(0, options.rowsPerRiskLimit ?? 25);
  const includeAdjacent = options.includeAdjacentLists ?? true;
  const riskFilter: DoseRoundtripHtmlRiskFilter = options.riskFilter ?? 'all';
  const interactive = options.interactive ?? true;
  const fontFamily =
    options.fontFamily ?? `system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;

  // Group diffs by risk tier
  const byRisk: Record<DoseRoundtripDiff['risk'], DoseRoundtripDiff[]> = {
    structural: [],
    mixed: [],
    'status-edit': [],
    'note-only': [],
  };
  for (const d of result.diffs) byRisk[d.risk].push(d);

  const tiersToRender =
    riskFilter === 'all' ? RISK_PRIORITY : RISK_PRIORITY.filter((r) => r === riskFilter);

  let totalShown = 0;
  let totalHidden = 0;
  const sections: string[] = [];
  for (const tier of tiersToRender) {
    const section = renderRiskSection(
      tier,
      byRisk[tier],
      fontFamily,
      rowsLimit,
      interactive,
    );
    if (section.html) sections.push(section.html);
    totalShown += section.shown;
    totalHidden += section.hidden;
  }

  // Add hidden count for risk tiers filtered out entirely
  if (riskFilter !== 'all') {
    for (const tier of RISK_PRIORITY) {
      if (tier === riskFilter) continue;
      totalHidden += byRisk[tier].length;
    }
  }

  const titleText = options.patientName
    ? `${options.patientName} — dose round-trip review`
    : 'Dose round-trip review';
  const headerHtml =
    `<div style="font-family:${fontFamily};margin-bottom:14px;">` +
    `<div style="font-size:18px;font-weight:700;color:#111827;border-bottom:3px solid #0f766e;padding-bottom:4px;display:inline-block;">${escapeHtml(titleText)}</div>` +
    `<div style="font-size:12px;color:#6b7280;margin-top:6px;">` +
    `${result.unchangedCount} unchanged &middot; ${result.diffs.length} diff${result.diffs.length === 1 ? '' : 's'} &middot; ` +
    `${result.addedIds.length} added &middot; ${result.removedIds.length} removed &middot; ` +
    `${result.parseSkipped.length} parser skip${result.parseSkipped.length === 1 ? '' : 's'}` +
    `</div>` +
    `</div>`;

  let body = '';
  if (totalShown === 0 && tiersToRender.length === RISK_PRIORITY.length) {
    body = `<div style="font-family:${fontFamily};font-size:13px;color:#166534;background:#dcfce7;padding:12px;border-radius:6px;">All rows round-tripped cleanly. Nothing to review.</div>`;
  } else if (totalShown === 0) {
    body = `<div style="font-family:${fontFamily};font-size:13px;color:#6b7280;font-style:italic;">No diffs in the selected risk tier.</div>`;
  } else {
    body = sections.join('');
  }

  let adjacentHtml = '';
  if (includeAdjacent) {
    const adjacentLimit = 25;
    const adjacentSections: string[] = [];
    if (result.addedIds.length > 0) {
      adjacentSections.push(
        renderAdjacentList('Added rows', result.addedIds, fontFamily, '#dcfce7', '#166534', adjacentLimit),
      );
    }
    if (result.removedIds.length > 0) {
      adjacentSections.push(
        renderAdjacentList('Removed rows', result.removedIds, fontFamily, '#fee2e2', '#991b1b', adjacentLimit),
      );
    }
    if (result.parseSkipped.length > 0) {
      const skippedItems = result.parseSkipped
        .slice(0, adjacentLimit)
        .map(
          (s) =>
            `<li style="margin:2px 0;"><span style="font-weight:600;">row ${s.row}:</span> ${escapeHtml(s.reason)}</li>`,
        )
        .join('');
      const overflow = result.parseSkipped.length - Math.min(adjacentLimit, result.parseSkipped.length);
      const overflowLine =
        overflow > 0
          ? `<li style="margin:2px 0;color:#9ca3af;font-style:italic;">…and ${overflow} more</li>`
          : '';
      adjacentSections.push(
        `<div style="margin-bottom:12px;">` +
          `<div style="font-family:${fontFamily};font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;">` +
          `Parser skipped <span style="display:inline-block;background:#fef3c7;color:#854d0e;padding:1px 6px;border-radius:9999px;font-size:11px;margin-left:4px;">${result.parseSkipped.length}</span>` +
          `</div>` +
          `<ul style="margin:0;padding-left:18px;font-family:${fontFamily};font-size:12px;color:#374151;">${skippedItems}${overflowLine}</ul>` +
          `</div>`,
      );
    }
    if (adjacentSections.length > 0) {
      adjacentHtml =
        `<div style="margin-top:16px;border-top:1px solid #e5e7eb;padding-top:12px;">` +
        adjacentSections.join('') +
        `</div>`;
    }
  }

  return {
    html: headerHtml + body + adjacentHtml,
    shownDiffCount: totalShown,
    hiddenDiffCount: totalHidden,
  };
}

/**
 * Convenience: render ONLY the diff table (no header, no adjacent
 * lists). For embedding inside a larger adjudication UI that already
 * has its own header.
 */
export function renderDoseRoundtripDiffsOnly(
  result: DoseRoundtripValidateResult,
  options: DoseRoundtripValidateHtmlOptions = {},
): DoseRoundtripValidateHtml {
  return renderDoseRoundtripValidateHtml(result, {
    ...options,
    includeAdjacentLists: false,
  });
}
