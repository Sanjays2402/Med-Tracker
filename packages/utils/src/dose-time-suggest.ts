/**
 * Suggest optimal dose times given quiet hours, meal windows, and
 * existing schedules.
 *
 * "When should I take this?" is a decision the app has enough context
 * to answer, not punt back to the user. Inputs:
 *
 *   - dosesPerDay (1..6) and an optional minimum spacing in hours,
 *   - quiet hours (no reminders fire inside this window),
 *   - food rules (with-food / empty-stomach for the new med),
 *   - meals[] the user typically eats (with categories — `food-windows`
 *     vocabulary so the two utilities compose directly),
 *   - existing scheduled doses[] across the rest of the regimen so
 *     the new med isn't piled on top of an already busy time.
 *
 * The suggester searches a grid of candidate HH:MM start times,
 * generates a full day's slots from each anchor by even spacing,
 * scores each slot against quiet-hours / meal-rule / clash penalties,
 * and returns the top-N anchor schedules with a breakdown of penalties
 * so the UI can render "8:00 + 20:00 (with breakfast and dinner)".
 *
 * Pure / deterministic. Times are HH:MM strings to match Schedule's
 * existing format. No timezone math beyond local minutes-of-day.
 */

import type { QuietHours } from './quiet-hours';
import { isInQuietHours } from './quiet-hours';
import type { FoodCategory, FoodRule } from './food-windows';

export interface MealHabit {
  /** Typical local HH:MM the user eats this meal. */
  at: string;
  /** Categories present (matches food-windows vocabulary). */
  categories: FoodCategory[];
  /** Optional label for the UI ("breakfast", "dinner"). */
  label?: string;
}

export interface ExistingDose {
  /** HH:MM time of an already scheduled dose elsewhere in the regimen. */
  at: string;
  /** True if this slot is on a sensitive medication that should not crowd. */
  sensitive?: boolean;
}

export interface DoseTimeSuggestionInput {
  /** How many times per day this medication is taken (1..6). */
  dosesPerDay: number;
  /** Minimum hours between consecutive doses. Default = 24 / dosesPerDay - 1. */
  minSpacingHours?: number;
  /** Quiet hours during which a dose should never be scheduled. */
  quiet?: QuietHours;
  /**
   * Food rules attached to this medication (e.g. metformin requires food).
   * The suggester treats `requires:true` as "anchor on a meal" and
   * `requires:false` (default) as "stay X minutes away from any meal of
   * this category".
   */
  foodRules?: FoodRule[];
  /** The user's typical meals/snacks throughout the day. */
  meals?: MealHabit[];
  /** Other scheduled doses across the regimen. */
  existing?: ExistingDose[];
  /**
   * Earliest minute of day the user is willing to take a dose. Default 06:00.
   * Same for latestMinute (default 23:00).
   */
  earliestMinute?: number;
  latestMinute?: number;
  /** Anchor candidate step in minutes. Default 30. */
  stepMinutes?: number;
  /** Number of suggestions to return. Default 3. */
  limit?: number;
}

export type SuggestionPenaltyKind =
  | 'quiet-hours'
  | 'food-required-missing'
  | 'food-forbidden-conflict'
  | 'existing-clash'
  | 'before-earliest'
  | 'after-latest'
  | 'spacing-too-tight';

export interface SuggestionPenalty {
  kind: SuggestionPenaltyKind;
  /** Slot HH:MM the penalty applies to. */
  slot: string;
  /** Magnitude in arbitrary units; higher = worse. */
  weight: number;
  /** Optional human-readable note for the UI. */
  note?: string;
}

export interface DoseSuggestion {
  /** Suggested HH:MM dose times, sorted ascending. */
  times: string[];
  /** Total penalty across all slots. 0 = perfect. */
  totalPenalty: number;
  penalties: SuggestionPenalty[];
  /** Plain-language description of the suggested schedule. */
  message: string;
}

const DAY_MIN = 24 * 60;

function parseHM(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return ((h ?? 0) * 60 + (m ?? 0)) % DAY_MIN;
}

