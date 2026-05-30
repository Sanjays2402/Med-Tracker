"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenSchema = exports.SignupSchema = exports.LoginSchema = void 0;
const zod_1 = require("zod");
exports.LoginSchema = zod_1.z.object({ email: zod_1.z.string().email(), password: zod_1.z.string().min(8) });
exports.SignupSchema = exports.LoginSchema.extend({ displayName: zod_1.z.string().min(1).max(80) });
exports.TokenSchema = zod_1.z.object({ token: zod_1.z.string(), expiresAt: zod_1.z.string().datetime() });
