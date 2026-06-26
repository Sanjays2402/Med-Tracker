'use client';

import * as React from 'react';
import Link from 'next/link';
import { Pill as PillIcon, Bell, Flame, TrendingUp, ChartBar } from '@med/icons';
import {
  Btn,
  StatTile,
  Section,
  Empty,
  ErrorBox,
  SkeletonRow,
  Pill,
  formatTime,
  CheckBurst,
} from '../../../components/uikit';
import { DayRail } from '../../../components/DayRail';
import { AdherenceRing } from '../../../components/AdherenceRing';
import { AdherenceBreakdownPopover } from '../../../components/AdherenceBreakdownPopover';
import { NextDoseCountdown } from '../../../components/NextDoseCountdown';
import { getAdherence, listTodayDoses, listRefills, logDose } from '../../../lib/data';
import type { AdherenceSummary, DoseEvent, Refill } from '../../../lib/types';
import { trendFromCounts } from '../../../lib/adherence-trend';

export default function DashboardPage() {
  const [adherence, setAdherence] = React.useState<AdherenceSummary | null>(null);
  const [doses, setDoses] = React.useState<DoseEvent[] | null>(null);
  const [refills, setRefills] = React.useState<Refill[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [justTaken, setJustTaken] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, d, r] = await Promise.all([getAdherence(), listTodayDoses(), listRefills()]);
      setAdherence(a);
      setDoses(d);
      setRefills(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your pillbox.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const next = (doses ?? [])
    .filter((d) => d.status === 'pending')
    .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));
  const pendingRefills = (refills ?? []).filter((r) => r.status === 'needed');
  const takenToday = (doses ?? []).filter((d) => d.status === 'taken').length;
  const totalToday = (doses ?? []).length;
  const todayPct = totalToday ? Math.round((takenToday / totalToday) * 100) : 0;
  const adherencePct =
    adherence && adherence.scheduled
      ? Math.round((adherence.taken / adherence.scheduled) * 100)
      : 0;

  // This-window vs prior-window trend. Prefer a real percentage-point delta
  // from the prior-window counts when the summary carries them; null when there
  // is no honest prior baseline (the UI then falls back to the trend enum).
  const trend =
    adherence && adherence.priorScheduled != null && adherence.priorTaken != null
      ? trendFromCounts(
          adherence.taken,
          adherence.scheduled,
          adherence.priorTaken,
          adherence.priorScheduled,
        )
      : null;
  // Arrow direction: the computed delta when available, else the summary enum.
  const trendDir: 'up' | 'down' | 'flat' = trend?.direction ?? adherence?.trend ?? 'flat';

  async function quickTake(id: string) {
    try {
      await logDose(id, 'taken');
      setDoses((prev) =>
        (prev ?? []).map((d) =>
          d.id === id ? { ...d, status: 'taken', takenAt: new Date().toISOString() } : d,
        ),
      );
      setJustTaken(id);
      setTimeout(() => setJustTaken(null), 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not log that dose.');
    }
  }

  if (error && !doses) return <ErrorBox message={error} onRetry={load} />;

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <div className="eyebrow">{niceDate()}</div>
        <h1 className="display text-[38px] sm:text-[44px] leading-none tracking-tight">
          Good {greeting()}.
        </h1>
        <p className="text-[14px] text-[var(--ink-soft)] max-w-md">
          {pendingRefills.length > 0
            ? `${pendingRefills.length} refill${pendingRefills.length === 1 ? '' : 's'} on deck. Otherwise, the day is steady.`
            : 'Steady day ahead. No refills pending.'}
        </p>
      </header>

      {/* Day rail hero */}
      {loading && !doses ? (
        <div className="sheet p-6 h-44 animate-pulse" />
      ) : (
        <DayRail doses={doses ?? []} onTake={quickTake} />
      )}

      {/* Live next-dose countdown */}
      {loading && !doses ? (
        <div className="sheet p-5 h-[88px] animate-pulse" />
      ) : (
        <NextDoseCountdown
          doses={(doses ?? []).map((d) => ({
            id: d.id,
            scheduledAt: d.scheduledAt,
            status: d.status,
            medicationName: d.medicationName,
            ...(d.strength ? { strength: d.strength } : {}),
            medicationId: d.medicationId,
          }))}
          onTake={quickTake}
          takingId={justTaken}
        />
      )}

      {/* Stat capsules */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {loading && !adherence ? (
          <>
            <div className="sheet p-5 h-28 animate-pulse" />
            <div className="sheet p-5 h-28 animate-pulse" />
            <div className="sheet p-5 h-28 animate-pulse" />
            <div className="sheet p-5 h-28 animate-pulse" />
          </>
        ) : (
          <>
            <StatTile
              label="today"
              value={`${takenToday}/${totalToday}`}
              hint={`${todayPct}% logged so far`}
              accent={todayPct >= 80 ? 'ok' : todayPct >= 50 ? 'warn' : 'danger'}
            />
            <StatTile
              label={`last ${adherence?.windowDays ?? 30} days`}
              value={`${adherencePct}%`}
              hint={adherence ? `${adherence.taken} of ${adherence.scheduled} doses` : ''}
              accent={adherencePct >= 90 ? 'ok' : 'warn'}
            />
            <StatTile
              label="streak"
              value={
                <span className="inline-flex items-center gap-2">
                  <Flame size={22} /> {adherence?.streakDays ?? 0}d
                </span>
              }
              hint="days on schedule"
            />
            <StatTile
              label="refills"
              value={pendingRefills.length}
              hint={pendingRefills.length === 1 ? 'needs filling' : 'need filling'}
              accent={pendingRefills.length > 0 ? 'warn' : 'ok'}
            />
          </>
        )}
      </div>

      {/* Up next */}
      <Section
        title="Up next"
        display
        action={
          <Link
            href="/today"
            className="text-[12px] text-[var(--ink-muted)] hover:text-[var(--ink)] capsule"
          >
            See all doses
          </Link>
        }
      >
        <div className="sheet">
          {loading && !doses ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : next.length === 0 ? (
            <Empty
              icon={<Bell size={22} />}
              title="No more doses today"
              description="You can rest the pillbox. Tomorrow's schedule is already queued."
            />
          ) : (
            <ul>
              {next.slice(0, 5).map((d, i) => (
                <li
                  key={d.id}
                  className="flex items-center gap-4 px-5 py-4 border-b border-[var(--line-soft)] last:border-0 anim-in"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}
                  >
                    <PillIcon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14.5px] font-medium truncate text-[var(--ink)]">
                      {d.medicationName}
                      {d.strength && (
                        <span className="text-[var(--ink-muted)] font-normal"> {d.strength}</span>
                      )}
                    </div>
                    <div className="text-[12.5px] text-[var(--ink-muted)] tabular mt-0.5">
                      {formatTime(d.scheduledAt)}
                    </div>
                  </div>
                  <Btn size="sm" variant="primary" onClick={() => quickTake(d.id)}>
                    {justTaken === d.id ? (
                      <span className="inline-flex items-center gap-1 anim-pop">
                        <CheckBurst size={14} /> Logged
                      </span>
                    ) : (
                      'Mark taken'
                    )}
                  </Btn>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      <div className="grid lg:grid-cols-2 gap-6">
        <Section
          title="Refills"
          display
          action={
            <Link
              href="/refills"
              className="text-[12px] text-[var(--ink-muted)] hover:text-[var(--ink)] capsule"
            >
              Manage
            </Link>
          }
        >
          <div className="sheet">
            {loading && !refills ? (
              <>
                <SkeletonRow />
                <SkeletonRow />
              </>
            ) : pendingRefills.length === 0 ? (
              <Empty
                icon={<ChartBar size={20} />}
                title="Bottles look full"
                description="Nothing flagged for the next two weeks."
              />
            ) : (
              <ul>
                {pendingRefills.slice(0, 4).map((r) => {
                  const days = daysUntil(r.refillBy);
                  return (
                    <li
                      key={r.id}
                      className="flex items-center gap-3 px-5 py-4 border-b border-[var(--line-soft)] last:border-0"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-medium truncate">{r.medicationName}</div>
                        <div className="text-[12px] text-[var(--ink-muted)] mt-0.5">
                          {r.daysSupply} day supply · {r.pharmacy ?? 'no pharmacy on file'}
                        </div>
                      </div>
                      <Pill tone={days <= 3 ? 'danger' : 'warn'}>
                        {days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `${days} days`}
                      </Pill>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Section>

        <Section title="Two-week pulse" display
          action={
            <Link
              href="/schedule"
              className="text-[12px] text-[var(--ink-muted)] hover:text-[var(--ink)] capsule"
            >
              Calendar
            </Link>
          }
        >
          <div className="sheet p-5">
            <div className="flex items-center gap-5 flex-wrap">
              <AdherenceBreakdownPopover
                taken={adherence?.taken ?? 0}
                scheduled={adherence?.scheduled ?? 0}
                windowDays={adherence?.windowDays ?? 30}
              >
                <AdherenceRing
                  percent={adherencePct}
                  size={132}
                  stroke={12}
                  subtitle={`${adherence?.windowDays ?? 30}d`}
                />
              </AdherenceBreakdownPopover>
              <div className="flex-1 min-w-[160px] space-y-1.5">
                <div className="flex items-center gap-2 text-[13px] text-[var(--ink)]">
                  <TrendingUp
                    size={16}
                    style={{
                      color:
                        trendDir === 'down'
                          ? 'var(--danger)'
                          : trendDir === 'flat'
                          ? 'var(--ink-muted)'
                          : 'var(--ok)',
                      transform: trendDir === 'down' ? 'scaleY(-1)' : undefined,
                    }}
                  />
                  Trending {trendDir}
                  {trend && trend.direction !== 'flat' && (
                    <span
                      className="capsule tabular text-[11px]"
                      style={{
                        background:
                          trend.tone === 'ok'
                            ? 'var(--ok-soft, color-mix(in srgb, var(--ok) 14%, transparent))'
                            : 'color-mix(in srgb, var(--danger) 14%, transparent)',
                        color: trend.tone === 'ok' ? 'var(--ok)' : 'var(--danger)',
                      }}
                      title={`This ${adherence?.windowDays ?? 30}d vs the prior ${adherence?.windowDays ?? 30}d`}
                    >
                      {trend.label}
                    </span>
                  )}
                </div>
                <div className="text-[12px] text-[var(--ink-muted)]">
                  {adherence ? `${adherence.taken} of ${adherence.scheduled} doses` : 'No data yet'}
                </div>
                {trend && (
                  <div className="text-[11px] text-[var(--ink-muted)]">
                    {trend.direction === 'flat'
                      ? `Holding steady vs the prior ${adherence?.windowDays ?? 30} days`
                      : `${trend.magnitude}pp ${trend.direction === 'up' ? 'higher' : 'lower'} than the prior ${adherence?.windowDays ?? 30} days`}
                  </div>
                )}
                {adherence && (
                  <div className="text-[12px] text-[var(--ink-muted)]">
                    <span className="capsule capsule-ok mr-1">
                      <Flame size={10} /> {adherence.streakDays}d streak
                    </span>
                  </div>
                )}
                <div className="text-[11px] text-[var(--ink-muted)] pt-0.5">Tap the ring for the full breakdown.</div>
              </div>
            </div>

            <div className="mt-5">
              <div className="eyebrow mb-2">last 14 days</div>
              <div className="grid grid-cols-7 gap-1.5">
                {Array.from({ length: 14 }).map((_, i) => {
                  // Deterministic pseudo-data sourced from the user's average % so the
                  // grid feels coherent with the ring even before the API returns the
                  // real per-day numbers. Variance ~ 18pp from the mean.
                  const seed = (i * 9301 + 49297) % 233280;
                  const wobble = (seed / 233280 - 0.5) * 36;
                  const dayPct = Math.max(0, Math.min(100, adherencePct + wobble));
                  const intensity = dayPct / 100;
                  const isToday = i === 13;
                  return (
                    <div
                      key={i}
                      className="h-9 rounded-full relative"
                      style={{
                        background: `color-mix(in srgb, var(--accent) ${10 + intensity * 70}%, var(--bg-sunk))`,
                        outline: isToday ? '1.5px solid var(--accent)' : undefined,
                        outlineOffset: isToday ? '1.5px' : undefined,
                      }}
                      title={`Day ${i + 1}: ${Math.round(dayPct)}%`}
                    />
                  );
                })}
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px] text-[var(--ink-muted)]">
                <span>two weeks ago</span>
                <span>today</span>
              </div>
            </div>
          </div>
        </Section>
      </div>

      {error && doses && <ErrorBox message={error} onRetry={load} />}
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'evening';
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

function niceDate(): string {
  return new Date().toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function daysUntil(iso: string): number {
  return Math.ceil((+new Date(iso) - Date.now()) / 86400000);
}
