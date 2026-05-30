"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeLocalStorage = void 0;
exports.safeLocalStorage = {
    get(key, fallback) {
        if (typeof window === 'undefined')
            return fallback;
        try {
            const raw = window.localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        }
        catch {
            return fallback;
        }
    },
    set(key, value) {
        if (typeof window === 'undefined')
            return;
        try {
            window.localStorage.setItem(key, JSON.stringify(value));
        }
        catch { }
    },
    remove(key) {
        if (typeof window === 'undefined')
            return;
        try {
            window.localStorage.removeItem(key);
        }
        catch { }
    },
};
