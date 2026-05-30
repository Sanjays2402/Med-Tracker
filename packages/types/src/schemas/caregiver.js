"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CaregiverShareSchema = void 0;
const zod_1 = require("zod");
exports.CaregiverShareSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    userId: zod_1.z.string().uuid(),
    token: zod_1.z.string().min(20),
    label: zod_1.z.string().max(80),
    expiresAt: zod_1.z.string().datetime().nullable().optional(),
    scopes: zod_1.z.array(zod_1.z.enum(['view-meds', 'view-adherence', 'view-refills'])).default(['view-meds']),
    createdAt: zod_1.z.string().datetime(),
});
