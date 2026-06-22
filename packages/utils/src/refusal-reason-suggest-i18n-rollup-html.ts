/**
 * Refusal reason suggest i18n rollup — HTML render.
 *
 * `refusal-reason-suggest-i18n-rollup` produces a
 * RefusalReasonI18nRollupResult: per-dose localised suggestions plus
 * a coverage rollup. The patient adjudication queue UI needs to
 * render that result as a TABLE the patient can scan and
 * accept-or-reject row-by-row — same pattern as
 * dose-export-csv-import-roundtrip-validator-html for the
 * round-trip validator.
 *
 * Structural decisions mirror the validator HTML (chip colours,
 * grouping, font stack) so the adjudication queue feels consistent
 * across modules:
 *
 *   - Doses are GROUPED BY SOURCE in priority order (npo-window ->
 *     prescriber-pause -> out-of-supply -> sleeping-window ->
 *     recent-pattern). Each source maps to its own chip colour borrowed
 *     from followup-digest-html's palette so a fast visual scan tells
 *     the patient which rule fired.
 *   - Each row shows the localised explanation, locale used (with a
 *     small "fallback" badge when the i18n layer fell back to English),
 *     suggested reason code, and accept / reject controls.
 *   - Doses with no suggestion are filtered out (the suggester's
 *     "nothing fired" rows aren't actionable in the queue).
 *   - A coverage summary chip strip at the top reflects the rollup's
 *     telemetry (doseCount, suggestedCount, fallbackCount, top source)
 *     so the patient sees the queue's overall health in one glance.
 *
 * Pure / deterministic. No I/O. HTML fragment only — no <html>/<body>
 * envelope, all styles inline so Gmail / Outlook / portal previews
 * render correctly.
 */

import type { RefusalReasonI18nKey } from './refusal-reason-suggest-i18n';
import type {
  LocalisedRefusalSuggestion,
  RefusalReasonI18nRollupResult,
} from './refusal-reason-suggest-i18n-rollup';

export type RefusalReasonI18nRollupHtmlSourceFilter =
  | 'all'
  | RefusalReasonI18nKey;

export interface RefusalReasonI18nRollupHtmlOptions {
  /** Cap on rows per source group. Default 25. Extras collapse to "...and N more". */
  rowsPerSourceLimit?: number;
  /** Filter to one source group instead of rendering all five. Default 'all'. */
  sourceFilter?: RefusalReasonI18nRollupHtmlSourceFilter;
  /** Render accept / reject checkbox controls per row. Default true. */
  interactive?: boolean;
  /** Include the coverage summary chip strip at the top. Default true. */
  includeCoverageStrip?: boolean;
  /** Override the cell font-family. */
  fontFamily?: string;
  /**
   * Optional patient name for the panel header. Empty / undefined
   * renders a generic title.
   */
  patientName?: string;
}

export interface RefusalReasonI18nRollupHtml {
  /** HTML fragment (no <html>/<body>). */
  html: string;
  /** Number of suggestion rows actually rendered post-filter + post-limit. */
  shownSuggestionCount: number;
  /** Number of suggestion rows hidden by limits or filter. */
  hiddenSuggestionCount: number;
  /** Per-source row counts that were rendered. */
  shownBySource: Record<RefusalReasonI18nKey, number>;
}

const SOURCE_LABEL: Record<RefusalReasonI18nKey, string> = {
  'npo-window': 'NPO WINDOW',
  'prescriber-pause': 'PRESCRIBER PAUSE',
  'out-of-supply': 'OUT OF SUPPLY',
  'sleeping-window': 'SLEEPING WINDOW',
  'recent-pattern': 'RECENT PATTERN',
};

const SOURCE_BG: Record<RefusalReasonI18nKey, string> = {
  'npo-window': '#fef3c7', // yellow
  'prescriber-pause': '#dbeafe', // blue
  'out-of-supply': '#fee2e2', // red
  'sleeping-window': '#e0e7ff', // indigo
  'recent-pattern': '#fce7f3', // pink
};

const SOURCE_FG: Record<RefusalReasonI18nKey, string> = {
  'npo-window': '#854d0e',
  'prescriber-pause': '#1e3a8a',
  'out-of-supply': '#991b1b',
  'sleeping-window': '#3730a3',
  'recent-pattern': '#9d174d',
};

const SOURCE_PRIORITY: RefusalReasonI18nKey[] = [
  'npo-window',
  'prescriber-pause',
  'out-of-supply',
  'sleeping-window',
  'recent-pattern',
];

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function chipForSource(source: RefusalReasonI18nKey): string {
  return (
    `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;` +
    `background:${SOURCE_BG[source]};color:${SOURCE_FG[source]};font-size:11px;font-weight:600;letter-spacing:0.04em;">` +
    escapeHtml(SOURCE_LABEL[source]) +
    `</span>`
  );
}

function fallbackBadge(): string {
  return (
    `<span style="display:inline-block;margin-left:6px;padding:1px 6px;border-radius:3px;` +
    `background:#fef3c7;color:#854d0e;font-size:10px;font-weight:600;letter-spacing:0.04em;">` +
    `FALLBACK</span>`
  );
}

