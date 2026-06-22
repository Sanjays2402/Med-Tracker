/**
 * Refusal reason suggest.
 *
 * `medication-refusal-log` accepts a controlled vocabulary of refusal
 * reasons (sleeping, npo, nausea, etc) and uses them to compute
 * honest adherence + tolerability flags. The vocabulary is small on
 * purpose — patients won't pick from a 20-option list when they're
 * already saying "skip this dose."
 *
 * But the patient UI still has to make the picker fast: showing 10
 * radio buttons every time means most refusals get logged as
 * `declined` (the path of least resistance), which destroys the
 * signal in honest-adherence math.
 *
 * This module suggests a likely refusal reason given the dose's
 * context — the time-of-day, any known sleeping window, any known
 * procedure/NPO date, the most-recent refusal pattern for THIS
 * medication. The UI then pre-selects that reason in the picker;
 * the patient confirms or overrides with one tap. We don't
 * auto-apply — the patient is always the source of truth.
 *
 * Suggestion sources (priority order):
 *   1. NPO date match: scheduled date falls inside a known
 *      procedure / NPO window -> 'npo'.
 *   2. Prescriber pause window: dose date falls inside a
 *      prescriber-paused interval -> 'prescriber-paused'.
 *   3. Out-of-supply: medication supplyRemaining <= 0 at dose
 *      time -> 'out-of-supply'.
 *   4. Sleeping window: dose time-of-day falls inside the
 *      patient's sleep window AND the medication isn't a known
 *      rescue/sleeping med -> 'sleeping'.
 *   5. Pattern history: medication has >= 2 of the same reason
 *      in the last 30 days AND this dose doesn't match any of the
 *      higher-priority rules -> that reason (e.g. nausea).
 *
 * Pure / deterministic. No I/O. No clinical inference beyond the
 * rule-based composition above.
 */

import type { Dose } from '@med/types';
import type {
  NormalizedRefusal,
  RefusalReasonCode,
} from './medication-refusal-log';
import { isInQuietHours, type QuietHours } from './quiet-hours';

export interface SleepingWindow {
  /** Local-time HH:MM start of nightly sleep window. */
  start: string;
  /** Local-time HH:MM end of nightly sleep window. */
  end: string;
}

export interface NpoWindow {
  /** ISO date (YYYY-MM-DD) when NPO starts (inclusive). */
  startDate: string;
  /** ISO date when NPO ends (inclusive). */
  endDate: string;
  /** Optional context: procedure type, surgeon, location. */
  reason?: string;
}

export interface PrescriberPauseWindow {
  /** Medication id this pause applies to. */
  medicationId: string;
  /** ISO date pause starts (inclusive). */
  startDate: string;
  /** ISO date pause ends (inclusive). */
  endDate: string;
  /** Optional context (e.g. "hold for INR check"). */
  reason?: string;
}

export interface RefusalReasonSuggestInput {
  /** The dose the patient is about to mark as refused. */
  dose: Dose;
  /**
   * Medication snapshot at the dose's effective time. We only need
   * id + active + supplyRemaining + (optional) form to make a
   * decision; full Medication shape would tie us to other fields we
   * don't read.
   */
  medication: {
    id: string;
    supplyRemaining: number;
    /** Tag that suppresses the 'sleeping' suggestion for sleep-aids
     *  / overnight rescue meds where the sleeping rule is wrong. */
    isOvernightMed?: boolean;
  };
  /** Known sleeping window for the patient. Optional. */
  sleeping?: SleepingWindow;
  /** Known NPO / procedure windows for the patient. */
  npoWindows?: NpoWindow[];
  /** Active prescriber pauses across the regimen. */
  prescriberPauses?: PrescriberPauseWindow[];
  /** Recent refusal history (last ~30d) for the same patient. */
  recentRefusals?: NormalizedRefusal[];
  /** Reference clock for "recent" history. Default new Date(). */
  now?: Date;
  /**
   * Days back from `now` that count as recent for the pattern rule.
   * Default 30.
   */
  patternWindowDays?: number;
  /**
   * Minimum same-reason count required for a pattern-based
   * suggestion to fire. Default 2.
   */
  patternMinCount?: number;
}

export interface RefusalReasonSuggestion {
  reason: RefusalReasonCode;
  /**
   * Why we chose this. Stable identifier so the UI can map to a
   * tooltip / explanation without parsing strings.
   */
  source:
    | 'npo-window'
    | 'prescriber-pause'
    | 'out-of-supply'
    | 'sleeping-window'
    | 'recent-pattern';
  /** 0..1 confidence. Higher = more certain. UI may suppress < 0.5. */
  confidence: number;
  /** Plain-English explanation for the picker tooltip. */
  explanation: string;
}

export interface RefusalReasonSuggestResult {
  /** Best suggestion (highest priority + confidence). Null when no rule fires. */
  suggested: RefusalReasonSuggestion | null;
  /** All rules that fired, in priority order. UI can show as alternatives. */
  alternatives: RefusalReasonSuggestion[];
}

function parseLocalIso(s: string): Date | null {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y!, m! - 1, d!);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isDateInRange(d: Date, startIso: string, endIso: string): boolean {
  const start = parseLocalIso(startIso);
  const end = parseLocalIso(endIso);
  if (!start || !end) return false;
  const t = dateOnly(d).getTime();
  return t >= dateOnly(start).getTime() && t <= dateOnly(end).getTime();
}

