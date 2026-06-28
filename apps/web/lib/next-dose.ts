/**
 * next-dose — compute the "next dose" countdown shown on the medication detail
 * hero. Pure date math, no React, so it can be unit tested deterministically by
 * passing an explicit `now`.
 *
 * Given a medication's dose events (already filtered to that medication), find
 * the most relevant pending dose and describe how far away it is. "Most
 * relevant" = the earliest pending dose that is not yet more than the grace
 * window overdue; if every pending dose is overdue, the latest overdue one is
 * surfaced so the user sees "X late" rather than a stale far-future time.
 */

export interface NextDoseInput {
  id: string;
  scheduledAt: string; // ISO
  status: 'pending' | 'taken' | 'skipped' | 'missed';
}

export type NextDoseTone = 'upcoming' | 'due' | 'overdue' | 'none';

export interface NextDoseResult {
  /** The dose id this countdown refers to, or null when nothing is pending. */
  doseId: string | null;
  /** Short human label: "in 2h 10m", "in 5m", "now", "20m late", "All done". */
  label: string;
  tone: NextDoseTone;
  /** Signed ms until the dose (negative = past). null when nothing pending. */
  deltaMs: number | null;
}

const GRACE_MS = 15 * 60_000;

export function computeNextDose(
  doses: readonly NextDoseInput[],
  now: number = Date.now(),
): NextDoseResult {
  const pending = doses
    .filter((d) => d.status === 'pending')
    .map((d) => ({ id: d.id, at: +new Date(d.scheduledAt) }))
    .filter((d) => Number.isFinite(d.at))
    .sort((a, b) => a.at - b.at);

  if (pending.length === 0) {
    return { doseId: null, label: 'All done', tone: 'none', deltaMs: null };
  }

  // Prefer the earliest dose that is still within (or ahead of) the grace
  // window. If all are well past, fall back to the latest overdue one.
  const upcoming = pending.find((d) => d.at >= now - GRACE_MS);
  const chosen = upcoming ?? pending[pending.length - 1]!;
  const delta = chosen.at - now;

  return {
    doseId: chosen.id,
    label: formatDelta(delta),
    tone: toneFor(delta),
    deltaMs: delta,
  };
}

export function toneFor(deltaMs: number): NextDoseTone {
  if (deltaMs < -GRACE_MS) return 'overdue';
  if (deltaMs <= GRACE_MS) return 'due';
  return 'upcoming';
}

export function formatDelta(deltaMs: number): string {
  const overdue = deltaMs < -GRACE_MS;
  const absMin = Math.round(Math.abs(deltaMs) / 60_000);
  const hrs = Math.floor(absMin / 60);
  const rem = absMin % 60;

  if (overdue) {
    return absMin < 60 ? `${absMin}m late` : `${hrs}h ${rem}m late`;
  }
  if (absMin < 1) return 'now';
  if (absMin < 60) return `in ${absMin}m`;
  return `in ${hrs}h ${rem}m`;
}

/** Capsule tone the next-dose chip maps to a colour on the medication hero. */
export type NextDoseChipTone = 'danger' | 'warn' | 'accent' | 'ok';

export interface NextDoseChip {
  /** Tone the renderer maps to a `capsule-*` class. */
  tone: NextDoseChipTone;
  /** Short prefix word, e.g. "overdue" / "due" / "next dose" / "today". */
  prefix: string;
}

const CHIP_BY_TONE: Record<NextDoseTone, NextDoseChip> = {
  overdue: { tone: 'danger', prefix: 'overdue' },
  due: { tone: 'warn', prefix: 'due' },
  upcoming: { tone: 'accent', prefix: 'next dose' },
  none: { tone: 'ok', prefix: 'today' },
};

/**
 * Map a NextDoseTone onto a capsule chip ({ tone, prefix }) so the medication
 * detail hero (and any future surface) stays a thin render instead of repeating
 * the tone -> colour/word ternary inline. Overdue is coral, due amber, an
 * upcoming dose the accent, and an all-done day a calm sage "today". Pure.
 */
export function nextDoseChip(tone: NextDoseTone): NextDoseChip {
  return CHIP_BY_TONE[tone];
}

/**
 * Full capsule text for the next-dose chip: "All done today" when nothing is
 * pending, otherwise "<prefix> · <label>" (e.g. "next dose · in 2h 10m",
 * "overdue · 20m late"). Reads the same NextDoseResult the hero already
 * computes so the chip's tone and text never disagree. Pure.
 */
export function nextDoseCapsuleText(result: Pick<NextDoseResult, 'tone' | 'label'>): string {
  if (result.tone === 'none') return 'All done today';
  return `${nextDoseChip(result.tone).prefix} · ${result.label}`;
}
