/**
 * Patient-reported adverse event log.
 *
 * `side-effect-correlation` answers "across the journal corpus, does
 * this symptom cluster around this medication?" -- a population-level
 * triage signal. This module is the per-EVENT companion: when the
 * patient logs ONE adverse event, classify its severity, find the
 * nearest preceding dose for each candidate medication, and produce
 * a structured record suitable for storage, report export, and
 * clinician handoff.
 *
 * Outputs:
 *   - severity: minor / moderate / major / life-threatening, derived
 *     from a tag vocabulary (anaphylaxis, syncope, etc.) and an
 *     optional patient-reported 1..10 severity slider,
 *   - proximity: per-medication time-since-last-dose plus a confidence
 *     label (within-window / outside-window / never-dosed),
 *   - escalation: whether the event warrants immediate care
 *     (life-threatening or major + tight proximity).
 *
 * No medical advice is generated; the module flags WHAT happened and
 * WHEN relative to which medications, so a human can decide what to
 * do. The output is deterministic and pure.
 */

export type AdverseSeverity = 'minor' | 'moderate' | 'major' | 'life-threatening';

export type AdverseTag =
  | 'rash'
  | 'itching'
  | 'nausea'
  | 'vomiting'
  | 'diarrhea'
  | 'headache'
  | 'dizziness'
  | 'syncope'
  | 'palpitations'
  | 'chest-pain'
  | 'shortness-of-breath'
  | 'wheezing'
  | 'anaphylaxis'
  | 'swelling'
  | 'angioedema'
  | 'bleeding'
  | 'bruising'
  | 'jaundice'
  | 'confusion'
  | 'hallucinations'
  | 'seizure'
  | 'fever'
  | 'fatigue'
  | 'insomnia'
  | 'mood-change'
  | 'other';

export interface AdverseEventInput {
  /** Free-form patient description. Persisted verbatim. */
  description: string;
  /** Structured tags from the AdverseTag vocabulary. */
  tags: AdverseTag[];
  /** When the patient first noticed the symptom (ISO). */
  onsetAt: string;
  /** When the event was logged (ISO). Defaults to onsetAt. */
  reportedAt?: string;
  /** Optional patient-reported severity 1..10 (10 = worst imaginable). */
  patientSeverity?: number;
}

export interface DoseHistoryEntry {
  medicationId: string;
  /** Medication display name (for the report sentence). */
  medicationName: string;
  /** When the dose was taken (ISO). Only `taken` doses should be passed in. */
  takenAt: string;
}

export interface MedicationProximity {
  medicationId: string;
  medicationName: string;
  /** Time of the dose nearest in the past (ISO), or null if never dosed. */
  lastDoseAt: string | null;
  /** Hours since lastDoseAt to the event onset; null when never dosed. */
  hoursSinceLastDose: number | null;
  /** True when hoursSinceLastDose is finite and <= proximityWindowHours. */
  withinWindow: boolean;
  /** Human-readable phrase for reports. */
  proximityNote: string;
}

export interface AdverseEventLogOptions {
  /** Hours after a dose that we consider "tight proximity". Default 12. */
  proximityWindowHours?: number;
  /** Patient-severity threshold that escalates to major. Default 8. */
  patientSeverityMajorThreshold?: number;
  /** Patient-severity threshold that escalates to life-threatening. Default 10. */
  patientSeverityLifeThreshold?: number;
}

export interface AdverseEventRecord {
  id: string;
  description: string;
  tags: AdverseTag[];
  onsetAt: string;
  reportedAt: string;
  patientSeverity?: number;
  severity: AdverseSeverity;
  /** Reason the severity was assigned at this level. */
  severityRationale: string;
  /** Per-medication proximity, sorted ascending by hoursSinceLastDose. */
  proximities: MedicationProximity[];
  /** Medications dosed within the proximity window. */
  suspectMedications: string[];
  /** True when the event warrants immediate medical attention. */
  escalate: boolean;
  /** Plain-language summary line for a clinician handoff/report. */
  summary: string;
}

const SEVERITY_RANK: Record<AdverseSeverity, number> = {
  'minor': 1,
  'moderate': 2,
  'major': 3,
  'life-threatening': 4,
};

const TAG_SEVERITY: Record<AdverseTag, AdverseSeverity> = {
  rash: 'moderate',
  itching: 'minor',
  nausea: 'minor',
  vomiting: 'moderate',
  diarrhea: 'moderate',
  headache: 'minor',
  dizziness: 'moderate',
  syncope: 'major',
  palpitations: 'moderate',
  'chest-pain': 'major',
  'shortness-of-breath': 'major',
  wheezing: 'major',
  anaphylaxis: 'life-threatening',
  swelling: 'moderate',
  angioedema: 'life-threatening',
  bleeding: 'major',
  bruising: 'minor',
  jaundice: 'major',
  confusion: 'major',
  hallucinations: 'major',
  seizure: 'life-threatening',
  fever: 'moderate',
  fatigue: 'minor',
  insomnia: 'minor',
  'mood-change': 'moderate',
  other: 'minor',
};

