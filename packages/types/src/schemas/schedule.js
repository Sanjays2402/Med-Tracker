"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScheduleSchema = exports.TimeOfDaySchema = exports.ScheduleKind = void 0;
const zod_1 = require("zod");
exports.ScheduleKind = zod_1.z.enum(['daily', 'weekly', 'interval', 'cron', 'asNeeded']);
exports.TimeOfDaySchema = zod_1.z.string().regex(/^\d{2}:\d{2}$/, 'expect HH:MM');
exports.ScheduleSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    medicationId: zod_1.z.string().uuid(),
    kind: exports.ScheduleKind,
    times: zod_1.z.array(exports.TimeOfDaySchema).default([]),
    daysOfWeek: zod_1.z.array(zod_1.z.number().int().min(0).max(6)).optional(),
    intervalHours: zod_1.z.number().int().positive().optional(),
    cronExpression: zod_1.z.string().optional(),
    startsAt: zod_1.z.string().datetime(),
    endsAt: zod_1.z.string().datetime().nullable().optional(),
    enabled: zod_1.z.boolean().default(true),
});
