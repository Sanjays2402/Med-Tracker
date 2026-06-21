/**
 * Caregiver handoff summary.
 *
 * `shift-handoff.ts` builds a check-list-style transcript for two
 * caregivers swapping shifts in real time (next 12h dose plan,
 * recent misses, PRN tallies). This module is the COMPLEMENTARY
 * narrative summary: a paragraph-style brief for asynchronous
 * handoffs (overnight aide -> day aide, on-call sibling -> primary
 * caregiver) where the recipient needs a quick "since I left, what
 * happened?" instead of a real-time dose list.
 *
 * The narrative covers:
 *
 *   - Patient context (name, regimen size, since-time).
 *   - Adherence delta (taken / missed / skipped counts in the window
 *     plus the percentage).
 *   - PRN usage (count + by-medication breakdown).
 *   - Medications added or removed (regimen-change-diff style).
 *   - Adverse events flagged in the window (highest severity called
 *     out first).
 *   - Any open caregiver tasks queued for the incoming person.
 *
 * Output is both a structured `HandoffSummary` (mobile UI) and a
 * 4-6 sentence text block suitable for paste-into-Slack or SMS.
 *
 * Pure / deterministic. No I/O. Composes existing modules' outputs
 * via plain TypeScript types, no class wiring.
 */

import type { AdverseSeverity } from './adverse-event-log';

export interface HandoffDoseEvent {
  doseId: string;
  medicationId: string;
  medicationName: string;
  /** When the dose was supposed to happen. ISO datetime. */
  dueAt: string;
  status: 'taken' | 'missed' | 'skipped' | 'late';
  /** When the action was taken. Optional. */
  actedAt?: string;
}

export interface HandoffPrnEvent {
  medicationId: string;
  medicationName: string;
  /** When the PRN was administered. ISO datetime. */
  takenAt: string;
  /** Free-text reason ("for pain"). Optional. */
  reason?: string;
}

export interface HandoffMedicationChange {
  /** Direction: was the medication added or removed during the window? */
  change: 'added' | 'removed';
  medicationName: string;
  /** When the change happened. ISO datetime. */
  changedAt: string;
  /** Reason captured at the time of the change. */
  reason?: string;
}

export interface HandoffAdverseEvent {
  description: string;
  severity: AdverseSeverity;
  onsetAt: string;
  suspectMedications?: string[];
}

export interface HandoffOpenTask {
  id: string;
  title: string;
  /** Priority: low / normal / urgent for sorting. */
  priority?: 'low' | 'normal' | 'urgent';
  dueAt?: string;
}

export interface HandoffSummaryInput {
  patientName: string;
  outgoingCaregiver: string;
  incomingCaregiver: string;
  /** Window start (when the outgoing caregiver took over). ISO datetime. */
  windowStart: string;
  /** Window end (default = now). ISO datetime. */
  windowEnd: string;
  /** Total active medications on the regimen RIGHT NOW. */
  activeMedicationCount: number;
  doseEvents?: HandoffDoseEvent[];
  prnEvents?: HandoffPrnEvent[];
  medicationChanges?: HandoffMedicationChange[];
  adverseEvents?: HandoffAdverseEvent[];
  openTasks?: HandoffOpenTask[];
}

export interface HandoffSummaryOptions {
  /** Max adverse events to surface. Default 5. */
  adverseEventLimit?: number;
  /** Max open tasks to surface. Default 6. */
  openTaskLimit?: number;
}

export interface HandoffAdherenceCounts {
  taken: number;
  missed: number;
  skipped: number;
  late: number;
  /** Percentage of doses taken (taken / total non-late). 0..100. Null when no doses. */
  takenPercent: number | null;
  /** Doses that arrived late (also counted in `late`). */
  totalEvents: number;
}

export interface HandoffPrnRollup {
  medicationId: string;
  medicationName: string;
  count: number;
  /** Free-text reasons concatenated, deduped, preserving order. */
  reasons: string[];
}

