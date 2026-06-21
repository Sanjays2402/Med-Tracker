/**
 * Caregiver activity feed.
 *
 * A caregiver dashboard needs a chronological stream of recent
 * activity across the patient's regimen: doses taken/missed, refills
 * placed, adverse events reported, lab results filed, schedule edits.
 * The feed has to be permission-aware (a caregiver with view-meds
 * only must NOT see psychiatric-med adverse-event entries) and
 * paginable (the UI shows 20 rows + "load more").
 *
 * This module composes with `caregiver-permission-matrix.buildPermissionMatrix`:
 * pass the matrix in and the feed filters every event through it. Per-medication
 * deny overrides win, exactly as the matrix specifies.
 *
 * Pagination uses a cursor-based scheme: the cursor is the ISO
 * timestamp of the OLDEST returned event in the current page, plus its
 * id for tie-breaking on identical timestamps. The next page is the
 * batch of events strictly older than that point. This is stable in
 * the face of new events being appended at the head.
 *
 * Pure / deterministic. No I/O.
 */

import type { PermissionMatrix, Capability } from './caregiver-permission-matrix';
import { canCaregiverDo } from './caregiver-permission-matrix';

export type CaregiverEventKind =
  | 'dose-taken'
  | 'dose-missed'
  | 'dose-skipped'
  | 'refill-placed'
  | 'refill-filled'
  | 'adverse-event'
  | 'lab-drawn'
  | 'schedule-edited'
  | 'medication-added'
  | 'medication-removed';

export interface CaregiverEvent {
  id: string;
  /** ISO timestamp of when the event occurred. */
  occurredAt: string;
  kind: CaregiverEventKind;
  /** Medication this event relates to. Null for regimen-wide events
   *  (e.g. account-level activity), which always require view-medications.
   */
  medicationId: string | null;
  /** Display name of the medication (denormalized for the feed row). */
  medicationName?: string;
  /** Short headline for the feed row. */
  headline: string;
  /** Optional secondary description ("250 mg, taken at 08:14"). */
  detail?: string;
}

export interface CaregiverFeedInput {
  events: CaregiverEvent[];
  matrix: PermissionMatrix;
  /**
   * Cursor: encoded `${occurredAt}|${id}` from a previous page's
   * `nextCursor`. Omit for the first page.
   */
  cursor?: string;
  /** Page size. Default 20. */
  pageSize?: number;
  /**
   * Optional kind filter ("show only refill events"). Multiple kinds
   * union; empty = all kinds.
   */
  kinds?: CaregiverEventKind[];
}

export interface CaregiverFeedPage {
  events: CaregiverEvent[];
  /** Cursor to pass back for the next page. Null when no more pages. */
  nextCursor: string | null;
  /** Number of events filtered out by the permission matrix. */
  filteredCount: number;
  /** Total events the matrix permits (across all pages). */
  totalVisible: number;
}

/**
 * Required capability for each event kind. Caregivers with the
 * capability on the relevant medication will see the event; without
 * it (or with an explicit deny), the event is hidden.
 *
 * For regimen-wide events (medicationId === null), the global capability
 * is checked.
 */
const KIND_CAPABILITY: Record<CaregiverEventKind, Capability> = {
  'dose-taken': 'view-adherence',
  'dose-missed': 'view-adherence',
  'dose-skipped': 'view-adherence',
  'refill-placed': 'view-refills',
  'refill-filled': 'view-refills',
  'adverse-event': 'view-medications',
  'lab-drawn': 'view-medications',
  'schedule-edited': 'view-medications',
  'medication-added': 'view-medications',
  'medication-removed': 'view-medications',
};

function eventIsVisible(event: CaregiverEvent, matrix: PermissionMatrix): boolean {
  if (matrix.expired) return false;
  const capability = KIND_CAPABILITY[event.kind];
  return canCaregiverDo(matrix, capability, event.medicationId ?? undefined);
}

function encodeCursor(event: CaregiverEvent): string {
  return `${event.occurredAt}|${event.id}`;
}

