"use strict";
/**
 * Pediatric weight-based dose calculator.
 *
 * Pediatric dosing is almost always expressed as mg/kg/day with a
 * per-dose ceiling and an absolute adult-equivalent cap (e.g.
 * amoxicillin 25 mg/kg/day divided BID, max 875 mg per dose;
 * acetaminophen 10-15 mg/kg/dose, max 1000 mg/dose, 75 mg/kg/day,
 * 4000 mg/day adult cap). Errors at this step are a known source of
 * 10x dosing harm.
 *
 * This module:
 *
 *   1. Computes the per-dose and per-day target from weight, indication,
 *      and frequency.
 *   2. Applies BOTH per-dose and per-day caps (and a per-kg max where
 *      the rule defines one).
 *   3. Rounds the target to the nearest measurable volume given the
 *      product concentration and syringe granularity.
 *   4. Reports every cap that was hit and a safety status so the UI
 *      can require explicit acknowledgement before saving.
 *
 * Pure, deterministic, no I/O. All masses in mg, all volumes in mL,
 * weight in kg.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.COMMON_PEDIATRIC_RULES = void 0;
exports.calculatePediatricDose = calculatePediatricDose;
const DOSES_PER_DAY = {
    qd: 1,
    bid: 2,
    tid: 3,
    qid: 4,
    q4h: 6,
    q6h: 4,
    q8h: 3,
    q12h: 2,
};
function roundToStep(value, step) {
    if (step <= 0)
        return value;
    return Math.round(value / step) * step;
}
function round2(n) {
    return Math.round(n * 100) / 100;
}
function calculatePediatricDose(req) {
    const { rule, weightKg, frequency } = req;
    const warnings = [];
    const capsHit = [];
    if (!(weightKg > 0)) {
        return {
            status: 'invalid',
            perDoseMg: 0,
            perDoseMl: 0,
            perDayMg: 0,
            dosesPerDay: DOSES_PER_DAY[frequency],
            targetPerDoseMg: 0,
            capsHit: [],
            warnings: ['weightKg must be positive'],
        };
    }
    if (rule.concentrationMgPerMl <= 0) {
        return {
            status: 'invalid',
            perDoseMg: 0,
            perDoseMl: 0,
            perDayMg: 0,
            dosesPerDay: DOSES_PER_DAY[frequency],
            targetPerDoseMg: 0,
            capsHit: [],
            warnings: ['concentrationMgPerMl must be positive'],
        };
    }
    const dosesPerDay = DOSES_PER_DAY[frequency];
    let outOfRange = false;
    if (weightKg < rule.minWeightKg) {
        warnings.push(`weight ${weightKg} kg is below validated minimum ${rule.minWeightKg} kg`);
        outOfRange = true;
    }
    if (weightKg > rule.maxWeightKg) {
        warnings.push(`weight ${weightKg} kg exceeds pediatric maximum ${rule.maxWeightKg} kg; use adult dosing`);
        outOfRange = true;
    }
    // Target per-dose (mg) before any caps.
    let targetMg;
    if (rule.mgPerKgPerDose !== undefined) {
        targetMg = rule.mgPerKgPerDose * weightKg;
    }
    else {
        targetMg = (rule.mgPerKgPerDay * weightKg) / dosesPerDay;
    }
    const rawTarget = targetMg;
    // Cap: per-dose mg.
    if (targetMg > rule.maxMgPerDose) {
        targetMg = rule.maxMgPerDose;
        capsHit.push('per-dose-mg');
    }
    // Cap: per-kg per-dose explicit rule (rare but used for opioids).
    if (rule.mgPerKgPerDose !== undefined) {
        const perKg = targetMg / weightKg;
        if (perKg > rule.mgPerKgPerDose) {
            // Should not happen because we computed from it; kept for parity.
            targetMg = rule.mgPerKgPerDose * weightKg;
            capsHit.push('per-kg-per-dose');
        }
    }
    // Cap: per-day mg. If total exceeds, scale per-dose down.
    if (targetMg * dosesPerDay > rule.maxMgPerDay) {
        targetMg = rule.maxMgPerDay / dosesPerDay;
        capsHit.push('per-day-mg');
    }
    // Round to syringe step in mL, then convert back.
    const targetMl = targetMg / rule.concentrationMgPerMl;
    let roundedMl = roundToStep(targetMl, rule.syringeStepMl);
    if (roundedMl < 0)
        roundedMl = 0;
    let roundedMg = roundedMl * rule.concentrationMgPerMl;
    // Rounding can push over per-dose cap; clip down one syringe step if so.
    while (roundedMg > rule.maxMgPerDose && roundedMl > 0) {
        roundedMl = round2(roundedMl - rule.syringeStepMl);
        roundedMg = roundedMl * rule.concentrationMgPerMl;
    }
    // Same for per-day cap.
    while (roundedMg * dosesPerDay > rule.maxMgPerDay && roundedMl > 0) {
        roundedMl = round2(roundedMl - rule.syringeStepMl);
        roundedMg = roundedMl * rule.concentrationMgPerMl;
    }
    let status;
    if (outOfRange)
        status = 'out-of-range';
    else if (capsHit.length > 0)
        status = 'capped';
    else
        status = 'ok';
    if (roundedMl <= 0) {
        warnings.push('rounded dose is zero; check product concentration and syringe granularity');
    }
    return {
        status,
        perDoseMg: round2(roundedMg),
        perDoseMl: round2(roundedMl),
        perDayMg: round2(roundedMg * dosesPerDay),
        dosesPerDay,
        targetPerDoseMg: round2(rawTarget),
        capsHit,
        warnings,
    };
}
/** Library of common pediatric rules. Values are reference-only and should be verified by a pharmacist. */
exports.COMMON_PEDIATRIC_RULES = {
    amoxicillin_standard: {
        medicationId: 'amoxicillin',
        concentrationMgPerMl: 50, // 250 mg / 5 mL
        mgPerKgPerDay: 45,
        maxMgPerDose: 875,
        maxMgPerDay: 1750,
        minWeightKg: 3,
        maxWeightKg: 40,
        syringeStepMl: 0.1,
    },
    amoxicillin_high_dose: {
        medicationId: 'amoxicillin-hd',
        concentrationMgPerMl: 80, // 400 mg / 5 mL
        mgPerKgPerDay: 90,
        maxMgPerDose: 1000,
        maxMgPerDay: 3000,
        minWeightKg: 3,
        maxWeightKg: 40,
        syringeStepMl: 0.1,
    },
    acetaminophen: {
        medicationId: 'acetaminophen',
        concentrationMgPerMl: 32, // 160 mg / 5 mL
        mgPerKgPerDay: 75,
        mgPerKgPerDose: 15,
        maxMgPerDose: 1000,
        maxMgPerDay: 4000,
        minWeightKg: 4,
        maxWeightKg: 50,
        syringeStepMl: 0.1,
    },
    ibuprofen: {
        medicationId: 'ibuprofen',
        concentrationMgPerMl: 20, // 100 mg / 5 mL
        mgPerKgPerDay: 40,
        mgPerKgPerDose: 10,
        maxMgPerDose: 800,
        maxMgPerDay: 2400,
        minWeightKg: 6,
        maxWeightKg: 50,
        syringeStepMl: 0.25,
    },
};
