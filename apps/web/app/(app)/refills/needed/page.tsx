'use client';

import * as React from 'react';
import Link from 'next/link';
import { Pill as PillIcon, Warning } from '@med/icons';
import { Surface, Empty, ErrorBox, SkeletonRow, Pill, Btn, formatDate } from '../../../../components/uikit';
import { listRefillsNeeded, requestRefill } from '../../../../lib/data';
import type { Refill } from '../../../../lib/types';

export default function RefillsNeededPage() {
  const [refills, setRefills] = React.useState<Refill[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try { setRefills(await listRefillsNeeded()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load refills.'); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  async function onRequest(id: string) {
    setBusy(id);
    try {
      await requestRefill(id);
      setRefills(prev => (prev ?? []).filter(r => r.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not request refill.');
    } finally {
      setBusy(null);
    }
  }

  if (error && !refills) return <ErrorBox message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Refills needed</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Medications running low. Request a refill from your pharmacy.
        </p>
      </header>

      {refills === null ? (
        <Surface><SkeletonRow /><SkeletonRow /></Surface>
      ) : refills.length === 0 ? (
        <Empty
          icon={<PillIcon size={32} weight="duotone" />}
          title="Nothing to reorder"
          description="Your medications have enough supply for now."
          action={<Link href="/refills" className="text-sm text-brand-600 hover:underline">View all refills</Link>}
        />
      ) : (
        <Surface>
          <ul>
            {refills.map(r => {
              const days = Math.ceil((+new Date(r.refillBy) - Date.now()) / 86400000);
              const urgent = days <= 3;
              return (
                <li key={r.id} className="flex items-center gap-3 p-3 border-b border-neutral-100 dark:border-neutral-900 last:border-0">
                  <div className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 ${
                    urgent ? 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400' : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400'
                  }`}>
                    {urgent ? <Warning size={18} weight="duotone" /> : <PillIcon size={18} weight="duotone" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link href={`/medications/${r.medicationId}`} className="text-sm font-medium hover:underline truncate block">
                      {r.medicationName}
                    </Link>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                      {r.daysSupply} day supply{r.pharmacy ? ` · ${r.pharmacy}` : ''} · by {formatDate(r.refillBy)}
                    </div>
                  </div>
                  <Pill tone={urgent ? 'danger' : 'warn'}>
                    {days <= 0 ? 'overdue' : `${days}d left`}
                  </Pill>
                  <Btn variant="primary" size="sm" disabled={busy === r.id} onClick={() => onRequest(r.id)}>
                    {busy === r.id ? 'Sending' : 'Request'}
                  </Btn>
                </li>
              );
            })}
          </ul>
        </Surface>
      )}

      {error && refills && <ErrorBox message={error} onRetry={load} />}
    </div>
  );
}
