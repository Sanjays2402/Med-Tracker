"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InteractionSchema = exports.InteractionSeverity = void 0;
const zod_1 = require("zod");
exports.InteractionSeverity = zod_1.z.enum(['minor', 'moderate', 'major', 'contraindicated']);
exports.InteractionSchema = zod_1.z.object({
    a: zod_1.z.string(),
    b: zod_1.z.string(),
    severity: exports.InteractionSeverity,
    note: zod_1.z.string(),
});
