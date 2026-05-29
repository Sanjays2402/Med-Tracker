import { z } from 'zod';

export const MedicationFormSchema = z.enum([
  'tablet','capsule','liquid','injection','patch','inhaler','cream','drops','suppository','powder',
]);

export const MedicationSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  drugId: z.string().min(1),
  name: z.string().min(1).max(120),
  strength: z.string().max(40),
  form: MedicationFormSchema,
  instructions: z.string().max(500).optional(),
  startDate: z.string().date(),
  endDate: z.string().date().nullable().optional(),
  active: z.boolean().default(true),
  supplyRemaining: z.number().int().nonnegative().default(0),
  dosesPerRefill: z.number().int().positive().default(30),
});
export type Medication = z.infer<typeof MedicationSchema>;

export const NewMedicationSchema = MedicationSchema.omit({ id: true });
export type NewMedication = z.infer<typeof NewMedicationSchema>;
