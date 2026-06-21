/**
 * Dose batch export — FHIR R4 MedicationAdministration JSON.
 *
 * Care transitions (hospital admission, new prescriber, payer audit)
 * regularly ask for an authoritative dose-administration history in
 * a portable format. The healthcare interop answer is FHIR R4's
 * MedicationAdministration resource: a structured record of WHO
 * took WHAT and WHEN, with status, route, dosage, and traceability
 * back to the medication record.
 *
 * This module translates Med-Tracker's internal Dose + Medication
 * shape into a FHIR R4 Bundle of MedicationAdministration resources
 * suitable for direct POST into any FHIR endpoint, or for sending
 * as a JSON attachment to a clinician. It is a PURE SHAPE
 * TRANSLATOR — no network I/O, no LLM, no clinical inference.
 *
 * The mapping is the documented R4 one:
 *
 *   Dose.id              -> MedicationAdministration.id
 *   Dose.medicationId    -> MedicationAdministration.medicationReference
 *   Dose.dueAt           -> MedicationAdministration.effectiveDateTime
 *                           (when no takenAt — represents the
 *                           SCHEDULED time of the would-have-been dose)
 *   Dose.takenAt         -> MedicationAdministration.effectiveDateTime
 *                           (when present — the ACTUAL administration)
 *   Dose.status:
 *     taken              -> 'completed'
 *     skipped            -> 'not-done' + statusReason 'patient-skipped'
 *     missed             -> 'not-done' + statusReason 'missed'
 *     late               -> 'completed' (with note)
 *     scheduled          -> 'in-progress' (still pending)
 *   Dose.note            -> MedicationAdministration.note[0].text
 *   Medication.strength  -> dosage.text (e.g. "10 mg")
 *   Medication.form      -> dosage.method.coding (FHIR routes)
 *
 * The Bundle is `type: 'collection'` (NOT 'transaction') — we are
 * NOT instructing the FHIR server to do anything; we're shipping a
 * read-only dataset. If the consumer wants to ingest it, they
 * re-wrap as a transaction on their side.
 *
 * Pure / deterministic. No I/O.
 */

import type { Dose, DoseStatus } from '@med/types';
import type { Medication } from '@med/types';

/**
 * FHIR R4 MedicationAdministration status. We deliberately restrict
 * to the values our mapping ever emits — the full spec includes
 * 'on-hold', 'stopped', 'entered-in-error', 'unknown' which we
 * don't have a Dose status for.
 */
export type FhirAdminStatus = 'completed' | 'not-done' | 'in-progress';

/** FHIR R4 method (route) codes used in our mapping. */
export type FhirRouteCode =
  | 'PO' // oral
  | 'IH' // inhaled
  | 'TD' // topical
  | 'IM' // intramuscular
  | 'SC' // subcutaneous
  | 'IV' // intravenous
  | 'PR' // per rectum
  | 'OPHTH' // ophthalmic
  | 'NS' // nasal
  | 'OTH'; // other / unknown

const FORM_TO_ROUTE: Record<Medication['form'], { code: FhirRouteCode; display: string }> = {
  tablet: { code: 'PO', display: 'Oral' },
  capsule: { code: 'PO', display: 'Oral' },
  liquid: { code: 'PO', display: 'Oral' },
  injection: { code: 'IM', display: 'Intramuscular' },
  patch: { code: 'TD', display: 'Transdermal' },
  inhaler: { code: 'IH', display: 'Inhaled' },
  cream: { code: 'TD', display: 'Topical' },
  drops: { code: 'OPHTH', display: 'Ophthalmic' },
  suppository: { code: 'PR', display: 'Per rectum' },
  powder: { code: 'PO', display: 'Oral' },
};

// FHIR R4 Bundle / MedicationAdministration shape minimums.
// We only encode the fields we actually populate. Consumers should
// validate against their own FHIR profile.

export interface FhirCoding {
  system: string;
  code: string;
  display?: string;
}

export interface FhirCodeableConcept {
  coding: FhirCoding[];
  text?: string;
}

export interface FhirReference {
  reference: string;
  display?: string;
}

export interface FhirAnnotation {
  text: string;
  time?: string;
  authorString?: string;
}

