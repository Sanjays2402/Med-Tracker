"use strict";
/**
 * Travel-aware dose-time planner.
 *
 * When a patient travels across timezones, naively keeping the original local
 * times in the new zone can either compress two doses dangerously close
 * together (eastbound) or stretch them too far apart (westbound). The
 * conservative real-world approach is to shift dose times gradually over
 * several days so the inter-dose interval stays inside a drug-specific
 * tolerance band.
 *
 * planTravelSchedule takes:
 *   - the home zone and target zone (IANA),
 *   - the trip start (departure) and end (return) UTC instants,
 *   - the home-zone dose wall times (e.g. ["08:00","20:00"]),
 *   - the target inter-dose interval and an allowed deviation,
 *   - an optional max shift per day (hours).
 *
 * It returns one entry per scheduled dose between trip start and return,
 * each carrying:
 *   - the UTC instant the dose should be taken,
 *   - the wall time in the active zone for display,
 *   - whether this dose is during the outbound shift, steady state in the
 *     destination, or the inbound shift back.
 *
 * Pure and deterministic. No DB, no network.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.planTravelSchedule = planTravelSchedule;
function offsetMinutes(date, zone) {
    // Use Intl to render the date in the target zone, then reconstruct UTC
    // from the wall fields and difference with the original UTC ms.
    const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
    const parts = fmt.formatToParts(date);
    const get = (t) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') === 24 ? 0 : get('hour'), get('minute'), get('second'));
    return Math.round((asUtc - date.getTime()) / 60_000);
}
function parseHHMM(s) {
    const [h, m] = s.split(':').map((x) => Number(x));
    if (!Number.isFinite(h) || !Number.isFinite(m))
        throw new Error(`bad time: ${s}`);
    return { h: h ?? 0, m: m ?? 0 };
}
function fmtHHMM(h, m) {
    const hh = ((h % 24) + 24) % 24;
    return `${String(hh).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
/**
 * UTC instant whose wall clock in `zone` on the given calendar day is hh:mm.
 * Uses a single offset correction; correct to the minute for all modern zones
 * except inside a DST gap, where the result lands at the gap boundary.
 */