function fmt(min: number): string {
  const m = ((min % DAY_MIN) + DAY_MIN) % DAY_MIN;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function quietFor(min: number, quiet?: QuietHours): boolean {
  if (!quiet) return false;
  const stub = new Date(2000, 0, 1, Math.floor(min / 60), min % 60);
  return isInQuietHours(stub, quiet);
}

/** Build evenly spaced slots from an anchor minute and dosesPerDay. */
function buildSlots(anchorMin: number, dosesPerDay: number): number[] {
  const gap = Math.round(DAY_MIN / dosesPerDay);
  const slots: number[] = [];
  for (let i = 0; i < dosesPerDay; i++) {
    slots.push((anchorMin + i * gap) % DAY_MIN);
  }
  slots.sort((a, b) => a - b);
  return slots;
}

/** Distance in minutes between two times-of-day, on the shorter arc. */
function dayDist(a: number, b: number): number {
  const d = Math.abs(a - b) % DAY_MIN;
  return Math.min(d, DAY_MIN - d);
}

function scoreSlot(
  slot: number,
  input: DoseTimeSuggestionInput,
): SuggestionPenalty[] {
  const penalties: SuggestionPenalty[] = [];
  const slotStr = fmt(slot);
  const earliest = input.earliestMinute ?? 6 * 60;
  const latest = input.latestMinute ?? 23 * 60;

  if (slot < earliest) {
    penalties.push({
      kind: 'before-earliest',
      slot: slotStr,
      weight: (earliest - slot) / 30,
      note: `Before ${fmt(earliest)}.`,
    });
  }
  if (slot > latest) {
    penalties.push({
      kind: 'after-latest',
      slot: slotStr,
      weight: (slot - latest) / 30,
      note: `After ${fmt(latest)}.`,
    });
  }

  if (quietFor(slot, input.quiet)) {
    penalties.push({
      kind: 'quiet-hours',
      slot: slotStr,
      weight: 5,
      note: `Inside quiet hours ${input.quiet?.start}-${input.quiet?.end}.`,
    });
  }

  // Food rules.
  if (input.foodRules?.length && input.meals?.length) {
    for (const rule of input.foodRules) {
      const window = Math.max(rule.minutesBefore, rule.minutesAfter);
      const matchingMeals = input.meals.filter((m) =>
        rule.category === 'any'
          ? m.categories.length > 0
          : m.categories.includes(rule.category),
      );
      const within = matchingMeals.filter((m) => dayDist(parseHM(m.at), slot) <= window);
      if (rule.requires) {
        if (within.length === 0) {
          // Find the nearest qualifying meal to report a distance for tuning.
          let nearest = Infinity;
          for (const m of matchingMeals) {
            nearest = Math.min(nearest, dayDist(parseHM(m.at), slot));
          }
          penalties.push({
            kind: 'food-required-missing',
            slot: slotStr,
            // Heavier penalty the further the nearest meal is. Cap at 6.
            weight: matchingMeals.length === 0 ? 6 : Math.min(6, nearest / 30),
            note: `${rule.description} (nearest meal is ${
              isFinite(nearest) ? `${Math.round(nearest)} min away` : 'absent'
            }).`,
          });
        }
      } else {
        for (const m of within) {
          const dist = dayDist(parseHM(m.at), slot);
          // Inside forbidden window: closer = worse. Inverse linear in [0..window].
          const closeness = 1 - dist / Math.max(1, window);
          penalties.push({
            kind: 'food-forbidden-conflict',
            slot: slotStr,
            weight: 1 + 3 * closeness,
            note: `${rule.description} (meal at ${m.at}).`,
          });
        }
      }
    }
  }

  // Existing dose clashes (within 30 min).
  if (input.existing?.length) {
    for (const e of input.existing) {
      const dist = dayDist(parseHM(e.at), slot);
      if (dist <= 30) {
        penalties.push({
          kind: 'existing-clash',
          slot: slotStr,
          // Sensitive meds carry double weight.
          weight: (e.sensitive ? 4 : 2) * (1 - dist / 30),
          note: `Clashes with existing dose at ${e.at}${e.sensitive ? ' (sensitive)' : ''}.`,
        });
      }
    }
  }

  return penalties;
}

/**
 * Suggest the top-N dose-time anchors.
 */
export function suggestDoseTimes(input: DoseTimeSuggestionInput): DoseSuggestion[] {
  if (input.dosesPerDay < 1 || input.dosesPerDay > 6) {
    throw new Error('dosesPerDay must be in 1..6');
  }
  const step = input.stepMinutes ?? 30;
  const limit = input.limit ?? 3;
  const minSpacing =
    input.minSpacingHours != null
      ? Math.round(input.minSpacingHours * 60)
      : Math.max(60, Math.floor(DAY_MIN / input.dosesPerDay) - 60);

  // Enumerate anchors from 00:00 to 23:30 in `step` minutes; each anchor
  // produces a full day of evenly spaced slots. Score and rank.
  const candidates: DoseSuggestion[] = [];
  for (let anchor = 0; anchor < DAY_MIN; anchor += step) {
    const slots = buildSlots(anchor, input.dosesPerDay);

    // Reject anchors where two consecutive slots are too close.
    let spacingOk = true;
    let spacingPenalty: SuggestionPenalty | null = null;
    for (let i = 1; i < slots.length; i++) {
      const gap = slots[i]! - slots[i - 1]!;
      if (gap < minSpacing) {
        spacingOk = false;
        spacingPenalty = {
          kind: 'spacing-too-tight',
          slot: fmt(slots[i]!),
          weight: (minSpacing - gap) / 30,
          note: `Only ${gap} min after ${fmt(slots[i - 1]!)}.`,
        };
        break;
      }
    }
    if (!spacingOk && spacingPenalty) {
      // Still include with a heavy spacing penalty so dosesPerDay=1 always
      // produces a result even with awkward inputs.
      const all: SuggestionPenalty[] = [spacingPenalty];
      for (const slot of slots) all.push(...scoreSlot(slot, input));
      candidates.push({
        times: slots.map(fmt),
        totalPenalty: all.reduce((s, p) => s + p.weight, 0) + 10,
        penalties: all,
        message: buildMessage(slots, all, input),
      });
      continue;
    }

    const all: SuggestionPenalty[] = [];
    for (const slot of slots) all.push(...scoreSlot(slot, input));
    candidates.push({
      times: slots.map(fmt),
      totalPenalty: Number(all.reduce((s, p) => s + p.weight, 0).toFixed(4)),
      penalties: all,
      message: buildMessage(slots, all, input),
    });
  }

  // Deduplicate by time string set (anchors that produce identical slots
  // when dosesPerDay divides DAY_MIN evenly).
  const seen = new Set<string>();
  const unique: DoseSuggestion[] = [];
  for (const c of candidates) {
    const key = c.times.join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(c);
  }

  unique.sort((a, b) => {
    if (a.totalPenalty !== b.totalPenalty) return a.totalPenalty - b.totalPenalty;
    // Tiebreak: earlier first slot wins (less likely to disrupt morning).
    return parseHM(a.times[0]!) - parseHM(b.times[0]!);
  });
  return unique.slice(0, limit);
}

function buildMessage(
  slots: number[],
  penalties: SuggestionPenalty[],
  _input: DoseTimeSuggestionInput,
): string {
  const times = slots.map(fmt).join(', ');
  const issueCount = penalties.length;
  if (issueCount === 0) return `Take at ${times}. No conflicts with quiet hours, meals, or existing doses.`;
  return `Take at ${times}. ${issueCount} consideration${issueCount === 1 ? '' : 's'}.`;
}

/** Convenience: the single best suggestion, or null if input is impossible. */
export function bestDoseTimes(input: DoseTimeSuggestionInput): DoseSuggestion | null {
  return suggestDoseTimes({ ...input, limit: 1 })[0] ?? null;
}
