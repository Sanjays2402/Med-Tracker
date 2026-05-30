"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.COMMON_FOOD_RULES = void 0;
exports.validateDoseTiming = validateDoseTiming;
exports.findCompliantTime = findCompliantTime;
const MIN_MS = 60 * 1000;
function toMs(iso) {
    return new Date(iso).getTime();
}
function categoryMatches(rule, meal) {
    if (rule.category === 'any')
        return meal.categories.length > 0;
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
function validateDoseTiming(doseAtIso, rules, meals) {
    const doseMs = toMs(doseAtIso);
    const violations = [];
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
function findCompliantTime(desiredIso, rules, meals, opts) {
    const step = (opts.stepMinutes ?? 5) * MIN_MS;
    const earliest = toMs(opts.earliestIso);
    const latest = toMs(opts.latestIso);
    const desired = toMs(desiredIso);
    if (earliest > latest)
        throw new Error('earliestIso must be <= latestIso');
    // Clamp starting point into window.
    const start = Math.min(Math.max(desired, earliest), latest);
    // Distance 0 first, then +/- in lockstep so smaller disturbance wins.
    const maxRadius = Math.max(latest - start, start - earliest);
    for (let delta = 0; delta <= maxRadius; delta += step) {
        for (const sign of delta === 0 ? [0] : [-1, 1]) {
            const candidate = start + sign * delta;
            if (candidate < earliest || candidate > latest)
                continue;
            const iso = new Date(candidate).toISOString();
            if (validateDoseTiming(iso, rules, meals).ok)
                return iso;
        }
    }
    return null;
}
/** Convenience presets for common rules. */
exports.COMMON_FOOD_RULES = {
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
