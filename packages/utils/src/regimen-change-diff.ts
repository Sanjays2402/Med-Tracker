/**
 * Regimen change diff.
 *
 * After a prescriber visit, a patient's regimen often changes: meds
 * added, dosed up or down, frequency changed, or discontinued. The
 * patient-facing app needs to surface those changes plainly ("Your
 * doctor changed 3 things today") and the audit log needs a
 * machine-readable record for the caregiver dashboard and the export.
 *
 * This module diffs two regimen snapshots and reports:
 *
 *   - added: medications present in the new snapshot but not the old,
 *   - removed: medications present in the old snapshot but not the new
 *     (or marked inactive),
 *   - changed: medications present in both snapshots with a meaningful
 *     change to strength, instructions, supply, or any schedule's
 *     times / days / kind / interval / enabled flag,
 *   - unchanged: medications present in both with no detectable change.
 *
 * Each "changed" entry carries a list of field-level FieldDiff records
 * so the UI can render "Lisinopril: dose 10mg -> 20mg, evening dose
 * added".
 *
 * Pure / deterministic. Operates on Medication[] + Schedule[] for each
 * snapshot.
 */

import type { Medication, Schedule } from '@med/types';

export interface RegimenSnapshot {
  medications: Medication[];
  schedules: Schedule[];
}

export interface FieldDiff {
  /** Dot-path of the changed field, e.g. "strength", "schedules[0].times". */
  field: string;
  /** Display value before. Null when added. */
  before: string | null;
  /** Display value after. Null when removed. */
  after: string | null;
  /** Human-readable label for the UI. */
  label: string;
}

export interface ChangedMedication {
  medicationId: string;
  name: string;
  diffs: FieldDiff[];
}

export interface RegimenDiff {
  added: Array<{ medicationId: string; name: string }>;
  removed: Array<{ medicationId: string; name: string; reason: 'absent' | 'inactive' }>;
  changed: ChangedMedication[];
  unchanged: Array<{ medicationId: string; name: string }>;
  /** Plain-text headline for notifications. */
  headline: string;
  /** Total number of meaningful changes (added + removed + changed). */
  changeCount: number;
}

export interface DiffOptions {
  /**
   * When true, medications whose `active` flipped from true to false are
   * categorized as `removed` with reason='inactive' rather than 'absent'.
   * Default true.
   */
  treatInactiveAsRemoved?: boolean;
  /**
   * Optional field allow-list for the diff. Defaults to all comparable
   * fields. Use this when the UI only cares about a subset.
   */
  fields?: Array<'strength' | 'instructions' | 'supplyRemaining' | 'dosesPerRefill' | 'schedules'>;
}

const ALL_FIELDS: NonNullable<DiffOptions['fields']> = [
  'strength',
  'instructions',
  'supplyRemaining',
  'dosesPerRefill',
  'schedules',
];

function schedulesForMed(schedules: Schedule[], medicationId: string): Schedule[] {
  return schedules
    .filter((s) => s.medicationId === medicationId)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function formatSchedule(s: Schedule): string {
  const enabled = s.enabled ? '' : ' (disabled)';
  if (s.kind === 'asNeeded') return `as-needed${enabled}`;
  if (s.kind === 'interval') {
    return `every ${s.intervalHours ?? '?'}h${enabled}`;
  }
  if (s.kind === 'weekly') {
    const dows = (s.daysOfWeek ?? []).join(',');
    return `weekly [${dows}] at ${s.times.join(', ')}${enabled}`;
  }
  if (s.kind === 'cron') return `cron ${s.cronExpression ?? ''}${enabled}`;
  return `daily at ${s.times.join(', ')}${enabled}`;
}

function scheduleKey(s: Schedule): string {
  return JSON.stringify({
    kind: s.kind,
    times: [...s.times].sort(),
    daysOfWeek: (s.daysOfWeek ?? []).slice().sort(),
    intervalHours: s.intervalHours ?? null,
    cron: s.cronExpression ?? null,
    enabled: s.enabled,
  });
}

function diffSchedules(before: Schedule[], after: Schedule[]): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  const beforeKeys = before.map(scheduleKey);
  const afterKeys = after.map(scheduleKey);

  // Schedules added.
  for (let i = 0; i < after.length; i++) {
    if (!beforeKeys.includes(afterKeys[i]!)) {
      diffs.push({
        field: `schedules[${i}]`,
        before: null,
        after: formatSchedule(after[i]!),
        label: `Schedule added: ${formatSchedule(after[i]!)}`,
      });
    }
  }
  // Schedules removed.
  for (let i = 0; i < before.length; i++) {
    if (!afterKeys.includes(beforeKeys[i]!)) {
      diffs.push({
        field: `schedules[${i}]`,
        before: formatSchedule(before[i]!),
        after: null,
        label: `Schedule removed: ${formatSchedule(before[i]!)}`,
      });
    }
  }
  return diffs;
}

