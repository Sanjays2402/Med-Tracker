/**
 * Regimen snapshot archive history rollup — CSV export merge,
 * anonymisation key-rotation HTML render.
 *
 * `regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate`
 * produces a per-patient mapping connecting old -> new pseudonyms
 * across an HMAC secret rotation. The mapping is a structured
 * JavaScript object — fine for code consumers, useless for the
 * security auditor reviewing the rotation by eye.
 *
 * Real audit workflows want an HTML table:
 *
 *   - one row per patient with old + new pseudonym columns;
 *   - a per-row no-op marker when the pseudonym did not change
 *     (rare but possible under any name strategy with adjacent
 *     identical secrets);
 *   - a top-of-page banner summarising the rotation (count, no-op,
 *     collisions) so the auditor sees the verdict before scrolling;
 *   - a footer with timestamps so the printed page is filed
 *     correctly in the audit binder.
 *
 * This module is the HTML render of RegimenHistoryAnonymiseKeyRotateResult.
 * Layout deliberately mirrors `regimen-snapshot-archive-history-rollup-html`
 * + `dose-export-csv-import-roundtrip-validator-html` so the audit
 * binder uses the same visual vocabulary across cosmetic types.
 *
 * Options:
 *
 *   - includeOriginalIds (default false) — when true, the original
 *     patient ids + names are included as additional columns. OFF by
 *     default because the resulting HTML is PHI under HIPAA safe
 *     harbour (45 CFR 164.514) — most audit consumers want the
 *     non-PHI variant they can file outside the patient chart;
 *   - includeNoOpRows (default true) — when false, drop the rows
 *     where old pseudonym === new pseudonym to keep the audit page
 *     focussed on actual changes;
 *   - sortBy (default 'old-pseudonym') — 'old-pseudonym' /
 *     'new-pseudonym' / 'patient-id' / 'input' (preserve mapping
 *     order). 'patient-id' requires includeOriginalIds=true.
 *
 * Pure / deterministic. No I/O. No remote URLs. HTML escaped.
 *
 * Composes:
 *   - the rotation result from key-rotate / key-rotate-bulk's
 *     per-transition mapping
 */

import type { RegimenHistoryAnonymiseKeyRotateResult } from './regimen-snapshot-archive-history-rollup-csv-export-merge-anonymise-key-rotate';

export type RegimenHistoryAnonymiseKeyRotateHtmlSortBy =
  | 'old-pseudonym'
  | 'new-pseudonym'
  | 'patient-id'
  | 'input';

export interface RegimenHistoryAnonymiseKeyRotateHtmlOptions {
  /**
   * Include original patient id + name columns. OFF by default
   * because the resulting HTML contains PHI. Audit consumers
   * almost always want the non-PHI variant.
   */
  includeOriginalIds?: boolean;
  /**
   * Include rows where old pseudonym === new pseudonym. Default
   * true. Switch off for a "changes only" audit view.
   */
  includeNoOpRows?: boolean;
  /**
   * Sort order. Default 'old-pseudonym' (lexical) so the same
   * patient appears in the same row across runs. 'patient-id'
   * requires includeOriginalIds=true (the column has to exist).
   */
  sortBy?: RegimenHistoryAnonymiseKeyRotateHtmlSortBy;
  /**
   * Wrap fragment in a full HTML document. Default false (the
   * fragment is a <section> suitable for splicing into a host
   * page). Mirrors the convention of the regimen-history-html
   * sibling.
   */
  wrapHtmlDocument?: boolean;
  /**
   * Document title — used inside <title> and in the document
   * heading. Default 'Anonymisation key rotation'.
   */
  documentTitle?: string;
  /**
   * Optional caption shown under the title (e.g. "Q3 2026 rotation
   * audit"). HTML escaped.
   */
  caption?: string;
  /**
   * Date/time stamp shown in the footer. Default omitted; pass an
   * ISO date string or a Date.
   */
  generatedAt?: Date | string;
}

