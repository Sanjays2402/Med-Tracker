"use strict";
/**
 * Caregiver shift handoff report.
 *
 * When two caregivers hand off a shift (home health aide, family member,
 * facility staff), they need a compact, action-focused brief covering:
 *
 *   - upcoming doses in the next N hours,
 *   - recent missed / late / skipped doses inside a recency window,
 *   - PRN (as-needed) usage in the recent window with running totals
 *     against the per-medication daily cap,
 *   - open alerts (interaction, refill, cold-chain) that the outgoing
 *     caregiver has not yet acknowledged.
 *
 * Output is a plain-text report plus a structured object so the mobile
 * app can render it as a checklist. Deduplication is deterministic so
 * regenerating the report at the same `now` produces identical text.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildShiftHandoff = buildShiftHandoff;
const HOUR_MS = 3_600_000;
function buildShiftHandoff(input) {
    const nowMs = Date.parse(input.now);
    if (Number.isNaN(nowMs))
        throw new Error('now is not a valid datetime');
    const lookahead = input.lookaheadHours ?? 12;
    const recency = input.recencyHours ?? 12;
    const windowEnd = nowMs + lookahead * HOUR_MS;
    const windowStart = nowMs - recency * HOUR_MS;
    const past24Start = nowMs - 24 * HOUR_MS;
    // Upcoming: dedup by doseId, keep entries within [now, now+lookahead], sort by scheduledFor.
    const seenUpcoming = new Set();
    const upcoming = [];
    for (const d of input.upcoming) {
        if (seenUpcoming.has(d.doseId))
            continue;
        const t = Date.parse(d.scheduledFor);
        if (Number.isNaN(t))
            continue;
        if (t < nowMs || t > windowEnd)
            continue;
        seenUpcoming.add(d.doseId);
        upcoming.push(d);
    }
    upcoming.sort((a, b) => Date.parse(a.scheduledFor) - Date.parse(b.scheduledFor));
    // Recent missed/late/skipped within recency window, dedup by doseId.
    const seenHist = new Set();
    const recentMissedOrLate = [];
    for (const h of input.history) {
        if (h.status === 'taken')
            continue;
        if (seenHist.has(h.doseId))
            continue;
        const t = Date.parse(h.scheduledFor);
        if (Number.isNaN(t))
            continue;
        if (t < windowStart || t > nowMs)
            continue;
        seenHist.add(h.doseId);
        recentMissedOrLate.push(h);
    }
    recentMissedOrLate.sort((a, b) => Date.parse(a.scheduledFor) - Date.parse(b.scheduledFor));
    // PRN summary: count uses in last 24h per medicationId.
    const prnByMed = new Map();
    for (const p of input.prnUsage) {
        const t = Date.parse(p.takenAt);
        if (Number.isNaN(t))
            continue;
        if (t < past24Start || t > nowMs)
            continue;
        const cur = prnByMed.get(p.medicationId) ?? { name: p.medicationName, cap: p.dailyCap, count: 0 };
        cur.count += 1;
        // Cap can vary if entries disagree; take the smallest to stay safe.
        cur.cap = Math.min(cur.cap, p.dailyCap);
        prnByMed.set(p.medicationId, cur);
    }
    const prnSummary = Array.from(prnByMed.entries())
        .map(([id, v]) => ({
        medicationId: id,
        medicationName: v.name,
        usedLast24h: v.count,
        dailyCap: v.cap,
        remaining: Math.max(0, v.cap - v.count),
        atCap: v.count >= v.cap,
    }))
        .sort((a, b) => a.medicationName.localeCompare(b.medicationName));
    // Alerts: dedup by id, drop acknowledged, sort by severity desc then raisedAt asc.
    const sevRank = { critical: 0, warning: 1, info: 2 };
    const seenAlert = new Set();
    const openAlerts = [];
    for (const a of input.alerts) {
        if (a.acknowledged)
            continue;
        if (seenAlert.has(a.id))
            continue;
        seenAlert.add(a.id);
        openAlerts.push(a);
    }
    openAlerts.sort((a, b) => sevRank[a.severity] - sevRank[b.severity] || Date.parse(a.raisedAt) - Date.parse(b.raisedAt));
    const text = renderText({
        patientName: input.patientName,
        outgoingCaregiver: input.outgoingCaregiver,
        incomingCaregiver: input.incomingCaregiver,
        now: input.now,
        lookahead,
        recency,
        upcoming,
        recentMissedOrLate,
        prnSummary,
        openAlerts,
    });
    return {
        patientName: input.patientName,
        generatedAt: input.now,
        outgoingCaregiver: input.outgoingCaregiver,
        incomingCaregiver: input.incomingCaregiver,
        windows: { lookaheadHours: lookahead, recencyHours: recency },
        upcoming,
        recentMissedOrLate,
        prnSummary,
        openAlerts,
        text,
    };
}
function renderText(r) {
    const lines = [];
    lines.push(`Shift handoff for ${r.patientName}`);
    lines.push(`From ${r.outgoingCaregiver} to ${r.incomingCaregiver} at ${r.now}.`);
    lines.push('');
    lines.push(`Upcoming doses (next ${r.lookahead}h): ${r.upcoming.length}`);
    for (const d of r.upcoming) {
        const tag = d.prn ? ' [PRN]' : '';
        lines.push(`  ${d.scheduledFor}  ${d.medicationName} ${d.strength}${tag}${d.instruction ? ' (' + d.instruction + ')' : ''}`);
    }
    lines.push('');
    lines.push(`Recent missed or late (last ${r.recency}h): ${r.recentMissedOrLate.length}`);
    for (const h of r.recentMissedOrLate) {
        lines.push(`  ${h.scheduledFor}  ${h.medicationName} -> ${h.status}`);
    }
    lines.push('');
    lines.push(`PRN use in last 24h: ${r.prnSummary.length} medications`);
    for (const p of r.prnSummary) {
        const flag = p.atCap ? ' AT CAP' : '';
        lines.push(`  ${p.medicationName}: ${p.usedLast24h}/${p.dailyCap}, ${p.remaining} remaining${flag}`);
    }
    lines.push('');
    lines.push(`Open alerts: ${r.openAlerts.length}`);
    for (const a of r.openAlerts) {
        lines.push(`  [${a.severity.toUpperCase()}] ${a.kind}: ${a.message}`);
    }
    return lines.join('\n');
}