export interface FhirMedicationAdministrationDosage {
  text?: string;
  route?: FhirCodeableConcept;
  method?: FhirCodeableConcept;
}

export interface FhirMedicationAdministration {
  resourceType: 'MedicationAdministration';
  id: string;
  status: FhirAdminStatus;
  statusReason?: FhirCodeableConcept[];
  medicationReference: FhirReference;
  subject: FhirReference;
  effectiveDateTime: string;
  note?: FhirAnnotation[];
  dosage?: FhirMedicationAdministrationDosage;
}

export interface FhirBundleEntry {
  fullUrl?: string;
  resource: FhirMedicationAdministration;
}

export interface FhirBundle {
  resourceType: 'Bundle';
  type: 'collection';
  timestamp: string;
  total: number;
  entry: FhirBundleEntry[];
}

export interface DoseExportOptions {
  /** Patient FHIR reference. Defaults to `Patient/${userId}`. */
  patientReference?: string;
  /** Inclusive ISO datetime range start. Defaults to no lower bound. */
  rangeStart?: string;
  /** Inclusive ISO datetime range end. Defaults to no upper bound. */
  rangeEnd?: string;
  /**
   * When true, include doses still in 'scheduled' status (mapped to
   * MedicationAdministration.status='in-progress'). Default false —
   * exports normally ship the patient's REALISED history only.
   */
  includeScheduled?: boolean;
  /**
   * URL base used in `fullUrl` so consumers can resolve a stable
   * canonical reference. Default 'urn:uuid:' prefix.
   */
  fullUrlBase?: string;
  /**
   * Source-of-truth label to embed in the note when present. Useful
   * for distinguishing exports from this app vs. a chart import.
   */
  source?: string;
}

export interface DoseExportInput {
  /** Patient (FHIR Patient.id) user id. Drives the subject reference. */
  userId: string;
  /** All medication records the doses reference. Used for dosage.text. */
  medications: Medication[];
  doses: Dose[];
  options?: DoseExportOptions;
}

interface MappedAdmin {
  resource: FhirMedicationAdministration;
}

const STATUS_REASON_SYSTEM = 'http://terminology.hl7.org/CodeSystem/reason-medication-not-given';

const ROUTE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/v3-RouteOfAdministration';

function statusToFhir(status: DoseStatus): {
  status: FhirAdminStatus;
  statusReason?: FhirCodeableConcept[];
} {
  switch (status) {
    case 'taken':
      return { status: 'completed' };
    case 'late':
      return { status: 'completed' };
    case 'skipped':
      return {
        status: 'not-done',
        statusReason: [
          {
            coding: [
              { system: STATUS_REASON_SYSTEM, code: 'a', display: 'None provided' },
            ],
            text: 'patient-skipped',
          },
        ],
      };
    case 'missed':
      return {
        status: 'not-done',
        statusReason: [
          {
            coding: [
              { system: STATUS_REASON_SYSTEM, code: 'b', display: 'Patient missed dose' },
            ],
            text: 'missed',
          },
        ],
      };
    case 'scheduled':
      return { status: 'in-progress' };
  }
}

function buildDosage(med: Medication): FhirMedicationAdministrationDosage | undefined {
  const dosage: FhirMedicationAdministrationDosage = {};
  if (med.strength && med.strength.trim()) dosage.text = med.strength.trim();
  const route = FORM_TO_ROUTE[med.form];
  if (route) {
    dosage.route = {
      coding: [{ system: ROUTE_SYSTEM, code: route.code, display: route.display }],
    };
  }
  if (!dosage.text && !dosage.route) return undefined;
  return dosage;
}

function pickEffective(dose: Dose): string {
  // When the dose was actually taken, that's the real administration
  // instant. Otherwise fall back to the scheduled time so the export
  // still anchors the record on the calendar.
  if (dose.takenAt) return dose.takenAt;
  return dose.dueAt;
}

function inRange(ts: string, start: string | undefined, end: string | undefined): boolean {
  if (!start && !end) return true;
  const t = Date.parse(ts);
  if (!Number.isFinite(t)) return false;
  if (start) {
    const s = Date.parse(start);
    if (Number.isFinite(s) && t < s) return false;
  }
  if (end) {
    const e = Date.parse(end);
    if (Number.isFinite(e) && t > e) return false;
  }
  return true;
}

