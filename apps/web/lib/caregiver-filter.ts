/**
 * caregiver-filter — pure search predicate for the /caregivers list page.
 *
 * The caregivers list gets an inline search box that narrows by the share's
 * label OR any of its scope tokens. This module owns the match predicate, the
 * filter pass, and a small match-count summary so the page stays a thin render
 * and the matching stays unit-tested. It composes with caregiver-sort: filter
 * first, then sort the survivors.
 *
 * Scope matching is friendly: a query of "refill" matches both the raw token
 * "request-refill" and its human label "Request refills", so a user need not
 * know the internal slug. No React, no Date.now().
 */

import type { CaregiverShare } from './types';
import { scopeLabel } from './caregiver-activity';

/** Normalise a query: trimmed, lower-cased. */
function norm(q: string): string {
  return q.trim().toLowerCase();
}

/**
 * True when the share matches `query`. Empty/whitespace query matches all.
 * Matches against the label and each scope's raw token AND friendly label, so
 * "view" hits "view-meds" and "View medications" alike.
 */
export function matchesCaregiver(share: CaregiverShare, query: string): boolean {
  const q = norm(query);
  if (!q) return true;
  if (share.label.toLowerCase().includes(q)) return true;
  for (const scope of share.scopes) {
    if (scope.toLowerCase().includes(q)) return true;
    if (scopeLabel(scope).toLowerCase().includes(q)) return true;
  }
  return false;
}

/** Filter a COPY of the shares to those matching `query` (order preserved). */
export function filterCaregivers(
  shares: readonly CaregiverShare[],
  query: string,
): CaregiverShare[] {
  const q = norm(query);
  if (!q) return [...shares];
  return shares.filter((s) => matchesCaregiver(s, q));
}

export interface CaregiverFilterSummary {
  shares: CaregiverShare[];
  /** How many shares matched. */
  matchCount: number;
  /** Total shares considered. */
  total: number;
  /** True when a non-empty query is active. */
  filtering: boolean;
}

/**
 * Filter plus a small headline the list header can show ("2 of 5"). One call
 * gives the page the narrowed list and the counts so it never recomputes them.
 */
export function summarizeCaregiverFilter(
  shares: readonly CaregiverShare[],
  query: string,
): CaregiverFilterSummary {
  const filtered = filterCaregivers(shares, query);
  return {
    shares: filtered,
    matchCount: filtered.length,
    total: shares.length,
    filtering: norm(query).length > 0,
  };
}
