"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveConflicts = resolveConflicts;
const schedule_conflicts_1 = require("./schedule-conflicts");
const schedule_1 = require("./schedule");
function cloneMeds(meds) {
    return meds.map((m) => ({
        medicationId: m.medicationId,
        schedule: { ...m.schedule, times: [...m.schedule.times] },
    }));
}
function parseHHMM(t) {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
}
function fmtHHMM(minutes) {
    const wrapped = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
    const h = Math.floor(wrapped / 60);
    const m = wrapped % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function detect(meds, opts) {
    return (0, schedule_conflicts_1.detectScheduleConflicts)(meds, {
        from: opts.from,
        to: opts.to,
        clusterWindowMinutes: opts.clusterWindowMinutes,
        clusterThreshold: opts.clusterThreshold,
        duplicateWindowMinutes: opts.duplicateWindowMinutes,
        spacingRules: opts.spacingRules,
    });
}
/**
 * Try every candidate shift between `-maxShift` and `+maxShift` at the given
 * step, picking the smallest absolute shift that strictly reduces conflict
 * count. Returns null if no candidate improves things.
 */
function bestShiftFor(meds, medIndex, timeIndex, opts, baselineCount) {
    const step = opts.stepMinutes ?? 15;
    const maxShift = opts.maxShiftMinutes ?? 90;
    const original = meds[medIndex].schedule.times[timeIndex];
    const originalMin = parseHHMM(original);
    let best = null;
    for (let delta = step; delta <= maxShift; delta += step) {
        for (const sign of [-1, 1]) {
            const candidateMin = originalMin + sign * delta;
            if (candidateMin < 0 || candidateMin >= 24 * 60)
                continue;
            const candidate = fmtHHMM(candidateMin);
            if (candidate === original)
                continue;
            meds[medIndex].schedule.times[timeIndex] = candidate;
            const conflicts = detect(meds, opts).length;
            meds[medIndex].schedule.times[timeIndex] = original;
            if (conflicts < baselineCount) {
                if (!best || conflicts < best.conflicts || delta < Math.abs(best.shiftMinutes)) {
                    best = { newTime: candidate, shiftMinutes: sign * delta, conflicts };
                }
            }
        }
        if (best)
            return { newTime: best.newTime, shiftMinutes: best.shiftMinutes };
    }
    return best ? { newTime: best.newTime, shiftMinutes: best.shiftMinutes } : null;
}
function classifyConflict(c) {
    return c.kind;
}
/**
 * Generate a deterministic set of proposals. The algorithm iterates while
 * there are still conflicts, picks the first conflict's first non-locked
 * medication, and asks `bestShiftFor` for the smallest helpful change.
 * Bounded by a hard iteration cap so pathological inputs cannot loop.
 */
function resolveConflicts(meds, opts) {
    const work = cloneMeds(meds);
    const locked = new Set(opts.lockedScheduleIds ?? []);
    const proposals = [];
    const maxIterations = 25;
    for (let iter = 0; iter < maxIterations; iter++) {
        const conflicts = detect(work, opts);
        if (conflicts.length === 0)
            break;
        const target = conflicts[0];
        let resolved = false;
        for (const medId of target.medicationIds) {
            const medIndex = work.findIndex((m) => m.medicationId === medId && !locked.has(m.schedule.id));
            if (medIndex < 0)
                continue;
            const sched = work[medIndex].schedule;
            const targetTimeMin = (() => {
                const at = new Date(target.at);
                const expanded = (0, schedule_1.expandSchedule)(sched, opts.from, opts.to);
                const match = expanded.find((d) => d.getTime() === at.getTime());
                if (!match)
                    return parseHHMM(sched.times[0] ?? '08:00');
                return match.getHours() * 60 + match.getMinutes();
            })();
            const timeIndex = sched.times.findIndex((t) => parseHHMM(t) === targetTimeMin);
            if (timeIndex < 0)
                continue;
            const baseline = conflicts.length;
            const shift = bestShiftFor(work, medIndex, timeIndex, opts, baseline);
            if (!shift)
                continue;
            const original = sched.times[timeIndex];
            sched.times[timeIndex] = shift.newTime;
            proposals.push({
                scheduleId: sched.id,
                medicationId: medId,
                timeIndex,
                originalTime: original,
                proposedTime: shift.newTime,
                shiftMinutes: shift.shiftMinutes,
                reason: classifyConflict(target),
                rationale: target.message,
            });
            resolved = true;
            break;
        }
        if (!resolved)
            break; // nothing we can do without violating locks
    }
    return proposals;
}
