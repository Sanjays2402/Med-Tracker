"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isInQuietHours = isInQuietHours;
exports.deferToAllowedWindow = deferToAllowedWindow;
exports.planReminders = planReminders;
const date_1 = require("./date");
function minutesOfDay(d) {
    return d.getHours() * 60 + d.getMinutes();
}
function parseHM(value) {
    const [h, m] = value.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
}
/**
 * True when `instant` falls inside the quiet window. Handles both same-day
 * (start < end) and overnight (start > end) windows. start == end is treated
 * as "no quiet hours".
 */
function isInQuietHours(instant, quiet) {
    const startMin = parseHM(quiet.start);
    const endMin = parseHM(quiet.end);
    if (startMin === endMin)
        return false;
    const minute = minutesOfDay(instant);
    if (startMin < endMin)
        return minute >= startMin && minute < endMin;
    // overnight window wraps midnight
    return minute >= startMin || minute < endMin;
}
/**
 * If `instant` is inside the quiet window, return the next instant at which
 * reminders are allowed (the end of the current quiet window). Otherwise
 * return `instant` unchanged.
 */
function deferToAllowedWindow(instant, quiet) {
    if (!isInQuietHours(instant, quiet))
        return instant;
    const startMin = parseHM(quiet.start);
    const endMin = parseHM(quiet.end);
    // Compute the next end boundary after `instant`.
    if (startMin < endMin) {
        // same-day window; end is later today
        return (0, date_1.parseHHMM)(quiet.end, instant);
    }
    // overnight window
    if (minutesOfDay(instant) >= startMin) {
        // we are in the pre-midnight tail; end is tomorrow at quiet.end
        return (0, date_1.parseHHMM)(quiet.end, (0, date_1.addDays)(instant, 1));
    }
    // we are in the post-midnight head; end is today at quiet.end
    return (0, date_1.parseHHMM)(quiet.end, instant);
}
/**
 * Decide when each due reminder should actually fire, given quiet hours and a
 * lead window. A reminder may fire up to `leadMinutes` before its dueAt, but
 * never inside the quiet window.
 */
function planReminders(items, options) {
    const leadMinutes = options.leadMinutes ?? 5;
    const out = [];
    for (const item of items) {
        const target = item.dueAt;
        const earliest = new Date(target.getTime() - leadMinutes * 60_000);
        let fireAt = earliest.getTime() < options.now.getTime() ? options.now : earliest;
        let deferred = false;
        if (options.quiet && isInQuietHours(fireAt, options.quiet)) {
            fireAt = deferToAllowedWindow(fireAt, options.quiet);
            deferred = true;
        }
        out.push({
            ...item,
            fireAt,
            deferred,
            snoozeEligible: !deferred && fireAt.getTime() <= target.getTime(),
        });
    }
    return out.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
}
