/**
 * Appointment prep text export.
 *
 * `appointment-prep-checklist` produces a full-page text rendering
 * of the patient's pre-visit checklist (medications, adverse events,
 * labs, refills, questions, vitals). That layout is intended for an
 * 8.5x11" printout the patient brings to the visit.
 *
 * This module is the counterpart wallet-pocket layout: a 3.5x2" (US
 * business card / handoff card) text block sized for the FRONT-DESK
 * handoff at check-in. The receptionist's job is to confirm what's
 * on file, mark new items for the clinician, and route the patient
 * to the right exam room — they don't want the patient's question
 * list, they want:
 *
 *   - patient name (one line),
 *   - appointment date + clinician + reason (one or two lines),
 *   - medication count + last-visit anchor (one line each),
 *   - badge summary: "3 NEW adverse" / "2 labs OVERDUE" /
 *     "1 refill DUE TODAY",
 *   - one line per urgent item that needs front-desk routing
 *     (overdue lab order, refill that has run out, severe AE).
 *
 * The total is capped at 10 lines @ 40 columns by default — fits
 * on the patient's portal-printed handoff slip and stays glanceable
 * at the front desk. Optional ASCII border so a pure-text print
 * looks card-shaped.
 *
 * Pure / deterministic. No I/O.
 */

import type {
  AppointmentChecklist,
  AppointmentLabItem,
  AppointmentRefillNeeded,
} from './appointment-prep-checklist';
import type { AdverseSeverity } from './adverse-event-log';

export interface AppointmentTextExportOptions {
  /** Card width in monospace columns. Default 40 (wallet size). */
  width?: number;
  /** Max total lines including borders. Default 10. */
  maxLines?: number;
  /**
   * Surround the block with `+--+` / `|  |` ASCII borders. Default
   * true. Disable when the consumer already wraps the block in HTML
   * or PDF chrome.
   */
  border?: boolean;
  /**
   * Cap on inline urgent-item lines (a few of overdue labs +
   * out-of-supply refills). Default 3.
   */
  urgentItemLimit?: number;
  /**
   * Days of supply at which a refill is "urgent" enough to surface in
   * the wallet card. Default 3.
   */
  urgentRefillDaysOfSupply?: number;
}

export interface AppointmentTextExport {
  text: string;
  /** Effective width (border + content). */
  width: number;
  /** Lines in the final text block (incl. border). */
  lineCount: number;
  /** True when content was truncated to fit maxLines. */
  truncated: boolean;
  /** Items dropped because they didn't fit. */
  droppedItems: number;
}

const SEVERITY_RANK: Record<AdverseSeverity, number> = {
  minor: 0,
  moderate: 1,
  major: 2,
  'life-threatening': 3,
};

const SEVERITY_SHORT: Record<AdverseSeverity, string> = {
  minor: 'MIN',
  moderate: 'MOD',
  major: 'MAJ',
  'life-threatening': 'CRIT',
};

function truncateLine(s: string, width: number): string {
  if (s.length <= width) return s;
  if (width <= 1) return s.slice(0, width);
  return s.slice(0, width - 1) + '\u2026'; // single-char ellipsis
}

function centerLine(s: string, width: number): string {
  if (s.length >= width) return truncateLine(s, width);
  const pad = width - s.length;
  const left = Math.floor(pad / 2);
  const right = pad - left;
  return ' '.repeat(left) + s + ' '.repeat(right);
}

function dividerLine(width: number): string {
  return '-'.repeat(width);
}

function wrapBorder(lines: string[], width: number): string[] {
  // Outer border: "+" corners, "-" horizontals, "|" verticals.
  const innerWidth = width - 2;
  const top = '+' + '-'.repeat(innerWidth) + '+';
  const bottom = top;
  const middle = lines.map((l) => {
    const trimmed = l.length > innerWidth ? truncateLine(l, innerWidth) : l + ' '.repeat(innerWidth - l.length);
    return '|' + trimmed + '|';
  });
  return [top, ...middle, bottom];
}

function pickWorstLab(labs: AppointmentLabItem[]): AppointmentLabItem | undefined {
  // Overdue precedes due-soon; among overdue, the most-overdue wins.
  // labs in AppointmentChecklist are already sorted by daysUntilDue
  // ascending, so [0] is the right pick when non-empty.
  return labs[0];
}

function pickUrgentRefills(
  refills: AppointmentRefillNeeded[],
  urgentDays: number,
  limit: number,
): AppointmentRefillNeeded[] {
  return refills
    .filter((r) => r.daysOfSupplyLeft <= urgentDays)
    .slice(0, limit);
}

/**
 * Build a wallet-pocket text block for an AppointmentChecklist.
 *
 * The layout uses fixed-pitch ASCII; consumers should print with a
 * monospace font (Courier, Menlo, etc). Longer titles are ellipsis-
 * truncated to fit the card width.
 *
 * Header (always present):
 *   line 1: centered patient name
 *   line 2: visit date + clinician
 *
 * Counts row:
 *   "Meds X  Adv Y  Labs Z  Refills W"
 *
 * Urgent rows (each consumes one line, in order):
 *   - worst lab overdue/due-soon row
 *   - up to N urgent refills (default 3)
 *   - top adverse event when severity >= major
 *
 * Footer (when room remains):
 *   "Since visit YYYY-MM-DD" anchor line.
 *
 * Truncation: if content overruns maxLines (default 10), urgent
 * items get trimmed first, then the footer. We never drop the
 * counts row — it is the single highest-value line.
 */