export interface HandoffSummary {
  patientName: string;
  outgoingCaregiver: string;
  incomingCaregiver: string;
  window: { start: string; end: string };
  activeMedicationCount: number;
  adherence: HandoffAdherenceCounts;
  prn: { totalCount: number; byMedication: HandoffPrnRollup[] };
  medicationChanges: HandoffMedicationChange[];
  adverseEvents: HandoffAdverseEvent[];
  openTasks: HandoffOpenTask[];
  /** Severity headline: highest adverse-event severity in the window, or null. */
  worstAdverseSeverity: AdverseSeverity | null;
  /** Narrative paragraph (4-6 sentences). */
  narrative: string;
}

const SEVERITY_RANK: Record<AdverseSeverity, number> = {
  minor: 0,
  moderate: 1,
  major: 2,
  'life-threatening': 3,
};

const TASK_PRIORITY_RANK: Record<NonNullable<HandoffOpenTask['priority']>, number> = {
  urgent: 0,
  normal: 1,
  low: 2,
};

function parseIso(value: string): number {
  return Date.parse(value);
}

function inWindow(iso: string, start: number, end: number): boolean {
  const t = parseIso(iso);
  if (Number.isNaN(t)) return false;
  return t >= start && t <= end;
}

function computeAdherence(events: HandoffDoseEvent[]): HandoffAdherenceCounts {
  const counts = { taken: 0, missed: 0, skipped: 0, late: 0 };
  for (const e of events) {
    counts[e.status] += 1;
  }
  const total = counts.taken + counts.missed + counts.skipped + counts.late;
  // takenPercent denominator: any dose that EXISTS counted, taken and late are "delivered".
  // For the dashboard headline, "% on time" = taken / total; late doses depress the percentage.
  const takenPercent = total === 0 ? null : (counts.taken / total) * 100;
  return { ...counts, takenPercent, totalEvents: total };
}

function rollupPrns(events: HandoffPrnEvent[]): { totalCount: number; byMedication: HandoffPrnRollup[] } {
  const byMed = new Map<string, HandoffPrnRollup>();
  for (const ev of events) {
    let row = byMed.get(ev.medicationId);
    if (!row) {
      row = { medicationId: ev.medicationId, medicationName: ev.medicationName, count: 0, reasons: [] };
      byMed.set(ev.medicationId, row);
    }
    row.count += 1;
    if (ev.reason && !row.reasons.includes(ev.reason)) row.reasons.push(ev.reason);
  }
  const list = Array.from(byMed.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.medicationName.localeCompare(b.medicationName);
  });
  const totalCount = list.reduce((s, r) => s + r.count, 0);
  return { totalCount, byMedication: list };
}

function pickWorstSeverity(events: HandoffAdverseEvent[]): AdverseSeverity | null {
  if (events.length === 0) return null;
  return events.reduce<AdverseSeverity>((acc, ev) => {
    return SEVERITY_RANK[ev.severity] > SEVERITY_RANK[acc] ? ev.severity : acc;
  }, events[0]!.severity);
}

