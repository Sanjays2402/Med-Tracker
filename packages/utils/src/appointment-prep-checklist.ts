/**
 * Appointment prep checklist.
 *
 * Patients on multi-medication regimens routinely lose useful prep time
 * at the start of a 15-minute visit because the doctor opens by asking
 * "what are you on, when did you last refill, did anything new happen?"
 * — all questions the app already knows the answer to. This module
 * generates a structured pre-visit checklist that the patient can
 * print, screenshot, or hand to the front desk.
 *
 * The checklist covers:
 *
 *   - Medications list (active only, with strength + sig).
 *   - Recent adverse events since the last visit (severity-sorted).
 *   - Lab results status (overdue + due-soon flagged for clinician
 *     order entry at visit).
 *   - Refills needed in the next N days (so the visit can renew them
 *     without a follow-up call).
 *   - Open clinical questions: per-medication free-text the patient
 *     queued between visits.
 *   - Optional vitals-to-bring list (BP cuff readings, glucose meter
 *     log) when the patient is tracking them.
 *
 * Output is a structured object PLUS a paginated text-block so the UI
 * has both a checklist view and a single-screen export view. Items
 * are kept short (one line each) so 20-line printouts fit one page.
 *
 * Pure / deterministic. Composes existing utility outputs — does NOT
 * reach into the database or fetch anything.
 */

import type { Medication } from '@med/types';
import type { AdverseEventRecord, AdverseSeverity } from './adverse-event-log';
import type { LabWindow, LabStatus } from './lab-window-tracker';

export interface AppointmentRefillNeeded {
  medicationId: string;
  medicationName: string;
  /** Days until current supply runs out. Negative if already out. */
  daysOfSupplyLeft: number;
  /** ISO date the supply runs out. */
  runsOutOn?: string;
}

export interface AppointmentQuestion {
  /** Optional anchor medication; null for regimen-wide questions. */
  medicationId: string | null;
  /** Free-text question, typically <= 120 chars. */
  text: string;
  /** When the patient queued the question. ISO datetime. */
  queuedAt: string;
}

export interface AppointmentVital {
  kind: 'bp' | 'glucose' | 'weight' | 'temperature' | 'pulse' | 'other';
  label: string;
  /** Free-text note such as "AM readings only" or "fasting". */
  note?: string;
}

export interface AppointmentPrepInput {
  patientName: string;
  /** Visit date + clinician name. Visit date is ISO date. */
  visit: { dateIso: string; clinician?: string; reasonForVisit?: string };
  /** Most recent prior visit's date (used to bound "since last visit"). */
  lastVisitIso?: string;
  /** Active medications. The checklist filters out inactive entries. */
  medications: Medication[];
  /**
   * Adverse events. Only events with `onsetAt` strictly after
   * `lastVisitIso` (or all events if no lastVisitIso) are surfaced.
   */
  adverseEvents?: AdverseEventRecord[];
  /** Lab status windows (typically the flat list from lab-window-tracker). */
  labs?: LabWindow[];
  /** Refill projections — derived upstream from inventory-low-stock-forecast. */
  refillsNeeded?: AppointmentRefillNeeded[];
  /** Patient-queued questions for the clinician. */
  questions?: AppointmentQuestion[];
  /** Vitals the patient should bring to the visit. */
  vitals?: AppointmentVital[];
  /** Reference clock used to bound refill horizons. Default new Date(). */
  now?: Date;
}

export interface AppointmentPrepOptions {
  /** Refill horizon in days for surfacing "needs renewal at this visit". Default 30. */
  refillHorizonDays?: number;
  /** Cap the number of adverse events shown. Default 8. */
  adverseEventLimit?: number;
  /** Cap the number of questions shown. Default 10. */
  questionLimit?: number;
}

export interface AppointmentMedicationItem {
  medicationId: string;
  name: string;
  strength: string;
  /** Display sig: "1 tab po qid" — uses instructions if present. */
  sig: string;
}

export interface AppointmentLabItem {
  labCode: string;
  labName: string;
  medicationName: string;
  status: LabStatus;
  message: string;
}

