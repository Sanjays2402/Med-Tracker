/**
 * Regimen snapshot archive history rollup.
 *
 * `regimen-snapshot-archive` produces signed snapshots of a regimen
 * at a moment in time. A patient over a year accumulates several:
 * one each quarter, one before every hospitalisation, one at every
 * new clinician. Those snapshots are the closest thing to a real
 * audit trail of "what was I on, when?".
 *
 * `diffRegimenSnapshots` already compares two adjacent snapshots
 * and returns add/remove/strength-change. This module rolls a
 * chronological LIST of snapshots into a per-medication timeline:
 *
 *   - When did each medication first appear?
 *   - When was it removed?
 *   - Every strength change in between, with the before -> after
 *     values + the snapshot id of the change.
 *
 * Output is a per-medication record with a chronological event list
 * (added / removed / strength-change) and a cross-snapshot timeline
 * of regimen size. The de-prescribing review reads the timeline to
 * find "drug X has been on the list for 18 months with no clinical
 * indication recorded" or "drug Y was titrated 5 -> 10 -> 20 mg
 * across three quarters but never tapered back."
 *
 * We deliberately ignore prescriber / pharmacy joins in the timeline
 * — those churn for non-clinical reasons (insurance changes, locums,
 * pharmacy mergers) and the noise would crowd out the strength /
 * presence changes the prescriber actually cares about.
 *
 * Pure / deterministic. No I/O. Composes diffRegimenSnapshots
 * pairwise so we always agree with single-snapshot comparisons.
 */

import {
  diffRegimenSnapshots,
  type SnapshotPayload,
  type SnapshotPayloadItem,
  type SignedRegimenSnapshot,
} from './regimen-snapshot-archive';

export type RegimenHistoryEventKind = 'added' | 'removed' | 'strength-change';

export interface RegimenHistoryEvent {
  kind: RegimenHistoryEventKind;
  /** Snapshot id where the change was observed. */
  snapshotId: string;
  /** Snapshot takenAt timestamp where the change was observed (ISO). */
  observedAt: string;
  /** Strength before the change (strength-change events only). */
  before?: string;
  /** Strength after the change (added + strength-change events). */
  after?: string;
}

export interface RegimenMedicationHistory {
  medicationId: string;
  /** Most recent known name (medications get renamed over time). */
  name: string;
  /** Snapshot id where this med first appears, or null when present in the first snapshot. */
  firstSeenSnapshotId: string;
  /** Snapshot takenAt where this med first appears (ISO). */
  firstSeenAt: string;
  /** Snapshot id where this med last appears. */
  lastSeenSnapshotId: string;
  /** Snapshot takenAt where this med last appears (ISO). */
  lastSeenAt: string;
  /** True when the med disappeared before the most recent snapshot. */
  removed: boolean;
  /** Chronological events affecting this medication. */
  events: RegimenHistoryEvent[];
}

export interface RegimenSnapshotTimelineEntry {
  snapshotId: string;
  takenAt: string;
  itemCount: number;
  /** Net change in itemCount versus the previous snapshot. */
  delta: number;
}

export interface RegimenHistoryRollup {
  /** Snapshot count rolled up. */
  snapshotCount: number;
  /** Snapshot id ordering (oldest first). */
  snapshotIds: string[];
  /** Per-medication chronological history. */
  perMedication: RegimenMedicationHistory[];
  /** Per-snapshot itemCount timeline (oldest first). */
  timeline: RegimenSnapshotTimelineEntry[];
  /** Total event count across all medications. */
  eventCount: number;
  /** Medication ids that were ADDED then REMOVED in this window. */
  cycledMedicationIds: string[];
}

function ensureSorted(snapshots: SnapshotPayload[]): SnapshotPayload[] {
  const copy = snapshots.slice();
  copy.sort((a, b) => {
    const ta = Date.parse(a.takenAt);
    const tb = Date.parse(b.takenAt);
    if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
    return a.snapshotId.localeCompare(b.snapshotId);
  });
  return copy;
}

