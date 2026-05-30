"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StreakSchema = void 0;
const zod_1 = require("zod");
exports.StreakSchema = zod_1.z.object({
    medicationId: zod_1.z.string().uuid(),
    currentDays: zod_1.z.number().int().nonnegative(),
    longestDays: zod_1.z.number().int().nonnegative(),
    lastTakenAt: zod_1.z.string().datetime().nullable(),
});
