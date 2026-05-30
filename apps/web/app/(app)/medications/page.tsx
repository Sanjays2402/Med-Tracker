'use client';

import * as React from 'react';
import Link from 'next/link';
import { Pill as PillIcon } from '@med/icons';
import { Btn, Surface, Empty, ErrorBox, SkeletonRow, Pill } from '../../../components/uikit';
import { listMedications } from '../../../lib/data';
import type { Medication } from '../../../lib/types';

export default function MedicationsPage() {
  const [meds, setMeds] = React.useState<Medication[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');

  const load = React.useCallback(async () => {
    setError(null);
    try { setMeds(await listMedications()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load medications.'); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  if (error && !meds) return <ErrorBox message={error} onRetry={load} />;

  const filtered = (meds ?? []).filter(m =>
    !query || m.name.toLowerCase().includes(query.toLowerCase()) || (m.strength ?? '').toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="eyebrow">your pillbox</div>
          <h1 className="display text-[36px] leading-none tracking-tight mt-1">Medications</h1>
          <p className="text-[13px] text-[var(--ink-muted)] mt-2">{meds?.length ?? 0} on file</p>
        </div>
        <Link href="/medications/new"><Btn variant="primary">Add a medication</Btn></Link>
      </header>

      <Surface className="p-2">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name or strength"
          className="w-full bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-neutral-400"
        />
      </Surface>

      {meds === null ? (
        <Surface><SkeletonRow /><SkeletonRow /><SkeletonRow /></Surface>
      ) : filtered.length === 0 ? (
        meds.length === 0 ? (
          <Empty
            icon={<PillIcon size={32} />}
            title="An empty pillbox"
            description="Add your first medication. Doses, refills, and reminders wire themselves up."
            action={<Link href="/medications/new"><Btn variant="primary" size="sm">Add a medication</Btn></Link>}
          />
        ) : (
          <Empty title="Nothing matches" description={`No medications match "${query}".`} />
        )
      ) : (
        <Surface>
          <ul>
            {filtered.map(m => (
              <li key={m.id}>
                <Link
                  href={`/medications/${m.id}`}
                  className="flex items-center gap-3 p-3 border-b border-neutral-100 dark:border-neutral-900 last:border-0 hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors"
                >
                  <div className="w-9 h-9 rounded-md bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
                    <PillIcon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{m.name} {m.strength && <span className="text-neutral-500 font-normal">{m.strength}</span>}</div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{m.schedule ?? 'No schedule'} {m.form ? `, ${m.form}` : ''}</div>
                  </div>
                  {typeof m.remainingDoses === 'number' && (
                    <Pill tone={m.remainingDoses < 10 ? 'danger' : m.remainingDoses < 20 ? 'warn' : 'neutral'}>
                      {m.remainingDoses} left
                    </Pill>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </Surface>
      )}
    </div>
  );
}
