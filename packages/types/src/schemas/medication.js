"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NewMedicationSchema = exports.MedicationSchema = exports.MedicationFormSchema = void 0;
const zod_1 = require("zod");
exports.MedicationFormSchema = zod_1.z.enum([
    'tablet', 'capsule', 'liquid', 'injection', 'patch', 'inhaler', 'cream', 'drops', 'suppository', 'powder',
]);
exports.MedicationSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    userId: zod_1.z.string().uuid(),
    drugId: zod_1.z.string().min(1),
    name: zod_1.z.string().min(1).max(120),
    strength: zod_1.z.string().max(40),
    form: exports.MedicationFormSchema,
    instructions: zod_1.z.string().max(500).optional(),
    startDate: zod_1.z.string().date(),
    endDate: zod_1.z.string().date().nullable().optional(),
    active: zod_1.z.boolean().default(true),
    supplyRemaining: zod_1.z.number().int().nonnegative().default(0),
    dosesPerRefill: zod_1.z.number().int().positive().default(30),
});
exports.NewMedicationSchema = exports.MedicationSchema.omit({ id: true });
