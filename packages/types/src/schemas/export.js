"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExportRequestSchema = exports.ExportFormat = void 0;
const zod_1 = require("zod");
exports.ExportFormat = zod_1.z.enum(['csv', 'pdf', 'json']);
exports.ExportRequestSchema = zod_1.z.object({
    format: exports.ExportFormat,
    from: zod_1.z.string().date(),
    to: zod_1.z.string().date(),
    includeNotes: zod_1.z.boolean().default(true),
});
