"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildInteractionGraph = buildInteractionGraph;
exports.rankSwapCandidates = rankSwapCandidates;
const interaction_severity_1 = require("./interaction-severity");
/**
 * Regimen-level interaction graph.
 *
 * Given a list of active drugs, classifyInteractions returns the pairwise edges.
 * For multi-drug regimens it is also useful to see:
 *   - which drugs participate in the most interactions (hubs),
 *   - connected clusters of mutually interacting drugs,
 *   - the highest-severity edge per drug and across the regimen,
 *   - a single composite regimen risk score so caregivers can triage at a glance.
 *
 * The functions here are pure and deterministic. They operate on the output of
 * classifyInteractions plus the original drug list so callers (API, web, mobile)
 * share one ranking.
 */
const SEVERITY_WEIGHT = {
    minor: 1,
    moderate: 3,
    major: 7,
    contraindicated: 15,
};
function severityMax(a, b) {
    if (a === null)
        return b;
    return SEVERITY_WEIGHT[b] > SEVERITY_WEIGHT[a] ? b : a;
}
/**
 * Build a deterministic interaction graph for an active drug regimen.
 *
 * Drugs without any interaction edge are still represented as nodes so the
 * caller can render a complete regimen view.
 */
function buildInteractionGraph(active) {
    const sorted = [...active].sort((a, b) => a.id.localeCompare(b.id));
    const scored = (0, interaction_severity_1.classifyInteractions)(sorted);
    // Index drugs by generic (lowercased) and by id so we can rebuild edge endpoints.
    const byGeneric = new Map();
    for (const d of sorted)
        byGeneric.set(d.generic.toLowerCase(), d);
    const edges = [];
    for (const s of scored) {
        const a = byGeneric.get(s.a.toLowerCase());
        const b = byGeneric.get(s.b.toLowerCase());
        if (!a || !b)
            continue;
        const ids = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
        edges.push({ ...s, drugIds: ids });
    }
    edges.sort((x, y) => {
        const sev = SEVERITY_WEIGHT[y.severity] - SEVERITY_WEIGHT[x.severity];
        if (sev !== 0)
            return sev;
        return x.drugIds.join('|').localeCompare(y.drugIds.join('|'));
    });
    // Build adjacency.
    const adjacency = new Map();
    const neighborGenerics = new Map();
    const nodeWeight = new Map();
    const nodeWorst = new Map();
    for (const d of sorted) {
        adjacency.set(d.id, new Set());
        neighborGenerics.set(d.id, new Set());
        nodeWeight.set(d.id, 0);
        nodeWorst.set(d.id, null);
    }
    for (const e of edges) {
        const [x, y] = e.drugIds;
        adjacency.get(x).add(y);
        adjacency.get(y).add(x);
        const dx = sorted.find((d) => d.id === x);
        const dy = sorted.find((d) => d.id === y);
        neighborGenerics.get(x).add(dy.generic);
        neighborGenerics.get(y).add(dx.generic);
        const w = SEVERITY_WEIGHT[e.severity];
        nodeWeight.set(x, nodeWeight.get(x) + w);
        nodeWeight.set(y, nodeWeight.get(y) + w);
        nodeWorst.set(x, severityMax(nodeWorst.get(x), e.severity));
        nodeWorst.set(y, severityMax(nodeWorst.get(y), e.severity));
    }
    const nodes = sorted.map((d) => ({
        drugId: d.id,
        generic: d.generic,
        degree: adjacency.get(d.id).size,
        worstSeverity: nodeWorst.get(d.id),
        weight: nodeWeight.get(d.id),
        neighbors: [...neighborGenerics.get(d.id)].sort(),
    }));
    // Connected components (clusters) restricted to nodes with at least one edge.
    const visited = new Set();
    const clusters = [];
    for (const d of sorted) {
        if (visited.has(d.id))
            continue;
        if (adjacency.get(d.id).size === 0)
            continue;
        const stack = [d.id];
        const members = [];
        while (stack.length) {
            const cur = stack.pop();
            if (visited.has(cur))
                continue;
            visited.add(cur);
            members.push(cur);
            for (const nb of adjacency.get(cur))
                if (!visited.has(nb))
                    stack.push(nb);
        }
        members.sort();
        let edgeCount = 0;
        let worst = 'minor';
        let worstW = 0;
        for (const e of edges) {
            if (members.includes(e.drugIds[0]) && members.includes(e.drugIds[1])) {
                edgeCount++;
                if (SEVERITY_WEIGHT[e.severity] > worstW) {
                    worstW = SEVERITY_WEIGHT[e.severity];
                    worst = e.severity;
                }
            }
        }
        const generics = members.map((id) => sorted.find((d) => d.id === id).generic).sort();
        clusters.push({ drugIds: members, generics, worstSeverity: worst, edgeCount });
    }
    clusters.sort((a, b) => {
        const sev = SEVERITY_WEIGHT[b.worstSeverity] - SEVERITY_WEIGHT[a.worstSeverity];
        if (sev !== 0)
            return sev;
        if (b.edgeCount !== a.edgeCount)
            return b.edgeCount - a.edgeCount;
        return a.drugIds[0].localeCompare(b.drugIds[0]);
    });
    let worstSeverity = null;
    for (const e of edges)
        worstSeverity = severityMax(worstSeverity, e.severity);
    const riskScore = edges.reduce((acc, e) => acc + SEVERITY_WEIGHT[e.severity], 0);
    const hubs = [...nodes]
        .filter((n) => n.weight > 0)
        .sort((a, b) => b.weight - a.weight || a.drugId.localeCompare(b.drugId))
        .map((n) => n.drugId);
    let summary;
    if (edges.length === 0) {
        summary = 'No interactions detected across the active regimen.';
    }
    else {
        const sev = worstSeverity ?? 'minor';
        summary = `${edges.length} interaction${edges.length === 1 ? '' : 's'} across ${clusters.length} cluster${clusters.length === 1 ? '' : 's'}; worst severity ${sev}.`;
    }
    return { edges, nodes, clusters, worstSeverity, riskScore, hubs, summary };
}
function rankSwapCandidates(active) {
    const base = buildInteractionGraph(active);
    const out = [];
    for (const d of active) {
        const without = active.filter((x) => x.id !== d.id);
        const after = buildInteractionGraph(without);
        out.push({
            drugId: d.id,
            generic: d.generic,
            currentRisk: base.riskScore,
            riskIfRemoved: after.riskScore,
            riskReduction: base.riskScore - after.riskScore,
        });
    }
    out.sort((a, b) => b.riskReduction - a.riskReduction || a.drugId.localeCompare(b.drugId));
    return out;
}
