'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Pill as PillIcon } from '@med/icons';
import { Surface, Empty, ErrorBox, SkeletonRow, Pill, formatDate, Btn } from '../../../../../components/uikit';
import { getMedication, listRefills, requestRefill } from '../../../../../lib/data';
import type { Medication, Refill } from '../../../../../lib/types';

export default function MedicationRefillsPage() {
  const routed = useParams<{ id: string }>();
  const id = routed?.id ?? '';
  const [med, setMed] = React.useState<Medication | null | undefined>(undefined);
  const [refills, setRefills] = React.useState<Refill[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const [m, r] = await Promise.all([getMedication(id), listRefills()]);
      setMed(m);
      setRefills(r.filter(x => x.medicationId === id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load refills.');
    }
  }, [id]);
  React.useEffect(() => { void load(); }, [load]);

  async function onRequest(rid: string) {
    setBusy(rid);
    try {
      await requestRefill(rid);
      setRefills(prev => (prev ?? []).map(r => r.id === rid ? { ...r, status: 'requested' } : r));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not request refill.');
    } finally {
      setBusy(null);
    }
  }

  if (error && !refills) return <ErrorBox message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <Link href={`/medications/${id}`} className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
        <ArrowLeft size={14} />
        Back to medication
      </Link>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {med ? `${med.name} refills` : 'Refills'}
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Supply tracking and pharmacy requests for this medication.
        </p>
      </header>

      {refills === null ? (
        <Surface><SkeletonRow /><SkeletonRow /></Surface>
      ) : refills.length === 0 ? (
        <Empty
          icon={<PillIcon size={32} weight="duotone" />}
          title="No refills logged"
          description="When supply runs low, refills appear here automatically."
        />
      ) : (
        <Surface>
          <ul>
            {refills.map(r => {
              const days = Math.ceil((+new Date(r.refillBy) - Date.now()) / 86400000);
              return (
                <li key={r.id} className="flex items-center gap-3 p-3 border-b border-neutral-100 dark:border-neutral-900 last:border-0">
                  <div className="w-9 h-9 rounded-md bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 flex items-center justify-center shrink-0">
                    <PillIcon size={18} weight="duotone" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{r.pharmacy ?? 'Pharmacy not set'}</div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">
                      {r.daysSupply} day supply · by {formatDate(r.refillBy)}
                    </div>
                  </div>
                  <StatusPill status={r.status} daysLeft={days} />
                  {r.status === 'needed' && (
                    <Btn variant="primary" size="sm" disabled={busy === r.id} onClick={() => onRequest(r.id)}>
                      {busy === r.id ? 'Sending' : 'Request'}
                    </Btn>
                  )}
                </li>
              );
            })}
          </ul>
        </Surface>
      )}
    </div>
  );
}

function StatusPill({ status, daysLeft }: { status: Refill['status']; daysLeft: number }) {
  if (status === 'requested') return <Pill tone="info">Requested</Pill>;
  if (status === 'ready') return <Pill tone="ok">Ready</Pill>;
  if (status === 'picked_up') return <Pill tone="neutral">Picked up</Pill>;
  return <Pill tone={daysLeft <= 3 ? 'danger' : 'warn'}>{daysLeft <= 0 ? 'overdue' : `${daysLeft}d left`}</Pill>;
}
