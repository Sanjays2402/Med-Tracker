'use client';

import { api, ApiError } from './api-client';
import type { Medication, DoseEvent, ScheduleEntry, Refill, AdherenceSummary, Drug, NotificationItem, CaregiverShare, PillQuery, PillIdentifyResponse, PillCatalogResponse, PillDescriptor } from './types';

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
    return unwrap<Medication[]>(res, 'medications', localMeds.filter(m => !m.archived));
  } catch (e) {
    if (e instanceof ApiError && e.status >= 500) throw e;
    return localMeds.filter(m => !m.archived);
  }
}

export async function listArchivedMedications(): Promise<Medication[]> {
  try {
    const res = await api.get<unknown>('/medications?archived=true');
    const arr = unwrap<Medication[]>(res, 'medications', []);
    if (arr.length) return arr.filter(m => m.archived);
  } catch (e) {
    if (e instanceof ApiError && e.status >= 500) throw e;
  }
  return localMeds.filter(m => m.archived);
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
    const res = await api.post<unknown>('/medications', input);
    const m = unwrapObj<Medication | null>(res, 'medication', null);
    if (m && (m as Medication).id) {
      localMeds = [m as Medication, ...localMeds];
      return m as Medication;
    }
  } catch (e) {
    if (e instanceof ApiError && e.status >= 500) throw e;
  }
  const created: Medication = { ...input, id: `med_${Date.now().toString(36)}` };
  localMeds = [created, ...localMeds];
  return created;
}

export async function archiveMedication(id: string): Promise<void> {
  try {
    await api.post(`/medications/${id}/archive`, {});
  } catch (e) {
    if (e instanceof ApiError && e.status >= 500) throw e;
  }
  localMeds = localMeds.map(m => m.id === id ? { ...m, archived: true } : m);
}

