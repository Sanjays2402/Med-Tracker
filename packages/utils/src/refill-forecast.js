"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dailyUsageFromSchedules = dailyUsageFromSchedules;
exports.forecastRefill = forecastRefill;
exports.forecastMany = forecastMany;
const schedule_1 = require("./schedule");
const date_1 = require("./date");
/**
 * Average daily consumption derived by expanding each enabled schedule over the
 * forecast horizon. Falls back to 0 for as-needed-only regimens.
 */
function dailyUsageFromSchedules(schedules, now, horizonDays, dosePerAdmin = 1) {
    const to = (0, date_1.addDays)((0, date_1.startOfDay)(now), horizonDays);
    let total = 0;
    for (const s of schedules) {
        if (!s.enabled)
            continue;
        total += (0, schedule_1.expandSchedule)(s, now, to).length * dosePerAdmin;
    }
    return total / horizonDays;
}
function forecastRefill(input, now = new Date()) {
    const { medicationId, supplyRemaining, dosePerAdmin = 1, schedules, soonThresholdDays = 14, urgentThresholdDays = 5, horizonDays = 14, } = input;
    const dailyUsage = dailyUsageFromSchedules(schedules, now, horizonDays, dosePerAdmin);
    if (supplyRemaining <= 0) {
        return {
            medicationId,
            supplyRemaining,
            dailyUsage,
            daysOfSupply: 0,
            runOutDate: (0, date_1.startOfDay)(now).toISOString(),
            refillByDate: (0, date_1.startOfDay)(now).toISOString(),
            status: 'out',
            reason: 'No supply remaining.',
        };
    }
    if (dailyUsage <= 0) {
        return {
            medicationId,
            supplyRemaining,
            dailyUsage: 0,
            daysOfSupply: Infinity,
            runOutDate: null,
            refillByDate: null,
            status: 'ok',
            reason: 'As needed regimen; no scheduled daily usage.',
        };
    }
    const daysOfSupply = Math.floor(supplyRemaining / dailyUsage);
    const runOut = (0, date_1.addDays)((0, date_1.startOfDay)(now), daysOfSupply);
    // Recommend refilling a few days before run-out, never in the past.
    const refillLead = Math.min(urgentThresholdDays, Math.max(2, Math.floor(urgentThresholdDays / 2)));
    const refillBy = (0, date_1.addDays)(runOut, -refillLead);
    const refillByDate = refillBy.getTime() < (0, date_1.startOfDay)(now).getTime() ? (0, date_1.startOfDay)(now).toISOString() : refillBy.toISOString();
    let status;
    let reason;
    if (daysOfSupply <= urgentThresholdDays) {
        status = 'urgent';
        reason = `Only ${daysOfSupply} day${daysOfSupply === 1 ? '' : 's'} of supply remaining at current usage.`;
    }
    else if (daysOfSupply <= soonThresholdDays) {
        status = 'soon';
        reason = `Supply will last about ${daysOfSupply} days. Plan a refill this week.`;
    }
    else {
        status = 'ok';
        reason = `Supply will last about ${daysOfSupply} days.`;
    }
    return {
        medicationId,
        supplyRemaining,
        dailyUsage: Number(dailyUsage.toFixed(3)),
        daysOfSupply,
        runOutDate: runOut.toISOString(),
        refillByDate,
        status,
        reason,
    };
}
function forecastMany(inputs, now = new Date()) {
    return inputs
        .map((i) => forecastRefill(i, now))
        .sort((a, b) => {
        const order = { out: 0, urgent: 1, soon: 2, ok: 3 };
        const d = order[a.status] - order[b.status];
        if (d !== 0)
            return d;
        return a.daysOfSupply - b.daysOfSupply;
    });
}
