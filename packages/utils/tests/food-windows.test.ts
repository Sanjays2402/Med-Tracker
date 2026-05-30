import { describe, expect, it } from 'vitest';
import {
  COMMON_FOOD_RULES,
  type FoodRule,
  type MealEvent,
  findCompliantTime,
  validateDoseTiming,
} from '../src/food-windows';

describe('food window validator', () => {
  it('passes when no meals fall in forbidden window', () => {
    const meals: MealEvent[] = [{ at: '2025-01-01T06:00:00Z', categories: ['any'] }];
    const res = validateDoseTiming(
      '2025-01-01T08:00:00Z',
      [COMMON_FOOD_RULES.levothyroxine],
      meals,
    );
    expect(res.ok).toBe(true);
    expect(res.violations).toEqual([]);
  });

  it('flags meal taken too soon after dose', () => {
    const meals: MealEvent[] = [{ at: '2025-01-01T08:20:00Z', categories: ['any'] }];
    const res = validateDoseTiming(
      '2025-01-01T08:00:00Z',
      [COMMON_FOOD_RULES.levothyroxine],
      meals,
    );
    expect(res.ok).toBe(false);
    expect(res.violations[0].offsetMinutes).toBe(20);
    expect(res.violations[0].ruleId).toBe('levothyroxine-empty-stomach');
  });

  it('flags calcium specifically, ignores unrelated food', () => {
    const meals: MealEvent[] = [
      { at: '2025-01-01T07:00:00Z', categories: ['any'] },
      { at: '2025-01-01T07:30:00Z', categories: ['calcium', 'dairy'] },
    ];
    const res = validateDoseTiming(
      '2025-01-01T09:00:00Z',
      [COMMON_FOOD_RULES.ciprofloxacin_dairy],
      meals,
    );
    expect(res.ok).toBe(false);
    expect(res.violations).toHaveLength(1);
    expect(res.violations[0].conflictingMealAt).toBe('2025-01-01T07:30:00Z');
  });

  it('requires-rule passes when qualifying meal is present', () => {
    const meals: MealEvent[] = [{ at: '2025-01-01T08:10:00Z', categories: ['any'] }];
    const res = validateDoseTiming(
      '2025-01-01T08:00:00Z',
      [COMMON_FOOD_RULES.metformin_with_food],
      meals,
    );
    expect(res.ok).toBe(true);
  });

  it('requires-rule fails with missingRequired when no meal', () => {
    const res = validateDoseTiming(
      '2025-01-01T08:00:00Z',
      [COMMON_FOOD_RULES.metformin_with_food],
      [],
    );
    expect(res.ok).toBe(false);
    expect(res.violations[0].missingRequired).toBe(true);
  });

  it('findCompliantTime returns original time when already ok', () => {
    const meals: MealEvent[] = [{ at: '2025-01-01T05:00:00Z', categories: ['any'] }];
    const t = findCompliantTime(
      '2025-01-01T08:00:00Z',
      [COMMON_FOOD_RULES.levothyroxine],
      meals,
      { earliestIso: '2025-01-01T07:00:00Z', latestIso: '2025-01-01T10:00:00Z' },
    );
    expect(t).toBe('2025-01-01T08:00:00.000Z');
  });

  it('findCompliantTime slides dose to avoid meal', () => {
    const meals: MealEvent[] = [{ at: '2025-01-01T08:20:00Z', categories: ['any'] }];
    const t = findCompliantTime(
      '2025-01-01T08:00:00Z',
      [COMMON_FOOD_RULES.levothyroxine],
      meals,
      { earliestIso: '2025-01-01T07:00:00Z', latestIso: '2025-01-01T11:00:00Z' },
    );
    // Needs meal outside [t-30, t+60]; meal at 8:20 means t+60 < 8:20 -> t < 7:20,
    // or t-30 > 8:20 -> t > 8:50. Smallest disturbance from 8:00 is 7:15.
    expect(t).not.toBeNull();
    expect(new Date(t!).getTime()).toBeLessThanOrEqual(new Date('2025-01-01T07:20:00Z').getTime());
  });

  it('findCompliantTime returns null when window has no compliant point', () => {
    const meals: MealEvent[] = [
      { at: '2025-01-01T08:00:00Z', categories: ['any'] },
      { at: '2025-01-01T08:30:00Z', categories: ['any'] },
      { at: '2025-01-01T09:00:00Z', categories: ['any'] },
    ];
    const t = findCompliantTime(
      '2025-01-01T08:30:00Z',
      [COMMON_FOOD_RULES.levothyroxine],
      meals,
      { earliestIso: '2025-01-01T08:00:00Z', latestIso: '2025-01-01T09:00:00Z' },
    );
    expect(t).toBeNull();
  });

  it('handles multiple rules in one validation', () => {
    const rules: FoodRule[] = [
      COMMON_FOOD_RULES.levothyroxine,
      COMMON_FOOD_RULES.ciprofloxacin_dairy,
    ];
    const meals: MealEvent[] = [
      { at: '2025-01-01T08:15:00Z', categories: ['any', 'dairy', 'calcium'] },
    ];
    const res = validateDoseTiming('2025-01-01T08:00:00Z', rules, meals);
    expect(res.violations.map((v) => v.ruleId).sort()).toEqual([
      'cipro-no-calcium',
      'levothyroxine-empty-stomach',
    ]);
  });

  it('tyramine rule covers wide window', () => {
    const meals: MealEvent[] = [{ at: '2025-01-01T20:00:00Z', categories: ['tyramine'] }];
    const res = validateDoseTiming('2025-01-02T07:00:00Z', [COMMON_FOOD_RULES.maoi_tyramine], meals);
    expect(res.ok).toBe(false);
  });

  it('rejects inverted slide window', () => {
    expect(() =>
      findCompliantTime('2025-01-01T08:00:00Z', [], [], {
        earliestIso: '2025-01-01T10:00:00Z',
        latestIso: '2025-01-01T09:00:00Z',
      }),
    ).toThrow();
  });
});
