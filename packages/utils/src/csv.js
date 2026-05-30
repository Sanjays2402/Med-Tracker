"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toCsv = toCsv;
function toCsv(rows, columns) {
    if (!rows.length)
        return '';
    const cols = columns ?? Object.keys(rows[0]);
    const esc = (v) => {
        const s = v == null ? '' : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = cols.join(',');
    const body = rows.map((r) => cols.map((c) => esc(r[c])).join(',')).join('\n');
    return `${head}\n${body}\n`;
}