const SEVERITY_LABEL: Record<AdverseSeverity, string> = {
  'minor': 'minor',
  'moderate': 'moderate',
  'major': 'major',
  'life-threatening': 'life-threatening',
};

const MS_PER_HOUR = 3_600_000;

function maxSeverity(a: AdverseSeverity, b: AdverseSeverity): AdverseSeverity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

function generateId(onsetAt: string, tags: AdverseTag[]): string {
  const t = Date.parse(onsetAt);
  if (Number.isNaN(t)) {
    throw new Error('onsetAt must be a valid ISO timestamp');
  }
  // Stable, deterministic id derived from onset + tags (so re-running
  // import doesn't duplicate events).
  const tagPart = [...tags].sort().join(',') || 'untagged';
  let h = 5381;
  const seed = `${t}|${tagPart}`;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  return `ae_${(h >>> 0).toString(36)}_${t.toString(36)}`;
}

function classifySeverity(
  tags: AdverseTag[],
  patientSeverity: number | undefined,
  opts: AdverseEventLogOptions,
): { severity: AdverseSeverity; rationale: string } {
  const majorThreshold = opts.patientSeverityMajorThreshold ?? 8;
  const lifeThreshold = opts.patientSeverityLifeThreshold ?? 10;
  if (majorThreshold < 1 || lifeThreshold < majorThreshold) {
    throw new Error('patientSeverity thresholds must satisfy 1 <= major <= life');
  }

  let highest: AdverseSeverity = 'minor';
  let drivingTag: AdverseTag | undefined;
  for (const tag of tags) {
    const tagSev = TAG_SEVERITY[tag];
    if (SEVERITY_RANK[tagSev] > SEVERITY_RANK[highest]) {
      highest = tagSev;
      drivingTag = tag;
    }
  }

  let final = highest;
  let rationale = drivingTag
    ? `Driven by tag "${drivingTag}" (${SEVERITY_LABEL[highest]}).`
    : `Default severity for untagged event.`;

  if (typeof patientSeverity === 'number') {
    if (patientSeverity >= lifeThreshold) {
      final = maxSeverity(final, 'life-threatening');
      rationale = `Patient-reported severity ${patientSeverity}/10 escalates to life-threatening (>= ${lifeThreshold}).`;
    } else if (patientSeverity >= majorThreshold) {
      final = maxSeverity(final, 'major');
      if (final === 'major' && drivingTag === undefined) {
        rationale = `Patient-reported severity ${patientSeverity}/10 escalates to major (>= ${majorThreshold}).`;
      } else if (SEVERITY_RANK[final] < SEVERITY_RANK['major']) {
        // not reachable since we just maxed; but keep readable
        rationale += ` Patient-reported severity ${patientSeverity}/10 considered.`;
      } else if (drivingTag) {
        rationale = `Driven by tag "${drivingTag}" (${SEVERITY_LABEL[final]}); patient-reported severity ${patientSeverity}/10 supports.`;
      }
    }
  }

  return { severity: final, rationale };
}

function computeProximities(
  history: DoseHistoryEntry[],
  onsetAt: string,
  windowHours: number,
): MedicationProximity[] {
  const onsetMs = Date.parse(onsetAt);
  if (Number.isNaN(onsetMs)) throw new Error('onsetAt must be a valid ISO timestamp');

  // Group history by medicationId, picking the most-recent dose at-or-before onset.
  const seenMeds = new Map<string, { name: string; lastDose: { ms: number; iso: string } | null }>();
  for (const entry of history) {
    const t = Date.parse(entry.takenAt);
    if (Number.isNaN(t)) continue;
    const existing = seenMeds.get(entry.medicationId);
    if (!existing) {
      seenMeds.set(entry.medicationId, {
        name: entry.medicationName,
        lastDose: t <= onsetMs ? { ms: t, iso: entry.takenAt } : null,
      });
    } else {
      if (t <= onsetMs && (!existing.lastDose || t > existing.lastDose.ms)) {
        existing.lastDose = { ms: t, iso: entry.takenAt };
      }
    }
  }

  const out: MedicationProximity[] = [];
  for (const [medicationId, info] of seenMeds.entries()) {
    if (!info.lastDose) {
      out.push({
        medicationId,
        medicationName: info.name,
        lastDoseAt: null,
        hoursSinceLastDose: null,
        withinWindow: false,
        proximityNote: `${info.name}: no doses before onset.`,
      });
      continue;
    }
    const hours = (onsetMs - info.lastDose.ms) / MS_PER_HOUR;
    const within = hours <= windowHours;
    out.push({
      medicationId,
      medicationName: info.name,
      lastDoseAt: info.lastDose.iso,
      hoursSinceLastDose: Number(hours.toFixed(2)),
      withinWindow: within,
      proximityNote: within
        ? `${info.name}: last dose ${formatHours(hours)} before onset (within ${windowHours}h window).`
        : `${info.name}: last dose ${formatHours(hours)} before onset (outside ${windowHours}h window).`,
    });
  }

  // Sort so the most temporally suspect medications appear first.
  out.sort((a, b) => {
    if (a.hoursSinceLastDose == null && b.hoursSinceLastDose == null) {
      return a.medicationName.localeCompare(b.medicationName);
    }
    if (a.hoursSinceLastDose == null) return 1;
    if (b.hoursSinceLastDose == null) return -1;
    return a.hoursSinceLastDose - b.hoursSinceLastDose;
  });
  return out;
}