export interface RegimenHistoryAnonymiseKeyRotateHtmlResult {
  /** HTML fragment (or document, when wrapHtmlDocument=true). */
  html: string;
  /** Row count emitted in the body (post sort + filter). */
  rowCount: number;
  /** True if includeNoOpRows=false dropped any rows. */
  noOpRowsDropped: boolean;
  /** True if includeOriginalIds was true (PHI present). */
  containsOriginalIds: boolean;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

interface RowView {
  originalPatientId: string;
  originalPatientName: string;
  oldPseudonymousId: string;
  oldPseudonymousName: string;
  newPseudonymousId: string;
  newPseudonymousName: string;
  isNoOp: boolean;
}

function buildRows(
  result: RegimenHistoryAnonymiseKeyRotateResult,
  options: RegimenHistoryAnonymiseKeyRotateHtmlOptions,
): RowView[] {
  const includeNoOp = options.includeNoOpRows ?? true;
  const rows: RowView[] = result.mappings.map((m) => ({
    originalPatientId: m.originalPatientId,
    originalPatientName: m.originalPatientName,
    oldPseudonymousId: m.oldPseudonymousId,
    oldPseudonymousName: m.oldPseudonymousName,
    newPseudonymousId: m.newPseudonymousId,
    newPseudonymousName: m.newPseudonymousName,
    isNoOp:
      m.oldPseudonymousId === m.newPseudonymousId &&
      m.oldPseudonymousName === m.newPseudonymousName,
  }));
  const filtered = includeNoOp ? rows : rows.filter((r) => !r.isNoOp);
  const sortBy = options.sortBy ?? 'old-pseudonym';
  if (sortBy === 'input') return filtered;
  if (sortBy === 'patient-id') {
    return [...filtered].sort((a, b) =>
      a.originalPatientId.localeCompare(b.originalPatientId),
    );
  }
  if (sortBy === 'new-pseudonym') {
    return [...filtered].sort((a, b) =>
      a.newPseudonymousId.localeCompare(b.newPseudonymousId),
    );
  }
  // default: 'old-pseudonym'
  return [...filtered].sort((a, b) =>
    a.oldPseudonymousId.localeCompare(b.oldPseudonymousId),
  );
}

function bannerHtml(
  result: RegimenHistoryAnonymiseKeyRotateResult,
  caption: string | undefined,
): string {
  const n = result.mappings.length;
  const noOpChip = result.noOpRotation
    ? `<span class="krhtml-chip krhtml-chip--noop">NO-OP ROTATION</span>`
    : '';
  const collisionChip = result.collisionDetected
    ? `<span class="krhtml-chip krhtml-chip--collision">COLLISION DETECTED</span>`
    : `<span class="krhtml-chip krhtml-chip--ok">NO COLLISIONS</span>`;
  const captionLine = caption
    ? `<div class="krhtml-caption">${escapeHtml(caption)}</div>`
    : '';
  return (
    `<header class="krhtml-banner">` +
    `<div class="krhtml-count">${n} ${n === 1 ? 'patient' : 'patients'} mapped</div>` +
    `<div class="krhtml-chips">${noOpChip}${collisionChip}</div>` +
    captionLine +
    `</header>`
  );
}

function bodyHtml(
  rows: RowView[],
  includeOriginalIds: boolean,
): string {
  if (rows.length === 0) {
    return `<p class="krhtml-empty">No mapping rows.</p>`;
  }
  const headParts: string[] = [];
  if (includeOriginalIds) {
    headParts.push(
      `<th class="krhtml-th">Patient id</th>`,
      `<th class="krhtml-th">Patient name</th>`,
    );
  }
  headParts.push(
    `<th class="krhtml-th">Old pseudonym id</th>`,
    `<th class="krhtml-th">Old pseudonym name</th>`,
    `<th class="krhtml-th">New pseudonym id</th>`,
    `<th class="krhtml-th">New pseudonym name</th>`,
    `<th class="krhtml-th krhtml-th--status">Status</th>`,
  );
  const head = `<thead><tr>${headParts.join('')}</tr></thead>`;
  const bodyRows = rows
    .map((r) => {
      const rowParts: string[] = [];
      if (includeOriginalIds) {
        rowParts.push(
          `<td class="krhtml-td krhtml-td--mono">${escapeHtml(r.originalPatientId)}</td>`,
          `<td class="krhtml-td">${escapeHtml(r.originalPatientName)}</td>`,
        );
      }
      rowParts.push(
        `<td class="krhtml-td krhtml-td--mono">${escapeHtml(r.oldPseudonymousId)}</td>`,
        `<td class="krhtml-td">${escapeHtml(r.oldPseudonymousName)}</td>`,
        `<td class="krhtml-td krhtml-td--mono">${escapeHtml(r.newPseudonymousId)}</td>`,
        `<td class="krhtml-td">${escapeHtml(r.newPseudonymousName)}</td>`,
      );
      const statusChip = r.isNoOp
        ? `<span class="krhtml-chip krhtml-chip--noop">unchanged</span>`
        : `<span class="krhtml-chip krhtml-chip--changed">changed</span>`;
      rowParts.push(
        `<td class="krhtml-td krhtml-td--status">${statusChip}</td>`,
      );
      const rowClass = r.isNoOp ? 'krhtml-tr krhtml-tr--noop' : 'krhtml-tr';
      return `<tr class="${rowClass}">${rowParts.join('')}</tr>`;
    })
    .join('');
  return `<table class="krhtml-table">${head}<tbody>${bodyRows}</tbody></table>`;
}

function footerHtml(
  result: RegimenHistoryAnonymiseKeyRotateResult,
  rowCount: number,
  generatedAt: string | null,
): string {
  const total = result.mappings.length;
  const dropped = total - rowCount;
  const dropPart =
    dropped > 0
      ? ` &middot; ${dropped} no-op ${dropped === 1 ? 'row' : 'rows'} hidden`
      : '';
  const datePart =
    generatedAt !== null
      ? ` &middot; Generated ${escapeHtml(generatedAt)}`
      : '';
  return (
    `<footer class="krhtml-footer">` +
    `Showing ${rowCount} of ${total} mapping ${total === 1 ? 'row' : 'rows'}${dropPart}${datePart}` +
    `</footer>`
  );
}

const CSS =
  `.krhtml{font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;}` +
  `.krhtml-title{font-size:18pt;font-weight:700;margin:0 0 4pt 0;color:#111827;}` +
  `.krhtml-banner{display:flex;flex-wrap:wrap;gap:8pt;align-items:center;padding:8pt 0 12pt 0;border-bottom:1px solid #e5e7eb;margin-bottom:12pt;}` +
  `.krhtml-count{font-size:12pt;font-weight:600;color:#111827;margin-right:8pt;}` +
  `.krhtml-chips{display:flex;gap:4pt;}` +
  `.krhtml-caption{width:100%;font-size:9pt;color:#6b7280;margin-top:4pt;}` +
  `.krhtml-chip{display:inline-block;padding:2pt 6pt;border-radius:9999px;font-size:8pt;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;}` +
  `.krhtml-chip--noop{background:#fef3c7;color:#92400e;}` +
  `.krhtml-chip--collision{background:#fee2e2;color:#991b1b;}` +
  `.krhtml-chip--ok{background:#dcfce7;color:#166534;}` +
  `.krhtml-chip--changed{background:#dbeafe;color:#1e40af;}` +
  `.krhtml-table{width:100%;border-collapse:collapse;margin-bottom:12pt;}` +
  `.krhtml-th{text-align:left;padding:6pt 8pt;background:#f3f4f6;color:#111827;font-size:9pt;font-weight:700;border-bottom:1px solid #e5e7eb;}` +
  `.krhtml-th--status{text-align:right;}` +
  `.krhtml-td{padding:6pt 8pt;font-size:9pt;border-bottom:1px solid #f3f4f6;}` +
  `.krhtml-td--mono{font-family:'SFMono-Regular','Menlo','Consolas',monospace;color:#374151;}` +
  `.krhtml-td--status{text-align:right;}` +
  `.krhtml-tr--noop{background:#fffbeb;}` +
  `.krhtml-empty{color:#6b7280;font-style:italic;margin:12pt 0;}` +
  `.krhtml-footer{font-size:8pt;color:#6b7280;padding-top:8pt;border-top:1px solid #e5e7eb;}`;

/**
 * Render the rotation mapping as an HTML fragment (or full document).
 *
 * Default output is a non-PHI fragment (no original patient ids /
 * names) suitable for archiving in the audit binder. Pass
 * `includeOriginalIds: true` to include the source columns (PHI).
 *
 * Pure / deterministic given (result, options).
 */
export function renderRegimenHistoryAnonymiseKeyRotateHtml(
  result: RegimenHistoryAnonymiseKeyRotateResult,
  options: RegimenHistoryAnonymiseKeyRotateHtmlOptions = {},
): RegimenHistoryAnonymiseKeyRotateHtmlResult {
  const includeOriginalIds = options.includeOriginalIds ?? false;
  if (
    (options.sortBy ?? 'old-pseudonym') === 'patient-id' &&
    !includeOriginalIds
  ) {
    throw new Error(
      "sortBy='patient-id' requires includeOriginalIds=true (the column has to be present to sort by it).",
    );
  }
  const includeNoOp = options.includeNoOpRows ?? true;
  const wrapHtml = options.wrapHtmlDocument ?? false;
  const docTitle = options.documentTitle ?? 'Anonymisation key rotation';

  const rows = buildRows(result, options);
  const banner = bannerHtml(result, options.caption);
  const body = bodyHtml(rows, includeOriginalIds);
  const generatedAtStr =
    options.generatedAt === undefined
      ? null
      : options.generatedAt instanceof Date
        ? isoDate(options.generatedAt)
        : options.generatedAt;
  const footer = footerHtml(result, rows.length, generatedAtStr);
  const titleLine = `<h1 class="krhtml-title">${escapeHtml(docTitle)}</h1>`;
  const sectionInner = titleLine + banner + body + footer;

  const fragment = `<section class="krhtml">${sectionInner}</section>`;
  const html = wrapHtml
    ? `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(docTitle)}</title><style>${CSS}</style></head><body>${fragment}</body></html>`
    : `<style>${CSS}</style>${fragment}`;

  const noOpRowsDropped = !includeNoOp && rows.length < result.mappings.length;

  return {
    html,
    rowCount: rows.length,
    noOpRowsDropped,
    containsOriginalIds: includeOriginalIds,
  };
}

/**
 * Convenience: render the changes-only audit page (no-op rows
 * dropped, original ids dropped, sorted by old pseudonym, no
 * document wrapping). The most common audit-binder filing shape.
 */
export function renderRegimenHistoryAnonymiseKeyRotateHtmlChangesOnly(
  result: RegimenHistoryAnonymiseKeyRotateResult,
  options: Omit<RegimenHistoryAnonymiseKeyRotateHtmlOptions, 'includeNoOpRows' | 'includeOriginalIds'> = {},
): RegimenHistoryAnonymiseKeyRotateHtmlResult {
  return renderRegimenHistoryAnonymiseKeyRotateHtml(result, {
    ...options,
    includeNoOpRows: false,
    includeOriginalIds: false,
  });
}

/**
 * Convenience: one-line summary for the cron log paired with the
 * HTML render.
 *
 *   "Key rotation HTML: 14 rows (2 no-op rows hidden; non-PHI variant)."
 */
export function summarizeKeyRotateHtmlResult(
  result: RegimenHistoryAnonymiseKeyRotateHtmlResult,
): string {
  const hiddenPart = result.noOpRowsDropped
    ? ' (no-op rows hidden)'
    : '';
  const phiPart = result.containsOriginalIds
    ? 'PHI variant'
    : 'non-PHI variant';
  const n = result.rowCount;
  return (
    `Key rotation HTML: ${n} ${n === 1 ? 'row' : 'rows'}${hiddenPart}; ${phiPart}.`
  );
}