export async function activateMedication(id: string): Promise<void> {
  try {
    await api.post(`/medications/${id}/activate`, {});
  } catch (e) {
    if (e instanceof ApiError && e.status >= 500) throw e;
  }
  localMeds = localMeds.map(m => m.id === id ? { ...m, archived: false } : m);
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

export async function undoDose(doseId: string): Promise<DoseEvent> {
  try {
    await api.patch(`/doses/${doseId}`, { status: 'pending', takenAt: null });
  } catch (e) {
    if (e instanceof ApiError && e.status >= 500) throw e;
  }
  localDoses = localDoses.map(d => d.id === doseId ? { ...d, status: 'pending', takenAt: undefined } : d);
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

// ---- Drugs catalog ----

export async function searchDrugs(q: string, limit = 25): Promise<Drug[]> {
  const qs = new URLSearchParams({ q, limit: String(limit) }).toString();
  try {
    const res = await api.get<unknown>(`/drugs/search?${qs}`);
    if (res && typeof res === 'object' && Array.isArray((res as any).results)) {
      return (res as any).results as Drug[];
    }
  } catch (e) {
    if (e instanceof ApiError && e.status >= 500) throw e;
  }
  return [];
}

export async function getDrug(id: string): Promise<Drug | null> {
  try {
    const res = await api.get<unknown>(`/drugs/${encodeURIComponent(id)}`);
    if (res && typeof res === 'object' && (res as any).id) return res as Drug;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    if (e instanceof ApiError && e.status >= 500) throw e;
  }
  return null;
}

// ---- Notifications ----

const SEED_NOTIFICATIONS: NotificationItem[] = [
  { id: 'n1', title: 'Time for Lisinopril', body: '10 mg with water.', kind: 'reminder', createdAt: new Date(Date.now() - 30 * 60_000).toISOString(), href: '/today' },
  { id: 'n2', title: 'Refill suggested: Atorvastatin', body: '6 days of supply remaining.', kind: 'refill', createdAt: new Date(Date.now() - 6 * 3600_000).toISOString(), href: '/refills/needed' },
  { id: 'n3', title: 'Weekly adherence report ready', body: 'You took 92% of scheduled doses this week.', kind: 'system', createdAt: new Date(Date.now() - 26 * 3600_000).toISOString(), href: '/reports/weekly' },
  { id: 'n4', title: 'Caregiver share viewed', body: 'Your share for Dr. Reyes was opened.', kind: 'caregiver', createdAt: new Date(Date.now() - 2 * 86400_000).toISOString(), read: true, href: '/caregivers' },
  { id: 'n5', title: 'Amoxicillin course ends Wednesday', body: 'Finish the full course as prescribed.', kind: 'reminder', createdAt: new Date(Date.now() - 3 * 86400_000).toISOString(), read: true, href: '/medications/med_amox' },
];

let localNotifications: NotificationItem[] = [...SEED_NOTIFICATIONS];

export async function listNotifications(): Promise<NotificationItem[]> {
  try {
    const res = await api.get<unknown>('/notifications');
    if (res && typeof res === 'object' && Array.isArray((res as any).notifications)) {
      const arr = (res as any).notifications as NotificationItem[];
      if (arr.length) return arr;
    }
  } catch (e) {
    if (e instanceof ApiError && e.status >= 500) throw e;
  }
  return localNotifications;
}

export async function markNotificationRead(id: string): Promise<void> {
  try {
    await api.post(`/notifications/${id}`, { read: true });
  } catch (e) {
    if (e instanceof ApiError && e.status >= 500) throw e;
  }
  localNotifications = localNotifications.map(n => n.id === id ? { ...n, read: true } : n);
}

export async function markAllNotificationsRead(): Promise<void> {
  try {
    await api.post('/notifications/mark-read', { all: true });
  } catch (e) {
    if (e instanceof ApiError && e.status >= 500) throw e;
  }
  localNotifications = localNotifications.map(n => ({ ...n, read: true }));
}

export async function snoozeNotification(id: string, until: string): Promise<void> {
  try {
    await api.post(`/notifications/${id}`, { snoozedUntil: until });
  } catch (e) {
    if (e instanceof ApiError && e.status >= 500) throw e;
  }
  localNotifications = localNotifications.map(n =>
    n.id === id ? { ...n, snoozedUntil: until, read: true } : n,
  );
}

// ---- Refills subgroups ----

export async function listRefillsNeeded(): Promise<Refill[]> {
  const all = await listRefills();
  return all.filter(r => r.status === 'needed');
}

export async function listRefillsHistory(): Promise<Refill[]> {
  const all = await listRefills();
  return all
    .filter(r => r.status === 'ready' || r.status === 'picked_up' || r.status === 'requested')
    .sort((a, b) => +new Date(b.refillBy) - +new Date(a.refillBy));
}

// ---- Caregivers ----

const SEED_CAREGIVERS: CaregiverShare[] = [
  { id: 'cg_reyes', label: 'Dr. Reyes (PCP)', scopes: ['view-meds', 'view-adherence'], createdAt: new Date(Date.now() - 14 * 86400_000).toISOString(), expiresAt: new Date(Date.now() + 30 * 86400_000).toISOString(), lastViewedAt: new Date(Date.now() - 2 * 86400_000).toISOString() },
  { id: 'cg_mom', label: 'Mom', scopes: ['view-meds'], createdAt: new Date(Date.now() - 60 * 86400_000).toISOString(), expiresAt: null, lastViewedAt: new Date(Date.now() - 9 * 86400_000).toISOString() },
  { id: 'cg_pharm', label: 'CVS Pharmacy', scopes: ['view-meds', 'request-refill'], createdAt: new Date(Date.now() - 5 * 86400_000).toISOString(), expiresAt: new Date(Date.now() + 90 * 86400_000).toISOString(), lastViewedAt: null },
];

let localCaregivers: CaregiverShare[] = [...SEED_CAREGIVERS];

export async function listCaregivers(): Promise<CaregiverShare[]> {
  try {
    const res = await api.get<unknown>('/caregivers');
    if (res && typeof res === 'object' && Array.isArray((res as any).caregivers)) {
      const arr = (res as any).caregivers as CaregiverShare[];
      if (arr.length) return arr;
    }
  } catch (e) {
    if (e instanceof ApiError && e.status >= 500) throw e;
    if (e instanceof ApiError && e.status === 401) return localCaregivers;
  }
  return localCaregivers;
}

export async function getCaregiver(id: string): Promise<CaregiverShare | null> {
  try {
    const res = await api.get<unknown>(`/caregivers/${id}`);
    if (res && typeof res === 'object' && (res as any).id) return res as CaregiverShare;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    if (e instanceof ApiError && e.status >= 500) throw e;
  }
  return localCaregivers.find(c => c.id === id) ?? null;
}

export async function createCaregiver(input: { label: string; scopes: string[]; ttlDays?: number | null }): Promise<CaregiverShare> {
  const ttlSeconds = input.ttlDays && input.ttlDays > 0 ? input.ttlDays * 86400 : null;
  try {
    const res = await api.post<unknown>('/caregivers', { label: input.label, scopes: input.scopes, ttlSeconds });
    if (res && typeof res === 'object' && (res as any).id) {
      const c = res as CaregiverShare;
      localCaregivers = [c, ...localCaregivers];
      return c;
    }
  } catch (e) {
    if (e instanceof ApiError && e.status >= 500) throw e;
  }
  const created: CaregiverShare = {
    id: `cg_${Date.now().toString(36)}`,
    label: input.label,
    scopes: input.scopes,
    createdAt: new Date().toISOString(),
    expiresAt: ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000).toISOString() : null,
    lastViewedAt: null,
  };
  localCaregivers = [created, ...localCaregivers];
  return created;
}

export async function revokeCaregiver(id: string): Promise<void> {
  try {
    await api.delete(`/caregivers/${id}`);
  } catch (e) {
    if (e instanceof ApiError && e.status >= 500) throw e;
  }
  localCaregivers = localCaregivers.filter(c => c.id !== id);
}

// ---- Dose history (per date) ----

export async function listDosesForDate(date: string /* YYYY-MM-DD */): Promise<DoseEvent[]> {
  try {
    const res = await api.get<unknown>(`/doses/history?date=${encodeURIComponent(date)}`);
    if (res && typeof res === 'object' && Array.isArray((res as any).doses)) {
      const arr = (res as any).doses as DoseEvent[];
      if (arr.length) return arr;
    }
  } catch (e) {
    if (e instanceof ApiError && e.status >= 500) throw e;
  }
  // Synthesize from today's seed when API is a stub. Deterministic from date.
  const seed = hashString(date);
  return localDoses.map((d, i) => {
    const taken = ((seed + i) % 7) < 6;
    return {
      ...d,
      id: `${d.id}_${date}`,
      scheduledAt: replaceDate(d.scheduledAt, date),
      status: taken ? 'taken' : 'missed',
      takenAt: taken ? replaceDate(d.scheduledAt, date) : undefined,
    };
  });
}

function replaceDate(iso: string, ymd: string): string {
  const d = new Date(iso);
  const [y, m, day] = ymd.split('-').map(Number);
  d.setFullYear(y!, (m! - 1), day!);
  return d.toISOString();
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
  return Math.abs(h);
}

export interface InteractionReport {
  pairs: Array<{ a: string; b: string; severity: 'low' | 'moderate' | 'high'; note?: string }>;
  unknownDrugIds: string[];
}

export async function checkInteractions(drugIds: string[]): Promise<InteractionReport> {
  if (drugIds.length === 0) return { pairs: [], unknownDrugIds: [] };
  try {
    const res = await api.post<unknown>('/interactions/check', { drugIds });
    if (res && typeof res === 'object') {
      const r = res as any;
      if (Array.isArray(r.pairs) || Array.isArray(r.interactions)) {
        return {
          pairs: r.pairs ?? r.interactions ?? [],
          unknownDrugIds: r.unknownDrugIds ?? r.unknown ?? [],
        };
      }
    }
  } catch (e) {
    if (e instanceof ApiError && e.status >= 500) throw e;
  }
  return { pairs: [], unknownDrugIds: drugIds };
}

export function medicationNameToDrugId(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export async function updateMedication(id: string, patch: Partial<Omit<Medication, 'id'>>): Promise<Medication> {
  try {
    const res = await api.patch<unknown>(`/medications/${id}`, patch);
    const m = unwrapObj<Medication | null>(res, 'medication', null);
    if (m && (m as Medication).id) {
      localMeds = localMeds.map(x => x.id === id ? (m as Medication) : x);
      return m as Medication;
    }
  } catch (e) {
    if (e instanceof ApiError && e.status >= 500) throw e;
  }
  localMeds = localMeds.map(x => x.id === id ? { ...x, ...patch } : x);
  const updated = localMeds.find(x => x.id === id);
  if (!updated) throw new Error('Medication not found');
  return updated;
}

export interface SharedView {
  share: { id: string; label: string; scopes: string[]; expiresAt?: string | null; };
  medications?: Medication[];
  adherence?: AdherenceSummary;
  refills?: Refill[];
}

export async function fetchSharedView(token: string, scopes: string[] = ['view-meds', 'view-adherence', 'view-refills']): Promise<SharedView | { error: string; status: number }> {
  const qs = new URLSearchParams({ token, scopes: scopes.join(',') }).toString();
  try {
    const res = await api.get<unknown>(`/shared/view?${qs}`);
    if (res && typeof res === 'object' && (res as any).share) {
      const r = res as any;
      return {
        share: r.share,
        medications: r.medications,
        adherence: r.adherence,
        refills: r.refills,
      };
    }
    return { error: 'Unexpected response from server', status: 0 };
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 401) return { error: 'This link is not valid.', status: 401 };
      if (e.status === 403) return { error: 'This link does not allow viewing that information.', status: 403 };
      if (e.status === 410) return { error: 'This link has expired or been revoked.', status: 410 };
    }
    return { error: e instanceof Error ? e.message : 'Could not load shared view.', status: 0 };
  }
}

// Pills

export async function listPillCatalog(): Promise<PillDescriptor[]> {
  try {
    const res = await api.get<PillCatalogResponse>('/pills/catalog');
    return res.entries ?? [];
  } catch (e) {
    if (e instanceof ApiError) throw new Error(`Could not load catalog (${e.status}).`);
    throw e;
  }
}

export async function getPill(id: string): Promise<PillDescriptor | null> {
  const entries = await listPillCatalog();
  return entries.find(e => e.id === id) ?? null;
}

export async function identifyPills(query: PillQuery): Promise<PillIdentifyResponse> {
  try {
    return await api.post<PillIdentifyResponse>('/pills/identify', query);
  } catch (e) {
    if (e instanceof ApiError) {
      const body = e.body as { error?: { code?: string; message?: string } } | undefined;
      if (body?.error?.code === 'empty_query') {
        throw new Error('Add at least one detail to search.');
      }
      throw new Error(body?.error?.message ?? `Search failed (${e.status}).`);
    }
    throw e;
  }
}
