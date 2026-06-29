/**
 * section-collapse-pref — pure collapse-set model + persistence for the /today
 * part-of-day sections.
 *
 * Once every dose in a Morning / Afternoon / Evening / Night section is acted on,
 * the rows are dead weight — the user wants the live sections (with pending doses)
 * up top, not a wall of taken pills. This lets a fully-done section collapse
 * behind a "3 done" summary chip, and remembers which sections the user folded so
 * the choice survives a reload, like the medications density + run-out prefs.
 *
 * This module owns the storage key, the set normalize/parse/serialize guards, the
 * "is this section collapsible (fully done)?" gate, and the summary-chip label.
 * No React, no direct localStorage access. The collapse set is the four labels;
 * a section only collapses when it's done AND in the set.
 */

import type { PartOfDay, PartOfDayCounts } from './part-of-day';
import { PART_OF_DAY_LABELS } from './part-of-day';

export const SECTION_COLLAPSE_STORAGE_KEY = 'medtracker.today.collapsedSections';

/** A section is COLLAPSIBLE only when it has doses and every one is acted on. */
export function isSectionDone(counts: PartOfDayCounts): boolean {
  return counts.total > 0 && counts.done;
}

/**
 * Summary chip for a collapsed (fully-done) section, e.g. "3 done" — taken +
 * skipped roll into the count since both are "handled". Returns null when the
 * section has nothing acted on (no chip). Pluralisation is unnecessary (the word
 * is "done"); reads "1 done" / "3 done" uniformly. Pure.
 */
export function sectionDoneSummary(counts: PartOfDayCounts): string | null {
  const handled = counts.taken + counts.skipped;
  return handled > 0 ? `${handled} done` : null;
}

/** Coerce an arbitrary value into a clean Set of valid part-of-day labels. */
export function normalizeCollapsed(value: unknown): Set<PartOfDay> {
  const out = new Set<PartOfDay>();
  if (!Array.isArray(value)) return out;
  for (const v of value) {
    if ((PART_OF_DAY_LABELS as readonly string[]).includes(v as string)) {
      out.add(v as PartOfDay);
    }
  }
  return out;
}

/** Parse a raw localStorage string (JSON array of labels) into a collapse set. */
export function parseCollapsed(raw: string | null | undefined): Set<PartOfDay> {
  if (!raw) return new Set();
  let value: unknown = raw;
  try {
    value = JSON.parse(raw);
  } catch {
    return new Set();
  }
  return normalizeCollapsed(value);
}

/** Serialise the collapse set in stable display order for localStorage. */
export function serializeCollapsed(set: ReadonlySet<PartOfDay>): string {
  return JSON.stringify(PART_OF_DAY_LABELS.filter((l) => set.has(l)));
}

/** Return a NEW set with `label` toggled in/out (never mutates the input). */
export function toggleCollapsed(set: ReadonlySet<PartOfDay>, label: PartOfDay): Set<PartOfDay> {
  const next = new Set(set);
  if (next.has(label)) next.delete(label);
  else next.add(label);
  return next;
}

/**
 * Whether a section should render collapsed: it must be fully done AND the user
 * must have folded it. A done section the user re-expanded shows; a live section
 * never collapses even if it lingers in the set (so a newly-pending dose always
 * reappears). Pure — the page renders the chip when this is true, rows when not.
 */
export function isCollapsed(
  label: PartOfDay,
  counts: PartOfDayCounts,
  set: ReadonlySet<PartOfDay>,
): boolean {
  return isSectionDone(counts) && set.has(label);
}

/** Minimal shape the bulk helpers read off each section (matches PartOfDayGroup). */
export interface CollapsibleSection {
  label: PartOfDay;
  counts: PartOfDayCounts;
}

/** The labels that are CURRENTLY done — the universe a "collapse all" can fold. */
export function doneLabels(groups: readonly CollapsibleSection[]): PartOfDay[] {
  return groups.filter((g) => isSectionDone(g.counts)).map((g) => g.label);
}

/**
 * Whether a "collapse all done" control would actually fold anything new: there
 * is at least one done section currently rendered expanded. When false, the
 * control's job is to UN-collapse instead (everything done is already folded),
 * so the page can flip the label. Pure.
 */
export function canCollapseAllDone(
  groups: readonly CollapsibleSection[],
  set: ReadonlySet<PartOfDay>,
): boolean {
  return doneLabels(groups).some((l) => !set.has(l));
}

/**
 * One control toggles every fully-done section at once. If any done section is
 * still expanded, fold them all; otherwise un-fold them. Live sections are never
 * added (only done labels), and folds for sections no longer done are dropped so
 * the set never goes stale. Returns a NEW set; never mutates. Pure.
 */
export function toggleAllDone(
  groups: readonly CollapsibleSection[],
  set: ReadonlySet<PartOfDay>,
): Set<PartOfDay> {
  const done = doneLabels(groups);
  if (canCollapseAllDone(groups, set)) return new Set(done);
  return new Set(set ? [...set].filter((l) => !done.includes(l)) : []);
}

/** Label for the bulk control, naming what the next tap does. Null when nothing's done. */
export function collapseAllLabel(
  groups: readonly CollapsibleSection[],
  set: ReadonlySet<PartOfDay>,
): string | null {
  if (doneLabels(groups).length === 0) return null;
  return canCollapseAllDone(groups, set) ? 'Collapse done' : 'Expand done';
}
