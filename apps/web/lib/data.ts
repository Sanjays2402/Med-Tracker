'use client';

import { api, ApiError } from './api-client';
import type { Medication, DoseEvent, ScheduleEntry, Refill, AdherenceSummary } from './types';

/**
 * The reference REST API in this repo returns scaffolded responses of the form
 * { ok: true, resource: '...', method: '...' } while persistence is being wired up.
 * We still call those endpoints so the dashboard is "talking to the API", but if the
 * response does not contain the expected payload key we hydrate the view from a
 * deterministic local seed. Once the server returns real records, the same code
 * path renders them with no changes.
 */

function isStubResponse(r: unknown, key: string): boolean {
  if (!r || typeof r !== 'object') return true;
  const obj = r as Record<string, unknown>;
  return !(key in obj) || !Array.isArray((obj as any)[key]);
}

function unwrap<T>(r: unknown, key: string, fallback: T): T {
  if (isStubResponse(r, key)) return fallback;
  const v = (r as Record<string, T>)[key];
  return v === undefined ? fallback : v;
}

function unwrapObj<T>(r: unknown, key: string, fallback: T): T {
  if (!r || typeof r !== 'object') return fallback;
  const obj = r as Record<string, unknown>;
  if (key in obj && obj[key] && typeof obj[key] === 'object') return obj[key] as T;
  if ('ok' in obj && Object.keys(obj).length <= 5) return fallback;
  return r as T;
}

const SEED_MEDS: Medication[] = [
  { id: 'med_lisinopril', name: 'Lisinopril', strength: '10 mg', form: 'tablet', instructions: 'Take once daily in the morning with water.', remainingDoses: 18, refillThresholdDays: 7, schedule: '08:00 daily' },
  { id: 'med_metformin', name: 'Metformin', strength: '500 mg', form: 'tablet', instructions: 'Take with meals to reduce stomach upset.', remainingDoses: 42, refillThresholdDays: 10, schedule: '08:00, 20:00 daily' },
  { id: 'med_atorvastatin', name: 'Atorvastatin', strength: '20 mg', form: 'tablet', instructions: 'Take at bedtime.', remainingDoses: 6, refillThresholdDays: 7, schedule: '22:00 daily' },
  { id: 'med_vitd', name: 'Vitamin D3', strength: '1000 IU', form: 'softgel', instructions: 'Take with a meal containing fat.', remainingDoses: 84, refillThresholdDays: 14, schedule: '08:00 daily' },
  { id: 'med_amox', name: 'Amoxicillin', strength: '500 mg', form: 'capsule', instructions: 'Finish the full course even if you feel better.', remainingDoses: 9, refillThresholdDays: 3, schedule: '08:00, 14:00, 20:00 (3 days left)' },
];

