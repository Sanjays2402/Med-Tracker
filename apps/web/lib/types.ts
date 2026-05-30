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
