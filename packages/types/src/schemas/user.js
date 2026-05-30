"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NewUserSchema = exports.UserSchema = void 0;
const zod_1 = require("zod");
exports.UserSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    email: zod_1.z.string().email(),
    displayName: zod_1.z.string().min(1).max(80),
    timezone: zod_1.z.string().default('UTC'),
    locale: zod_1.z.enum(['en', 'es', 'hi', 'fr']).default('en'),
    createdAt: zod_1.z.string().datetime(),
});
exports.NewUserSchema = exports.UserSchema.omit({ id: true, createdAt: true });
