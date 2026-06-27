'use client';

import * as React from 'react';
import Link from 'next/link';
import { Pill as PillIcon, Bell, Flame, TrendingUp, ChartBar, SparkleStar, Flag } from '@med/icons';
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
import { trendSeriesMeta } from '../../../lib/trend-series';
import { stripCellTitle } from '../../../lib/strip-dates';
import { streakAccent, streakToneVar, daysToStrong } from '../../../lib/streak-tone';
import { streakMilestoneChip } from '../../../lib/streak-milestone';
import { milestoneProgress, milestoneProgressLabel } from '../../../lib/milestone-progress';
import { activeRunoutChip } from '../../../lib/refill-sort';

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
  // Soonest run-out across the still-active refills (everything but picked-up),
  // surfaced as an always-on chip on the Refills section header so the
  // at-a-glance dashboard names what's about to go dry, matching /refills.
  const refillRunoutChip = activeRunoutChip((refills ?? []).filter((r) => r.status !== 'picked_up'));
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

  // Honest 14-day strip: older cells carry the prior-window average, newer cells
  // the current-window average (a real step when a baseline exists; otherwise a
  // flat strip). No invented per-day variance.
  const strip = trendSeriesMeta({
    taken: adherence?.taken ?? 0,
    scheduled: adherence?.scheduled ?? 0,
    priorTaken: adherence?.priorTaken,
    priorScheduled: adherence?.priorScheduled,
  });

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
              hint={streakHint(adherence?.streakDays ?? 0)}
              accent={streakAccent(adherence?.streakDays ?? 0)}
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
            <div className="flex items-center gap-2">
              {refillRunoutChip && (
                <span title={refillRunoutChip.tooltip}>
                  <Pill tone={refillRunoutChip.tone}>{refillRunoutChip.label}</Pill>
                </span>
              )}
              <Link
                href="/refills"
                className="text-[12px] text-[var(--ink-muted)] hover:text-[var(--ink)] capsule"
              >
                Manage
              </Link>
            </div>
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
                {adherence && (() => {
                  const milestone = streakMilestoneChip(adherence.streakDays);
                  const progress = milestoneProgress(adherence.streakDays);
                  return (
                    <div className="space-y-1.5">
                      <div className="text-[12px] text-[var(--ink-muted)] flex items-center gap-1.5 flex-wrap">
                        <span
                          className="capsule"
                          style={{
                            background: `color-mix(in srgb, ${streakToneVar(adherence.streakDays)} 14%, transparent)`,
                            color: streakToneVar(adherence.streakDays),
                          }}
                        >
                          <Flame size={10} /> {adherence.streakDays}d streak
                        </span>
                        {milestone && (
                          <span
                            className={`capsule ${milestone.reached ? 'capsule-ok anim-pop' : ''}`}
                            title={
                              milestone.reached
                                ? 'You just hit a streak milestone'
                                : 'Keep logging to reach the next milestone'
                            }
                          >
                            {milestone.reached ? <SparkleStar size={10} /> : <Flag size={10} />} {milestone.label}
                          </span>
                        )}
                      </div>
                      {/* Thin progress bar tracking how far the streak is between
                          the last milestone reached and the next one. */}
                      {progress && (
                        <div className="space-y-0.5" title={milestoneProgressLabel(adherence.streakDays) ?? undefined}>
                          <div
                            className="h-1 rounded-full overflow-hidden"
                            style={{ background: 'var(--bg-sunk)' }}
                            role="progressbar"
                            aria-valuenow={progress.pct}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={milestoneProgressLabel(adherence.streakDays) ?? undefined}
                          >
                            <div
                              className="h-full transition-[width] duration-700"
                              style={{
                                width: `${Math.max(progress.fraction * 100, progress.fraction > 0 ? 4 : 0).toFixed(1)}%`,
                                background: streakToneVar(adherence.streakDays),
                                borderRadius: '9999px',
                              }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-[var(--ink-muted)] tabular">
                            <span>{progress.fromDays === 0 ? 'start' : `${progress.fromDays}d`}</span>
                            <span>
                              {progress.remaining}d to {progress.toLabel}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
                <div className="text-[11px] text-[var(--ink-muted)] pt-0.5">Tap the ring for the full breakdown.</div>
              </div>
            </div>

            <div className="mt-5">
              <div className="eyebrow mb-2 flex items-center justify-between">
                <span>last 14 days</span>
                {strip.hasStep && (
                  <span className="normal-case tracking-normal text-[10.5px] text-[var(--ink-muted)]">
                    prior {strip.priorPct}% → now {strip.currentPct}%
                  </span>
                )}
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {strip.cells.map((cell, i) => {
                  // Honest fill: each cell carries its window's true average, not
                  // an invented daily number. The single step (when a prior
                  // baseline exists) mirrors the trend arrow above.
                  const intensity = cell.pct / 100;
                  return (
                    <div
                      key={i}
                      className="h-9 rounded-full relative"
                      style={{
                        background: `color-mix(in srgb, var(--accent) ${10 + intensity * 70}%, var(--bg-sunk))`,
                        outline: cell.isToday ? '1.5px solid var(--accent)' : undefined,
                        outlineOffset: cell.isToday ? '1.5px' : undefined,
                        opacity: cell.segment === 'prior' ? 0.82 : 1,
                      }}
                      title={stripCellTitle({
                        index: i,
                        cells: strip.cells.length,
                        pct: cell.pct,
                        segment: cell.segment,
                      })}
                    />
                  );
                })}
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px] text-[var(--ink-muted)]">
                <span>two weeks ago</span>
                <span>today</span>
              </div>
              {!strip.hasStep && adherence && (
                <div className="mt-2 text-[10.5px] text-[var(--ink-muted)]">
                  Showing your {adherence.windowDays}-day average. Per-day detail appears as more history lands.
                </div>
              )}
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

/**
 * Sub-label under the streak stat tile. Nudges toward the next week-long
 * milestone while a streak is building, celebrates an established run, and
 * stays plain at zero.
 */
function streakHint(days: number): string {
  if (days <= 0) return 'days on schedule';
  const left = daysToStrong(days);
  if (left && left > 0) return `${left} day${left === 1 ? '' : 's'} to a week`;
  return 'going strong';
}
