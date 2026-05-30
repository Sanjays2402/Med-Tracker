'use client';

import * as React from 'react';
import Link from 'next/link';
import { Pill as PillIcon, CheckCircle } from '@med/icons';
import { Surface, Empty, ErrorBox, SkeletonRow, Pill, formatDate } from '../../../../components/uikit';
import { listRefillsHistory } from '../../../../lib/data';
import type { Refill } from '../../../../lib/types';

export default function RefillsHistoryPage() {
  const [refills, setRefills] = React.useState<Refill[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try { setRefills(await listRefillsHistory()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load refill history.'); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  if (error && !refills) return <ErrorBox message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Refill history</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Past requests, ready pickups, and completed refills.
        </p>
      </header>

      {refills === null ? (
        <Surface><SkeletonRow /><SkeletonRow /><SkeletonRow /></Surface>
      ) : refills.length === 0 ? (
        <Empty
          icon={<CheckCircle size={32} weight="duotone" />}
          title="No refill history yet"
          description="Once you request or pick up a refill it appears here."
        />
      ) : (
        <Surface>
          <ul>
            {refills.map(r => (
              <li key={r.id} className="flex items-center gap-3 p-3 border-b border-neutral-100 dark:border-neutral-900 last:border-0">
                <div className="w-9 h-9 rounded-md bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 flex items-center justify-center shrink-0">
                  <PillIcon size={18} weight="duotone" />
                </div>
                <div className="flex-1 min-w-0">
                  <Link href={`/medications/${r.medicationId}`} className="text-sm font-medium hover:underline truncate block">
                    {r.medicationName}
                  </Link>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                    {r.daysSupply} day supply{r.pharmacy ? ` · ${r.pharmacy}` : ''} · {formatDate(r.refillBy)}
                  </div>
                </div>
                <StatusPill status={r.status} />
              </li>
            ))}
          </ul>
        </Surface>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: Refill['status'] }) {
  switch (status) {
    case 'requested': return <Pill tone="info">Requested</Pill>;
    case 'ready': return <Pill tone="ok">Ready</Pill>;
    case 'picked_up': return <Pill tone="neutral">Picked up</Pill>;
    default: return <Pill tone="warn">Needed</Pill>;
  }
}
