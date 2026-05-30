"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startOfDay = startOfDay;
exports.endOfDay = endOfDay;
exports.addDays = addDays;
exports.addHours = addHours;
exports.diffDays = diffDays;
exports.isSameDay = isSameDay;
exports.parseHHMM = parseHHMM;
exports.formatHHMM = formatHHMM;
function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}
function endOfDay(d) {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
}
function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
}
function addHours(d, n) {
    const x = new Date(d);
    x.setHours(x.getHours() + n);
    return x;
}
function diffDays(a, b) {
    return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86_400_000);
}
function isSameDay(a, b) {
    return startOfDay(a).getTime() === startOfDay(b).getTime();
}
function parseHHMM(value, base = new Date()) {
    const [h, m] = value.split(':').map(Number);
    const out = new Date(base);
    out.setHours(h, m, 0, 0);
    return out;
}
function formatHHMM(d) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
