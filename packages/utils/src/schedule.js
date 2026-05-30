"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expandSchedule = expandSchedule;
const date_1 = require("./date");
/** Expand a schedule into concrete due timestamps between two dates. */
function expandSchedule(s, from, to) {
    const out = [];
    let cursor = (0, date_1.startOfDay)(from);
    const end = (0, date_1.startOfDay)(to);
    if (s.kind === 'asNeeded')
        return out;
    while (cursor.getTime() <= end.getTime()) {
        if (s.kind === 'daily') {
            for (const t of s.times)
                out.push((0, date_1.parseHHMM)(t, cursor));
        }
        else if (s.kind === 'weekly') {
            if (s.daysOfWeek?.includes(cursor.getDay())) {
                for (const t of s.times)
                    out.push((0, date_1.parseHHMM)(t, cursor));
            }
        }
        else if (s.kind === 'interval' && s.intervalHours) {
            let t = new Date(cursor);
            const dayEnd = (0, date_1.addDays)(cursor, 1);
            while (t.getTime() < dayEnd.getTime()) {
                out.push(new Date(t));
                t = (0, date_1.addHours)(t, s.intervalHours);
            }
        }
        cursor = (0, date_1.addDays)(cursor, 1);
    }
    return out.filter((d) => d.getTime() >= from.getTime() && d.getTime() <= to.getTime());
}
