"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.err = exports.ok = void 0;
exports.unwrap = unwrap;
const ok = (value) => ({ ok: true, value });
exports.ok = ok;
const err = (error) => ({ ok: false, error });
exports.err = err;
function unwrap(r) {
    if (r.ok)
        return r.value;
    throw r.error;
}