function suggestNpo(input: RefusalReasonSuggestInput, doseAt: Date): RefusalReasonSuggestion | null {
  const windows = input.npoWindows ?? [];
  for (const w of windows) {
    if (isDateInRange(doseAt, w.startDate, w.endDate)) {
      const reason = w.reason ? ` (${w.reason})` : '';
      return {
        reason: 'npo',
        source: 'npo-window',
        confidence: 0.95,
        explanation: `Scheduled date falls inside a known NPO window${reason}.`,
      };
    }
  }
  return null;
}

function suggestPause(
  input: RefusalReasonSuggestInput,
  doseAt: Date,
): RefusalReasonSuggestion | null {
  const pauses = input.prescriberPauses ?? [];
  for (const p of pauses) {
    if (p.medicationId !== input.medication.id) continue;
    if (isDateInRange(doseAt, p.startDate, p.endDate)) {
      const reason = p.reason ? ` (${p.reason})` : '';
      return {
        reason: 'prescriber-paused',
        source: 'prescriber-pause',
        confidence: 0.9,
        explanation: `Prescriber paused this medication for the current window${reason}.`,
      };
    }
  }
  return null;
}

function suggestOutOfSupply(input: RefusalReasonSuggestInput): RefusalReasonSuggestion | null {
  if (input.medication.supplyRemaining <= 0) {
    return {
      reason: 'out-of-supply',
      source: 'out-of-supply',
      confidence: 0.85,
      explanation: 'No supply remaining for this medication on the dose date.',
    };
  }
  return null;
}

function suggestSleeping(
  input: RefusalReasonSuggestInput,
  doseAt: Date,
): RefusalReasonSuggestion | null {
  if (input.medication.isOvernightMed) return null;
  if (!input.sleeping) return null;
  const quiet: QuietHours = { start: input.sleeping.start, end: input.sleeping.end };
  if (!isInQuietHours(doseAt, quiet)) return null;
  return {
    reason: 'sleeping',
    source: 'sleeping-window',
    confidence: 0.7,
    explanation: `Scheduled time ${formatHHMM(doseAt)} falls inside the patient's sleep window (${input.sleeping.start}–${input.sleeping.end}).`,
  };
}

function formatHHMM(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function suggestPattern(
  input: RefusalReasonSuggestInput,
  doseAt: Date,
): RefusalReasonSuggestion | null {
  const refusals = input.recentRefusals ?? [];
  if (refusals.length === 0) return null;
  const now = input.now ?? new Date();
  const windowDays = input.patternWindowDays ?? 30;
  const minCount = input.patternMinCount ?? 2;
  const cutoffMs = dateOnly(now).getTime() - windowDays * 86_400_000;

  const counts = new Map<RefusalReasonCode, number>();
  for (const r of refusals) {
    if (r.medicationId !== input.medication.id) continue;
    const loggedMs = Date.parse(r.loggedAt);
    if (!Number.isFinite(loggedMs) || loggedMs < cutoffMs) continue;
    counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);
  }
  if (counts.size === 0) return null;

  // Pick the highest-count reason. Tie-break: prefer tolerability
  // signals (nausea > side-effect) because they're the most
  // actionable for de-prescribing review. Then alphabetical.
  const sorted = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    const aPri = a[0] === 'nausea' ? 2 : a[0] === 'side-effect' ? 1 : 0;
    const bPri = b[0] === 'nausea' ? 2 : b[0] === 'side-effect' ? 1 : 0;
    if (aPri !== bPri) return bPri - aPri;
    return a[0].localeCompare(b[0]);
  });
  const [topReason, topCount] = sorted[0]!;
  if (topCount < minCount) return null;
  // Suppress the pattern suggestion if the higher-priority rules
  // would already explain the dose. The orchestrator handles that by
  // calling these rules in order; pattern only fires when nothing
  // else matched.
  void doseAt;
  return {
    reason: topReason,
    source: 'recent-pattern',
    confidence: Math.min(0.65, 0.4 + topCount * 0.05),
    explanation: `Patient refused this medication ${topCount} time${topCount === 1 ? '' : 's'} in the last ${windowDays} days citing "${topReason}".`,
  };
}

/**
 * Compute the most likely refusal reason for a dose. Returns the
 * highest-priority rule that fires plus the full ordered list as
 * `alternatives` so the UI can offer fallbacks. Result.suggested is
 * null when no rule fires at all — the picker should then default to
 * an empty selection (forcing the patient to choose, which is the
 * right outcome when we have no signal).
 */
export function suggestRefusalReason(
  input: RefusalReasonSuggestInput,
): RefusalReasonSuggestResult {
  const doseAt = parseLocalIso(input.dose.dueAt);
  if (!doseAt) return { suggested: null, alternatives: [] };

  const rules: (RefusalReasonSuggestion | null)[] = [
    suggestNpo(input, doseAt),
    suggestPause(input, doseAt),
    suggestOutOfSupply(input),
    suggestSleeping(input, doseAt),
    suggestPattern(input, doseAt),
  ];
  const alternatives = rules.filter((x): x is RefusalReasonSuggestion => x !== null);
  return {
    suggested: alternatives[0] ?? null,
    alternatives,
  };
}

/**
 * Convenience: suggest a reason for a BATCH of doses. Returns a map
 * keyed by Dose.id. Doses without a suggested reason are absent
 * from the map (caller can fall back to whatever default they like).
 */
export function suggestRefusalReasonsBatch(
  doses: Dose[],
  context: Omit<RefusalReasonSuggestInput, 'dose'>,
): Map<string, RefusalReasonSuggestion> {
  const out = new Map<string, RefusalReasonSuggestion>();
  for (const d of doses) {
    const result = suggestRefusalReason({ ...context, dose: d });
    if (result.suggested) out.set(d.id, result.suggested);
  }
  return out;
}
