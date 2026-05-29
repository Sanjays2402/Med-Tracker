export const APP_NAME = 'Med-Tracker';
export const DEFAULT_LOCALE = 'en';
export const SUPPORTED_LOCALES = ['en', 'es', 'hi', 'fr'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const REMINDER_LEAD_MINUTES = 5;
export const STREAK_GRACE_HOURS = 6;
export const REFILL_THRESHOLD_DAYS = 7;
export const ADHERENCE_WINDOW_DAYS = 30;

export const API_BASE_URL =
  (typeof process !== 'undefined' && process.env?.API_BASE_URL) || 'http://localhost:4000';
export const WEB_BASE_URL =
  (typeof process !== 'undefined' && process.env?.WEB_BASE_URL) || 'http://localhost:3000';

export const STORAGE_KEYS = {
  authToken: 'mt.authToken',
  theme: 'mt.theme',
  locale: 'mt.locale',
  pendingDoses: 'mt.pendingDoses',
} as const;
