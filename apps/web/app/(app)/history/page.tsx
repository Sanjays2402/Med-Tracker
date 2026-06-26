'use client';

import * as React from 'react';
import Link from 'next/link';
import { CalendarCheck, ArrowRight, ChartBar, Flame } from '@med/icons';
import { Surface, Empty, Pill } from '../../../components/uikit';
import { summarizeStreak } from '../../../lib/history-streak';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_LONG = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Day {
  iso: string;
  date: Date;
  pct: number; // 0..100, deterministic until real history wires up
  doseCount: number;
  isFuture: boolean;
}

function fmtISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Short "Mon 16" style label for a YYYY-MM-DD streak-start key (local). */
function formatStreakStart(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function buildDays(weeks: number, today: Date): Day[] {
  // Build a `weeks * 7` matrix anchored so the rightmost column ends at today.
  // Each column is one week. We render Sun..Sat top-down per column (GitHub-style).
  const days: Day[] = [];
  // Find the most recent Saturday >= today
  const end = new Date(today);
  end.setHours(0, 0, 0, 0);
  // Saturday-of-this-week: shift forward to Sat (dow 6).
  const dow = end.getDay();
  const shift = 6 - dow;
  end.setDate(end.getDate() + shift);

  const start = new Date(end);
  start.setDate(end.getDate() - (weeks * 7 - 1));

  const cursor = new Date(start);
  for (let i = 0; i < weeks * 7; i++) {
    const iso = fmtISODate(cursor);
    const isFuture = cursor > today;
    let pct = 0;
    let doseCount = 0;
    if (!isFuture) {
      // Stable per-day percentage: 60..98 with day-of-week variance + iso hash.
      const seed = hash(iso);
      const base = 78 + ((seed % 22) - 11); // 67..89
      const wd = cursor.getDay();
      const weekendDip = (wd === 0 || wd === 6) ? -8 : 0;
      pct = Math.max(40, Math.min(100, base + weekendDip));
      doseCount = 3 + (seed % 5); // 3..7 doses
      // Random "missed" day every ~12 days
      if (seed % 12 === 0) pct = Math.max(30, pct - 35);
    }
    days.push({ iso, date: new Date(cursor), pct, doseCount, isFuture });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function intensityToTone(pct: number): { bg: string; ring?: string; label: string } {
  if (pct === 0) return { bg: 'var(--bg-sunk)', label: 'no data' };
  if (pct >= 85) return { bg: 'color-mix(in srgb, var(--accent) 65%, var(--bg-sunk))', label: 'solid' };
  if (pct >= 70) return { bg: 'color-mix(in srgb, var(--accent) 40%, var(--bg-sunk))', label: 'mixed' };
  if (pct >= 50) return { bg: 'color-mix(in srgb, var(--warn) 35%, var(--bg-sunk))', label: 'shaky' };
  return { bg: 'color-mix(in srgb, var(--danger) 35%, var(--bg-sunk))', label: 'rough' };
}

function monthLabelForColumn(weekIdx: number, days: Day[]): string | null {
  // Show a month label on the first column that contains the 1st of a month.
  const col = days.slice(weekIdx * 7, weekIdx * 7 + 7);
  const firstOfMonth = col.find((d) => d.date.getDate() <= 7);
  if (!firstOfMonth) return null;
  // Show only if this column is the leftmost column that contains the month's first week.
  const monthKey = `${firstOfMonth.date.getFullYear()}-${firstOfMonth.date.getMonth()}`;
  for (let i = 0; i < weekIdx; i++) {
    const prev = days.slice(i * 7, i * 7 + 7);
    const has = prev.find((d) =>
      d.date.getDate() <= 7 && `${d.date.getFullYear()}-${d.date.getMonth()}` === monthKey,
    );
    if (has) return null;
  }
  return firstOfMonth.date.toLocaleDateString(undefined, { month: 'short' });
}

export default function HistoryPage() {
  const today = React.useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);
  const WEEKS = 26; // ~6 months
  const days = React.useMemo(() => buildDays(WEEKS, today), [today]);
  const [hoverIdx, setHoverIdx] = React.useState<number | null>(null);

  const totalDays = days.filter((d) => !d.isFuture).length;
  const avgPct = totalDays
    ? Math.round(days.filter((d) => !d.isFuture).reduce((s, d) => s + d.pct, 0) / totalDays)
    : 0;
  const perfectDays = days.filter((d) => !d.isFuture && d.pct >= 95).length;
  const roughDays = days.filter((d) => !d.isFuture && d.pct > 0 && d.pct < 50).length;

  // Trailing on-track streak from the same day series the heatmap renders.
  const streak = summarizeStreak(days);

  const hovered = hoverIdx !== null ? days[hoverIdx] : null;

  // Recent 7 days for the list under the heatmap.
  const recent = [...days].reverse().filter((d) => !d.isFuture).slice(0, 7);

  return (
    <div className="space-y-8">
      <header>
        <div className="eyebrow">past doses</div>
        <h1 className="display text-[36px] leading-none tracking-tight mt-1">History</h1>
        <p className="text-[13px] text-[var(--ink-muted)] mt-2 max-w-md">
          Six months at a glance. Each square is a day. Tap one to open it.
        </p>
      </header>

      {totalDays === 0 ? (
        <Empty
          icon={<CalendarCheck size={32} weight="duotone" />}
          title="No history yet"
          description="Once you log doses, days appear here."
        />
      ) : (
        <>
          {/* Heatmap */}
          <Surface className="p-5 sm:p-6">
            <div className="flex items-end justify-between gap-3 flex-wrap mb-4">
              <div className="flex flex-wrap gap-3">
                <Stat label="6-month avg" value={`${avgPct}%`} tone={avgPct >= 85 ? 'ok' : avgPct >= 70 ? 'warn' : 'danger'} />
                <Stat label="perfect days" value={perfectDays} tone="ok" />
                <Stat label="rough days" value={roughDays} tone={roughDays === 0 ? 'ok' : 'warn'} />
              </div>
              <Legend />
            </div>

            <div className="flex">
              {/* Weekday labels column */}
              <div className="flex flex-col gap-[3px] mr-2 pt-5 shrink-0">
                {WEEKDAY_LABELS.map((wd, i) => (
                  <div
                    key={i}
                    className="text-[10px] text-[var(--ink-muted)] tabular leading-[14px] h-[14px] flex items-center"
                    style={{ opacity: i % 2 === 0 ? 0.6 : 1 }}
                  >
                    {i % 2 === 1 ? wd : ''}
                  </div>
                ))}
              </div>

              {/* Heatmap grid */}
              <div className="flex-1 min-w-0 overflow-x-auto">
                <div className="inline-flex flex-col">
                  {/* Month labels row */}
                  <div className="flex gap-[3px] h-5 mb-1">
                    {Array.from({ length: WEEKS }).map((_, w) => {
                      const label = monthLabelForColumn(w, days);
                      return (
                        <div
                          key={w}
                          className="text-[10.5px] text-[var(--ink-muted)] tabular w-[14px] flex items-end"
                        >
                          {label && <span className="whitespace-nowrap">{label}</span>}
                        </div>
                      );
                    })}
                  </div>
                  {/* Day cells */}
                  <div className="flex gap-[3px]">
                    {Array.from({ length: WEEKS }).map((_, w) => (
                      <div key={w} className="flex flex-col gap-[3px]">
                        {Array.from({ length: 7 }).map((_, d) => {
                          const idx = w * 7 + d;
                          const day = days[idx];
                          if (!day) return null;
                          if (day.isFuture) {
                            return (
                              <div
                                key={d}
                                className="w-[14px] h-[14px] rounded-[3px]"
                                style={{ background: 'var(--bg-sunk)', opacity: 0.35 }}
                                aria-hidden
                              />
                            );
                          }
                          const tone = intensityToTone(day.pct);
                          const isToday = day.iso === fmtISODate(today);
                          return (
                            <Link
                              key={d}
                              href={`/history/${day.iso}`}
                              onMouseEnter={() => setHoverIdx(idx)}
                              onMouseLeave={() => setHoverIdx((prev) => (prev === idx ? null : prev))}
                              onFocus={() => setHoverIdx(idx)}
                              onBlur={() => setHoverIdx((prev) => (prev === idx ? null : prev))}
                              className="w-[14px] h-[14px] rounded-[3px] transition-transform hover:scale-125 focus-visible:scale-125"
                              style={{
                                background: tone.bg,
                                outline: isToday ? '1.5px solid var(--accent)' : undefined,
                                outlineOffset: isToday ? '1px' : undefined,
                              }}
                              aria-label={`${day.date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })} — ${day.pct}% on schedule`}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Hover detail */}
            <div className="mt-4 h-10 text-[12.5px] flex items-center text-[var(--ink-soft)]">
              {hovered ? (
                <span className="flex items-center gap-3 anim-in">
                  <span className="capsule">
                    <span className="tabular">{hovered.date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</span>
                  </span>
                  <span>
                    <span className="text-[var(--ink)] font-medium tabular">{Math.round(hovered.pct)}%</span> on schedule
                    {' · '}{hovered.doseCount} doses
                  </span>
                  <span className="capsule">{intensityToTone(hovered.pct).label}</span>
                </span>
              ) : (
                <span className="text-[var(--ink-muted)]">Hover a day to see its adherence.</span>
              )}
            </div>
          </Surface>

          {/* Current streak callout */}
          {streak.current > 0 && (
            <div
              className="sheet flex items-center gap-4 px-5 py-4 anim-in"
              style={{
                background: 'color-mix(in srgb, var(--accent) 7%, var(--bg-elev))',
                border: '1px solid color-mix(in srgb, var(--accent) 22%, transparent)',
              }}
            >
              <span
                className="inline-flex items-center justify-center w-11 h-11 rounded-full shrink-0"
                style={{ background: 'color-mix(in srgb, var(--accent) 16%, transparent)', color: 'var(--accent)' }}
                aria-hidden
              >
                <Flame size={22} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-semibold text-[var(--ink)] leading-tight">
                  {streak.current}-day streak
                  {streak.isBest && streak.current >= 3 && (
                    <span className="capsule capsule-ok ml-2 align-middle text-[11px]">personal best</span>
                  )}
                </div>
                <div className="text-[12.5px] text-[var(--ink-muted)] mt-0.5">
                  {streak.current === 1
                    ? 'On track today. Keep it going tomorrow.'
                    : `On track ${streak.current} days running`}
                  {streak.startIso ? ` · since ${formatStreakStart(streak.startIso)}` : ''}
                  {streak.longest > streak.current ? ` · best ${streak.longest} days` : ''}
                </div>
              </div>
            </div>
          )}

          {/* Recent days as a list */}
          <section className="space-y-3">
            <h2 className="eyebrow">recent days</h2>
            <Surface>
              <ul>
                {recent.map((d, idx) => (
                  <li key={d.iso} className="border-b border-[var(--line-soft)] last:border-0">
                    <Link
                      href={`/history/${d.iso}`}
                      className="flex items-center gap-4 px-4 py-3.5 hover:bg-[var(--bg-sunk)] transition-colors"
                    >
                      <div
                        className="w-11 h-11 rounded-full flex flex-col items-center justify-center shrink-0"
                        style={{
                          background: intensityToTone(d.pct).bg,
                          color: 'var(--ink)',
                        }}
                      >
                        <span className="text-[9.5px] uppercase tracking-wider leading-none text-[var(--ink-soft)]">
                          {WEEKDAY_LONG[d.date.getDay()]}
                        </span>
                        <span className="text-[14px] font-medium tabular leading-none mt-1">
                          {d.date.getDate()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-medium text-[var(--ink)]">
                          {idx === 0 ? 'Today' : idx === 1 ? 'Yesterday' : d.date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                        </div>
                        <div className="text-[12px] text-[var(--ink-muted)] mt-0.5 flex items-center gap-2">
                          <span className="tabular">{Math.round(d.pct)}% on schedule</span>
                          <span>·</span>
                          <span>{d.doseCount} doses</span>
                        </div>
                      </div>
                      <Pill
                        tone={d.pct >= 95 ? 'ok' : d.pct >= 70 ? 'accent' : d.pct >= 50 ? 'warn' : 'danger'}
                      >
                        {intensityToTone(d.pct).label}
                      </Pill>
                      <ArrowRight size={14} className="text-[var(--ink-muted)]" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Surface>
            <div className="text-right">
              <Link href="/reports" className="capsule text-[12px] text-[var(--ink-muted)] hover:text-[var(--ink)]">
                <ChartBar size={11} className="inline mr-1" />
                See full reports
              </Link>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone: 'ok' | 'warn' | 'danger' }) {
  const fg =
    tone === 'ok'
      ? 'var(--ok)'
      : tone === 'warn'
      ? 'var(--warn)'
      : 'var(--danger)';
  return (
    <div className="flex flex-col">
      <span className="eyebrow">{label}</span>
      <span className="display tabular text-[20px] leading-tight" style={{ color: fg }}>
        {value}
      </span>
    </div>
  );
}

function Legend() {
  const stops = [0, 50, 70, 85, 95];
  return (
    <div className="flex items-center gap-2 text-[11px] text-[var(--ink-muted)]">
      <span>less</span>
      <div className="flex items-center gap-[3px]">
        {stops.map((p) => (
          <div
            key={p}
            className="w-[14px] h-[14px] rounded-[3px]"
            style={{ background: intensityToTone(p === 0 ? 1 : p).bg }}
            aria-hidden
          />
        ))}
      </div>
      <span>more</span>
    </div>
  );
}
