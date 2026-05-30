"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectScheduleConflicts = detectScheduleConflicts;
const schedule_1 = require("./schedule");
const MIN_MS = 60_000;
function detectScheduleConflicts(meds, opts) {
    const clusterWindow = (opts.clusterWindowMinutes ?? 15) * MIN_MS;
    const clusterThreshold = opts.clusterThreshold ?? 4;
    const dupWindow = (opts.duplicateWindowMinutes ?? 5) * MIN_MS;
    const doses = [];
    for (const m of meds) {
        for (const at of (0, schedule_1.expandSchedule)(m.schedule, opts.from, opts.to)) {
            doses.push({ medicationId: m.medicationId, scheduleId: m.schedule.id, at });
        }
    }
    doses.sort((a, b) => a.at.getTime() - b.at.getTime());
    const out = [];
    // Cluster: sliding window over sorted doses.
    for (let i = 0; i < doses.length; i++) {
        let j = i;
        while (j + 1 < doses.length && doses[j + 1].at.getTime() - doses[i].at.getTime() <= clusterWindow) {
            j += 1;
        }
        const span = j - i + 1;
        if (span >= clusterThreshold) {
            const ids = Array.from(new Set(doses.slice(i, j + 1).map((d) => d.medicationId)));
            out.push({
                kind: 'cluster',
                at: doses[i].at.toISOString(),
                medicationIds: ids,
                message: `${span} doses scheduled within ${(clusterWindow / MIN_MS).toFixed(0)} minutes`,
                severity: 'warning',
            });
            i = j; // skip ahead past the cluster
        }
    }
    // Duplicate: same medication, two schedules, doses within dupWindow.
    for (let i = 0; i < doses.length; i++) {
        for (let j = i + 1; j < doses.length; j++) {
            const dt = doses[j].at.getTime() - doses[i].at.getTime();
            if (dt > dupWindow)
                break;
            if (doses[i].medicationId === doses[j].medicationId &&
                doses[i].scheduleId !== doses[j].scheduleId) {
                out.push({
                    kind: 'duplicate',
                    at: doses[i].at.toISOString(),
                    medicationIds: [doses[i].medicationId],
                    message: 'Duplicate dose times from two schedules for the same medication',
                    severity: 'critical',
                });
            }
        }
    }
    // Spacing: every pair of doses across the two meds in a rule.
    for (const rule of opts.spacingRules ?? []) {
        const gapMs = rule.minMinutes * MIN_MS;
        const a = doses.filter((d) => d.medicationId === rule.medicationA);
        const b = doses.filter((d) => d.medicationId === rule.medicationB);
        for (const da of a) {
            for (const db of b) {
                const delta = Math.abs(da.at.getTime() - db.at.getTime());
                if (delta < gapMs) {
                    out.push({
                        kind: 'spacing',
                        at: (da.at.getTime() <= db.at.getTime() ? da.at : db.at).toISOString(),
                        medicationIds: [rule.medicationA, rule.medicationB],
                        message: rule.reason ??
                            `Doses are ${Math.round(delta / MIN_MS)} min apart; should be at least ${rule.minMinutes} min`,
                        severity: 'critical',
                    });
                }
            }
        }
    }
    // Sort final report by time then severity (critical first within ties).
    const sevRank = { critical: 0, warning: 1, info: 2 };
    out.sort((x, y) => {
        const t = x.at.localeCompare(y.at);
        return t !== 0 ? t : sevRank[x.severity] - sevRank[y.severity];
    });
    return out;
}
