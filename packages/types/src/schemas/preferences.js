"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PreferencesSchema = void 0;
const zod_1 = require("zod");
exports.PreferencesSchema = zod_1.z.object({
    theme: zod_1.z.enum(['light', 'dark', 'system']).default('system'),
    reminderLeadMinutes: zod_1.z.number().int().min(0).max(60).default(5),
    quietHoursStart: zod_1.z.string().regex(/^\d{2}:\d{2}$/).default('22:00'),
    quietHoursEnd: zod_1.z.string().regex(/^\d{2}:\d{2}$/).default('07:00'),
    caregiverShareEnabled: zod_1.z.boolean().default(false),
});