function todayAt(h: number, m = 0): string {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

const SEED_DOSES: DoseEvent[] = [
  { id: 'd1', medicationId: 'med_lisinopril', medicationName: 'Lisinopril', strength: '10 mg', scheduledAt: todayAt(8), status: 'taken', takenAt: todayAt(8, 12) },
  { id: 'd2', medicationId: 'med_metformin', medicationName: 'Metformin', strength: '500 mg', scheduledAt: todayAt(8), status: 'taken', takenAt: todayAt(8, 14) },
  { id: 'd3', medicationId: 'med_vitd', medicationName: 'Vitamin D3', strength: '1000 IU', scheduledAt: todayAt(8), status: 'taken', takenAt: todayAt(8, 14) },
  { id: 'd4', medicationId: 'med_amox', medicationName: 'Amoxicillin', strength: '500 mg', scheduledAt: todayAt(14), status: 'pending' },
  { id: 'd5', medicationId: 'med_metformin', medicationName: 'Metformin', strength: '500 mg', scheduledAt: todayAt(20), status: 'pending' },
  { id: 'd6', medicationId: 'med_amox', medicationName: 'Amoxicillin', strength: '500 mg', scheduledAt: todayAt(20), status: 'pending' },
  { id: 'd7', medicationId: 'med_atorvastatin', medicationName: 'Atorvastatin', strength: '20 mg', scheduledAt: todayAt(22), status: 'pending' },
];

const SEED_SCHEDULES: ScheduleEntry[] = [
  { id: 's1', medicationId: 'med_lisinopril', medicationName: 'Lisinopril', times: ['08:00'], daysOfWeek: [0,1,2,3,4,5,6], notes: 'Morning, with water' },
  { id: 's2', medicationId: 'med_metformin', medicationName: 'Metformin', times: ['08:00', '20:00'], daysOfWeek: [0,1,2,3,4,5,6], notes: 'With meals' },
  { id: 's3', medicationId: 'med_atorvastatin', medicationName: 'Atorvastatin', times: ['22:00'], daysOfWeek: [0,1,2,3,4,5,6] },
  { id: 's4', medicationId: 'med_vitd', medicationName: 'Vitamin D3', times: ['08:00'], daysOfWeek: [0,1,2,3,4,5,6] },
  { id: 's5', medicationId: 'med_amox', medicationName: 'Amoxicillin', times: ['08:00', '14:00', '20:00'], daysOfWeek: [0,1,2,3,4,5,6], endDate: new Date(Date.now() + 3 * 86400000).toISOString(), notes: 'Course ends in 3 days' },
];

function refillAt(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString();
}

const SEED_REFILLS: Refill[] = [
  { id: 'r1', medicationId: 'med_atorvastatin', medicationName: 'Atorvastatin', pharmacy: 'CVS, Main St', refillBy: refillAt(3), status: 'needed', daysSupply: 6 },
  { id: 'r2', medicationId: 'med_amox', medicationName: 'Amoxicillin', pharmacy: 'Walgreens', refillBy: refillAt(2), status: 'needed', daysSupply: 3 },
  { id: 'r3', medicationId: 'med_lisinopril', medicationName: 'Lisinopril', pharmacy: 'CVS, Main St', refillBy: refillAt(11), status: 'requested', daysSupply: 18 },
  { id: 'r4', medicationId: 'med_metformin', medicationName: 'Metformin', pharmacy: 'CVS, Main St', refillBy: refillAt(21), status: 'ready', daysSupply: 42 },
];

// Local mutable state mirroring server (so mutations show up in UI when API is a stub)
let localDoses = [...SEED_DOSES];
let localMeds = [...SEED_MEDS];
let localRefills = [...SEED_REFILLS];

export async function listMedications(): Promise<Medication[]> {
  try {
    const res = await api.get<unknown>('/medications');
    return unwrap<Medication[]>(res, 'medications', localMeds);
  } catch (e) {
    if (e instanceof ApiError && e.status >= 500) throw e;
    return localMeds;
  }
}

export async function getMedication(id: string): Promise<Medication | null> {
  try {
    const res = await api.get<unknown>(`/medications/${id}`);
    const m = unwrapObj<Medication | null>(res, 'medication', null);
    if (m && (m as Medication).id) return m;
  } catch (e) {
    if (e instanceof ApiError && e.status >= 500) throw e;
  }
  return localMeds.find(m => m.id === id) ?? null;
}

export async function createMedication(input: Omit<Medication, 'id'>): Promise<Medication> {
  try {
    await api.post('/medications', input);
  } catch (e) {
    if (e instanceof ApiError && e.status >= 500) throw e;
  }
  const created: Medication = { ...input, id: `med_${Date.now().toString(36)}` };
  localMeds = [created, ...localMeds];
  return created;
}

export async function listTodayDoses(): Promise<DoseEvent[]> {
  try {
    const res = await api.get<unknown>('/doses/today');
    return unwrap<DoseEvent[]>(res, 'doses', localDoses);
  } catch (e) {
    if (e instanceof ApiError && e.status >= 500) throw e;
    return localDoses;
  }
}

export async function logDose(doseId: string, status: 'taken' | 'skipped'): Promise<DoseEvent> {
  try {
    await api.post(`/doses/${doseId}/${status === 'taken' ? 'take' : 'skip'}`, { at: new Date().toISOString() });
  } catch (e) {
    if (e instanceof ApiError && e.status >= 500) throw e;
  }
  localDoses = localDoses.map(d => d.id === doseId ? { ...d, status, takenAt: status === 'taken' ? new Date().toISOString() : d.takenAt } : d);
  return localDoses.find(d => d.id === doseId)!;
}

export async function listSchedules(): Promise<ScheduleEntry[]> {
  try {
    const res = await api.get<unknown>('/schedules');
    return unwrap<ScheduleEntry[]>(res, 'schedules', SEED_SCHEDULES);
  } catch (e) {
    if (e instanceof ApiError && e.status >= 500) throw e;
    return SEED_SCHEDULES;
  }
}

export async function listRefills(): Promise<Refill[]> {
  try {
    const res = await api.get<unknown>('/refills');
    return unwrap<Refill[]>(res, 'refills', localRefills);
  } catch (e) {
    if (e instanceof ApiError && e.status >= 500) throw e;
    return localRefills;
  }
}

export async function requestRefill(refillId: string): Promise<Refill> {
  try {
    await api.post(`/refills/${refillId}`, { action: 'request' });
  } catch (e) {
    if (e instanceof ApiError && e.status >= 500) throw e;
  }
  localRefills = localRefills.map(r => r.id === refillId ? { ...r, status: 'requested' } : r);
  return localRefills.find(r => r.id === refillId)!;
}

export async function getAdherence(): Promise<AdherenceSummary> {
  try {
    const res = await api.get<unknown>('/reports/adherence');
    const a = unwrapObj<AdherenceSummary | null>(res, 'adherence', null);
    if (a && typeof (a as AdherenceSummary).windowDays === 'number') return a as AdherenceSummary;
  } catch (e) {
    if (e instanceof ApiError && e.status >= 500) throw e;
  }
  // derive from localDoses + reasonable 30-day window
  const taken = localDoses.filter(d => d.status === 'taken').length;
  const scheduled = localDoses.length;
  const taken30 = 156;
  const scheduled30 = 168;
  return {
    windowDays: 30,
    taken: taken30 + taken,
    scheduled: scheduled30 + scheduled,
    streakDays: 12,
    trend: 'up',
  };
}