function itemsByIdMap(s: SnapshotPayload): Map<string, SnapshotPayloadItem> {
  return new Map(s.items.map((it) => [it.medicationId, it]));
}

/**
 * Roll a list of snapshot PAYLOADS (already verified upstream by the
 * caller) into a per-medication timeline. Snapshots are sorted by
 * takenAt ascending before rollup so the caller can pass them in any
 * order.
 *
 * Returns an empty rollup for an empty input. A single snapshot
 * produces a per-medication history with `added` events for each
 * medication (firstSeen / lastSeen both equal to that snapshot) and
 * no `removed` / `strength-change` events.
 */
export function rollupRegimenHistory(
  snapshots: SnapshotPayload[],
): RegimenHistoryRollup {
  if (snapshots.length === 0) {
    return {
      snapshotCount: 0,
      snapshotIds: [],
      perMedication: [],
      timeline: [],
      eventCount: 0,
      cycledMedicationIds: [],
    };
  }
  const sorted = ensureSorted(snapshots);

  // Per-medication state: track first/last/most-recent-name + events.
  type Acc = {
    medicationId: string;
    name: string;
    firstSeenSnapshotId: string;
    firstSeenAt: string;
    lastSeenSnapshotId: string;
    lastSeenAt: string;
    lastKnownStrength: string;
    events: RegimenHistoryEvent[];
  };
  const acc = new Map<string, Acc>();
  const timeline: RegimenSnapshotTimelineEntry[] = [];
  let prevItems: Map<string, SnapshotPayloadItem> | null = null;

  for (const snap of sorted) {
    const currentItems = itemsByIdMap(snap);
    // Initial seed snapshot: every medication is "added".
    if (prevItems === null) {
      for (const it of snap.items) {
        const events: RegimenHistoryEvent[] = [
          {
            kind: 'added',
            snapshotId: snap.snapshotId,
            observedAt: snap.takenAt,
            after: it.strength,
          },
        ];
        acc.set(it.medicationId, {
          medicationId: it.medicationId,
          name: it.name,
          firstSeenSnapshotId: snap.snapshotId,
          firstSeenAt: snap.takenAt,
          lastSeenSnapshotId: snap.snapshotId,
          lastSeenAt: snap.takenAt,
          lastKnownStrength: it.strength,
          events,
        });
      }
      timeline.push({
        snapshotId: snap.snapshotId,
        takenAt: snap.takenAt,
        itemCount: snap.itemCount,
        delta: 0,
      });
      prevItems = currentItems;
      continue;
    }

    const diff = diffRegimenSnapshots(
      // Reconstruct a SnapshotPayload-shaped object for diff. We only
      // need items + minimal envelope; takenAt/snapshotId not used in
      // the diff so just pass an object with items.
      { items: [...prevItems.values()] } as SnapshotPayload,
      snap,
    );

    // Strength change events.
    for (const sc of diff.strengthChanged) {
      const a = acc.get(sc.medicationId);
      if (!a) continue;
      a.events.push({
        kind: 'strength-change',
        snapshotId: snap.snapshotId,
        observedAt: snap.takenAt,
        before: sc.before,
        after: sc.after,
      });
      a.lastKnownStrength = sc.after;
    }

    // Added events.
    for (const ad of diff.added) {
      const item = currentItems.get(ad.medicationId);
      if (!item) continue;
      const existing = acc.get(ad.medicationId);
      if (existing) {
        // Medication was previously removed and is now back — record
        // a fresh 'added' event and reset firstSeen to this snapshot.
        existing.events.push({
          kind: 'added',
          snapshotId: snap.snapshotId,
          observedAt: snap.takenAt,
          after: item.strength,
        });
        existing.lastKnownStrength = item.strength;
        // first-seen is preserved as the ORIGINAL first appearance —
        // a re-add after removal does NOT reset firstSeen because we
        // want the timeline to reflect the cumulative tenure.
      } else {
        acc.set(ad.medicationId, {
          medicationId: ad.medicationId,
          name: item.name,
          firstSeenSnapshotId: snap.snapshotId,
          firstSeenAt: snap.takenAt,
          lastSeenSnapshotId: snap.snapshotId,
          lastSeenAt: snap.takenAt,
          lastKnownStrength: item.strength,
          events: [
            {
              kind: 'added',
              snapshotId: snap.snapshotId,
              observedAt: snap.takenAt,
              after: item.strength,
            },
          ],
        });
      }
    }

    // Removed events.
    for (const rm of diff.removed) {
      const a = acc.get(rm.medicationId);
      if (!a) continue;
      a.events.push({
        kind: 'removed',
        snapshotId: snap.snapshotId,
        observedAt: snap.takenAt,
      });
    }

    // Update lastSeen for medications still present.
    for (const it of snap.items) {
      const a = acc.get(it.medicationId);
      if (a) {
        a.lastSeenSnapshotId = snap.snapshotId;
        a.lastSeenAt = snap.takenAt;
        a.name = it.name;
      }
    }

    const prevCount = prevItems.size;
    timeline.push({
      snapshotId: snap.snapshotId,
      takenAt: snap.takenAt,
      itemCount: snap.itemCount,
      delta: snap.itemCount - prevCount,
    });
    prevItems = currentItems;
  }

  // Determine `removed` flag per medication (med is "removed" when
  // not present in the most recent snapshot OR its most recent event
  // is a 'removed' event without a subsequent 'added').
  const lastSnap = sorted[sorted.length - 1]!;
  const lastIds = new Set(lastSnap.items.map((it) => it.medicationId));

  const perMedication: RegimenMedicationHistory[] = [];
  const cycledIds: string[] = [];
  for (const a of acc.values()) {
    const removed = !lastIds.has(a.medicationId);
    // Cycled = at least one 'removed' event followed by an 'added' event.
    let sawRemoved = false;
    let cycled = false;
    for (const ev of a.events) {
      if (ev.kind === 'removed') sawRemoved = true;
      else if (ev.kind === 'added' && sawRemoved) cycled = true;
    }
    if (cycled) cycledIds.push(a.medicationId);
    perMedication.push({
      medicationId: a.medicationId,
      name: a.name,
      firstSeenSnapshotId: a.firstSeenSnapshotId,
      firstSeenAt: a.firstSeenAt,
      lastSeenSnapshotId: a.lastSeenSnapshotId,
      lastSeenAt: a.lastSeenAt,
      removed,
      events: a.events,
    });
  }
  perMedication.sort((x, y) => x.name.localeCompare(y.name));
  cycledIds.sort();

  const eventCount = perMedication.reduce((acc, m) => acc + m.events.length, 0);

  return {
    snapshotCount: sorted.length,
    snapshotIds: sorted.map((s) => s.snapshotId),
    perMedication,
    timeline,
    eventCount,
    cycledMedicationIds: cycledIds,
  };
}

