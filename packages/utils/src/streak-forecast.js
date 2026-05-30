"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.forecastStreakSurvival = forecastStreakSurvival;
const date_1 = require("./date");
const Z = 1.96; // 95% normal approximation.
function dayHit(d) {
    return d.takenAt !== null;
}
function clamp01(x) {
    if (x < 0)
        return 0;
    if (x > 1)
        return 1;
    return x;
}
/**
 * Recency-weighted Laplace-smoothed hit rate.
 *
 * Returns the smoothed rate plus the effective sample size (sum of weights)
 * so callers can derive confidence intervals.
 */
function weightedRate(doses, now, halfLifeDays, weekdayFilter) {
    const lambda = Math.log(2) / halfLifeDays;
    let wSum = 0;
    let hitSum = 0;
    for (const d of doses) {
        const due = new Date(d.dueAt);
        if (weekdayFilter !== null && due.getUTCDay() !== weekdayFilter)
            continue;
        const ageDays = Math.max(0, (now.getTime() - due.getTime()) / 86_400_000);
        const w = Math.exp(-lambda * ageDays);
        wSum += w;
        if (dayHit(d))
            hitSum += w;
    }
    // Laplace smoothing with a weak symmetric prior scaled to a single dose so
    // a long perfect history is not pulled noticeably away from 1.
    const rate = (hitSum + 0.5) / (wSum + 1);
    return { rate: clamp01(rate), ess: wSum };
}
function wilson(rate, ess) {
    if (ess <= 0)
        return { lower: 0, upper: 1 };
    const n = ess;
    const z2 = Z * Z;
    const denom = 1 + z2 / n;
    const center = (rate + z2 / (2 * n)) / denom;
    const margin = (Z * Math.sqrt((rate * (1 - rate)) / n + z2 / (4 * n * n))) / denom;
    return { lower: clamp01(center - margin), upper: clamp01(center + margin) };
}
function forecastStreakSurvival(input) {
    const { doses, horizonDays = 14, recencyHalfLifeDays = 30, now = new Date(), } = input;
    const ref = (0, date_1.startOfDay)(now);
    // Overall rate.
    const overall = weightedRate(doses, ref, recencyHalfLifeDays, null);
    // Per-weekday rates (0=Sun..6=Sat). If a weekday has very low ESS, fall
    // back toward the overall rate via a simple shrinkage.
    const weekday = [];
    for (let dow = 0; dow < 7; dow++) {
        const wd = weightedRate(doses, ref, recencyHalfLifeDays, dow);
        // Shrinkage weight: weekday rate matters more once ESS exceeds ~3.
        const k = wd.ess / (wd.ess + 3);
        weekday.push(clamp01(k * wd.rate + (1 - k) * overall.rate));
    }
    const projection = [];
    let survival = 1;
    let lower = 1;
    let upper = 1;
    let medianBreak = null;
    for (let i = 1; i <= horizonDays; i++) {
        const day = (0, date_1.addDays)(ref, i);
        const dow = day.getUTCDay();
        const rate = weekday[dow];
        const { lower: rl, upper: ru } = wilson(rate, Math.max(overall.ess, 1));
        survival *= rate;
        lower *= rl;
        upper *= ru;
        if (medianBreak === null && survival < 0.5)
            medianBreak = i;
        projection.push({
            date: day.toISOString(),
            survivalProbability: survival,
            lowerBound: lower,
            upperBound: upper,
            dailyHitRate: rate,
        });
    }
    const horizonSurvival = projection.length ? projection[projection.length - 1].survivalProbability : 1;
    const horizonLower = projection.length ? projection[projection.length - 1].lowerBound : 1;
    const horizonUpper = projection.length ? projection[projection.length - 1].upperBound : 1;
    const pct = Math.round(horizonSurvival * 100);
    let summary;
    if (doses.length === 0) {
        summary = 'No dose history yet; forecast is a weak prior.';
    }
    else if (medianBreak !== null) {
        summary = `About ${pct}% chance the streak survives ${horizonDays} days; most likely break around day ${medianBreak}.`;
    }
    else {
        summary = `About ${pct}% chance the streak survives the full ${horizonDays}-day horizon.`;
    }
    return {
        horizonDays,
        overallHitRate: overall.rate,
        effectiveSampleSize: overall.ess,
        weekdayHitRates: weekday,
        projection,
        horizonSurvival,
        horizonLower,
        horizonUpper,
        medianBreakDay: medianBreak,
        summary,
    };
}
