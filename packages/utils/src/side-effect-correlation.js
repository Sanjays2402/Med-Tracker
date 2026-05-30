"use strict";
/**
 * Side-effect to dose correlation.
 *
 * Patients report symptoms (nausea, dizziness, rash, insomnia) in a journal.
 * Clinicians need a quick read on whether a symptom is plausibly associated
 * with a particular medication. This module looks for two signals:
 *
 *   1. Onset coupling: how often a symptom report occurs within a
 *      configurable window after a dose of a given medication, vs the base
 *      rate of that symptom across all hours.
 *   2. Introduction coupling: did the symptom start appearing only after
 *      the medication was introduced? Compares pre-introduction and
 *      post-introduction symptom frequencies per day.
 *
 * The output is a per (medication, symptom) score in [0,1] plus a short
 * structured reason and the counts that drove it. Pure and deterministic.
 *
 * This is not a diagnostic claim. It is a triage signal for clinician review,
 * so we expose the raw counts so a clinician can sanity-check.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.correlateSideEffects = correlateSideEffects;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
function correlateSideEffects(input) {
    const windowH = input.windowHours ?? 6;
    const minDoses = input.minDoses ?? 5;
    const minSymptoms = input.minSymptoms ?? 3;
    const dosesByMed = new Map();
    for (const d of input.doses) {
        const t = Date.parse(d.takenAt);
        if (Number.isNaN(t))
            continue;
        const arr = dosesByMed.get(d.medicationId) ?? [];
        arr.push(t);
        dosesByMed.set(d.medicationId, arr);
    }
    for (const arr of dosesByMed.values())
        arr.sort((a, b) => a - b);
    const symptomsByLabel = new Map();
    for (const s of input.symptoms) {
        const t = Date.parse(s.reportedAt);
        if (Number.isNaN(t))
            continue;
        const arr = symptomsByLabel.get(s.symptom) ?? [];
        arr.push(t);
        symptomsByLabel.set(s.symptom, arr);
    }
    for (const arr of symptomsByLabel.values())
        arr.sort((a, b) => a - b);
    // Observation window is min..max across all events.
    const allTimes = [];
    for (const arr of dosesByMed.values())
        allTimes.push(...arr);
    for (const arr of symptomsByLabel.values())
        allTimes.push(...arr);
    const obsStart = allTimes.length ? Math.min(...allTimes) : 0;
    const obsEnd = allTimes.length ? Math.max(...allTimes) : 0;
    const obsHours = Math.max(1, (obsEnd - obsStart) / HOUR_MS);
    const ignoredSymptoms = [];
    const ignoredMedications = [];
    for (const [sym, arr] of symptomsByLabel) {
        if (arr.length < minSymptoms)
            ignoredSymptoms.push(sym);
    }
    for (const [med, arr] of dosesByMed) {
        if (arr.length < minDoses)
            ignoredMedications.push(med);
    }
    const findings = [];
    for (const [med, doseTimes] of dosesByMed) {
        if (doseTimes.length < minDoses)
            continue;
        const windows = mergeWindows(doseTimes.map((t) => [t, t + windowH * HOUR_MS]));
        const inWindowHours = windows.reduce((s, [a, b]) => s + (b - a) / HOUR_MS, 0);
        const coverage = Math.min(1, inWindowHours / obsHours);
        const medStart = input.medicationStarts[med] ? Date.parse(input.medicationStarts[med]) : doseTimes[0];
        const preDays = Math.max(0.001, (medStart - obsStart) / DAY_MS);
        const postDays = Math.max(0.001, (obsEnd - medStart) / DAY_MS);
        for (const [sym, sympTimes] of symptomsByLabel) {
            if (sympTimes.length < minSymptoms)
                continue;
            const inWindow = sympTimes.filter((t) => insideAny(t, windows)).length;
            const total = sympTimes.length;
            const expected = total * coverage;
            const preCount = sympTimes.filter((t) => t < medStart).length;
            const postCount = total - preCount;
            const baselinePerDay = preCount / preDays;
            const postPerDay = postCount / postDays;
            // Onset signal: ratio of observed to expected, normalized to [0,1].
            const onset = expected > 0 ? Math.min(1, Math.max(0, (inWindow / expected - 1) / 2)) : 0;
            // Introduction signal: how much higher post rate is vs baseline.
            const intro = baselinePerDay === 0
                ? (postPerDay > 0 ? 1 : 0)
                : Math.min(1, Math.max(0, (postPerDay - baselinePerDay) / Math.max(baselinePerDay, postPerDay)));
            // Confidence shrinkage by report volume; small n is unreliable.
            const conf = Math.min(1, total / 10);
            const score = Number((conf * (0.6 * onset + 0.4 * intro)).toFixed(3));
            findings.push({
                medicationId: med,
                symptom: sym,
                inWindowReports: inWindow,
                totalReports: total,
                windowCoverage: Number(coverage.toFixed(3)),
                expectedInWindow: Number(expected.toFixed(2)),
                baselinePerDay: Number(baselinePerDay.toFixed(3)),
                postPerDay: Number(postPerDay.toFixed(3)),
                score,
                reason: buildReason(score, inWindow, expected, baselinePerDay, postPerDay),
            });
        }
    }
    findings.sort((a, b) => b.score - a.score || a.medicationId.localeCompare(b.medicationId) || a.symptom.localeCompare(b.symptom));
    return { findings, ignoredSymptoms, ignoredMedications };
}
function mergeWindows(windows) {
    if (windows.length === 0)
        return [];
    const sorted = [...windows].sort((a, b) => a[0] - b[0]);
    const out = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
        const last = out[out.length - 1];
        const cur = sorted[i];
        if (cur[0] <= last[1])
            last[1] = Math.max(last[1], cur[1]);
        else
            out.push(cur);
    }
    return out;
}
function insideAny(t, windows) {
    // windows are sorted and disjoint, so a linear scan is fine for small N.
    for (const [a, b] of windows) {
        if (t >= a && t <= b)
            return true;
        if (a > t)
            return false;
    }
    return false;
}
function buildReason(score, inWindow, expected, baseline, post) {
    const parts = [];
    if (expected > 0 && inWindow > expected * 1.25) {
        parts.push(`${inWindow} of reports landed in dose windows vs ${expected.toFixed(1)} expected`);
    }
    if (baseline === 0 && post > 0) {
        parts.push('symptom only appears after medication start');
    }
    else if (post > baseline * 1.5 && baseline > 0) {
        parts.push(`post-start rate ${post.toFixed(2)}/day vs baseline ${baseline.toFixed(2)}/day`);
    }
    if (parts.length === 0)
        return score > 0 ? 'weak signal worth monitoring' : 'no apparent association';
    return parts.join('; ');
}
