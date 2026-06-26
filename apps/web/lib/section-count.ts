/**
 * section-count — pure section-count model for the command palette headers.
 *
 * When a query is active, the palette section headers ("Pages", "Actions",
 * "Medications") gain a small count chip ("Medications · 12") so a user can see
 * at a glance how many hits live under each heading without scrolling. The
 * "Recent" section never shows a count (it is a fixed shortlist, not a search
 * result), and counts only appear while searching.
 *
 * This module owns the should-show decision and the chip label so the component
 * stays a thin render and the rule ("counts only when querying, never on
 * Recent") stays unit-tested. No React.
 */

/** Section labels that represent live search results (eligible for a count). */
export const COUNTABLE_SECTIONS = ['Pages', 'Actions', 'Medications'] as const;
export type CountableSection = (typeof COUNTABLE_SECTIONS)[number];

/** The Recent section is curated, not searched — it never carries a count. */
export const UNCOUNTABLE_SECTIONS = ['Recent'] as const;

/** True when `label` is a section whose results should be counted. */
export function isCountableSection(label: string): boolean {
  return (COUNTABLE_SECTIONS as readonly string[]).includes(label);
}

/**
 * Whether a section header should render a count chip.
 *
 * Rules:
 *  - only while a non-empty query is active (counts are a search affordance),
 *  - never for the Recent section (curated shortlist, not a result set),
 *  - only when the section actually has items.
 */
export function shouldShowCount(
  label: string,
  query: string,
  itemCount: number,
): boolean {
  if (query.trim().length === 0) return false;
  if (!isCountableSection(label)) return false;
  return itemCount > 0;
}

/**
 * The chip label for a section's result count. Plain number; the dot separator
 * is rendered by the header so the count reads "Medications · 12".
 */
export function countLabel(itemCount: number): string {
  return String(Math.max(0, Math.trunc(itemCount)));
}

/**
 * Total results across the countable sections — handy for an aria-live summary
 * ("12 results") so a screen-reader user hears how the query narrowed things.
 */
export function totalResultCount(
  sections: ReadonlyArray<{ label: string; items: readonly unknown[] }>,
): number {
  let total = 0;
  for (const s of sections) {
    if (isCountableSection(s.label)) total += s.items.length;
  }
  return total;
}

/** Pluralised "N results" / "1 result" / "No results" summary string. */
export function resultsSummary(total: number): string {
  if (total <= 0) return 'No results';
  return `${total} result${total === 1 ? '' : 's'}`;
}
