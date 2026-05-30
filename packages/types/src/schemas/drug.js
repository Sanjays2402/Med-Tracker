"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DrugIndexEntrySchema = exports.DrugSchema = void 0;
const zod_1 = require("zod");
exports.DrugSchema = zod_1.z.object({
    id: zod_1.z.string(),
    generic: zod_1.z.string(),
    brand: zod_1.z.string(),
    class: zod_1.z.string(),
    rxnormSample: zod_1.z.number().int(),
    indications: zod_1.z.array(zod_1.z.string()),
    dosages: zod_1.z.array(zod_1.z.string()),
    routes: zod_1.z.array(zod_1.z.string()),
    frequencies: zod_1.z.array(zod_1.z.string()),
    interactions: zod_1.z.array(zod_1.z.string()),
    warnings: zod_1.z.array(zod_1.z.string()),
    pregnancyCategory: zod_1.z.enum(['A', 'B', 'C', 'D', 'X']),
    storage: zod_1.z.string(),
    sourceNote: zod_1.z.string(),
});
exports.DrugIndexEntrySchema = exports.DrugSchema.pick({ id: true, generic: true, brand: true, class: true });
