import { describe, it, expect } from 'vitest';
import {
  buildCaregiverEventFeed,
  collectCaregiverFeed,
  groupFeedByDay,
  type CaregiverEvent,
  type CaregiverEventKind,
} from '../src/caregiver-event-feed';
import {
  buildPermissionMatrix,
  type PermissionMatrix,
  type CaregiverPermissionInput,
} from '../src/caregiver-permission-matrix';

function matrixWith(
  scopes: Array<'view-meds' | 'view-adherence' | 'view-refills'>,
  overrides?: CaregiverPermissionInput['overrides'],
  expiresAt?: string | null,
): PermissionMatrix {
  return buildPermissionMatrix({
    share: {
      id: 'c-1',
      scopes,
      expiresAt: expiresAt ?? null,
    } as CaregiverPermissionInput['share'],
    overrides,
    now: new Date(2026, 5, 15),
  });
}

function ev(
  id: string,
  occurredAt: string,
  kind: CaregiverEventKind,
  medicationId: string | null,
  headline = `event ${id}`,
): CaregiverEvent {
  return { id, occurredAt, kind, medicationId, medicationName: medicationId ?? undefined, headline };
}

const FULL = matrixWith(['view-meds', 'view-adherence', 'view-refills']);

describe('buildCaregiverEventFeed', () => {
  it('returns the newest events first, up to pageSize', () => {
    const events = [
      ev('1', '2026-06-10T08:00:00.000Z', 'dose-taken', 'm-1'),
      ev('2', '2026-06-11T08:00:00.000Z', 'dose-taken', 'm-1'),
      ev('3', '2026-06-12T08:00:00.000Z', 'dose-taken', 'm-1'),
      ev('4', '2026-06-13T08:00:00.000Z', 'dose-taken', 'm-1'),
    ];
    const page = buildCaregiverEventFeed({ events, matrix: FULL, pageSize: 3 });
    expect(page.events.map((e) => e.id)).toEqual(['4', '3', '2']);
    expect(page.nextCursor).not.toBeNull();
  });

  it('returns the next page strictly older than the cursor', () => {
    const events = [
      ev('1', '2026-06-10T08:00:00.000Z', 'dose-taken', 'm-1'),
      ev('2', '2026-06-11T08:00:00.000Z', 'dose-taken', 'm-1'),
      ev('3', '2026-06-12T08:00:00.000Z', 'dose-taken', 'm-1'),
      ev('4', '2026-06-13T08:00:00.000Z', 'dose-taken', 'm-1'),
    ];
    const first = buildCaregiverEventFeed({ events, matrix: FULL, pageSize: 2 });
    expect(first.events.map((e) => e.id)).toEqual(['4', '3']);
    const second = buildCaregiverEventFeed({
      events,
      matrix: FULL,
      pageSize: 2,
      cursor: first.nextCursor!,
    });
    expect(second.events.map((e) => e.id)).toEqual(['2', '1']);
    expect(second.nextCursor).toBeNull();
  });

  it('filters events with no permission and counts them', () => {
    // view-meds only -> can NOT see dose-taken (needs view-adherence)
    const matrix = matrixWith(['view-meds']);
    const events = [
      ev('1', '2026-06-10T08:00:00.000Z', 'dose-taken', 'm-1'),
      ev('2', '2026-06-11T08:00:00.000Z', 'medication-added', 'm-1'),
    ];
    const page = buildCaregiverEventFeed({ events, matrix });
    expect(page.events.map((e) => e.id)).toEqual(['2']);
    expect(page.filteredCount).toBe(1);
    expect(page.totalVisible).toBe(1);
  });

  it('respects per-medication deny overrides', () => {
    const matrix = matrixWith(
      ['view-meds', 'view-adherence'],
      [
        // m-private: deny view-adherence so dose events for it are hidden
        { medicationId: 'm-private', deny: ['view-adherence'] },
      ],
    );
    const events = [
      ev('1', '2026-06-10T08:00:00.000Z', 'dose-taken', 'm-private'),
      ev('2', '2026-06-11T08:00:00.000Z', 'dose-taken', 'm-public'),
    ];
    const page = buildCaregiverEventFeed({ events, matrix });
    expect(page.events.map((e) => e.id)).toEqual(['2']);
    expect(page.filteredCount).toBe(1);
  });

  it('respects per-medication grant overrides', () => {
    const matrix = matrixWith(
      ['view-meds'],
      [
        // grant view-adherence on a specific medication
        { medicationId: 'm-1', grant: ['view-adherence'] },
      ],
    );
    const events = [
      ev('1', '2026-06-10T08:00:00.000Z', 'dose-taken', 'm-1'),
      ev('2', '2026-06-11T08:00:00.000Z', 'dose-taken', 'm-2'),
    ];
    const page = buildCaregiverEventFeed({ events, matrix });
    expect(page.events.map((e) => e.id)).toEqual(['1']);
  });

  it('returns nothing for an expired share', () => {
    const matrix = matrixWith(['view-meds', 'view-adherence', 'view-refills'], [], new Date(2026, 0, 1).toISOString());
    const events = [
      ev('1', '2026-06-10T08:00:00.000Z', 'dose-taken', 'm-1'),
      ev('2', '2026-06-11T08:00:00.000Z', 'refill-placed', 'm-1'),
    ];
    const page = buildCaregiverEventFeed({ events, matrix });
    expect(page.events).toHaveLength(0);
    expect(page.filteredCount).toBe(2);
    expect(page.totalVisible).toBe(0);
  });

  it('regimen-wide events (medicationId null) use global capability', () => {
    const onlyAdherence = matrixWith(['view-adherence']);
    const events = [
      ev('1', '2026-06-10T08:00:00.000Z', 'medication-added', null),
    ];
    expect(buildCaregiverEventFeed({ events, matrix: onlyAdherence }).events).toHaveLength(0);

    const withMeds = matrixWith(['view-meds']);
    expect(buildCaregiverEventFeed({ events, matrix: withMeds }).events).toHaveLength(1);
  });

  it('filters by kind list when provided', () => {
    const events = [
      ev('1', '2026-06-10T08:00:00.000Z', 'dose-taken', 'm-1'),
      ev('2', '2026-06-11T08:00:00.000Z', 'refill-placed', 'm-1'),
      ev('3', '2026-06-12T08:00:00.000Z', 'adverse-event', 'm-1'),
    ];
    const page = buildCaregiverEventFeed({ events, matrix: FULL, kinds: ['refill-placed', 'adverse-event'] });
    expect(page.events.map((e) => e.id).sort()).toEqual(['2', '3']);
  });

  it('ignores an empty kinds array (treats as no filter)', () => {
    const events = [
      ev('1', '2026-06-10T08:00:00.000Z', 'dose-taken', 'm-1'),
    ];
    const page = buildCaregiverEventFeed({ events, matrix: FULL, kinds: [] });
    expect(page.events).toHaveLength(1);
  });

  it('tie-breaks identical timestamps by id descending', () => {
    const events = [
      ev('a', '2026-06-10T08:00:00.000Z', 'dose-taken', 'm-1'),
      ev('b', '2026-06-10T08:00:00.000Z', 'dose-taken', 'm-1'),
      ev('c', '2026-06-10T08:00:00.000Z', 'dose-taken', 'm-1'),
    ];
    const page = buildCaregiverEventFeed({ events, matrix: FULL });
    expect(page.events.map((e) => e.id)).toEqual(['c', 'b', 'a']);
  });

  it('returns null nextCursor when fewer than pageSize remain', () => {
    const events = [
      ev('1', '2026-06-10T08:00:00.000Z', 'dose-taken', 'm-1'),
      ev('2', '2026-06-11T08:00:00.000Z', 'dose-taken', 'm-1'),
    ];
    const page = buildCaregiverEventFeed({ events, matrix: FULL, pageSize: 5 });
    expect(page.nextCursor).toBeNull();
    expect(page.events).toHaveLength(2);
  });

  it('handles a malformed cursor by returning the first page', () => {
    const events = [
      ev('1', '2026-06-10T08:00:00.000Z', 'dose-taken', 'm-1'),
      ev('2', '2026-06-11T08:00:00.000Z', 'dose-taken', 'm-1'),
    ];
    const page = buildCaregiverEventFeed({ events, matrix: FULL, cursor: 'garbage' });
    expect(page.events.map((e) => e.id)).toEqual(['2', '1']);
  });

  it('totalVisible reflects the matrix, not the kinds filter', () => {
    const events = [
      ev('1', '2026-06-10T08:00:00.000Z', 'dose-taken', 'm-1'),
      ev('2', '2026-06-11T08:00:00.000Z', 'refill-placed', 'm-1'),
      ev('3', '2026-06-12T08:00:00.000Z', 'adverse-event', 'm-1'),
    ];
    const page = buildCaregiverEventFeed({
      events,
      matrix: FULL,
      kinds: ['refill-placed'],
    });
    expect(page.totalVisible).toBe(3);
    expect(page.events).toHaveLength(1);
  });
});

