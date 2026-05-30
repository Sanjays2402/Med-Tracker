"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.titleCase = exports.fmtPercent = exports.fmtRelative = exports.fmtTime = exports.fmtDateLong = void 0;
const fmtDateLong = (d, locale = 'en-US') => new Date(d).toLocaleDateString(locale, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
exports.fmtDateLong = fmtDateLong;
const fmtTime = (d, locale = 'en-US') => new Date(d).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
exports.fmtTime = fmtTime;
const fmtRelative = (d) => {
    const ms = new Date(d).getTime() - Date.now();
    const abs = Math.abs(ms);
    const mins = Math.round(abs / 60_000);
    if (mins < 60)
        return ms > 0 ? `in ${mins} min` : `${mins} min ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24)
        return ms > 0 ? `in ${hrs} h` : `${hrs} h ago`;
    const days = Math.round(hrs / 24);
    return ms > 0 ? `in ${days} d` : `${days} d ago`;
};
exports.fmtRelative = fmtRelative;
const fmtPercent = (n) => `${Math.round(n)}%`;
exports.fmtPercent = fmtPercent;
const titleCase = (s) => s.replace(/\w\S*/g, (t) => t[0].toUpperCase() + t.slice(1).toLowerCase());
exports.titleCase = titleCase;
