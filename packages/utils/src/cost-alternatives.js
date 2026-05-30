"use strict";
/**
 * Cost-aware therapy alternatives ranker.
 *
 * Given a patient's current medications and a catalog of therapeutic
 * alternatives (same drug class, evidence of equivalence), this module
 * proposes substitutions that lower monthly out-of-pocket cost while
 * preserving the prescribing class and avoiding the patient's contraindications.
 *
 * The ranker is deterministic and pure: no DB, no network. It computes
 * projected 30 and 90 day spend per alternative, applies a configurable
 * minimum savings threshold, and orders candidates by absolute monthly
 * savings (ties broken by lower switch friction, then lexicographic).
 *
 * Inputs use cents to avoid float drift. Output explains every recommendation
 * with the rule that fired so a pharmacist can audit it.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.rankCostAlternatives = rankCostAlternatives;
function monthlyCost(copayCents, daysSupply) {
    if (daysSupply <= 0)
        return 0;
    // 30-day normalized spend.
    return Math.round((copayCents * 30) / daysSupply);
}
function ninetyDayCost(copayCents, daysSupply) {
    if (daysSupply <= 0)
        return 0;
    return Math.round((copayCents * 90) / daysSupply);
}
function rankCostAlternatives(input) {
    const minSavings = input.minMonthlySavingsCents ?? 500;
    const tol = input.equivalenceTolerance ?? 0.2;
    const blockedIds = new Set(input.contraindicatedIds ?? []);
    const blockedClasses = new Set(input.contraindicatedClasses ?? []);
    const recs = [];
    const unchanged = [];
    for (const cur of input.current) {
        if (blockedClasses.has(cur.classId)) {
            unchanged.push({ medicationId: cur.medicationId, reason: 'class contraindicated for patient' });
            continue;
        }
        const curMonthly = monthlyCost(cur.copayCents, cur.daysSupply) * cur.dosesPerDay;
        const candidates = input.catalog.filter((c) => {
            if (c.medicationId === cur.medicationId)
                return false;
            if (c.classId !== cur.classId)
                return false;
            if (blockedIds.has(c.medicationId))
                return false;
            if (blockedClasses.has(c.classId))
                return false;
            // Equivalent dose check: candidate strength * equivalenceRatio should be
            // within tolerance of the current med's strength (assuming current is the reference).
            const candidateEqStrength = c.strength * c.equivalenceRatio;
            const lo = cur.strength * (1 - tol);
            const hi = cur.strength * (1 + tol);
            return candidateEqStrength >= lo && candidateEqStrength <= hi;
        });
        let best = null;
        for (const c of candidates) {
            const candMonthly = monthlyCost(c.copayCents, c.daysSupply) * cur.dosesPerDay;
            const savings = curMonthly - candMonthly;
            if (savings < minSavings)
                continue;
            const friction = c.switchFriction ?? (c.tier === cur.tier ? 0.1 : 0.3);
            const candidate = {
                forMedicationId: cur.medicationId,
                forMedicationName: cur.name,
                candidateId: c.medicationId,
                candidateName: c.name,
                currentMonthlyCents: curMonthly,
                candidateMonthlyCents: candMonthly,
                monthlySavingsCents: savings,
                ninetyDaySavingsCents: (ninetyDayCost(cur.copayCents, cur.daysSupply) - ninetyDayCost(c.copayCents, c.daysSupply)) * cur.dosesPerDay,
                switchFriction: friction,
                reason: buildReason(cur, c, savings),
            };
            if (!best) {
                best = candidate;
                continue;
            }
            if (candidate.monthlySavingsCents > best.monthlySavingsCents ||
                (candidate.monthlySavingsCents === best.monthlySavingsCents && candidate.switchFriction < best.switchFriction) ||
                (candidate.monthlySavingsCents === best.monthlySavingsCents &&
                    candidate.switchFriction === best.switchFriction &&
                    candidate.candidateName.localeCompare(best.candidateName) < 0)) {
                best = candidate;
            }
        }
        if (best) {
            recs.push(best);
        }
        else {
            unchanged.push({ medicationId: cur.medicationId, reason: 'no qualifying alternative meets savings threshold' });
        }
    }
    recs.sort((a, b) => {
        if (b.monthlySavingsCents !== a.monthlySavingsCents)
            return b.monthlySavingsCents - a.monthlySavingsCents;
        if (a.switchFriction !== b.switchFriction)
            return a.switchFriction - b.switchFriction;
        return a.candidateName.localeCompare(b.candidateName);
    });
    const total = recs.reduce((s, r) => s + r.monthlySavingsCents, 0);
    return { recommendations: recs, unchanged, totalMonthlySavingsCents: total };
}
function buildReason(cur, c, savings) {
    const tierMove = c.tier === cur.tier ? `same ${c.tier} tier` : `${cur.tier} to ${c.tier} tier`;
    const dollars = (savings / 100).toFixed(2);
    return `Switch saves $${dollars}/mo at equivalent dose (${tierMove}).`;
}
