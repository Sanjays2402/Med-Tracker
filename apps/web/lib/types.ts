/** Lightweight shared types for UI rendering. Mirrors @med/types but minimal. */
export interface Medication {
  id: string;
  name: string;
  strength?: string;
  form?: string;
  instructions?: string;
  archived?: boolean;
  refillThresholdDays?: number;
  remainingDoses?: number;
  schedule?: string;
}

export interface DoseEvent {
  id: string;
  medicationId: string;
  medicationName: string;
  strength?: string;
  scheduledAt: string; // ISO
  status: 'pending' | 'taken' | 'skipped' | 'missed';
  takenAt?: string;
}

export interface ScheduleEntry {
  id: string;
  medicationId: string;
  medicationName: string;
  times: string[]; // "HH:mm"
  daysOfWeek?: number[]; // 0..6
  startDate?: string;
  endDate?: string;
  notes?: string;
}

export interface Refill {
  id: string;
  medicationId: string;
  medicationName: string;
  pharmacy?: string;
  refillBy: string; // ISO
  status: 'needed' | 'requested' | 'ready' | 'picked_up';
  daysSupply?: number;
}

export interface AdherenceSummary {
  windowDays: number;
  taken: number;
  scheduled: number;
  streakDays: number;
  trend: 'up' | 'down' | 'flat';
}

export interface Drug {
  id: string;
  generic: string;
  brand?: string;
  class?: string;
  rxnormSample?: number;
  indications?: string[];
  dosages?: string[];
  routes?: string[];
  frequencies?: string[];
  interactions?: string[];
  warnings?: string[];
  pregnancyCategory?: string;
  storage?: string;
  sourceNote?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  body?: string;
  kind: 'reminder' | 'refill' | 'system' | 'caregiver';
  createdAt: string;
  read?: boolean;
  href?: string;
}

export interface CaregiverShare {
  id: string;
  label: string;
  scopes: string[];
  createdAt: string;
  expiresAt?: string | null;
  lastViewedAt?: string | null;
}
