"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chunk = chunk;
exports.uniqBy = uniqBy;
function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size)
        out.push(arr.slice(i, i + size));
    return out;
}
function uniqBy(arr, key) {
    const seen = new Set();
    return arr.filter((x) => {
        const k = key(x);
        if (seen.has(k))
            return false;
        seen.add(k);
        return true;
    });
}
