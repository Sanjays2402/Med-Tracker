"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdherenceReportSchema = exports.WeeklyPointSchema = void 0;
const zod_1 = require("zod");
exports.WeeklyPointSchema = zod_1.z.object({ date: zod_1.z.string().date(), takenPct: zod_1.z.number().min(0).max(100) });
exports.AdherenceReportSchema = zod_1.z.object({
    userId: zod_1.z.string().uuid(),
    from: zod_1.z.string().date(),
    to: zod_1.z.string().date(),
    adherencePct: zod_1.z.number().min(0).max(100),
    weekly: zod_1.z.array(exports.WeeklyPointSchema),
});
