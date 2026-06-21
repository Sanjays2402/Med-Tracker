/**
 * Per-day schedule overrides for vacations and travel.
 *
 * On a normal day a patient takes meds at the times their schedule
 * says. On a travel day the same dose lives at a different local
 * time (or doesn't happen at all): an 08:00 dose taken in the home
 * timezone needs to fire at 08:00 in the destination, or shift by
 * the entire flight to avoid double-dosing across a time zone
 * boundary.
 *
 * This module accepts a list of `VacationOverride` records — one
 * per (date, medication?) — and applies them to the concrete due
 * timestamps produced by `expandSchedule`. Three override types:
 *
 *   - `shift`: move every dose on that day by N minutes (e.g. +60
 *     for an eastbound trip, -180 for a flight west),
 *   - `replaceTimes`: discard the schedule's default times for that
 *     day and use an explicit list of HH:MM times instead,
 *   - `skip`: drop every dose on that day (rare; only valid for
 *     specific PRN-eligible meds and only when prescriber-approved).
 *
 * Overrides can target a single medication (medicationId) or apply
 * to the whole regimen (medicationId omitted). Per-med overrides
 * take precedence over regimen-wide ones for the same date.
 *
 * Pure / deterministic. Operates on the expanded Date list, so the
 * caller stays in control of the time window.
 */

export type OverrideKind = 'shift' | 'replaceTimes' | 'skip';

export interface VacationOverride {
  /** ISO date (YYYY-MM-DD) the override applies to (local). */
  date: string;
  /**
   * Medication this override targets. Omit for regimen-wide.
   * Per-med overrides supersede regimen-wide for the same date.
   */
  medicationId?: string;
  kind: OverrideKind;
  /** Minutes to shift each dose. Required for kind='shift'. */
  shiftMinutes?: number;
  /** HH:MM strings to replace the day's times. Required for kind='replaceTimes'. */
  replaceTimes?: string[];
  /** Optional human-readable label ("Flight to NYC", "Day at sea"). */
  reason?: string;
}

export interface DoseInstance {
  medicationId: string;
  /** Computed local instant the dose is due. */
  dueAt: Date;
}

export interface ApplyOverridesOptions {
  /** Default: keep doses that fall outside the window after shifting. */
  trimToWindow?: { from: Date; to: Date };
}

export interface AppliedOverride {
  dose: DoseInstance;
  /** When the dose would have fired without overrides. */
  originalDueAt: Date;
  /** Override record that affected this dose; null if none did. */
  override: VacationOverride | null;
}

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function setHHMM(base: Date, hhmm: string): Date {
  const parts = hhmm.split(':').map(Number);
  const out = new Date(base);
  out.setHours(parts[0] ?? 0, parts[1] ?? 0, 0, 0);
  return out;
}

/**
 * Build a lookup keyed by (date, medicationId | '*').
 * Per-med entries win when both exist for a date.
 */
export function indexOverrides(
  overrides: VacationOverride[],
): Map<string, VacationOverride> {
  const map = new Map<string, VacationOverride>();
  // First put regimen-wide; then per-med so per-med overwrites.
  for (const o of overrides) {
    if (o.medicationId) continue;
    map.set(`${o.date}|*`, o);
  }
  for (const o of overrides) {
    if (!o.medicationId) continue;
    map.set(`${o.date}|${o.medicationId}`, o);
  }
  return map;
}

function pickOverride(
  index: Map<string, VacationOverride>,
  date: string,
  medicationId: string,
): VacationOverride | null {
  const perMed = index.get(`${date}|${medicationId}`);
  if (perMed) return perMed;
  return index.get(`${date}|*`) ?? null;
}

/**
 * Apply overrides to a list of computed dose instances.
 *
 * Behaviour per kind:
 *   - `shift`: each affected dose's dueAt += shiftMinutes.
 *   - `replaceTimes`: all of that med's doses on that date are
 *     dropped and replaced with one DoseInstance per HH:MM in
 *     replaceTimes (combined with the date in local time).
 *   - `skip`: all of that med's doses on that date are dropped.
 *
 * Returns the new list of DoseInstance plus an audit log
 * (AppliedOverride[]) describing every dose whose schedule was
 * altered.
 */
