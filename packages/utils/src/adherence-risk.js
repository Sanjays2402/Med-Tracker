"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeRiskFeatures = computeRiskFeatures;
exports.scoreRisk = scoreRisk;
exports.rankRisk = rankRisk;
const date_1 = require("./date");
const FAILURE = ['missed', 'skipped'];
function isFailure(d) {
    return FAILURE.includes(d.status);
}
function bucketOf(date, hours) {
    return Math.floor(date.getHours() / hours);
}
/**
 * Compute the per-feature inputs that feed the risk score. Pulled out for
 * unit testing and so dashboards can show the raw numbers if desired.
 */
function computeRiskFeatures(doses, options = {}) {
    const windowDays = options.windowDays ?? 30;
    const halfLife = options.recencyHalfLifeDays ?? 7;
    const bucketHours = options.timeBucketHours ?? 2;
    const now = new Date();
    const windowStart = (0, date_1.addDays)((0, date_1.startOfDay)(now), -windowDays);
    const inWindow = doses.filter((d) => {
        const t = new Date(d.dueAt).getTime();
        return t >= windowStart.getTime() && t <= now.getTime();
    });
    const total = inWindow.length;
    const missed = inWindow.filter(isFailure).length;
    const recentMissRate = total === 0 ? 0 : missed / total;
    // EMA weights doses by recency: weight = 0.5 ^ (ageDays / halfLife).
    let weightSum = 0;
    let failWeight = 0;
    for (const d of inWindow) {
        const ageDays = (now.getTime() - new Date(d.dueAt).getTime()) / 86_400_000;
        const w = Math.pow(0.5, ageDays / halfLife);
        weightSum += w;
        if (isFailure(d))
            failWeight += w;
    }
    const emaFailureRate = weightSum === 0 ? 0 : failWeight / weightSum;
    let timeBucketMissRate = null;
    if (options.nextDueAt) {
        const bucket = bucketOf(options.nextDueAt, bucketHours);
        const sameBucket = inWindow.filter((d) => bucketOf(new Date(d.dueAt), bucketHours) === bucket);
        timeBucketMissRate = sameBucket.length === 0 ? null : sameBucket.filter(isFailure).length / sameBucket.length;
    }
    const sevenDayCutoff = (0, date_1.addDays)((0, date_1.startOfDay)(now), -7);
    const last7 = inWindow.filter((d) => new Date(d.dueAt).getTime() >= sevenDayCutoff.getTime());
    const trailing7DayMissRate = last7.length === 0 ? 0 : last7.filter(isFailure).length / last7.length;
    const lateCount = inWindow.filter((d) => d.status === 'late').length;
    const lateRate = total === 0 ? 0 : lateCount / total;
    // Count consecutive failures at the tail of chronological history.
    const sorted = [...inWindow].sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
    let consecutive = 0;
    for (let i = sorted.length - 1; i >= 0; i--) {
        if (isFailure(sorted[i]))
            consecutive++;
        else
            break;
    }
    return {
        totalDoses: total,
        missedDoses: missed,
        recentMissRate,
        emaFailureRate,
        timeBucketMissRate,
        trailing7DayMissRate,
        lateRate,
        consecutiveMisses: consecutive,
    };
}
/**
 * Score weights. Recency-weighted failures dominate, with smaller
 * contributions from the trailing-week rate, time-of-day pattern, late
 * rate (a precursor to misses), and consecutive miss streak (saturates at
 * five). Weights sum to 1.0.
 */
const W = {
    ema: 0.45,
    trailing7: 0.2,
    timeBucket: 0.15,
    late: 0.1,
    consecutive: 0.1,
};
function scoreRisk(medicationId, doses, options = {}) {
    const f = computeRiskFeatures(doses, options);
    if (f.totalDoses < 3) {
        return {
            medicationId,
            score: 0,
            level: 'low',
            features: f,
            reasons: ['insufficient history'],
        };
    }
    const timeBucket = f.timeBucketMissRate ?? f.recentMissRate;
    const consec = Math.min(f.consecutiveMisses, 5) / 5;
    const score = f.emaFailureRate * W.ema +
        f.trailing7DayMissRate * W.trailing7 +
        timeBucket * W.timeBucket +
        f.lateRate * W.late +
        consec * W.consecutive;
    const clamped = Math.max(0, Math.min(1, score));
    const level = clamped >= 0.45 ? 'high' : clamped >= 0.22 ? 'moderate' : 'low';
    const reasons = [];
    if (f.consecutiveMisses >= 2)
        reasons.push(`${f.consecutiveMisses} consecutive misses`);
    if (f.trailing7DayMissRate >= 0.3)
        reasons.push(`${Math.round(f.trailing7DayMissRate * 100)}% missed in last 7 days`);
    if (f.emaFailureRate >= 0.3)
        reasons.push(`${Math.round(f.emaFailureRate * 100)}% recency-weighted failure rate`);
    if (f.timeBucketMissRate !== null && f.timeBucketMissRate >= 0.4) {
        reasons.push(`${Math.round(f.timeBucketMissRate * 100)}% miss rate at this time of day`);
    }
    if (f.lateRate >= 0.3)
        reasons.push(`${Math.round(f.lateRate * 100)}% taken late`);
    if (reasons.length === 0)
        reasons.push('adherence stable');
    return { medicationId, score: clamped, level, features: f, reasons };
}
/** Score a batch and rank high-risk medications first. */
function rankRisk(rows, options = {}) {
    const out = rows.map((r) => scoreRisk(r.medicationId, r.doses, { ...options, nextDueAt: r.nextDueAt }));
    out.sort((a, b) => b.score - a.score);
    return out;
}