function joinNaturally(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function pluralize(n: number, singular: string, plural?: string): string {
  return n === 1 ? `${n} ${singular}` : `${n} ${plural ?? `${singular}s`}`;
}

function buildNarrative(s: HandoffSummary): string {
  const sentences: string[] = [];

  // Sentence 1: context.
  sentences.push(
    `${s.patientName} has ${pluralize(s.activeMedicationCount, 'active medication')} ` +
    `between ${s.window.start} and ${s.window.end}.`,
  );

  // Sentence 2: adherence.
  const adh = s.adherence;
  if (adh.totalEvents === 0) {
    sentences.push(`No scheduled doses fell in this window.`);
  } else {
    const pct = adh.takenPercent === null ? '?' : `${Math.round(adh.takenPercent)}%`;
    const adverseBits: string[] = [];
    if (adh.missed > 0) adverseBits.push(`${adh.missed} missed`);
    if (adh.skipped > 0) adverseBits.push(`${adh.skipped} skipped`);
    if (adh.late > 0) adverseBits.push(`${adh.late} late`);
    const tail = adverseBits.length > 0 ? ` (${adverseBits.join(', ')})` : '';
    sentences.push(`Adherence ${pct}: ${pluralize(adh.taken, 'dose')} taken out of ${adh.totalEvents}${tail}.`);
  }

  // Sentence 3: PRNs.
  if (s.prn.totalCount > 0) {
    const top = s.prn.byMedication.slice(0, 3).map((p) => `${p.medicationName} x${p.count}`);
    sentences.push(`PRN usage: ${pluralize(s.prn.totalCount, 'dose')} (${joinNaturally(top)}).`);
  } else {
    sentences.push(`No PRN medications taken.`);
  }

  // Sentence 4: med changes.
  if (s.medicationChanges.length > 0) {
    const added = s.medicationChanges.filter((c) => c.change === 'added').map((c) => c.medicationName);
    const removed = s.medicationChanges.filter((c) => c.change === 'removed').map((c) => c.medicationName);
    const parts: string[] = [];
    if (added.length > 0) parts.push(`added ${joinNaturally(added)}`);
    if (removed.length > 0) parts.push(`removed ${joinNaturally(removed)}`);
    sentences.push(`Regimen changes: ${parts.join('; ')}.`);
  }

  // Sentence 5: adverse events.
  if (s.adverseEvents.length > 0) {
    const lead = s.adverseEvents[0]!;
    const more = s.adverseEvents.length > 1 ? ` plus ${s.adverseEvents.length - 1} more` : '';
    sentences.push(`Adverse events: ${lead.severity} - ${lead.description}${more}.`);
  }

  // Sentence 6: open tasks.
  if (s.openTasks.length > 0) {
    sentences.push(`Open tasks for ${s.incomingCaregiver}: ${pluralize(s.openTasks.length, 'item')} (${s.openTasks[0]!.title}).`);
  }

  return sentences.join(' ');
}

/**
 * Build a structured + narrative handoff summary.
 *
 * Events outside [windowStart, windowEnd] are silently dropped — the
 * caller passes a wide net and this filter is the canonical bound.
 * Tasks are sorted urgent / normal / low then by dueAt asc.
 */
export function buildCaregiverHandoffSummary(
  input: HandoffSummaryInput,
  options: HandoffSummaryOptions = {},
): HandoffSummary {
  const adverseLimit = options.adverseEventLimit ?? 5;
  const taskLimit = options.openTaskLimit ?? 6;

  const start = parseIso(input.windowStart);
  const end = parseIso(input.windowEnd);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    throw new Error('windowStart and windowEnd must be valid datetimes and end >= start');
  }

  const doseEvents = (input.doseEvents ?? []).filter((e) => inWindow(e.actedAt ?? e.dueAt, start, end));
  const prnEvents = (input.prnEvents ?? []).filter((e) => inWindow(e.takenAt, start, end));
  const medicationChanges = (input.medicationChanges ?? []).filter((c) => inWindow(c.changedAt, start, end));
  const adverseRaw = (input.adverseEvents ?? []).filter((a) => inWindow(a.onsetAt, start, end));

  adverseRaw.sort((a, b) => {
    const sd = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (sd !== 0) return sd;
    return b.onsetAt.localeCompare(a.onsetAt);
  });
  const adverseEvents = adverseRaw.slice(0, Math.max(0, adverseLimit));

  const openTasks = (input.openTasks ?? [])
    .slice()
    .sort((a, b) => {
      const ap = TASK_PRIORITY_RANK[a.priority ?? 'normal'];
      const bp = TASK_PRIORITY_RANK[b.priority ?? 'normal'];
      if (ap !== bp) return ap - bp;
      const aDue = a.dueAt ? Date.parse(a.dueAt) : Infinity;
      const bDue = b.dueAt ? Date.parse(b.dueAt) : Infinity;
      if (aDue !== bDue) return aDue - bDue;
      return a.title.localeCompare(b.title);
    })
    .slice(0, Math.max(0, taskLimit));

  const adherence = computeAdherence(doseEvents);
  const prn = rollupPrns(prnEvents);
  const worstAdverseSeverity = pickWorstSeverity(adverseRaw);

  const summary: HandoffSummary = {
    patientName: input.patientName,
    outgoingCaregiver: input.outgoingCaregiver,
    incomingCaregiver: input.incomingCaregiver,
    window: { start: input.windowStart, end: input.windowEnd },
    activeMedicationCount: input.activeMedicationCount,
    adherence,
    prn,
    medicationChanges,
    adverseEvents,
    openTasks,
    worstAdverseSeverity,
    narrative: '',
  };
  summary.narrative = buildNarrative(summary);
  return summary;
}
