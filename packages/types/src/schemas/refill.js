"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RefillSchema = void 0;
const zod_1 = require("zod");
exports.RefillSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    medicationId: zod_1.z.string().uuid(),
    filledAt: zod_1.z.string().datetime(),
    quantity: zod_1.z.number().int().positive(),
    pharmacy: zod_1.z.string().max(120).optional(),
    prescriber: zod_1.z.string().max(120).optional(),
    cost: zod_1.z.number().nonnegative().optional(),
});
