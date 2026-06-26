/**
 * scope-model — pure capability model for the caregiver share scope editor.
 *
 * A caregiver share grants a set of scope tokens (view-meds, request-refill,
 * ...). The new/detail share form groups these into "View" vs "Act" categories
 * and shows a plain-language summary of what the share allows ("Can view
 * medications and request refills"). This module owns the scope catalog, the
 * grouping, selection validation, and the English summary so the form stays a
 * thin render and the wording is unit-tested.
 *
 * No React. The scope ids match the tokens the data layer + caregiver-activity
 * scopeLabel already use, so nothing downstream needs to change.
 */

export type ScopeGroup = 'view' | 'act';

export interface ScopeDef {
  id: string;
  group: ScopeGroup;
  /** Short control label, e.g. "View medications". */
  label: string;
  /** One-line explanation for the checkbox row. */
  desc: string;
  /** Fragment used to build the plain-language summary ("view medications"). */
  phrase: string;
}

export const SCOPE_DEFS: ScopeDef[] = [
  {
    id: 'view-meds',
    group: 'view',
    label: 'View medications',
    desc: 'See current medications, strengths, and dosing instructions.',
    phrase: 'view medications',
  },
  {
    id: 'view-adherence',
    group: 'view',
    label: 'View adherence',
    desc: 'See how often doses are taken, skipped, or missed.',
    phrase: 'view adherence',
  },
  {
    id: 'view-refills',
    group: 'view',
    label: 'View refills',
    desc: 'See refill status, pharmacy, and supply remaining.',
    phrase: 'view refills',
  },
  {
    id: 'view-history',
    group: 'view',
    label: 'View history',
    desc: 'See the full dose history log.',
    phrase: 'view history',
  },
  {
    id: 'request-refill',
    group: 'act',
    label: 'Request refills',
    desc: 'Submit refill requests to the pharmacy on your behalf.',
    phrase: 'request refills',
  },
];

export const SCOPE_GROUP_LABEL: Record<ScopeGroup, string> = {
  view: 'Can see',
  act: 'Can do',
};

const GROUP_ORDER: ScopeGroup[] = ['view', 'act'];

export function getScopeDef(id: string): ScopeDef | undefined {
  return SCOPE_DEFS.find((s) => s.id === id);
}

export interface ScopeGroupView {
  group: ScopeGroup;
  label: string;
  scopes: ScopeDef[];
}

/** Group the catalog into View / Act sections, in display order. */
export function groupedScopes(): ScopeGroupView[] {
  return GROUP_ORDER.map((group) => ({
    group,
    label: SCOPE_GROUP_LABEL[group],
    scopes: SCOPE_DEFS.filter((s) => s.group === group),
  })).filter((g) => g.scopes.length > 0);
}

/** Toggle a scope id in a selection array, returning a new array. */
export function toggleScope(selected: readonly string[], id: string): string[] {
  return selected.includes(id)
    ? selected.filter((s) => s !== id)
    : [...selected, id];
}

/** Keep only known scope ids, de-duplicated, in catalog order. */
export function normalizeScopes(selected: readonly string[]): string[] {
  const set = new Set(selected);
  return SCOPE_DEFS.filter((s) => set.has(s.id)).map((s) => s.id);
}

export interface ScopeValidation {
  valid: boolean;
  /** True when at least one "act" scope is selected without any "view" scope. */
  actWithoutView: boolean;
  message: string | null;
}

/**
 * Validate a selection. A share needs at least one scope. We also surface a soft
 * warning when an "act" capability (request refills) is granted with no "view"
 * capability — a caregiver who can request refills but can't see medications is
 * almost always a mistake.
 */
export function validateScopes(selected: readonly string[]): ScopeValidation {
  const known = normalizeScopes(selected);
  if (known.length === 0) {
    return { valid: false, actWithoutView: false, message: 'Pick at least one permission.' };
  }
  const hasView = known.some((id) => getScopeDef(id)?.group === 'view');
  const hasAct = known.some((id) => getScopeDef(id)?.group === 'act');
  if (hasAct && !hasView) {
    return {
      valid: true,
      actWithoutView: true,
      message: 'This share can request refills but cannot view medications. Add a view permission?',
    };
  }
  return { valid: true, actWithoutView: false, message: null };
}

/** Join phrases with commas and a trailing "and": "a, b and c". */
function joinAnd(parts: string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * Plain-language summary of a selection: "Can view medications and request
 * refills." Returns a gentle placeholder when nothing is selected. Phrases come
 * out in catalog order so the wording is stable.
 */
export function summarizeScopes(selected: readonly string[]): string {
  const known = normalizeScopes(selected);
  if (known.length === 0) return 'No access yet — pick what this share can see or do.';
  const phrases = known.map((id) => getScopeDef(id)!.phrase);
  return `Can ${joinAnd(phrases)}.`;
}