describe('collectCaregiverFeed', () => {
  it('walks all pages until exhausted', () => {
    const events: CaregiverEvent[] = [];
    for (let i = 0; i < 50; i++) {
      events.push(ev(`e${i}`, `2026-06-${String((i % 28) + 1).padStart(2, '0')}T08:00:00.000Z`, 'dose-taken', 'm-1'));
    }
    const all = collectCaregiverFeed({ events, matrix: FULL, pageSize: 7 });
    expect(all).toHaveLength(50);
    // Newest first across the whole collection
    expect(all[0]!.occurredAt >= all[all.length - 1]!.occurredAt).toBe(true);
  });

  it('returns nothing when matrix is expired regardless of events', () => {
    const matrix = matrixWith(['view-meds', 'view-adherence'], [], new Date(2026, 0, 1).toISOString());
    const events = Array.from({ length: 30 }, (_, i) =>
      ev(`e${i}`, `2026-06-${String((i % 28) + 1).padStart(2, '0')}T08:00:00.000Z`, 'dose-taken', 'm-1'),
    );
    expect(collectCaregiverFeed({ events, matrix })).toEqual([]);
  });
});

describe('groupFeedByDay', () => {
  it('groups events by UTC calendar day, newest day first', () => {
    const events = [
      ev('1', '2026-06-10T08:00:00.000Z', 'dose-taken', 'm-1'),
      ev('2', '2026-06-10T20:00:00.000Z', 'dose-taken', 'm-1'),
      ev('3', '2026-06-11T08:00:00.000Z', 'dose-taken', 'm-1'),
    ];
    const groups = groupFeedByDay(events);
    expect(groups.map((g) => g.date)).toEqual(['2026-06-11', '2026-06-10']);
    expect(groups[1]!.events).toHaveLength(2);
  });

  it('handles an empty event list', () => {
    expect(groupFeedByDay([])).toEqual([]);
  });
});
