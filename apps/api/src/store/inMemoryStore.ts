/**
 * In-memory persistence store used by the reference REST API.
 *
 * The production deployment is expected to back these collections with Prisma
 * (see `plugins/prismaShim.ts`). Until that is wired, this module gives the web
 * client a real, mutable backend so list, detail, create, and mutation flows
 * round-trip through the server instead of falling back to client-side seeds.
 */

export type Medication = {
  id: string;
  name: string;
  strength?: string;
  form?: string;
  instructions?: string;
  schedule?: string;
  remainingDoses?: number;
  refillThresholdDays?: number;
  createdAt: string;
  archivedAt?: string | null;
};

export type DoseEvent = {
  id: string;
  medicationId: string;
  medicationName: string;
  strength?: string;
  scheduledAt: string;
  status: 'pending' | 'taken' | 'skipped';
  takenAt?: string;
};

export type Refill = {
  id: string;
  medicationId: string;
  medicationName: string;
  pharmacy?: string;
  refillBy: string;
  status: 'needed' | 'requested' | 'ready' | 'filled';
  daysSupply: number;
};

function todayAt(h: number, m = 0): string {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

function refillAt(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function id(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

const nowIso = () => new Date().toISOString();

const meds: Medication[] = [
  { id: 'med_lisinopril', name: 'Lisinopril', strength: '10 mg', form: 'tablet', instructions: 'Take once daily in the morning with water.', remainingDoses: 18, refillThresholdDays: 7, schedule: '08:00 daily', createdAt: nowIso() },
  { id: 'med_metformin', name: 'Metformin', strength: '500 mg', form: 'tablet', instructions: 'Take with meals to reduce stomach upset.', remainingDoses: 42, refillThresholdDays: 10, schedule: '08:00, 20:00 daily', createdAt: nowIso() },
  { id: 'med_atorvastatin', name: 'Atorvastatin', strength: '20 mg', form: 'tablet', instructions: 'Take at bedtime.', remainingDoses: 6, refillThresholdDays: 7, schedule: '22:00 daily', createdAt: nowIso() },
  { id: 'med_vitd', name: 'Vitamin D3', strength: '1000 IU', form: 'softgel', instructions: 'Take with a meal containing fat.', remainingDoses: 84, refillThresholdDays: 14, schedule: '08:00 daily', createdAt: nowIso() },
  { id: 'med_amox', name: 'Amoxicillin', strength: '500 mg', form: 'capsule', instructions: 'Finish the full course even if you feel better.', remainingDoses: 9, refillThresholdDays: 3, schedule: '08:00, 14:00, 20:00 (3 days left)', createdAt: nowIso() },
];

const doses: DoseEvent[] = [
  { id: 'd1', medicationId: 'med_lisinopril', medicationName: 'Lisinopril', strength: '10 mg', scheduledAt: todayAt(8), status: 'taken', takenAt: todayAt(8, 12) },
  { id: 'd2', medicationId: 'med_metformin', medicationName: 'Metformin', strength: '500 mg', scheduledAt: todayAt(8), status: 'taken', takenAt: todayAt(8, 14) },
  { id: 'd3', medicationId: 'med_vitd', medicationName: 'Vitamin D3', strength: '1000 IU', scheduledAt: todayAt(8), status: 'taken', takenAt: todayAt(8, 14) },
  { id: 'd4', medicationId: 'med_amox', medicationName: 'Amoxicillin', strength: '500 mg', scheduledAt: todayAt(14), status: 'pending' },
  { id: 'd5', medicationId: 'med_metformin', medicationName: 'Metformin', strength: '500 mg', scheduledAt: todayAt(20), status: 'pending' },
  { id: 'd6', medicationId: 'med_amox', medicationName: 'Amoxicillin', strength: '500 mg', scheduledAt: todayAt(20), status: 'pending' },
  { id: 'd7', medicationId: 'med_atorvastatin', medicationName: 'Atorvastatin', strength: '20 mg', scheduledAt: todayAt(22), status: 'pending' },
];

const refills: Refill[] = [
  { id: 'r1', medicationId: 'med_atorvastatin', medicationName: 'Atorvastatin', pharmacy: 'CVS, Main St', refillBy: refillAt(3), status: 'needed', daysSupply: 6 },
  { id: 'r2', medicationId: 'med_amox', medicationName: 'Amoxicillin', pharmacy: 'Walgreens', refillBy: refillAt(2), status: 'needed', daysSupply: 3 },
  { id: 'r3', medicationId: 'med_lisinopril', medicationName: 'Lisinopril', pharmacy: 'CVS, Main St', refillBy: refillAt(11), status: 'requested', daysSupply: 18 },
  { id: 'r4', medicationId: 'med_metformin', medicationName: 'Metformin', pharmacy: 'CVS, Main St', refillBy: refillAt(21), status: 'ready', daysSupply: 42 },
];

export const store = {
  // medications
  listMedications(): Medication[] {
    return meds.filter((m) => !m.archivedAt);
  },
  getMedication(mid: string): Medication | undefined {
    return meds.find((m) => m.id === mid);
  },
  createMedication(input: Omit<Medication, 'id' | 'createdAt'>): Medication {
    const created: Medication = { ...input, id: id('med'), createdAt: nowIso() };
    meds.unshift(created);
    return created;
  },
  updateMedication(mid: string, patch: Partial<Medication>): Medication | undefined {
    const i = meds.findIndex((m) => m.id === mid);
    if (i < 0) return undefined;
    const current = meds[i]!;
    const next: Medication = { ...current, ...patch };
    meds[i] = next;
    return next;
  },
  archiveMedication(mid: string): Medication | undefined {
    return store.updateMedication(mid, { archivedAt: nowIso() });
  },

  // doses
  listDosesToday(): DoseEvent[] {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(24, 0, 0, 0);
    return doses.filter((d) => {
      const t = +new Date(d.scheduledAt);
      return t >= +start && t < +end;
    });
  },
  setDoseStatus(did: string, status: DoseEvent['status']): DoseEvent | undefined {
    const i = doses.findIndex((d) => d.id === did);
    if (i < 0) return undefined;
    const current = doses[i]!;
    const next: DoseEvent = { ...current, status, takenAt: status === 'taken' ? nowIso() : current.takenAt };
    doses[i] = next;
    return next;
  },

  // refills
  listRefills(): Refill[] {
    return refills.slice();
  },
  getRefill(rid: string): Refill | undefined {
    return refills.find((r) => r.id === rid);
  },
  updateRefill(rid: string, patch: Partial<Refill>): Refill | undefined {
    const i = refills.findIndex((r) => r.id === rid);
    if (i < 0) return undefined;
    const current = refills[i]!;
    const next: Refill = { ...current, ...patch };
    refills[i] = next;
    return next;
  },
};
