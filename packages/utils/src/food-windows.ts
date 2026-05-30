/**
 * Food and fasting window validator.
 *
 * Many medications carry food-timing rules that materially affect
 * absorption and safety:
 *
 *   - Levothyroxine: empty stomach, no food for 30-60 min after.
 *   - Bisphosphonates (alendronate): empty stomach, 30 min upright,
 *     no food/drink other than plain water.
 *   - Tetracycline / ciprofloxacin: avoid dairy and calcium for
 *     2 hours before and 4-6 hours after.
 *   - Metformin: take *with* food to reduce GI upset.
 *   - MAOIs: lifelong avoidance of tyramine-rich foods.
 *
 * Given a planned dose time and a log of meals (or specific food
 * categories like "dairy", "tyramine"), this module reports which
 * rules would be violated and proposes the nearest compliant time
 * by sliding the dose forward or backward inside an allowed window.
 *
 * Pure. Times are ISO timestamps. Window math is in minutes.
 */

export type FoodCategory =
  | 'any'
  | 'dairy'
  | 'calcium'
  | 'grapefruit'
  | 'tyramine'
  | 'alcohol'
  | 'high-fat';

export interface MealEvent {
  /** ISO timestamp the meal/food was consumed. */
  at: string;
  /** Categories present in this meal. 'any' means generic food/drink besides water. */
  categories: FoodCategory[];
}

export interface FoodRule {
  /** Rule id, e.g. "levothyroxine-empty-stomach". */
  id: string;
  category: FoodCategory;
  /** Minutes BEFORE the dose during which this category must be absent. 0 = no pre-window. */
  minutesBefore: number;
  /** Minutes AFTER the dose during which this category must be absent. 0 = no post-window. */
  minutesAfter: number;
  /** If true, the rule INVERTS: dose REQUIRES this category inside the window (e.g. metformin with food). */
  requires?: boolean;
  /** Human-readable explanation. No em dashes. */
  description: string;
}

export interface ValidationViolation {
  ruleId: string;
  description: string;
  /** Meal that triggered the violation (or, for `requires` rules, undefined when no qualifying meal exists). */
  conflictingMealAt?: string;
  /** Minutes by which the meal falls inside the forbidden window (negative = before dose, positive = after). */
  offsetMinutes?: number;
  /** True for "requires" rules where no qualifying meal was found. */
  missingRequired?: boolean;
}

export interface ValidationResult {
  doseAt: string;
  ok: boolean;
  violations: ValidationViolation[];
}

export interface SlideOptions {
  /** Earliest allowed time for the dose. */
  earliestIso: string;
  /** Latest allowed time for the dose. */
  latestIso: string;
  /** Step granularity in minutes for the search. Default 5. */
  stepMinutes?: number;
}

const MIN_MS = 60 * 1000;

function toMs(iso: string): number {
  return new Date(iso).getTime();
}

function categoryMatches(rule: FoodRule, meal: MealEvent): boolean {
  if (rule.category === 'any') return meal.categories.length > 0;
  return meal.categories.includes(rule.category);
}

/**
 * Validate a single planned dose against meal history.
 *
 *   - Forbid rules (default): a meal of the rule's category inside
 *     [dose - minutesBefore, dose + minutesAfter] is a violation.
 *   - Require rules (rule.requires=true): at least one qualifying
 *     meal must exist inside the window; otherwise the rule reports
 *     `missingRequired`.
 */
export function validateDoseTiming(
  doseAtIso: string,
  rules: FoodRule[],
  meals: MealEvent[],
): ValidationResult {
  const doseMs = toMs(doseAtIso);
  const violations: ValidationViolation[] = [];

  for (const rule of rules) {
    const windowStart = doseMs - rule.minutesBefore * MIN_MS;
    const windowEnd = doseMs + rule.minutesAfter * MIN_MS;
    const matching = meals
      .filter((m) => categoryMatches(rule, m))
      .filter((m) => {
        const ms = toMs(m.at);
        return ms >= windowStart && ms <= windowEnd;
      });

    if (rule.requires) {
      if (matching.length === 0) {
        violations.push({
          ruleId: rule.id,
          description: rule.description,
          missingRequired: true,
        });
      }
      continue;
    }

    for (const m of matching) {
      violations.push({
        ruleId: rule.id,
        description: rule.description,
        conflictingMealAt: m.at,
        offsetMinutes: Math.round((toMs(m.at) - doseMs) / MIN_MS),
      });
    }
  }

  return { doseAt: doseAtIso, ok: violations.length === 0, violations };
}

/**
 * Find the nearest compliant time to `desiredIso` inside [earliest, latest].
 * Returns the original time if already compliant. Returns null if no time in
 * the window satisfies every rule.
 *
 * Search expands outward from `desiredIso` in `stepMinutes` increments so the
 * smallest schedule disturbance wins ties.
 */
export function findCompliantTime(
  desiredIso: string,
  rules: FoodRule[],
  meals: MealEvent[],
  opts: SlideOptions,
): string | null {
  const step = (opts.stepMinutes ?? 5) * MIN_MS;
  const earliest = toMs(opts.earliestIso);
  const latest = toMs(opts.latestIso);
  const desired = toMs(desiredIso);
  if (earliest > latest) throw new Error('earliestIso must be <= latestIso');

  // Clamp starting point into window.
  const start = Math.min(Math.max(desired, earliest), latest);

  // Distance 0 first, then +/- in lockstep so smaller disturbance wins.
  const maxRadius = Math.max(latest - start, start - earliest);
  for (let delta = 0; delta <= maxRadius; delta += step) {
    for (const sign of delta === 0 ? [0] : [-1, 1]) {
      const candidate = start + sign * delta;
      if (candidate < earliest || candidate > latest) continue;
      const iso = new Date(candidate).toISOString();
      if (validateDoseTiming(iso, rules, meals).ok) return iso;
    }
  }
  return null;
}

/** Convenience presets for common rules. */
export const COMMON_FOOD_RULES: Record<string, FoodRule> = {
  levothyroxine: {
    id: 'levothyroxine-empty-stomach',
    category: 'any',
    minutesBefore: 30,
    minutesAfter: 60,
    description: 'Take on an empty stomach. No food for 60 minutes after.',
  },
  alendronate: {
    id: 'alendronate-empty-stomach',
    category: 'any',
    minutesBefore: 30,
    minutesAfter: 30,
    description: 'Empty stomach. Plain water only for 30 minutes after.',
  },
  ciprofloxacin_dairy: {
    id: 'cipro-no-calcium',
    category: 'calcium',
    minutesBefore: 120,
    minutesAfter: 360,
    description: 'Avoid dairy and calcium 2 hours before and 6 hours after.',
  },
  metformin_with_food: {
    id: 'metformin-with-food',
    category: 'any',
    minutesBefore: 30,
    minutesAfter: 30,
    requires: true,
    description: 'Take with food to reduce stomach upset.',
  },
  maoi_tyramine: {
    id: 'maoi-no-tyramine',
    category: 'tyramine',
    minutesBefore: 720,
    minutesAfter: 720,
    description: 'Avoid tyramine-rich foods (aged cheese, cured meats, fermented).',
  },
};