export function buildAppointmentPrepTextExport(
  checklist: AppointmentChecklist,
  options: AppointmentTextExportOptions = {},
): AppointmentTextExport {
  const width = Math.max(20, options.width ?? 40);
  const maxLines = Math.max(4, options.maxLines ?? 10);
  const border = options.border ?? true;
  const urgentLimit = Math.max(0, options.urgentItemLimit ?? 3);
  const urgentRefillDays = options.urgentRefillDaysOfSupply ?? 3;

  const contentWidth = border ? width - 2 : width;
  const maxContentLines = border ? maxLines - 2 : maxLines;

  // Build content lines in priority order.
  const contentLines: string[] = [];

  // Header: name (centered) and visit info (centered when it fits, else trimmed left).
  contentLines.push(centerLine(checklist.patientName, contentWidth));
  const visit = checklist.visit;
  const visitLineParts: string[] = [visit.dateIso];
  if (visit.clinician) visitLineParts.push('w/ ' + visit.clinician);
  contentLines.push(truncateLine(visitLineParts.join(' '), contentWidth));
  if (visit.reasonForVisit) {
    contentLines.push(truncateLine('Re: ' + visit.reasonForVisit, contentWidth));
  }
  contentLines.push(dividerLine(contentWidth));

  // Counts row.
  const adverseCount = checklist.adverseEvents.length;
  const labsCount = checklist.labs.length;
  const refillsCount = checklist.refillsNeeded.length;
  const medsCount = checklist.medications.length;
  const countsLine = `Meds ${medsCount}  Adv ${adverseCount}  Labs ${labsCount}  Rfl ${refillsCount}`;
  contentLines.push(truncateLine(countsLine, contentWidth));

  // Urgent rows.
  const urgentRows: string[] = [];

  // Worst lab (overdue beats due-soon by AppointmentChecklist sort).
  const worstLab = pickWorstLab(checklist.labs);
  if (worstLab) {
    const tag = worstLab.status === 'overdue' ? 'OVERDUE' : 'DUE SOON';
    urgentRows.push(
      truncateLine(`LAB ${tag}: ${worstLab.labName}`, contentWidth),
    );
  }

  // Top adverse event if at least major severity.
  if (adverseCount > 0) {
    let top = checklist.adverseEvents[0]!;
    for (const a of checklist.adverseEvents) {
      if (SEVERITY_RANK[a.severity] > SEVERITY_RANK[top.severity]) top = a;
    }
    if (SEVERITY_RANK[top.severity] >= SEVERITY_RANK.major) {
      const desc = truncateLine(
        `AE ${SEVERITY_SHORT[top.severity]}: ${top.description}`,
        contentWidth,
      );
      urgentRows.push(desc);
    }
  }

  // Urgent refills.
  const urgentRefills = pickUrgentRefills(
    checklist.refillsNeeded,
    urgentRefillDays,
    urgentLimit,
  );
  for (const r of urgentRefills) {
    const when = r.daysOfSupplyLeft <= 0 ? 'OUT' : `${r.daysOfSupplyLeft}d`;
    urgentRows.push(
      truncateLine(`RFL ${when}: ${r.medicationName}`, contentWidth),
    );
  }

  // Trim urgent rows to fit; counts row + header are sacrosanct.
  // We reserve maxContentLines for the assembled block.
  // Footer (last visit anchor) is optional and yields first.
  const footer = checklist.lastVisitIso
    ? truncateLine(`Since visit ${checklist.lastVisitIso}`, contentWidth)
    : '';

  // Initial draft: contentLines + urgentRows + (footer if any).
  let draft = contentLines.slice();
  let droppedItems = 0;

  // Drop footer first if no room.
  let remaining = maxContentLines - draft.length;
  const allUrgent = urgentRows.slice();
  const wantsFooter = footer !== '';

  // Try to fit all urgent + footer.
  const desiredAfterHeader = allUrgent.length + (wantsFooter ? 1 : 0);
  if (desiredAfterHeader <= remaining) {
    for (const r of allUrgent) draft.push(r);
    if (wantsFooter) draft.push(footer);
  } else if (allUrgent.length <= remaining) {
    // All urgent fits; footer doesn't.
    for (const r of allUrgent) draft.push(r);
    if (wantsFooter) droppedItems += 1;
  } else {
    // Drop footer first, then trim urgent.
    const fits = Math.max(0, remaining);
    for (let i = 0; i < fits; i++) draft.push(allUrgent[i]!);
    droppedItems += allUrgent.length - fits;
    if (wantsFooter) droppedItems += 1;
  }

  // Final assembly.
  const finalLines = border ? wrapBorder(draft, width) : draft;
  const truncated = droppedItems > 0;
  const text = finalLines.join('\n');

  return {
    text,
    width,
    lineCount: finalLines.length,
    truncated,
    droppedItems,
  };
}

/**
 * Convenience: just the inner ASCII block without border, suitable
 * for embedding inside another text layout (e.g. an email body).
 */
export function buildAppointmentPrepTextExportNoBorder(
  checklist: AppointmentChecklist,
  options: Omit<AppointmentTextExportOptions, 'border'> = {},
): AppointmentTextExport {
  return buildAppointmentPrepTextExport(checklist, { ...options, border: false });
}
