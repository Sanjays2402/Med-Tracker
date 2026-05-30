"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationSchema = exports.NotificationChannel = void 0;
const zod_1 = require("zod");
exports.NotificationChannel = zod_1.z.enum(['push', 'email', 'sms', 'inApp']);
exports.NotificationSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    userId: zod_1.z.string().uuid(),
    channel: exports.NotificationChannel,
    subject: zod_1.z.string(),
    body: zod_1.z.string(),
    sentAt: zod_1.z.string().datetime().nullable().optional(),
    readAt: zod_1.z.string().datetime().nullable().optional(),
});