function diffStringField(
  field: string,
  label: string,
  before: string | null | undefined,
  after: string | null | undefined,
): FieldDiff | null {
  const a = before ?? null;
  const b = after ?? null;
  if (a === b) return null;
  return {
    field,
    before: a,
    after: b,
    label: `${label}: ${a ?? '(none)'} -> ${b ?? '(none)'}`,
  };
}

function diffNumberField(
  field: string,
  label: string,
  before: number | null | undefined,
  after: number | null | undefined,
): FieldDiff | null {
  const a = before ?? null;
  const b = after ?? null;
  if (a === b) return null;
  return {
    field,
    before: a === null ? null : String(a),
    after: b === null ? null : String(b),
    label: `${label}: ${a ?? '(none)'} -> ${b ?? '(none)'}`,
  };
}

/**
 * Diff two regimen snapshots. The "old" snapshot represents the regimen
 * before the change (e.g. yesterday's state); the "new" snapshot is the
 * current state.
 */
export function diffRegimen(
  oldSnapshot: RegimenSnapshot,
  newSnapshot: RegimenSnapshot,
  options: DiffOptions = {},
): RegimenDiff {
  const treatInactive = options.treatInactiveAsRemoved ?? true;
  const fields = options.fields ?? ALL_FIELDS;

  const oldById = new Map<string, Medication>();
  for (const m of oldSnapshot.medications) oldById.set(m.id, m);
  const newById = new Map<string, Medication>();
  for (const m of newSnapshot.medications) newById.set(m.id, m);

  const added: RegimenDiff['added'] = [];
  const removed: RegimenDiff['removed'] = [];
  const changed: ChangedMedication[] = [];
  const unchanged: RegimenDiff['unchanged'] = [];

  // New meds.
  for (const [id, med] of newById) {
    if (!oldById.has(id) && med.active) {
      added.push({ medicationId: id, name: med.name });
    }
  }

  // Removed / changed / unchanged.
  for (const [id, oldMed] of oldById) {
    const newMed = newById.get(id);

    if (!newMed) {
      if (oldMed.active) {
        removed.push({ medicationId: id, name: oldMed.name, reason: 'absent' });
      }
      continue;
    }
    if (treatInactive && oldMed.active && !newMed.active) {
      removed.push({ medicationId: id, name: oldMed.name, reason: 'inactive' });
      continue;
    }
    if (!oldMed.active && !newMed.active) {
      // Both inactive; not interesting.
      continue;
    }

    const diffs: FieldDiff[] = [];
    if (fields.includes('strength')) {
      const d = diffStringField('strength', 'Strength', oldMed.strength, newMed.strength);
      if (d) diffs.push(d);
    }
    if (fields.includes('instructions')) {
      const d = diffStringField(
        'instructions',
        'Instructions',
        oldMed.instructions ?? null,
        newMed.instructions ?? null,
      );
      if (d) diffs.push(d);
    }
    if (fields.includes('supplyRemaining')) {
      const d = diffNumberField(
        'supplyRemaining',
        'Supply remaining',
        oldMed.supplyRemaining,
        newMed.supplyRemaining,
      );
      if (d) diffs.push(d);
    }
    if (fields.includes('dosesPerRefill')) {
      const d = diffNumberField(
        'dosesPerRefill',
        'Doses per refill',
        oldMed.dosesPerRefill,
        newMed.dosesPerRefill,
      );
      if (d) diffs.push(d);
    }
    if (fields.includes('schedules')) {
      const sb = schedulesForMed(oldSnapshot.schedules, id);
      const sa = schedulesForMed(newSnapshot.schedules, id);
      diffs.push(...diffSchedules(sb, sa));
    }

    if (diffs.length > 0) {
      changed.push({ medicationId: id, name: newMed.name, diffs });
    } else {
      unchanged.push({ medicationId: id, name: newMed.name });
    }
  }

  const changeCount = added.length + removed.length + changed.length;
  const headline = buildHeadline(added.length, removed.length, changed.length);

  return { added, removed, changed, unchanged, headline, changeCount };
}

function buildHeadline(addedN: number, removedN: number, changedN: number): string {
  const parts: string[] = [];
  if (addedN > 0) parts.push(`${addedN} added`);
  if (removedN > 0) parts.push(`${removedN} discontinued`);
  if (changedN > 0) parts.push(`${changedN} changed`);
  if (parts.length === 0) return 'No regimen changes.';
  return `Regimen update: ${parts.join(', ')}.`;
}

/**
 * Convenience: render the diff as a list of plain-text bullets, suitable
 * for an email body or a notification "view changes" expansion.
 */
export function renderDiffLines(diff: RegimenDiff): string[] {
  const lines: string[] = [];
  for (const a of diff.added) lines.push(`+ Added ${a.name}`);
  for (const r of diff.removed) {
    const reason = r.reason === 'inactive' ? ' (marked inactive)' : '';
    lines.push(`- Discontinued ${r.name}${reason}`);
  }
  for (const c of diff.changed) {
    lines.push(`~ ${c.name}:`);
    for (const d of c.diffs) lines.push(`    - ${d.label}`);
  }
  return lines;
}
