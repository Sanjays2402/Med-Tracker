'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChartBar } from '@med/icons';
import { Btn, Surface, Empty, ErrorBox, SkeletonRow, Pill, Section, formatDate } from '../../../components/uikit';
import { PillBottle } from '../../../components/PillBottle';
import { RefillTimeline } from '../../../components/RefillTimeline';
import { listRefills, requestRefill, listMedications } from '../../../lib/data';
import type { Refill, Medication } from '../../../lib/types';
import {
  REFILL_TABS,
  filterByTab,
  countByTab,
  defaultTab,
  type RefillTab,
} from '../../../lib/refill-filter';
import {
  REFILL_SORTS,
  sortRefills,
  activeRunoutChip,
  emptyTabSoonestHint,
  type RefillSortKey,
} from '../../../lib/refill-sort';
import {
  REFILL_SORT_STORAGE_KEY,
  DEFAULT_REFILL_SORT,
  parseRefillSort,
  serializeRefillSort,
} from '../../../lib/refill-sort-pref';

export default function RefillsPage() {
  const [refills, setRefills] = React.useState<Refill[] | null>(null);
  const [thresholds, setThresholds] = React.useState<Record<string, number>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<RefillTab>('all');
  const [tabPinned, setTabPinned] = React.useState(false);
  const [sortBy, setSortBy] = React.useState<RefillSortKey>(DEFAULT_REFILL_SORT);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const [rs, meds] = await Promise.all([listRefills(), listMedications()]);
      setRefills(rs);
      // Land on the most actionable non-empty tab on first load, but never
      // override a tab the user has explicitly chosen.
      setTabPinned((pinned) => {
        if (!pinned) setActiveTab(defaultTab(rs));
        return pinned;
      });
      const map: Record<string, number> = {};
      for (const m of meds) {
        if (typeof m.refillThresholdDays === 'number') map[m.id] = m.refillThresholdDays;
      }
      setThresholds(map);
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load refills.'); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  // Restore the persisted sort choice on mount (parallels the medications
  // density + run-out-group prefs).
  React.useEffect(() => {
    try { setSortBy(parseRefillSort(window.localStorage.getItem(REFILL_SORT_STORAGE_KEY))); }
    catch { /* localStorage unavailable - keep the default */ }
  }, []);

  const chooseSort = React.useCallback((next: RefillSortKey) => {
    setSortBy(next);
    try { window.localStorage.setItem(REFILL_SORT_STORAGE_KEY, serializeRefillSort(next)); }
    catch { /* best-effort persistence */ }
  }, []);

  function pickTab(tab: RefillTab) {
    setTabPinned(true);
    setActiveTab(tab);
  }

  async function onRequest(id: string) {
    setBusy(id);
    try {
      await requestRefill(id);
      setRefills(prev => (prev ?? []).map(r => r.id === id ? { ...r, status: 'requested' } : r));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not request refill.');
    } finally {
      setBusy(null);
    }
  }

  if (error && !refills) return <ErrorBox message={error} onRetry={load} />;

  const all = refills ?? [];
  const counts = countByTab(all);
  const visible = filterByTab(all, activeTab);
  const groups = {
    needed: sortRefills(visible.filter(r => r.status === 'needed'), sortBy),
    requested: sortRefills(visible.filter(r => r.status === 'requested'), sortBy),
    ready: sortRefills(visible.filter(r => r.status === 'ready'), sortBy),
    picked_up: sortRefills(visible.filter(r => r.status === 'picked_up'), sortBy),
  };

  // Soonest run-out across the still-active refills (everything but picked-up),
  // surfaced as an always-on chip beside the sort control regardless of the
  // active tab or sort, so the user always sees what's about to go dry.
  const runoutChip = activeRunoutChip(visible.filter(r => r.status !== 'picked_up'));

  // When the active status tab is empty but other tabs still hold refills, name
  // the soonest run-out across ALL tabs so the empty view doesn't read as "all
  // clear" when something is actually about to run out elsewhere.
  const emptyHint = activeTab !== 'all' ? emptyTabSoonestHint(all) : null;

  return (
    <div className="space-y-6">
      <header>
        <div className="eyebrow">pharmacy</div>
        <h1 className="display text-[36px] leading-none tracking-tight mt-1">Refills</h1>
        <p className="text-[13px] text-[var(--ink-muted)] mt-2">What needs reordering. What's ready to pick up.</p>
      </header>

      {refills === null ? (
        <Surface><SkeletonRow /><SkeletonRow /><SkeletonRow /></Surface>
      ) : refills.length === 0 ? (
        <Empty
          icon={<ChartBar size={32} />}
          title="Bottles look full"
          description="Refills show up here as medications run low."
        />
      ) : (
        <div className="space-y-6">
          {/* Status filter tabs + sort control */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1 overflow-x-auto" role="tablist" aria-label="Filter refills by status">
              {REFILL_TABS.map(t => {
                const count = counts[t.tab];
                const active = activeTab === t.tab;
                return (
                  <button
                    key={t.tab}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => pickTab(t.tab)}
                    className={`inline-flex items-center gap-2 h-8 px-3 rounded-full text-[12.5px] font-medium border whitespace-nowrap transition-colors ${
                      active
                        ? 'border-transparent bg-[var(--accent-soft)] text-[var(--accent-ink)]'
                        : 'border-[var(--line)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--bg-sunk)]'
                    }`}
                  >
                    {t.label}
                    {count > 0 && (
                      <span
                        className={`tabular text-[10.5px] min-w-[16px] h-4 px-1 inline-flex items-center justify-center rounded-full ${
                          active ? 'bg-[var(--bg-elev)] text-[var(--ink-muted)]' : 'bg-[var(--bg-sunk)] text-[var(--ink-muted)]'
                        }`}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-auto">
              {runoutChip && (
                <span title={runoutChip.tooltip}>
                  <Pill tone={runoutChip.tone}>{runoutChip.label}</Pill>
                </span>
              )}
              <div className="flex items-center gap-1" role="group" aria-label="Sort refills">
                {REFILL_SORTS.map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => chooseSort(opt.key)}
                    aria-pressed={sortBy === opt.key}
                    className={`h-8 px-3 rounded-full text-[12px] font-medium border transition-colors whitespace-nowrap ${
                      sortBy === opt.key
                        ? 'border-transparent bg-[var(--accent-soft)] text-[var(--accent-ink)]'
                        : 'border-[var(--line)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--bg-sunk)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Timeline overview — only on the All tab where every status is in view. */}
          {activeTab === 'all' && (() => {
            const plot = visible.filter(r => r.status !== 'picked_up');
            return plot.length >= 2 ? <RefillTimeline refills={plot} windowDays={30} /> : null;
          })()}

          {visible.length === 0 ? (
            <Empty
              icon={<ChartBar size={28} />}
              title="Nothing in this view"
              description={emptyHint ? emptyHint.message : 'Switch tabs to see refills in another status.'}
              action={
                emptyHint ? (
                  <Btn size="sm" variant="primary" onClick={() => pickTab('all')}>
                    View all refills
                  </Btn>
                ) : undefined
              }
            />
          ) : (
            <>
              {(activeTab === 'all' || activeTab === 'needed') && (
                <RefillGroup title="Needed" tone="warn" items={groups.needed} thresholds={thresholds} busy={busy} onRequest={onRequest} emptyText="Nothing to reorder." />
              )}
              {(activeTab === 'all' || activeTab === 'requested') && (
                <RefillGroup title="Requested" tone="info" items={groups.requested} thresholds={thresholds} emptyText="No refills in progress." />
              )}
              {(activeTab === 'all' || activeTab === 'ready') && (
                <RefillGroup title="Ready for pickup" tone="ok" items={groups.ready} thresholds={thresholds} emptyText="No refills ready." />
              )}
              {(activeTab === 'all' || activeTab === 'ready') && groups.picked_up.length > 0 && (
                <RefillGroup title="Recently picked up" tone="neutral" items={groups.picked_up} thresholds={thresholds} emptyText="" />
              )}
            </>
          )}
        </div>
      )}

      {error && refills && <ErrorBox message={error} onRetry={load} />}
    </div>
  );
}

function daysUntil(iso: string): number {
  return Math.ceil((+new Date(iso) - Date.now()) / 86400000);
}

function RefillGroup({
  title,
  tone,
  items,
  emptyText,
  thresholds,
  busy,
  onRequest,
}: {
  title: string;
  tone: 'warn' | 'info' | 'ok' | 'neutral';
  items: Refill[];
  emptyText: string;
  thresholds: Record<string, number>;
  busy?: string | null;
  onRequest?: (id: string) => void;
}) {
  return (
    <Section title={`${title} (${items.length})`}>
      <Surface>
        {items.length === 0 ? (
          <div className="p-4 text-[13px] text-[var(--ink-muted)]">{emptyText || 'None.'}</div>
        ) : (
          <ul>
            {items.map(r => {
              const days = daysUntil(r.refillBy);
              // Days of supply still on hand ~ days until the refill-by date,
              // capped at the original daysSupply. Capacity is daysSupply; the
              // low-water mark is the medication's refill threshold (fallback 20%).
              const capacity = r.daysSupply ?? Math.max(days, 1);
              const remaining = Math.max(0, Math.min(days, capacity));
              const lowAt = thresholds[r.medicationId];
              return (
                <li key={r.id} className="flex items-center gap-4 px-5 py-4 border-b border-[var(--line-soft)] last:border-0">
                  <PillBottle
                    remaining={remaining}
                    capacity={capacity}
                    {...(lowAt !== undefined ? { lowAt } : {})}
                    width={30}
                  />
                  <div className="flex-1 min-w-0">
                    <Link href={`/medications/${r.medicationId}`} className="text-[14.5px] font-medium hover:underline truncate block text-[var(--ink)]">{r.medicationName}</Link>
                    <div className="text-[12.5px] text-[var(--ink-muted)] truncate mt-0.5">
                      {r.daysSupply} day supply{r.pharmacy ? `, ${r.pharmacy}` : ''} · by {formatDate(r.refillBy)}
                    </div>
                  </div>
                  {tone === 'warn' && (
                    <Pill tone={days <= 3 ? 'danger' : 'warn'}>{days <= 0 ? 'overdue' : `${days}d left`}</Pill>
                  )}
                  {tone === 'info' && <Pill tone="info">requested</Pill>}
                  {tone === 'ok' && <Pill tone="ok">ready</Pill>}
                  {tone === 'neutral' && <Pill tone="neutral">picked up</Pill>}
                  {onRequest && r.status === 'needed' && (
                    <Btn size="sm" variant="primary" disabled={busy === r.id} onClick={() => onRequest(r.id)}>
                      {busy === r.id ? 'Sending' : 'Request'}
                    </Btn>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Surface>
    </Section>
  );
}
