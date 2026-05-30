"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adherencePct = adherencePct;
exports.weeklyAdherence = weeklyAdherence;
const date_1 = require("./date");
function adherencePct(doses) {
    if (!doses.length)
        return 0;
    const taken = doses.filter((d) => d.takenAt).length;
    return Math.round((taken / doses.length) * 100);
}
function weeklyAdherence(doses, days = 7) {
    const today = (0, date_1.startOfDay)(new Date());
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
        const day = (0, date_1.addDays)(today, -i);
        const next = (0, date_1.addDays)(day, 1);
        const slice = doses.filter((d) => {
            const t = new Date(d.dueAt).getTime();
            return t >= day.getTime() && t < next.getTime();
        });
        out.push({ date: day.toISOString().slice(0, 10), takenPct: adherencePct(slice) });
    }
    return out;
}
