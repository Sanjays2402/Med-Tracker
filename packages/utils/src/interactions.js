"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findInteractions = findInteractions;
/**
 * Cross check a user's active drug list against each drug's known interaction list.
 * Returns deduplicated pairs.
 */
function findInteractions(active) {
    const out = [];
    const seen = new Set();
    for (let i = 0; i < active.length; i++) {
        for (let j = i + 1; j < active.length; j++) {
            const a = active[i];
            const b = active[j];
            const matchAB = a.interactions.some((x) => b.generic.toLowerCase().includes(x.toLowerCase()) || b.class.toLowerCase().includes(x.toLowerCase()));
            const matchBA = b.interactions.some((x) => a.generic.toLowerCase().includes(x.toLowerCase()) || a.class.toLowerCase().includes(x.toLowerCase()));
            if (matchAB || matchBA) {
                const key = [a.id, b.id].sort().join('|');
                if (seen.has(key))
                    continue;
                seen.add(key);
                out.push({ a: a.generic, b: b.generic, severity: 'moderate', note: `Possible interaction between ${a.generic} and ${b.generic}.` });
            }
        }
    }
    return out;
}
