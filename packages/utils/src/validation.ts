export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
export const isStrongPassword = (s: string) => s.length >= 8 && /[A-Z]/.test(s) && /\d/.test(s);
export const isHHMM = (s: string) => /^\d{2}:\d{2}$/.test(s);
export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