function utcForZoneWallTime(zone, year, month1, day, hh, mm) {
    const guess = new Date(Date.UTC(year, month1 - 1, day, hh, mm));
    const off1 = offsetMinutes(guess, zone);
    const corrected = new Date(guess.getTime() - off1 * 60_000);
    const off2 = offsetMinutes(corrected, zone);
    if (off2 === off1)
        return corrected;
    return new Date(guess.getTime() - off2 * 60_000);
}
function zonedYMD(date, zone) {
    const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    const parts = fmt.formatToParts(date);
    const get = (t) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    return { y: get('year'), m: get('month'), d: get('day') };
}
function addCalendarDays(ymd, n) {
    const t = Date.UTC(ymd.y, ymd.m - 1, ymd.d) + n * 86_400_000;
    const x = new Date(t);
    return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate() };
}
function ymdCompare(a, b) {
    if (a.y !== b.y)
        return a.y - b.y;
    if (a.m !== b.m)
        return a.m - b.m;
    return a.d - b.d;
}
function planTravelSchedule(input) {
    const { homeZone, targetZone, departAt, returnAt, homeTimes, intervalHours, toleranceHours = 2, maxShiftPerDayHours = 2, } = input;
    if (homeTimes.length === 0) {
        return {
            doses: [],
            offsetDeltaHours: 0,
            outboundShiftDays: 0,
            inboundShiftDays: 0,
            summary: 'No dose times provided.',
        };
    }
    const depart = new Date(departAt);
    const ret = new Date(returnAt);
    if (ret.getTime() <= depart.getTime()) {
        return {
            doses: [],
            offsetDeltaHours: 0,
            outboundShiftDays: 0,
            inboundShiftDays: 0,
            summary: 'Return must be after departure.',
        };
    }
    const homeOff = offsetMinutes(depart, homeZone) / 60;
    const targetOff = offsetMinutes(depart, targetZone) / 60;
    // Positive delta means target is ahead of home (eastbound).
    const offsetDeltaHours = targetOff - homeOff;
    const shiftDaysNeeded = Math.ceil(Math.abs(offsetDeltaHours) / Math.max(0.5, maxShiftPerDayHours));
    // Build the sequence of (zone, wall-time list) per calendar day from depart
    // through return. Wall times slide from home toward target during outbound,
    // hold steady at target, then slide back during inbound.
    const doses = [];
    const parsedHome = homeTimes.map(parseHHMM);
    // Total trip days (calendar days in the home zone for stable indexing).
    const startDay = zonedYMD(depart, homeZone);
    const endDay = zonedYMD(ret, homeZone);
    // Reserve inbound shift days starting (shiftDays) before endDay.
    let dayIndex = 0;
    let cursor = { ...startDay };
    const tripDays = [];
    while (ymdCompare(cursor, endDay) <= 0) {
        tripDays.push({ ...cursor });
        cursor = addCalendarDays(cursor, 1);
    }
    const totalDays = tripDays.length;
    const outboundShiftDays = Math.min(shiftDaysNeeded, Math.max(0, totalDays - 1));
    const inboundShiftDays = Math.min(shiftDaysNeeded, Math.max(0, totalDays - outboundShiftDays - 1));
    for (const day of tripDays) {
        let progress; // 0 = home wall, 1 = target wall
        let leg;
        let zone;
        if (dayIndex < outboundShiftDays) {
            progress = (dayIndex + 1) / (outboundShiftDays + 1);
            leg = 'outbound-shift';
            // Use the target zone for display once half-shifted, otherwise home zone.
            zone = progress >= 0.5 ? targetZone : homeZone;
        }
        else if (dayIndex >= totalDays - inboundShiftDays) {
            const inboundIdx = dayIndex - (totalDays - inboundShiftDays);
            progress = 1 - (inboundIdx + 1) / (inboundShiftDays + 1);
            leg = 'inbound-shift';
            zone = progress >= 0.5 ? targetZone : homeZone;
        }
        else {
            progress = 1;
            leg = 'destination-steady';
            zone = targetZone;
        }
        for (const t of parsedHome) {
            // Shift home wall time by `progress * offsetDeltaHours` so that at
            // progress=1 the dose lands at the same _absolute_ moment it would in
            // the target zone if the user had been there all along. We model the
            // intended dose as the home wall time minus offset progress: eastbound
            // (positive delta) means doses move earlier on the home clock.
            const shifted = t.h * 60 + t.m + Math.round(progress * offsetDeltaHours * 60);
            const baseDay = zone === homeZone ? day : zonedYMD(utcForZoneWallTime(homeZone, day.y, day.m, day.d, 12, 0), targetZone);
            // Normalize into a 0..1439 wall minute within the chosen day; handle rollover.
            const total = shifted;
            const dayOffset = Math.floor(total / 1440);
            const wallMin = ((total % 1440) + 1440) % 1440;
            const dayAdjusted = addCalendarDays(baseDay, dayOffset);
            const hh = Math.floor(wallMin / 60);
            const mm = wallMin % 60;
            const utc = utcForZoneWallTime(zone, dayAdjusted.y, dayAdjusted.m, dayAdjusted.d, hh, mm);
            if (utc.getTime() < depart.getTime() || utc.getTime() > ret.getTime())
                continue;
            doses.push({
                takeAt: utc.toISOString(),
                displayLocalTime: fmtHHMM(hh, mm),
                displayZone: zone,
                leg,
                intervalFromPrev: null,
                intervalWarning: false,
            });
        }
        dayIndex += 1;
    }
    doses.sort((a, b) => a.takeAt.localeCompare(b.takeAt));
    for (let i = 0; i < doses.length; i++) {
        if (i === 0)
            continue;
        const dt = (new Date(doses[i].takeAt).getTime() - new Date(doses[i - 1].takeAt).getTime()) / 3_600_000;
        doses[i].intervalFromPrev = Number(dt.toFixed(2));
        doses[i].intervalWarning = Math.abs(dt - intervalHours) > toleranceHours;
    }
    const warnings = doses.filter((d) => d.intervalWarning).length;
    const summary = `${doses.length} doses planned across a ${Math.abs(offsetDeltaHours)}h ${offsetDeltaHours >= 0 ? 'eastbound' : 'westbound'} trip; ` +
        `${outboundShiftDays} day outbound shift, ${inboundShiftDays} day inbound shift, ${warnings} interval warning${warnings === 1 ? '' : 's'}.`;
    return {
        doses,
        offsetDeltaHours,
        outboundShiftDays,
        inboundShiftDays,
        summary,
    };
}