/**
 * Convenience: roll up a list of SignedRegimenSnapshot envelopes
 * (caller has already verified them). Just unwraps `.payload` and
 * delegates to rollupRegimenHistory.
 */
export function rollupSignedRegimenSnapshots(
  envelopes: SignedRegimenSnapshot[],
): RegimenHistoryRollup {
  return rollupRegimenHistory(envelopes.map((e) => e.payload));
}

/**
 * Convenience: filter the perMedication list to medications that
 * have been present for the FULL snapshot window (firstSeen ==
 * earliest snapshot AND not removed). Useful for "long-term
 * maintenance" rollups.
 */
export function filterLongTermMedications(
  rollup: RegimenHistoryRollup,
): RegimenMedicationHistory[] {
  if (rollup.snapshotIds.length === 0) return [];
  const earliest = rollup.snapshotIds[0]!;
  return rollup.perMedication.filter(
    (m) => m.firstSeenSnapshotId === earliest && !m.removed,
  );
}

/**
 * Convenience: filter to medications that had at least one strength
 * change in the window — the prescriber's "what's been titrated"
 * list.
 */
export function filterTitratedMedications(
  rollup: RegimenHistoryRollup,
): RegimenMedicationHistory[] {
  return rollup.perMedication.filter((m) =>
    m.events.some((e) => e.kind === 'strength-change'),
  );
}