function mapDose(
  dose: Dose,
  medsById: Map<string, Medication>,
  userId: string,
  options: DoseExportOptions,
): MappedAdmin | null {
  const med = medsById.get(dose.medicationId);
  if (!med) return null;
  const subjectRef = options.patientReference ?? `Patient/${userId}`;
  const { status, statusReason } = statusToFhir(dose.status);
  const effective = pickEffective(dose);

  const resource: FhirMedicationAdministration = {
    resourceType: 'MedicationAdministration',
    id: dose.id,
    status,
    medicationReference: {
      reference: `Medication/${med.id}`,
      display: med.name,
    },
    subject: { reference: subjectRef },
    effectiveDateTime: effective,
  };
  if (statusReason) resource.statusReason = statusReason;

  const dosage = buildDosage(med);
  if (dosage) resource.dosage = dosage;

  const noteLines: string[] = [];
  if (dose.note && dose.note.trim()) noteLines.push(dose.note.trim());
  if (dose.status === 'late') noteLines.push('Logged as late dose.');
  if (options.source) noteLines.push(`Exported from ${options.source}.`);
  if (noteLines.length > 0) {
    resource.note = [{ text: noteLines.join(' ') }];
  }

  return { resource };
}

/**
 * Build a FHIR R4 Bundle of MedicationAdministration resources from
 * a list of Dose + Medication records. Doses whose medicationId has
 * no matching Medication are skipped (caller error). Doses outside
 * the (optional) date range are skipped. Doses in 'scheduled' status
 * are skipped UNLESS `includeScheduled=true`.
 *
 * The Bundle is type 'collection' (read-only export) — never
 * 'transaction'. Entries are sorted by effectiveDateTime ascending
 * for stable, diffable output.
 */
export function buildDoseExportBundle(input: DoseExportInput): FhirBundle {
  const options = input.options ?? {};
  const fullUrlBase = options.fullUrlBase ?? 'urn:uuid:';
  const medsById = new Map<string, Medication>();
  for (const m of input.medications) medsById.set(m.id, m);

  const mapped: MappedAdmin[] = [];
  for (const dose of input.doses) {
    if (!options.includeScheduled && dose.status === 'scheduled') continue;
    const effective = pickEffective(dose);
    if (!inRange(effective, options.rangeStart, options.rangeEnd)) continue;
    const m = mapDose(dose, medsById, input.userId, options);
    if (m) mapped.push(m);
  }

  mapped.sort((a, b) => {
    if (a.resource.effectiveDateTime < b.resource.effectiveDateTime) return -1;
    if (a.resource.effectiveDateTime > b.resource.effectiveDateTime) return 1;
    return a.resource.id.localeCompare(b.resource.id);
  });

  const entry: FhirBundleEntry[] = mapped.map((m) => ({
    fullUrl: `${fullUrlBase}${m.resource.id}`,
    resource: m.resource,
  }));

  return {
    resourceType: 'Bundle',
    type: 'collection',
    timestamp: new Date().toISOString(),
    total: entry.length,
    entry,
  };
}

/**
 * Convenience: stringify a bundle with optional indent. Default is
 * minified (no whitespace) — caller-friendly for direct POST. Pass
 * `indent=2` for human-readable JSON.
 */
export function serializeBundle(bundle: FhirBundle, indent = 0): string {
  return JSON.stringify(bundle, null, indent);
}

/**
 * Build a bundle wrapped in `{ exportedAt, source, bundle }` for
 * audit-friendly storage. The wrapper is OUTSIDE the FHIR spec —
 * a consumer pulling just the `.bundle` key still gets a valid
 * R4 Bundle.
 */
export interface DoseExportEnvelope {
  exportedAt: string;
  source?: string;
  bundle: FhirBundle;
}

export function buildDoseExportEnvelope(input: DoseExportInput): DoseExportEnvelope {
  const bundle = buildDoseExportBundle(input);
  const env: DoseExportEnvelope = {
    exportedAt: new Date().toISOString(),
    bundle,
  };
  if (input.options?.source) env.source = input.options.source;
  return env;
}
