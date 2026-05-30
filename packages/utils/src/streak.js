"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeStreak = computeStreak;
const date_1 = require("./date");
/**
 * Compute current and longest streaks given chronologically sorted doses.
 * A day counts if at least one due dose was taken that day.
 */
function computeStreak(doses) {
    if (!doses.length)
        return { current: 0, longest: 0 };
    const days = new Set();
    for (const d of doses) {
        if (!d.takenAt)
            continue;
        days.add((0, date_1.startOfDay)(new Date(d.takenAt)).getTime());
    }
    let longest = 0;
    let run = 0;
    let cursor = (0, date_1.startOfDay)(new Date(doses[0].dueAt));
    const last = (0, date_1.startOfDay)(new Date(doses[doses.length - 1].dueAt));
    while (cursor.getTime() <= last.getTime()) {
        if (days.has(cursor.getTime())) {
            run += 1;
            longest = Math.max(longest, run);
        }
        else {
            run = 0;
        }
        cursor = (0, date_1.addDays)(cursor, 1);
    }
    let current = 0;
    let walk = (0, date_1.startOfDay)(new Date());
    while (days.has(walk.getTime())) {
        current += 1;
        walk = (0, date_1.addDays)(walk, -1);
    }
    // allow a 1 day grace if yesterday was taken but today not yet logged
    if (!days.has((0, date_1.startOfDay)(new Date()).getTime()) && days.has((0, date_1.addDays)((0, date_1.startOfDay)(new Date()), -1).getTime())) {
        // current already counted from yesterday
    }
    else if (current === 0 && days.has((0, date_1.addDays)((0, date_1.startOfDay)(new Date()), -1).getTime())) {
        current = 1;
    }
    return { current, longest };
}
