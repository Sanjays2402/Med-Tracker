'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChartBar, Pill as PillIcon } from '@med/icons';
import { Btn, Surface, Empty, ErrorBox, SkeletonRow, Pill, Section, formatDate } from '../../../components/uikit';
import { listRefills, requestRefill } from '../../../lib/data';
import type { Refill } from '../../../lib/types';

export default function RefillsPage() {
  const [refills, setRefills] = React.useState<Refill[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try { setRefills(await listRefills()); }
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
        <h1 className="text-2xl font-semibold tracking-tight">Refills</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Track what needs to be reordered and what is ready to pick up.</p>
      </header>

      {refills === null ? (
        <Surface><SkeletonRow /><SkeletonRow /><SkeletonRow /></Surface>
      ) : refills.length === 0 ? (
        <Empty
          icon={<ChartBar size={32} />}
          title="No refills to show"
          description="Refills appear here as medications run low."
        />
      ) : (
        <div className="space-y-6">
          <RefillGroup title="Needed" tone="warn" items={groups.needed} busy={busy} onRequest={onRequest} emptyText="Nothing to reorder." />
          <RefillGroup title="Requested" tone="info" items={groups.requested} emptyText="No refills in progress." />
          <RefillGroup title="Ready for pickup" tone="ok" items={groups.ready} emptyText="No refills ready." />
          {groups.picked_up.length > 0 && (
            <RefillGroup title="Recently picked up" tone="neutral" items={groups.picked_up} emptyText="" />
          )}
        </div>
      )}

      {error && refills && <ErrorBox message={error} onRetry={load} />}
    </div>
  );
}

function RefillGroup({
  title,
  tone,
  items,
  emptyText,
  busy,
  onRequest,
}: {
  title: string;
  tone: 'warn' | 'info' | 'ok' | 'neutral';
  items: Refill[];
  emptyText: string;
  busy?: string | null;
  onRequest?: (id: string) => void;
}) {
  return (
    <Section title={`${title} (${items.length})`}>
      <Surface>
        {items.length === 0 ? (
          <div className="p-4 text-sm text-neutral-500 dark:text-neutral-400">{emptyText || 'None.'}</div>
        ) : (
          <ul>
            {items.map(r => {
              const days = Math.ceil((+new Date(r.refillBy) - Date.now()) / 86400000);
              return (
                <li key={r.id} className="flex items-center gap-3 p-3 border-b border-neutral-100 dark:border-neutral-900 last:border-0">
                  <div className="w-9 h-9 rounded-md bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
                    <PillIcon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link href={`/medications/${r.medicationId}`} className="text-sm font-medium hover:underline truncate block">{r.medicationName}</Link>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
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
