import type { Locale } from '@med/config';
import en from './en';
import es from './es';
import hi from './hi';
import fr from './fr';

export const messages: Record<Locale, typeof en> = { en, es, hi, fr };
export type Messages = typeof en;