function renderRow(
  s: LocalisedRefusalSuggestion,
  fontFamily: string,
  interactive: boolean,
): string {
  if (!s.suggestion || !s.source) return '';
  const altCount = s.alternatives.length;
  const altLine =
    altCount > 0
      ? `<div style="font-family:${fontFamily};font-size:11px;color:#9ca3af;margin-top:4px;">${altCount} alternative${altCount === 1 ? '' : 's'} available</div>`
      : '';
  const fallbackTag = s.suggestion.fallback ? fallbackBadge() : '';
  const reasonLabel =
    typeof s.reason === 'string'
      ? `<div style="font-family:${fontFamily};font-size:11px;color:#6b7280;margin-top:4px;">Reason code: <span style="font-weight:600;">${escapeHtml(s.reason)}</span></div>`
      : '';
  const controls = interactive
    ? `<div style="display:flex;gap:6px;margin-top:8px;">` +
      `<label style="display:inline-flex;align-items:center;gap:4px;font-family:${fontFamily};font-size:12px;color:#166534;">` +
      `<input type="checkbox" name="accept" value="${escapeHtml(s.doseId)}" /> Accept` +
      `</label>` +
      `<label style="display:inline-flex;align-items:center;gap:4px;font-family:${fontFamily};font-size:12px;color:#991b1b;">` +
      `<input type="checkbox" name="reject" value="${escapeHtml(s.doseId)}" /> Reject` +
      `</label>` +
      `</div>`
    : '';
  return (
    `<tr>` +
    `<td style="padding:10px 12px 10px 0;font-family:${fontFamily};font-size:13px;color:#111827;border-top:1px solid #e5e7eb;vertical-align:top;width:220px;">` +
    `<div style="font-weight:600;">${escapeHtml(s.doseId)}</div>` +
    `<div style="margin-top:4px;">${chipForSource(s.source)}</div>` +
    reasonLabel +
    controls +
    `</td>` +
    `<td style="padding:10px 12px 10px 0;font-family:${fontFamily};font-size:13px;color:#374151;border-top:1px solid #e5e7eb;vertical-align:top;">` +
    `<div>${escapeHtml(s.suggestion.text)}${fallbackTag}</div>` +
    `<div style="font-family:${fontFamily};font-size:11px;color:#6b7280;margin-top:6px;">Locale: ${escapeHtml(s.suggestion.locale)}</div>` +
    altLine +
    `</td>` +
    `</tr>`
  );
}

function renderSourceSection(
  source: RefusalReasonI18nKey,
  rows: LocalisedRefusalSuggestion[],
  fontFamily: string,
  rowsLimit: number,
  interactive: boolean,
): { html: string; shown: number; hidden: number } {
  if (rows.length === 0) return { html: '', shown: 0, hidden: 0 };
  const shown = rows.slice(0, rowsLimit);
  const overflow = rows.length - shown.length;
  const bodyRows = shown.map((r) => renderRow(r, fontFamily, interactive)).join('');
  const overflowRow =
    overflow > 0
      ? `<tr><td colspan="2" style="padding:8px 12px;font-family:${fontFamily};font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb;font-style:italic;">…and ${overflow} more ${escapeHtml(SOURCE_LABEL[source].toLowerCase())} suggestion${overflow === 1 ? '' : 's'} not shown</td></tr>`
      : '';
  const headerLabel = `${escapeHtml(SOURCE_LABEL[source])} (${rows.length})`;
  const table =
    `<div style="margin-bottom:18px;">` +
    `<div style="font-family:${fontFamily};font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">${headerLabel}</div>` +
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;">` +
    `<tbody>${bodyRows}${overflowRow}</tbody>` +
    `</table>` +
    `</div>`;
  return { html: table, shown: shown.length, hidden: overflow };
}

function renderCoverageStrip(
  result: RefusalReasonI18nRollupResult,
  fontFamily: string,
): string {
  const c = result.coverage;
  const sources = [...c.bySource.entries()].sort(
    (a, b) => b[1].suggested - a[1].suggested,
  );
  const topSource =
    sources.length === 0
      ? 'none'
      : `${SOURCE_LABEL[sources[0]![0]]} (${sources[0]![1].suggested})`;
  const fallbackPart =
    c.fallbackCount > 0
      ? ` &middot; <span style="color:#854d0e;font-weight:600;">${c.fallbackCount} fallback</span>`
      : '';
  const missingPart =
    c.missingPlaceholders.length > 0
      ? ` &middot; <span style="color:#991b1b;font-weight:600;">Missing placeholders: ${c.missingPlaceholders.map(escapeHtml).join(', ')}</span>`
      : '';
  return (
    `<div style="font-family:${fontFamily};font-size:12px;color:#374151;background:#f9fafb;padding:8px 10px;border-radius:6px;margin-bottom:14px;">` +
    `${c.suggestedCount}/${c.doseCount} suggested ` +
    `&middot; Top source: ${escapeHtml(topSource)}` +
    fallbackPart +
    missingPart +
    `</div>`
  );
}