function decodeCursor(cursor: string): { occurredAt: string; id: string } | null {
  const idx = cursor.lastIndexOf('|');
  if (idx <= 0) return null;
  return {
    occurredAt: cursor.slice(0, idx),
    id: cursor.slice(idx + 1),
  };
}

/**
 * Strictly-older test: an event is "older than" the cursor if its
 * occurredAt is earlier, OR same timestamp with a smaller id (stable
 * tie-break).
 */
function isOlderThan(event: CaregiverEvent, cursor: { occurredAt: string; id: string }): boolean {
  if (event.occurredAt < cursor.occurredAt) return true;
  if (event.occurredAt === cursor.occurredAt && event.id < cursor.id) return true;
  return false;
}

/**
 * Build a paginated, permission-filtered feed page.
 *
 * Events are returned newest-first. The page contains up to `pageSize`
 * events strictly older than the cursor (or up to `pageSize` of the
 * newest events when no cursor is given). `nextCursor` is the cursor
 * that points to the page after this one, or null when none remain.
 */
export function buildCaregiverEventFeed(input: CaregiverFeedInput): CaregiverFeedPage {
  const pageSize = input.pageSize ?? 20;
  const kindFilter = input.kinds && input.kinds.length > 0 ? new Set(input.kinds) : null;
  const cursor = input.cursor ? decodeCursor(input.cursor) : null;

  // Filter by permission first so filteredCount reflects what the
  // matrix would have denied (not what the kind filter discarded).
  let visible = 0;
  let filteredCount = 0;
  const visibleEvents: CaregiverEvent[] = [];
  for (const e of input.events) {
    if (eventIsVisible(e, input.matrix)) {
      visible += 1;
      visibleEvents.push(e);
    } else {
      filteredCount += 1;
    }
  }

  // Apply optional kind filter on top.
  let pool = visibleEvents;
  if (kindFilter) pool = pool.filter((e) => kindFilter.has(e.kind));

  // Sort newest-first; tie-break by id descending so cursor pagination is stable.
  pool.sort((a, b) => {
    if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt ? 1 : -1;
    if (a.id !== b.id) return a.id < b.id ? 1 : -1;
    return 0;
  });

  let windowed = pool;
  if (cursor) windowed = pool.filter((e) => isOlderThan(e, cursor));

  const page = windowed.slice(0, pageSize);
  const nextCursor = page.length === pageSize && windowed.length > pageSize
    ? encodeCursor(page[page.length - 1]!)
    : null;

  return {
    events: page,
    nextCursor,
    filteredCount,
    totalVisible: visible,
  };
}

/**
 * Helper: walk the feed and collect every page into a single
 * flat array. Useful for tests and for caregiver email digests that
 * want the whole week.
 */
export function collectCaregiverFeed(input: CaregiverFeedInput): CaregiverEvent[] {
  const events: CaregiverEvent[] = [];
  let cursor: string | null = input.cursor ?? null;
  // Safety bound: 1000 pages * pageSize ~ 20k events; should never be hit
  // in real life but prevents runaway loops on bad cursors.
  for (let i = 0; i < 1000; i++) {
    const page: CaregiverFeedPage = buildCaregiverEventFeed({
      ...input,
      cursor: cursor ?? undefined,
    });
    events.push(...page.events);
    if (page.nextCursor === null) break;
    cursor = page.nextCursor;
  }
  return events;
}

/**
 * Group feed events by calendar day for the "Today / Yesterday /
 * Mon Jun 17" section headers many dashboards use.
 */
export interface FeedDayGroup {
  /** YYYY-MM-DD of the day in UTC (caller can re-render in local tz). */
  date: string;
  events: CaregiverEvent[];
}

export function groupFeedByDay(events: CaregiverEvent[]): FeedDayGroup[] {
  const map = new Map<string, CaregiverEvent[]>();
  for (const e of events) {
    const day = e.occurredAt.slice(0, 10);
    const list = map.get(day);
    if (list) list.push(e);
    else map.set(day, [e]);
  }
  const out: FeedDayGroup[] = [];
  for (const [date, evs] of map.entries()) out.push({ date, events: evs });
  out.sort((a, b) => (a.date < b.date ? 1 : -1));
  return out;
}
