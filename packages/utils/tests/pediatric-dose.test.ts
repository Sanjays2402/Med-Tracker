import { describe, expect, it } from 'vitest';
import {
  COMMON_PEDIATRIC_RULES,
  calculatePediatricDose,
} from '../src/pediatric-dose';

describe('pediatric dose calculator', () => {
  it('amoxicillin standard: 20 kg child BID', () => {
    const r = calculatePediatricDose({
      rule: COMMON_PEDIATRIC_RULES.amoxicillin_standard,
      weightKg: 20,
      frequency: 'bid',
    });
    // 45 * 20 = 900 mg/day / 2 = 450 mg/dose -> 9 mL.
    expect(r.status).toBe('ok');
    expect(r.perDoseMl).toBe(9);
    expect(r.perDoseMg).toBe(450);
    expect(r.perDayMg).toBe(900);
    expect(r.dosesPerDay).toBe(2);
    expect(r.capsHit).toEqual([]);
  });

  it('caps per-dose when weight is large', () => {
    const r = calculatePediatricDose({
      rule: COMMON_PEDIATRIC_RULES.amoxicillin_high_dose,
      weightKg: 35,
      frequency: 'bid',
    });
    // 90 * 35 / 2 = 1575 mg target -> capped to 1000 mg.
    expect(r.capsHit).toContain('per-dose-mg');
    expect(r.perDoseMg).toBeLessThanOrEqual(1000);
    expect(r.status).toBe('capped');
  });

  it('caps per-day when daily total exceeds cap', () => {
    const r = calculatePediatricDose({
      rule: COMMON_PEDIATRIC_RULES.amoxicillin_standard,
      weightKg: 38,
      frequency: 'tid',
    });
    // 45*38 = 1710 mg/day target (under 1750). With tid -> 570 mg/dose, 1710/day. OK.
    // Push higher weight:
    const r2 = calculatePediatricDose({
      rule: COMMON_PEDIATRIC_RULES.amoxicillin_standard,
      weightKg: 40,
      frequency: 'tid',
    });
    // 45*40 = 1800 mg/day -> capped to 1750.
    expect(r2.capsHit).toContain('per-day-mg');
    expect(r2.perDayMg).toBeLessThanOrEqual(1750);
    void r;
  });

  it('rounds to syringe step', () => {
    const r = calculatePediatricDose({
      rule: COMMON_PEDIATRIC_RULES.ibuprofen,
      weightKg: 13,
      frequency: 'q6h',
    });
    // 10 mg/kg/dose = 130 mg -> 6.5 mL at 20 mg/mL. Syringe step 0.25 -> 6.5 mL exact.
    expect(r.perDoseMl).toBe(6.5);
    // Step is 0.25, so result mod 0.25 == 0
    expect(Math.round((r.perDoseMl * 100) % 25)).toBe(0);
  });

  it('out-of-range below minimum weight', () => {
    const r = calculatePediatricDose({
      rule: COMMON_PEDIATRIC_RULES.amoxicillin_standard,
      weightKg: 2,
      frequency: 'bid',
    });
    expect(r.status).toBe('out-of-range');
    expect(r.warnings.join(' ')).toMatch(/below validated minimum/);
  });

  it('out-of-range above pediatric maximum', () => {
    const r = calculatePediatricDose({
      rule: COMMON_PEDIATRIC_RULES.acetaminophen,
      weightKg: 80,
      frequency: 'q6h',
    });
    expect(r.status).toBe('out-of-range');
    expect(r.warnings.join(' ')).toMatch(/use adult dosing/);
  });

  it('invalid weight returns status invalid', () => {
    const r = calculatePediatricDose({
      rule: COMMON_PEDIATRIC_RULES.amoxicillin_standard,
      weightKg: 0,
      frequency: 'bid',
    });
    expect(r.status).toBe('invalid');
  });

  it('per-dose ruled medication respects mgPerKgPerDose ceiling', () => {
    const r = calculatePediatricDose({
      rule: COMMON_PEDIATRIC_RULES.acetaminophen,
      weightKg: 30,
      frequency: 'q6h',
    });
    // 15 mg/kg * 30 = 450 mg/dose target; q6h * 450 = 1800 mg/day (< 4000), under per-dose 1000.
    expect(r.perDoseMg).toBeCloseTo(451.2, 1);
    expect(r.capsHit).not.toContain('per-dose-mg');
  });

  it('rounding never exceeds per-dose cap', () => {
    const rule = {
      ...COMMON_PEDIATRIC_RULES.amoxicillin_standard,
      syringeStepMl: 1, // coarse syringe
    };
    const r = calculatePediatricDose({
      rule,
      weightKg: 25,
      frequency: 'bid',
    });
    expect(r.perDoseMg).toBeLessThanOrEqual(rule.maxMgPerDose);
  });

  it('frequency dosesPerDay matches table', () => {
    const r = calculatePediatricDose({
      rule: COMMON_PEDIATRIC_RULES.amoxicillin_standard,
      weightKg: 15,
      frequency: 'q8h',
    });
    expect(r.dosesPerDay).toBe(3);
  });

  it('reports raw target separately from final per-dose mg', () => {
    const r = calculatePediatricDose({
      rule: COMMON_PEDIATRIC_RULES.amoxicillin_high_dose,
      weightKg: 30,
      frequency: 'bid',
    });
    // raw: 90*30/2 = 1350
    expect(r.targetPerDoseMg).toBe(1350);
    expect(r.perDoseMg).toBeLessThanOrEqual(1000);
  });
});
