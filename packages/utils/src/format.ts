export const fmtDateLong = (d: Date | string, locale = 'en-US') =>
  new Date(d).toLocaleDateString(locale, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });

export const fmtTime = (d: Date | string, locale = 'en-US') =>
  new Date(d).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });

export const fmtRelative = (d: Date | string) => {
  const ms = new Date(d).getTime() - Date.now();
  const abs = Math.abs(ms);
  const mins = Math.round(abs / 60_000);
  if (mins < 60) return ms > 0 ? `in ${mins} min` : `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return ms > 0 ? `in ${hrs} h` : `${hrs} h ago`;
  const days = Math.round(hrs / 24);
  return ms > 0 ? `in ${days} d` : `${days} d ago`;
};

export const fmtPercent = (n: number) => `${Math.round(n)}%`;

export const titleCase = (s: string) =>
  s.replace(/\w\S*/g, (t) => t[0]!.toUpperCase() + t.slice(1).toLowerCase());