function formatHours(h: number): string {
  if (h < 1) {
    const m = Math.max(1, Math.round(h * 60));
    return `${m} min`;
  }
  if (h < 24) return `${h.toFixed(1)}h`;
  const days = h / 24;
  return `${days.toFixed(1)}d`;
}

function buildSummary(
  description: string,
  severity: AdverseSeverity,
  proximities: MedicationProximity[],
): string {
  const suspect = proximities.filter((p) => p.withinWindow).map((p) => p.medicationName);
  const head = `${severity[0]!.toUpperCase()}${severity.slice(1)} adverse event: ${description.trim()}.`;
  if (suspect.length === 0) {
    return `${head} No medications dosed within the proximity window.`;
  }
  if (suspect.length === 1) {
    return `${head} Suspect medication: ${suspect[0]}.`;
  }
  if (suspect.length === 2) {
    return `${head} Suspect medications: ${suspect[0]} and ${suspect[1]}.`;
  }
  return `${head} Suspect medications: ${suspect.slice(0, -1).join(', ')}, and ${suspect[suspect.length - 1]}.`;
}

/**
 * Log a single adverse event against a recent dose history.
 */
export function logAdverseEvent(
  input: AdverseEventInput,
  history: DoseHistoryEntry[] = [],
  options: AdverseEventLogOptions = {},
): AdverseEventRecord {
  if (!input.description || !input.description.trim()) {
    throw new Error('description is required');
  }
  if (typeof input.patientSeverity === 'number') {
    if (input.patientSeverity < 1 || input.patientSeverity > 10) {
      throw new Error('patientSeverity must be in 1..10');
    }
  }
  const windowHours = options.proximityWindowHours ?? 12;
  if (windowHours <= 0) throw new Error('proximityWindowHours must be > 0');

  const reportedAt = input.reportedAt ?? input.onsetAt;
  const { severity, rationale } = classifySeverity(input.tags, input.patientSeverity, options);
  const proximities = computeProximities(history, input.onsetAt, windowHours);
  const suspectMedications = proximities
    .filter((p) => p.withinWindow)
    .map((p) => p.medicationId);

  // Escalation: life-threatening always, major when something is in
  // the tight proximity window.
  const escalate =
    severity === 'life-threatening' ||
    (severity === 'major' && suspectMedications.length > 0);

  return {
    id: generateId(input.onsetAt, input.tags),
    description: input.description.trim(),
    tags: [...input.tags],
    onsetAt: input.onsetAt,
    reportedAt,
    patientSeverity: input.patientSeverity,
    severity,
    severityRationale: rationale,
    proximities,
    suspectMedications,
    escalate,
    summary: buildSummary(input.description, severity, proximities),
  };
}

/**
 * Roll up a list of adverse-event records into counts by severity.
 * Useful for the dashboard "you've logged 3 events this week" badge.
 */
export function summarizeAdverseEvents(records: AdverseEventRecord[]): {
  total: number;
  bySeverity: Record<AdverseSeverity, number>;
  byMedication: Array<{ medicationId: string; count: number }>;
  escalations: number;
} {
  const bySeverity: Record<AdverseSeverity, number> = {
    'minor': 0,
    'moderate': 0,
    'major': 0,
    'life-threatening': 0,
  };
  const medCounts = new Map<string, number>();
  let escalations = 0;
  for (const r of records) {
    bySeverity[r.severity] += 1;
    if (r.escalate) escalations += 1;
    for (const med of r.suspectMedications) {
      medCounts.set(med, (medCounts.get(med) ?? 0) + 1);
    }
  }
  const byMedication = [...medCounts.entries()]
    .map(([medicationId, count]) => ({ medicationId, count }))
    .sort((a, b) => b.count - a.count || a.medicationId.localeCompare(b.medicationId));
  return { total: records.length, bySeverity, byMedication, escalations };
}
