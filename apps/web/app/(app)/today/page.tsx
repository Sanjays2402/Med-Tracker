'use client';

import * as React from 'react';
import Link from 'next/link';
import { Pill as PillIcon, Bell, Check, X as XIcon, Warning, ArrowDown } from '@med/icons';
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
import { useToast } from '../../../components/Toast';
import {
  selectablePendingIds,
  toggleSelection,
  rangeSelect,
  selectAllPending,
  pruneSelection,
  summarizeSelection,
} from '../../../lib/dose-selection';
import {
  partitionOverdue,
  overdueHeadline,
  formatLateness,
} from '../../../lib/overdue';
import { groupByPartOfDay, sectionCountLabel, type PartOfDayCounts } from '../../../lib/part-of-day';
import { sectionProgress, sectionProgressLabel } from '../../../lib/section-progress';
import { DoseSegments } from '../../../components/DoseSegments';

export default function TodayPage() {
  const [doses, setDoses] = React.useState<DoseEvent[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [pop, setPop] = React.useState<string | null>(null);
  const [now, setNow] = React.useState(() => Date.now());
  const { toast } = useToast();

  // Bulk-select state. `selected` holds dose ids; `anchor` is the last row the
  // user toggled, used as the pivot for shift+click range selection.
  const [selecting, setSelecting] = React.useState(false);
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(() => new Set());
  const [anchor, setAnchor] = React.useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = React.useState(false);

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

  // Whenever the dose list changes, prune any selection that's no longer pending.
  React.useEffect(() => {
    if (!doses) return;
    setSelected((prev) => pruneSelection(prev, doses));
  }, [doses]);

  const sel = summarizeSelection(selected, doses ?? []);

  function exitSelecting() {
    setSelecting(false);
    setSelected(new Set());
    setAnchor(null);
  }

  function onRowToggle(id: string, shiftKey: boolean) {
    if (!doses) return;
    setSelecting(true);
    if (shiftKey && anchor) {
      setSelected((prev) => rangeSelect(selectablePendingIds(doses), anchor, id, prev));
    } else {
      setSelected((prev) => toggleSelection(prev, id));
    }
    setAnchor(id);
  }

  function toggleSelectAll() {
    if (!doses) return;
    setSelecting(true);
    if (sel.allSelected) {
      setSelected(new Set());
    } else {
      setSelected(selectAllPending(doses));
    }
  }

  async function act(id: string, status: 'taken' | 'skipped') {
    setBusy(id);
    const dose = (doses ?? []).find((d) => d.id === id);
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
      // Show a confirming toast with Undo. Dedup by dose id so spamming Take
      // doesn't pile up identical toasts.
      const name = dose ? `${dose.medicationName}${dose.strength ? ' ' + dose.strength : ''}` : 'Dose';
      toast({
        id: `dose-${id}`,
        kind: status === 'taken' ? 'success' : 'info',
        title: status === 'taken' ? `${name} taken` : `${name} skipped`,
        description: status === 'taken'
          ? new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
          : 'You can still log it later from history.',
        action: { label: 'Undo', run: () => void undo(id) },
        durationMs: 5000,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not log that dose.';
      setError(msg);
      toast({ kind: 'error', title: 'Could not log that dose', description: msg });
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
      toast({ id: `dose-${id}`, kind: 'info', title: 'Dose returned to pending', durationMs: 2800 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not undo that.';
      setError(msg);
      toast({ kind: 'error', title: 'Could not undo', description: msg });
    } finally {
      setBusy(null);
    }
  }

  // Mark every selected dose taken in one action, then offer a single bulk Undo.
  async function takeSelected() {
    if (!doses) return;
    const ids = [...selected].filter((id) =>
      (doses ?? []).some((d) => d.id === id && d.status === 'pending'),
    );
    if (ids.length === 0) return;
    setBulkBusy(true);
    const results = await Promise.allSettled(ids.map((id) => logDose(id, 'taken')));
    const ok: string[] = [];
    let failed = 0;
    results.forEach((r, i) => {
      const id = ids[i]!;
      if (r.status === 'fulfilled') ok.push(id);
      else failed++;
    });
    if (ok.length > 0) {
      const stamp = new Date().toISOString();
      setDoses((prev) =>
        (prev ?? []).map((d) => (ok.includes(d.id) ? { ...d, status: 'taken', takenAt: stamp } : d)),
      );
    }
    setBulkBusy(false);
    exitSelecting();
    if (ok.length > 0) {
      toast({
        id: 'bulk-take',
        kind: failed > 0 ? 'warning' : 'success',
        title: `${ok.length} dose${ok.length === 1 ? '' : 's'} marked taken`,
        description:
          failed > 0
            ? `${failed} couldn't be logged. They're still pending.`
            : new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        action: { label: 'Undo all', run: () => void undoMany(ok) },
        durationMs: 6000,
      });
    } else {
      toast({ kind: 'error', title: 'Could not mark those doses taken' });
    }
  }

  async function undoMany(ids: string[]) {
    const results = await Promise.allSettled(ids.map((id) => undoDose(id)));
    const ok = ids.filter((_, i) => results[i]?.status === 'fulfilled');
    if (ok.length > 0) {
      setDoses((prev) =>
        (prev ?? []).map((d) => (ok.includes(d.id) ? { ...d, status: 'pending', takenAt: undefined } : d)),
      );
    }
    toast({ id: 'bulk-take', kind: 'info', title: `${ok.length} dose${ok.length === 1 ? '' : 's'} returned to pending`, durationMs: 2800 });
  }

  if (error && !doses) return <ErrorBox message={error} onRetry={load} />;

  const groups = groupByPartOfDay(doses ?? []);

  const total = doses?.length ?? 0;
  const taken = (doses ?? []).filter((d) => d.status === 'taken').length;
  const pct = total ? Math.round((taken / total) * 100) : 0;

  // Overdue partition drives the sticky banner. Recomputed as `now` ticks.
  const overdueModel = partitionOverdue(doses ?? [], now);

  function jumpToFirstOverdue() {
    const id = overdueModel.firstOverdueId;
    if (!id) return;
    const el = document.getElementById(`dose-row-${id}`);
    if (!el) return;
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    el.classList.add('anim-pop');
    window.setTimeout(() => el.classList.remove('anim-pop'), 700);
  }

  return (
    <div className="space-y-10 pb-24">
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
          {doses && doses.length > 0 ? (
            <DoseSegments doses={doses} />
          ) : (
            <div
              className="h-2.5 rounded-full overflow-hidden"
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
          )}
        </div>
      </header>

      {/* Sticky overdue banner — appears when 1+ pending doses slipped past
          their scheduled time. Jumps focus to the dose that's been waiting
          longest. */}
      {overdueModel.count > 0 && (
        <div
          className="sticky top-3 z-[600] anim-in"
          role="status"
          aria-live="polite"
        >
          <div
            className="sheet flex items-center gap-3 px-4 py-3"
            style={{
              background: 'var(--danger-bg)',
              border: '1px solid color-mix(in srgb, var(--danger) 28%, transparent)',
              boxShadow: '0 10px 26px -14px color-mix(in srgb, var(--danger) 60%, transparent)',
            }}
          >
            <span
              className="inline-flex items-center justify-center w-8 h-8 rounded-full shrink-0 anim-overdue"
              style={{ background: 'color-mix(in srgb, var(--danger) 16%, transparent)', color: 'var(--danger)' }}
              aria-hidden
            >
              <Warning size={17} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-semibold text-[var(--danger)] leading-tight">
                {overdueHeadline(overdueModel.count)}
              </div>
              <div className="text-[12px] text-[var(--ink-soft)] mt-0.5">
                Oldest is {formatLateness(overdueModel.worstMinutesLate)} past due. Take or skip to clear it.
              </div>
            </div>
            <Btn size="sm" variant="primary" onClick={jumpToFirstOverdue}>
              <span className="inline-flex items-center gap-1.5">
                <ArrowDown size={13} /> Jump to first
              </span>
            </Btn>
          </div>
        </div>
      )}

      {doses && doses.length > 0 && (
        <DayRail doses={doses} onTake={(id) => void act(id, 'taken')} />
      )}

      {/* Select toolbar — appears once there's at least one pending dose. */}
      {sel.selectableCount > 0 && (
        <div className="flex items-center justify-between gap-3 -mb-4">
          <div className="text-[12.5px] text-[var(--ink-muted)]">
            {selecting && !sel.isEmpty
              ? `${sel.count} selected`
              : `${sel.selectableCount} pending dose${sel.selectableCount === 1 ? '' : 's'}`}
          </div>
          <div className="flex items-center gap-2">
            {selecting ? (
              <>
                <Btn size="sm" variant="ghost" onClick={toggleSelectAll}>
                  {sel.allSelected ? 'Clear all' : 'Select all'}
                </Btn>
                <Btn size="sm" variant="ghost" onClick={exitSelecting}>Done</Btn>
              </>
            ) : (
              <Btn size="sm" variant="secondary" onClick={() => setSelecting(true)}>
                Select
              </Btn>
            )}
          </div>
        </div>
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
        groups.map(({ label, doses: items, counts }) =>
          items.length === 0 ? null : (
            <Section
              key={label}
              title={label}
              display
              action={
                sectionCountLabel(counts) && (
                  <span
                    className={`capsule tabular text-[11px] ${counts.done ? 'capsule-ok' : ''}`}
                    title={`${counts.taken} taken, ${counts.pending} pending of ${counts.total}`}
                  >
                    {sectionCountLabel(counts)}
                  </span>
                )
              }
            >
              <SectionProgressBar counts={counts} />
              <div className="sheet">
                <ul>
                  {items
                    .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt))
                    .map((d, i) => {
                      const t = +new Date(d.scheduledAt);
                      const isOverdue = d.status === 'pending' && t < now - 15 * 60_000;
                      const isNext = d.status === 'pending' && !isOverdue;
                      const isSelectable = d.status === 'pending';
                      const isChecked = selected.has(d.id);
                      return (
                        <li
                          key={d.id}
                          id={`dose-row-${d.id}`}
                          className="flex items-center gap-4 px-5 py-4 border-b border-[var(--line-soft)] last:border-0 anim-in"
                          style={{
                            animationDelay: `${i * 30}ms`,
                            background: isChecked ? 'var(--accent-soft)' : undefined,
                          }}
                        >
                          {selecting && isSelectable ? (
                            <SelectCheckbox
                              checked={isChecked}
                              label={`Select ${d.medicationName}`}
                              onToggle={(shiftKey) => onRowToggle(d.id, shiftKey)}
                            />
                          ) : (
                            <DoseGlyph status={d.status} overdue={isOverdue} />
                          )}
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

                          {selecting ? null : d.status === 'pending' ? (
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

      {/* Floating bulk action bar */}
      {selecting && !sel.isEmpty && (
        <div className="fixed bottom-6 inset-x-4 sm:inset-x-0 z-[1000] flex justify-center anim-toast-in pointer-events-none">
          <div
            className="pointer-events-auto sheet flex items-center gap-3 pl-4 pr-2 py-2"
            style={{ boxShadow: '0 16px 36px -12px rgba(0,0,0,0.28), 0 4px 10px -4px rgba(0,0,0,0.1)' }}
          >
            <span
              className="inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full text-[12.5px] font-semibold tabular"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}
            >
              {sel.count}
            </span>
            <span className="text-[13px] text-[var(--ink-soft)]">
              selected
            </span>
            <button
              type="button"
              onClick={exitSelecting}
              className="inline-flex items-center justify-center w-8 h-8 rounded-full text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--bg-sunk)] transition-colors"
              aria-label="Cancel selection"
            >
              <XIcon size={14} />
            </button>
            <Btn size="md" variant="primary" disabled={bulkBusy} onClick={takeSelected}>
              {bulkBusy ? (
                'Marking…'
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <Check size={14} /> Mark {sel.count} taken
                </span>
              )}
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionProgressBar({ counts }: { counts: PartOfDayCounts }) {
  const p = sectionProgress(counts);
  if (!p.visible) return null;
  const fillColor = p.tone === 'ok' ? 'var(--ok)' : 'var(--accent)';
  const takenPctW = `${(p.takenFraction * 100).toFixed(2)}%`;
  const skippedPctW = `${(p.skippedFraction * 100).toFixed(2)}%`;
  return (
    <div
      className="h-1.5 rounded-full overflow-hidden flex -mt-1"
      style={{ background: 'var(--bg-sunk)' }}
      role="progressbar"
      aria-valuenow={p.takenPct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={sectionProgressLabel(counts) ?? undefined}
    >
      <div
        className="h-full transition-[width] duration-500"
        style={{ width: takenPctW, background: fillColor, borderRadius: '9999px' }}
      />
      {p.skippedFraction > 0 && (
        <div
          className="h-full transition-[width] duration-500"
          style={{
            width: skippedPctW,
            background: 'color-mix(in srgb, var(--warn) 55%, transparent)',
          }}
        />
      )}
    </div>
  );
}

function SelectCheckbox({
  checked,
  label,
  onToggle,
}: {
  checked: boolean;
  label: string;
  onToggle: (shiftKey: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => onToggle(e.shiftKey)}
      className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-colors"
      style={{
        background: checked ? 'var(--accent)' : 'var(--bg-sunk)',
        color: checked ? 'var(--bg-elev)' : 'var(--ink-muted)',
        border: `1px solid ${checked ? 'var(--accent)' : 'var(--line)'}`,
      }}
    >
      {checked ? <Check size={18} /> : <span className="w-4 h-4 rounded-md border border-current opacity-60" />}
    </button>
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