export interface AppointmentAdverseItem {
  description: string;
  severity: AdverseSeverity;
  onsetIso: string;
  suspectMedications: string[];
}

export interface AppointmentChecklist {
  patientName: string;
  visit: { dateIso: string; clinician?: string; reasonForVisit?: string };
  lastVisitIso?: string;
  medications: AppointmentMedicationItem[];
  adverseEvents: AppointmentAdverseItem[];
  labs: AppointmentLabItem[];
  refillsNeeded: AppointmentRefillNeeded[];
  questions: AppointmentQuestion[];
  vitals: AppointmentVital[];
  /** Section-by-section text blocks the UI can print or copy. */
  text: string;
  /** Total checklist line count (medications + adverse + labs + refills + questions + vitals). */
  totalItemCount: number;
  /** Worst severity adverse event across the slice, or null. */
  highestSeverity: AdverseSeverity | null;
  /** True when any lab is overdue (drives a red banner in the UI). */
  hasOverdueLabs: boolean;
  /** True when any refill is already out or runs out in <= 7 days. */
  hasUrgentRefills: boolean;
}

const SEVERITY_RANK: Record<AdverseSeverity, number> = {
  minor: 0,
  moderate: 1,
  major: 2,
  'life-threatening': 3,
};

function parseIsoDate(value: string): Date | null {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function defaultSig(med: Medication): string {
  if (med.instructions && med.instructions.trim().length > 0) {
    return med.instructions.trim();
  }
  // Fallback: "<form>" works as a minimal sig.
  return `1 ${med.form}`;
}

function trimList<T>(items: T[], limit: number): T[] {
  if (!Number.isFinite(limit) || limit < 0) return items.slice();
  return items.slice(0, limit);
}

function renderTextBlocks(c: AppointmentChecklist): string {
  const lines: string[] = [];
  lines.push(`Appointment prep for ${c.patientName}`);
  lines.push(`Visit: ${c.visit.dateIso}${c.visit.clinician ? ` with ${c.visit.clinician}` : ''}`);
  if (c.visit.reasonForVisit) lines.push(`Reason: ${c.visit.reasonForVisit}`);
  if (c.lastVisitIso) lines.push(`Since last visit: ${c.lastVisitIso}`);
  lines.push('');

  if (c.medications.length > 0) {
    lines.push(`Current medications (${c.medications.length}):`);
    for (const m of c.medications) {
      lines.push(`  - ${m.name} ${m.strength} — ${m.sig}`);
    }
    lines.push('');
  }

  if (c.adverseEvents.length > 0) {
    lines.push(`New adverse events since last visit (${c.adverseEvents.length}):`);
    for (const a of c.adverseEvents) {
      const suspect = a.suspectMedications.length > 0
        ? ` [suspect: ${a.suspectMedications.join(', ')}]`
        : '';
      lines.push(`  - [${a.severity}] ${a.onsetIso}: ${a.description}${suspect}`);
    }
    lines.push('');
  }

  if (c.labs.length > 0) {
    lines.push(`Labs flagged (${c.labs.length}):`);
    for (const l of c.labs) {
      lines.push(`  - ${l.labName} (${l.medicationName}): ${l.message}`);
    }
    lines.push('');
  }

  if (c.refillsNeeded.length > 0) {
    lines.push(`Refills needed at this visit (${c.refillsNeeded.length}):`);
    for (const r of c.refillsNeeded) {
      const when = r.daysOfSupplyLeft <= 0
        ? 'OUT'
        : `${r.daysOfSupplyLeft}d left`;
      lines.push(`  - ${r.medicationName}: ${when}`);
    }
    lines.push('');
  }

  if (c.questions.length > 0) {
    lines.push(`Questions to ask (${c.questions.length}):`);
    for (const q of c.questions) {
      lines.push(`  - ${q.text}`);
    }
    lines.push('');
  }

  if (c.vitals.length > 0) {
    lines.push(`Bring to visit:`);
    for (const v of c.vitals) {
      const note = v.note ? ` (${v.note})` : '';
      lines.push(`  - ${v.label}${note}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

/**
 * Build a structured + text appointment prep checklist.
 *
 * Medications: active only (Medication.active === true).
 * Adverse events: filtered to events with onsetAt strictly after the
 *   last visit date (00:00 local) when lastVisitIso is provided; sorted
 *   by severity descending then onset descending.
 * Labs: filtered to status `overdue` or `due-soon`; sorted overdue-first.
 * Refills: kept in caller order with stable secondary sort by name.
 * Questions: kept in caller order (typically chronological).
 */
export function buildAppointmentPrepChecklist(
  input: AppointmentPrepInput,
  options: AppointmentPrepOptions = {},
): AppointmentChecklist {
  const adverseLimit = options.adverseEventLimit ?? 8;
  const questionLimit = options.questionLimit ?? 10;
  const refillHorizon = options.refillHorizonDays ?? 30;

  const activeMeds = input.medications.filter((m) => m.active);
  const medications: AppointmentMedicationItem[] = activeMeds
    .map((m) => ({
      medicationId: m.id,
      name: m.name,
      strength: m.strength,
      sig: defaultSig(m),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Adverse events.
  const lastVisit = input.lastVisitIso ? parseIsoDate(input.lastVisitIso) : null;
  const adverseRaw = (input.adverseEvents ?? []).filter((ev) => {
    if (!lastVisit) return true;
    const onset = parseIsoDate(ev.onsetAt);
    return onset !== null && onset.getTime() > lastVisit.getTime();
  });
  adverseRaw.sort((a, b) => {
    const sevDelta = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (sevDelta !== 0) return sevDelta;
    return b.onsetAt.localeCompare(a.onsetAt);
  });
  const adverseEvents: AppointmentAdverseItem[] = trimList(adverseRaw, adverseLimit).map((a) => ({
    description: a.description,
    severity: a.severity,
    onsetIso: a.onsetAt,
    suspectMedications: a.suspectMedications.slice(),
  }));

  // Labs: only overdue + due-soon, overdue first.
  const labsRaw = (input.labs ?? []).filter(
    (l) => l.status === 'overdue' || l.status === 'due-soon',
  );
  labsRaw.sort((a, b) => {
    // overdue (-N) before due-soon (+N)
    return a.daysUntilDue - b.daysUntilDue;
  });
  const labs: AppointmentLabItem[] = labsRaw.map((l) => ({
    labCode: l.labCode,
    labName: l.labName,
    medicationName: l.medicationName,
    status: l.status,
    message: l.message,
  }));

  // Refills inside horizon, sorted by daysOfSupplyLeft asc.
  const refillsNeeded = (input.refillsNeeded ?? [])
    .filter((r) => r.daysOfSupplyLeft <= refillHorizon)
    .slice()
    .sort((a, b) => {
      if (a.daysOfSupplyLeft !== b.daysOfSupplyLeft) {
        return a.daysOfSupplyLeft - b.daysOfSupplyLeft;
      }
      return a.medicationName.localeCompare(b.medicationName);
    });

  const questions = trimList(input.questions ?? [], questionLimit);
  const vitals = (input.vitals ?? []).slice();

  const highestSeverity: AdverseSeverity | null = adverseEvents.length === 0
    ? null
    : adverseEvents.reduce<AdverseSeverity>((acc, ev) => {
        return SEVERITY_RANK[ev.severity] > SEVERITY_RANK[acc] ? ev.severity : acc;
      }, adverseEvents[0]!.severity);

  const hasOverdueLabs = labs.some((l) => l.status === 'overdue');
  const hasUrgentRefills = refillsNeeded.some((r) => r.daysOfSupplyLeft <= 7);

  const totalItemCount =
    medications.length +
    adverseEvents.length +
    labs.length +
    refillsNeeded.length +
    questions.length +
    vitals.length;

  const checklist: AppointmentChecklist = {
    patientName: input.patientName,
    visit: { ...input.visit },
    ...(input.lastVisitIso !== undefined ? { lastVisitIso: input.lastVisitIso } : {}),
    medications,
    adverseEvents,
    labs,
    refillsNeeded,
    questions,
    vitals,
    text: '',
    totalItemCount,
    highestSeverity,
    hasOverdueLabs,
    hasUrgentRefills,
  };
  checklist.text = renderTextBlocks(checklist);
  return checklist;
}
