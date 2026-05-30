'use client';

import * as React from 'react';
import Link from 'next/link';
import { Pill as PillIcon, Bell } from '@med/icons';
import {
  Btn,
  Section,
  Empty,
  ErrorBox,
  SkeletonRow,
  Pill,
  formatTime,
  CheckBurst,
} from '../../../components/uikit';
import { DayRail } from '../../../components/DayRail';
import { listTodayDoses, logDose, undoDose } from '../../../lib/data';
import type { DoseEvent } from '../../../lib/types';

export default function TodayPage() {
  const [doses, setDoses] = React.useState<DoseEvent[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [pop, setPop] = React.useState<string | null>(null);
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      setDoses(await listTodayDoses());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load today.');
    }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  async function act(id: string, status: 'taken' | 'skipped') {
    setBusy(id);
    try {
      await logDose(id, status);
      setDoses((prev) =>
        (prev ?? []).map((d) =>
          d.id === id
            ? { ...d, status, takenAt: status === 'taken' ? new Date().toISOString() : d.takenAt }
            : d,
        ),
      );
      if (status === 'taken') {
        setPop(id);
        setTimeout(() => setPop(null), 1000);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not log that dose.');
    } finally {
      setBusy(null);
    }
  }

  async function undo(id: string) {
    setBusy(id);
    try {
      await undoDose(id);
      setDoses((prev) =>
        (prev ?? []).map((d) =>
          d.id === id ? { ...d, status: 'pending', takenAt: undefined } : d,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not undo that.');
    } finally {
      setBusy(null);
    }
  }

  if (error && !doses) return <ErrorBox message={error} onRetry={load} />;

  const groups: Record<string, DoseEvent[]> = { Morning: [], Afternoon: [], Evening: [], Night: [] };
  for (const d of doses ?? []) {
    const h = new Date(d.scheduledAt).getHours();
    const k = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : h < 21 ? 'Evening' : 'Night';
    (groups[k] as DoseEvent[]).push(d);
  }

  const total = doses?.length ?? 0;
  const taken = (doses ?? []).filter((d) => d.status === 'taken').length;
  const pct = total ? Math.round((taken / total) * 100) : 0;

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <div className="eyebrow">
          {new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
        <div className="flex items-end justify-between gap-4">
          <h1 className="display text-[40px] leading-none tracking-tight">Today</h1>
          <div className="text-right">
            <div className="eyebrow">progress</div>
            <div className="display text-[28px] tabular leading-none mt-1">
              {taken}<span className="text-[var(--ink-muted)]">/{total}</span>
            </div>
          </div>
        </div>
        <div className="mt-3">
          <div
            className="h-2 rounded-full overflow-hidden"
            style={{ background: 'var(--bg-sunk)' }}
            aria-label={`${pct}% complete`}
          >
            <div
              className="h-full transition-all"
              style={{
                width: `${pct}%`,
                background: 'var(--accent)',
                borderRadius: '9999px',
              }}
            />
          </div>
        </div>
      </header>

      {doses && doses.length > 0 && (
        <DayRail doses={doses} onTake={(id) => void act(id, 'taken')} />
      )}

      {doses === null ? (
        <div className="sheet">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : total === 0 ? (
        <Empty
          icon={<Bell size={26} />}
          title="Nothing scheduled today"
          description="Add a medication and we'll line up the doses on your day rail."
          action={
            <Link href="/medications/new">
              <Btn variant="primary" size="md">Add a medication</Btn>
            </Link>
          }
        />
      ) : (
        Object.entries(groups).map(([label, items]) =>
          items.length === 0 ? null : (
            <Section key={label} title={label} display>
              <div className="sheet">
                <ul>
                  {items
                    .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt))
                    .map((d, i) => {
                      const t = +new Date(d.scheduledAt);
                      const isOverdue = d.status === 'pending' && t < now - 15 * 60_000;
                      const isNext = d.status === 'pending' && !isOverdue;
                      return (
                        <li
                          key={d.id}
                          className="flex items-center gap-4 px-5 py-4 border-b border-[var(--line-soft)] last:border-0 anim-in"
                          style={{ animationDelay: `${i * 30}ms` }}
                        >
                          <DoseGlyph status={d.status} overdue={isOverdue} />
                          <div className="flex-1 min-w-0">
                            <div className="text-[14.5px] font-medium truncate text-[var(--ink)]">
                              <Link
                                href={`/medications/${d.medicationId}`}
                                className="hover:underline underline-offset-4 decoration-[var(--line)]"
                              >
                                {d.medicationName}
                              </Link>
                              {d.strength && (
                                <span className="text-[var(--ink-muted)] font-normal"> {d.strength}</span>
                              )}
                            </div>
                            <div className="text-[12.5px] text-[var(--ink-muted)] mt-1 flex items-center gap-2 flex-wrap">
                              <span className="capsule">
                                <span className="tabular">{formatTime(d.scheduledAt)}</span>
                              </span>
                              {d.status === 'taken' && (
                                <Pill tone="ok">
                                  <CheckBurst size={11} /> taken {d.takenAt ? formatTime(d.takenAt) : ''}
                                </Pill>
                              )}
                              {d.status === 'skipped' && <Pill tone="warn">skipped</Pill>}
                              {d.status === 'missed' && <Pill tone="danger">missed</Pill>}
                              {isOverdue && <Pill tone="danger">overdue</Pill>}
                              {isNext && !isOverdue && <Pill tone="warn">due</Pill>}
                            </div>
                          </div>

                          {d.status === 'pending' ? (
                            <div className="flex gap-2">
                              <Btn
                                size="sm"
                                variant="ghost"
                                disabled={busy === d.id}
                                onClick={() => act(d.id, 'skipped')}
                              >
                                Skip
                              </Btn>
                              <Btn
                                size="sm"
                                variant="primary"
                                disabled={busy === d.id}
                                onClick={() => act(d.id, 'taken')}
                                className={pop === d.id ? 'anim-pop' : ''}
                              >
                                {pop === d.id ? (
                                  <span className="inline-flex items-center gap-1">
                                    <CheckBurst size={13} /> Taken
                                  </span>
                                ) : (
                                  'Take'
                                )}
                              </Btn>
                            </div>
                          ) : (
                            <Btn
                              size="sm"
                              variant="ghost"
                              disabled={busy === d.id}
                              onClick={() => undo(d.id)}
                            >
                              Undo
                            </Btn>
                          )}
                        </li>
                      );
                    })}
                </ul>
              </div>
            </Section>
          ),
        )
      )}

      {error && doses && <ErrorBox message={error} onRetry={() => setError(null)} />}
    </div>
  );
}

function DoseGlyph({ status, overdue }: { status: DoseEvent['status']; overdue: boolean }) {
  const tone = overdue
    ? 'danger'
    : status === 'taken'
    ? 'ok'
    : status === 'skipped'
    ? 'muted'
    : 'accent';
  const bg =
    tone === 'ok'
      ? 'var(--ok-bg)'
      : tone === 'danger'
      ? 'var(--danger-bg)'
      : tone === 'muted'
      ? 'var(--bg-sunk)'
      : 'var(--accent-soft)';
  const fg =
    tone === 'ok'
      ? 'var(--ok)'
      : tone === 'danger'
      ? 'var(--danger)'
      : tone === 'muted'
      ? 'var(--ink-muted)'
      : 'var(--accent-ink)';
  return (
    <div
      className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${
        overdue ? 'anim-overdue' : ''
      }`}
      style={{ background: bg, color: fg }}
      aria-hidden
    >
      <PillIcon size={18} />
    </div>
  );
}
