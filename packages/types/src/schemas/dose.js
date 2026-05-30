"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogDoseSchema = exports.DoseSchema = exports.DoseStatus = void 0;
const zod_1 = require("zod");
exports.DoseStatus = zod_1.z.enum(['scheduled', 'taken', 'skipped', 'missed', 'late']);
exports.DoseSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    medicationId: zod_1.z.string().uuid(),
    scheduleId: zod_1.z.string().uuid(),
    dueAt: zod_1.z.string().datetime(),
    takenAt: zod_1.z.string().datetime().nullable().optional(),
    status: exports.DoseStatus.default('scheduled'),
    note: zod_1.z.string().max(280).optional(),
});
exports.LogDoseSchema = zod_1.z.object({
    doseId: zod_1.z.string().uuid(),
    status: exports.DoseStatus,
    note: zod_1.z.string().max(280).optional(),
});
