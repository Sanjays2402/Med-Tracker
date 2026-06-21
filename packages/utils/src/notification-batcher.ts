/**
 * Notification batching.
 *
 * A patient with multiple medications often has several doses due within a
 * few minutes of each other ("08:00 metformin, 08:00 lisinopril, 08:05
 * atorvastatin"). Firing three notifications inside one minute teaches the
 * patient to dismiss them en masse, which is the worst possible outcome
 * for a reminder system.
 *
 * `batchNotifications` walks a chronologically sorted list of pending
 * reminders and groups any that fall within a configurable window (default
 * 10 minutes) into a single combined notification. The output preserves
 * the per-reminder details so the UI can render a single banner with a
 * "3 doses due" subtitle and a tap-to-expand list.
 *
 * Batching respects two important constraints:
 *
 *   - **Critical reminders bypass batching.** A reminder flagged
 *     `priority: 'critical'` (e.g. insulin, opioid antagonist) always
 *     fires on its own with no batching, even if it overlaps others.
 *   - **Quiet hours interact correctly.** If the window straddles the
 *     start of quiet hours, only reminders before quiet-hours go in the
 *     batch; the post-quiet reminders form their own batch.
 *
 * Pure / deterministic. The caller supplies the cutoffs.
 */

export type ReminderPriority = 'critical' | 'normal' | 'low';

export interface PendingReminder {
  id: string;
  /** ISO timestamp when the reminder should fire. */
  fireAt: string;
  medicationId: string;
  medicationName: string;
  /** Display dose, e.g. "500 mg" or "1 tablet". */
  dose?: string;
  priority?: ReminderPriority;
}

export interface NotificationBatch {
  /** Time the batch should fire (first reminder's fireAt). */
  fireAt: string;
  /** All reminders included in this batch (length >= 1). */
  reminders: PendingReminder[];
  /** Compact title for the OS notification. */
  title: string;
  /** Multi-line body for the OS notification. */
  body: string;
  /** True when this batch contains exactly one reminder. */
  single: boolean;
  /** Highest priority among all reminders. */
  priority: ReminderPriority;
}

export interface BatchOptions {
  /** Coalesce window in minutes. Default 10. */
  windowMinutes?: number;
  /**
   * Quiet hours [startMinute, endMinute] of the day (00:00 = 0, 23:59 = 1439).
   * Reminders that fall inside this window are excluded from the batch (the
   * caller is responsible for re-scheduling them).
   */
  quietHours?: { startMinute: number; endMinute: number };
  /** Maximum reminders per batch. Default unlimited. */
  maxPerBatch?: number;
}

const PRIORITY_RANK: Record<ReminderPriority, number> = {
  critical: 2,
  normal: 1,
  low: 0,
};

function isInQuietWindow(at: Date, q: BatchOptions['quietHours']): boolean {
  if (!q) return false;
  const m = at.getHours() * 60 + at.getMinutes();
  if (q.startMinute <= q.endMinute) {
    return m >= q.startMinute && m < q.endMinute;
  }
  // Wraps midnight (e.g. 22:00 -> 07:00).
  return m >= q.startMinute || m < q.endMinute;
}

function maxPriority(a: ReminderPriority, b: ReminderPriority): ReminderPriority {
  return PRIORITY_RANK[a] >= PRIORITY_RANK[b] ? a : b;
}

function buildBatch(reminders: PendingReminder[]): NotificationBatch {
  const sorted = [...reminders].sort(
    (a, b) => new Date(a.fireAt).getTime() - new Date(b.fireAt).getTime(),
  );
  const priority = sorted.reduce<ReminderPriority>(
    (acc, r) => maxPriority(acc, r.priority ?? 'normal'),
    'low',
  );
  const single = sorted.length === 1;
  const title = single
    ? `Take ${sorted[0]!.medicationName}${sorted[0]!.dose ? ` (${sorted[0]!.dose})` : ''}`
    : `${sorted.length} doses due`;
  const body = single
    ? `Time for your ${sorted[0]!.medicationName}.`
    : sorted
        .map((r) => `• ${r.medicationName}${r.dose ? ` — ${r.dose}` : ''}`)
        .join('\n');
  return {
    fireAt: sorted[0]!.fireAt,
    reminders: sorted,
    title,
    body,
    single,
    priority,
  };
}

export function batchNotifications(
  reminders: PendingReminder[],
  options: BatchOptions = {},
): NotificationBatch[] {
  const windowMs = (options.windowMinutes ?? 10) * 60_000;
  const maxPerBatch = options.maxPerBatch ?? Infinity;

  // Filter out reminders during quiet hours.
  const active = reminders.filter(
    (r) => !isInQuietWindow(new Date(r.fireAt), options.quietHours),
  );

  // Separate critical reminders — they NEVER batch with others. We handle
  // them as singleton batches and then weave them back into the sorted
  // output at the end.
  const criticals = active.filter((r) => r.priority === 'critical');
  const normals = active.filter((r) => r.priority !== 'critical');

  // Sort normals chronologically and walk into windowed buckets.
  const sortedNormals = [...normals].sort(
    (a, b) => new Date(a.fireAt).getTime() - new Date(b.fireAt).getTime(),
  );

  const batches: NotificationBatch[] = [];
  let bucket: PendingReminder[] = [];
  let bucketStart = 0;

  const flush = (): void => {
    if (bucket.length > 0) {
      batches.push(buildBatch(bucket));
      bucket = [];
    }
  };

  for (const r of sortedNormals) {
    const t = new Date(r.fireAt).getTime();
    if (bucket.length === 0) {
      bucket.push(r);
      bucketStart = t;
      continue;
    }
    if (t - bucketStart <= windowMs && bucket.length < maxPerBatch) {
      bucket.push(r);
    } else {
      flush();
      bucket.push(r);
      bucketStart = t;
    }
  }
  flush();

  // Emit each critical as its own batch.
  for (const c of criticals) batches.push(buildBatch([c]));

  // Stable chronological order across normals + criticals.
  batches.sort((a, b) => new Date(a.fireAt).getTime() - new Date(b.fireAt).getTime());
  return batches;
}

/**
 * Convenience: count how many notifications were saved by batching.
 * Useful for telemetry ("batched 12 reminders into 4 notifications").
 */
export function countSavedNotifications(
  reminders: PendingReminder[],
  batches: NotificationBatch[],
): number {
  return Math.max(0, reminders.length - batches.length);
}