export function applyVacationOverrides(
  doses: DoseInstance[],
  overrides: VacationOverride[],
  options: ApplyOverridesOptions = {},
): { doses: DoseInstance[]; applied: AppliedOverride[] } {
  const index = indexOverrides(overrides);
  if (index.size === 0) {
    const sortedCopy = [...doses].sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
    return { doses: sortedCopy, applied: [] };
  }

  // Group doses by (date, medication) so we can apply replaceTimes
  // and skip atomically.
  const grouped = new Map<string, DoseInstance[]>();
  for (const d of doses) {
    const key = `${dayKey(d.dueAt)}|${d.medicationId}`;
    const arr = grouped.get(key) ?? [];
    arr.push(d);
    grouped.set(key, arr);
  }

  const result: DoseInstance[] = [];
  const applied: AppliedOverride[] = [];

  for (const [groupKey, group] of grouped) {
    const [date, medicationId] = groupKey.split('|') as [string, string];
    const ov = pickOverride(index, date, medicationId);
    if (!ov) {
      result.push(...group);
      continue;
    }

    if (ov.kind === 'skip') {
      for (const orig of group) {
        applied.push({
          dose: orig,
          originalDueAt: orig.dueAt,
          override: ov,
        });
      }
      continue;
    }

    if (ov.kind === 'shift') {
      const shiftMs = (ov.shiftMinutes ?? 0) * 60_000;
      for (const orig of group) {
        const shifted: DoseInstance = {
          medicationId: orig.medicationId,
          dueAt: new Date(orig.dueAt.getTime() + shiftMs),
        };
        result.push(shifted);
        applied.push({
          dose: shifted,
          originalDueAt: orig.dueAt,
          override: ov,
        });
      }
      continue;
    }

    if (ov.kind === 'replaceTimes') {
      const baseDate = group[0]?.dueAt ?? new Date(`${date}T00:00:00`);
      const times = ov.replaceTimes ?? [];
      // Use the calendar day from the date key, not from baseDate, so
      // a regimen-wide override on a date with no original doses
      // still produces doses on the correct day.
      const anchor = setHHMM(baseDate, '00:00');
      const [y, m, d] = date.split('-').map(Number);
      anchor.setFullYear(y!, (m ?? 1) - 1, d ?? 1);
      const fresh = times.map<DoseInstance>((t) => ({
        medicationId,
        dueAt: setHHMM(anchor, t),
      }));
      for (const newDose of fresh) {
        result.push(newDose);
        applied.push({
          dose: newDose,
          originalDueAt: group[0]?.dueAt ?? newDose.dueAt,
          override: ov,
        });
      }
      continue;
    }
  }

  // Sort by dueAt for predictable downstream rendering.
  result.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());

  // Optional trim back to window after shifting may have pushed
  // doses out.
  if (options.trimToWindow) {
    const fromMs = options.trimToWindow.from.getTime();
    const toMs = options.trimToWindow.to.getTime();
    return {
      doses: result.filter(
        (d) => d.dueAt.getTime() >= fromMs && d.dueAt.getTime() <= toMs,
      ),
      applied,
    };
  }

  return { doses: result, applied };
}

/**
 * Convenience helper for travel timezone changes: build a `shift`
 * override that compensates for a flight from `homeOffsetMinutes`
 * to `destOffsetMinutes` (both UTC offsets, e.g. -480 for PST,
 * -300 for EST). Useful for the "I'm flying to NYC tomorrow"
 * flow in the settings UI.
 */
export function shiftFromTimezoneChange(
  date: string,
  homeOffsetMinutes: number,
  destOffsetMinutes: number,
  medicationId?: string,
  reason?: string,
): VacationOverride {
  return {
    date,
    medicationId,
    kind: 'shift',
    shiftMinutes: destOffsetMinutes - homeOffsetMinutes,
    reason: reason ?? 'travel timezone shift',
  };
}

/**
 * Return true when the override is well-formed; useful for UI input
 * validation before persisting. Each kind has different required
 * fields.
 */
export function isValidOverride(o: VacationOverride): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date)) return false;
  if (o.kind === 'shift') {
    return typeof o.shiftMinutes === 'number' && Number.isFinite(o.shiftMinutes);
  }
  if (o.kind === 'replaceTimes') {
    return (
      Array.isArray(o.replaceTimes) &&
      o.replaceTimes.length > 0 &&
      o.replaceTimes.every((t) => {
        const m = /^(\d{2}):(\d{2})$/.exec(t);
        if (!m) return false;
        const h = Number(m[1]);
        const min = Number(m[2]);
        return h >= 0 && h <= 23 && min >= 0 && min <= 59;
      })
    );
  }
  if (o.kind === 'skip') return true;
  return false;
}