/**
 * Render a RefusalReasonI18nRollupResult as an HTML fragment for the
 * patient adjudication queue. Suggestions are grouped by source in
 * priority order (npo-window -> prescriber-pause -> out-of-supply ->
 * sleeping-window -> recent-pattern). Each row carries its localised
 * explanation, locale id, fallback indicator, suggested reason code,
 * and accept / reject controls.
 *
 * Returns the fragment + shown / hidden counts so the caller can
 * render its own "showing X of Y" UI affordances.
 */
export function renderRefusalReasonI18nRollupHtml(
  result: RefusalReasonI18nRollupResult,
  options: RefusalReasonI18nRollupHtmlOptions = {},
): RefusalReasonI18nRollupHtml {
  const rowsLimit = Math.max(0, options.rowsPerSourceLimit ?? 25);
  const sourceFilter: RefusalReasonI18nRollupHtmlSourceFilter = options.sourceFilter ?? 'all';
  const interactive = options.interactive ?? true;
  const includeCoverageStrip = options.includeCoverageStrip ?? true;
  const fontFamily =
    options.fontFamily ?? `system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;

  const bySource: Record<RefusalReasonI18nKey, LocalisedRefusalSuggestion[]> = {
    'npo-window': [],
    'prescriber-pause': [],
    'out-of-supply': [],
    'sleeping-window': [],
    'recent-pattern': [],
  };
  for (const s of result.suggestions) {
    if (!s.source) continue;
    bySource[s.source].push(s);
  }

  const sourcesToRender =
    sourceFilter === 'all'
      ? SOURCE_PRIORITY
      : SOURCE_PRIORITY.filter((s) => s === sourceFilter);

  let totalShown = 0;
  let totalHidden = 0;
  const shownBySource: Record<RefusalReasonI18nKey, number> = {
    'npo-window': 0,
    'prescriber-pause': 0,
    'out-of-supply': 0,
    'sleeping-window': 0,
    'recent-pattern': 0,
  };
  const sections: string[] = [];
  for (const source of sourcesToRender) {
    const section = renderSourceSection(
      source,
      bySource[source],
      fontFamily,
      rowsLimit,
      interactive,
    );
    if (section.html) sections.push(section.html);
    totalShown += section.shown;
    totalHidden += section.hidden;
    shownBySource[source] = section.shown;
  }

  if (sourceFilter !== 'all') {
    for (const source of SOURCE_PRIORITY) {
      if (source === sourceFilter) continue;
      totalHidden += bySource[source].length;
    }
  }

  const titleText = options.patientName
    ? `${options.patientName} — refusal-reason adjudication`
    : 'Refusal-reason adjudication';
  const headerHtml =
    `<div style="font-family:${fontFamily};margin-bottom:14px;">` +
    `<div style="font-size:18px;font-weight:700;color:#111827;border-bottom:3px solid #6d28d9;padding-bottom:4px;display:inline-block;">${escapeHtml(titleText)}</div>` +
    `</div>`;

  const coverageStrip = includeCoverageStrip ? renderCoverageStrip(result, fontFamily) : '';

  let body = '';
  if (totalShown === 0 && sourcesToRender.length === SOURCE_PRIORITY.length) {
    body = `<div style="font-family:${fontFamily};font-size:13px;color:#6b7280;background:#f9fafb;padding:12px;border-radius:6px;font-style:italic;">No suggestions to review.</div>`;
  } else if (totalShown === 0) {
    body = `<div style="font-family:${fontFamily};font-size:13px;color:#6b7280;font-style:italic;">No suggestions in the selected source group.</div>`;
  } else {
    body = sections.join('');
  }

  return {
    html: headerHtml + coverageStrip + body,
    shownSuggestionCount: totalShown,
    hiddenSuggestionCount: totalHidden,
    shownBySource,
  };
}

/**
 * Convenience: render ONLY the suggestion tables (no header, no
 * coverage strip). For embedding inside a larger adjudication UI
 * that already has its own header.
 */
export function renderRefusalReasonI18nRollupTableOnly(
  result: RefusalReasonI18nRollupResult,
  options: RefusalReasonI18nRollupHtmlOptions = {},
): RefusalReasonI18nRollupHtml {
  const rendered = renderRefusalReasonI18nRollupHtml(result, {
    ...options,
    includeCoverageStrip: false,
  });
  // Strip the header by re-rendering without it. We have to strip
  // separately because the function above always emits the header;
  // returning the tail after the closing </div> of the header keeps
  // the body identical without re-doing the per-source math.
  const headerEnd = rendered.html.indexOf('</div></div>');
  // The header ends right after `inline-block;">${title}</div></div>`
  // — find the close-tags and slice from after them. If the index isn't
  // found (defensive: future refactor changes the header shape), fall
  // back to the full body.
  const sliceAt = headerEnd >= 0 ? headerEnd + '</div></div>'.length : 0;
  return {
    html: rendered.html.slice(sliceAt),
    shownSuggestionCount: rendered.shownSuggestionCount,
    hiddenSuggestionCount: rendered.hiddenSuggestionCount,
    shownBySource: rendered.shownBySource,
  };
}
