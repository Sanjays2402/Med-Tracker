'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Pill as PillIcon, ArrowCounterClockwise } from '@med/icons';
import { Surface, Empty, ErrorBox, SkeletonRow, Btn } from '../../../../components/uikit';
import { listArchivedMedications, activateMedication } from '../../../../lib/data';
import type { Medication } from '../../../../lib/types';

export default function ArchivedMedicationsPage() {
  const [meds, setMeds] = React.useState<Medication[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try { setMeds(await listArchivedMedications()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load archived medications.'); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  async function onRestore(id: string) {
    setBusy(id);
    try {
      await activateMedication(id);
      setMeds(prev => (prev ?? []).filter(m => m.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not restore medication.');
    } finally {
      setBusy(null);
    }
  }

  if (error && !meds) return <ErrorBox message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <Link href="/medications" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
        <ArrowLeft size={14} />
        Medications
      </Link>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Archived medications</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Medications you have stopped taking. Restore one to bring it back to your active list.
        </p>
      </header>

      {meds === null ? (
        <Surface><SkeletonRow /><SkeletonRow /></Surface>
      ) : meds.length === 0 ? (
        <Empty
          icon={<PillIcon size={32} weight="duotone" />}
          title="Nothing in the archive"
          description="When you archive a medication it appears here so you can restore it later."
        />
      ) : (
        <Surface>
          <ul>
            {meds.map(m => (
              <li key={m.id} className="flex items-center gap-3 p-3 border-b border-neutral-100 dark:border-neutral-900 last:border-0">
                <div className="w-9 h-9 rounded-md bg-neutral-100 dark:bg-neutral-900 text-neutral-500 flex items-center justify-center shrink-0">
                  <PillIcon size={18} weight="duotone" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {m.name}
                    {m.strength && <span className="text-neutral-500 dark:text-neutral-400 font-normal"> · {m.strength}</span>}
                  </div>
                  {m.instructions && (
                    <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{m.instructions}</div>
                  )}
                </div>
                <Btn variant="secondary" size="sm" onClick={() => onRestore(m.id)} disabled={busy === m.id}>
                  <ArrowCounterClockwise size={14} />
                  {busy === m.id ? 'Restoring' : 'Restore'}
                </Btn>
              </li>
            ))}
          </ul>
        </Surface>
      )}

      {error && meds && <ErrorBox message={error} />}
    </div>
  );
}
