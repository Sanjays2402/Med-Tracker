'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChartBar } from '@med/icons';
import { Btn, Surface, Empty, ErrorBox, SkeletonRow, Pill, Section, formatDate } from '../../../components/uikit';
import { PillBottle } from '../../../components/PillBottle';
import { RefillTimeline } from '../../../components/RefillTimeline';
import { listRefills, requestRefill, listMedications } from '../../../lib/data';
import type { Refill, Medication } from '../../../lib/types';

export default function RefillsPage() {
  const [refills, setRefills] = React.useState<Refill[] | null>(null);
  const [thresholds, setThresholds] = React.useState<Record<string, number>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const [rs, meds] = await Promise.all([listRefills(), listMedications()]);
      setRefills(rs);
      const map: Record<string, number> = {};
      for (const m of meds) {
        if (typeof m.refillThresholdDays === 'number') map[m.id] = m.refillThresholdDays;
      }
      setThresholds(map);
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load refills.'); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

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

  const groups = {
    needed: (refills ?? []).filter(r => r.status === 'needed'),
    requested: (refills ?? []).filter(r => r.status === 'requested'),
    ready: (refills ?? []).filter(r => r.status === 'ready'),
    picked_up: (refills ?? []).filter(r => r.status === 'picked_up'),
  };

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
          {(() => {
            const plot = refills.filter(r => r.status !== 'picked_up');
            return plot.length >= 2 ? <RefillTimeline refills={plot} windowDays={30} /> : null;
          })()}
          <RefillGroup title="Needed" tone="warn" items={groups.needed} thresholds={thresholds} busy={busy} onRequest={onRequest} emptyText="Nothing to reorder." />
          <RefillGroup title="Requested" tone="info" items={groups.requested} thresholds={thresholds} emptyText="No refills in progress." />
          <RefillGroup title="Ready for pickup" tone="ok" items={groups.ready} thresholds={thresholds} emptyText="No refills ready." />
          {groups.picked_up.length > 0 && (
            <RefillGroup title="Recently picked up" tone="neutral" items={groups.picked_up} thresholds={thresholds} emptyText="" />
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
