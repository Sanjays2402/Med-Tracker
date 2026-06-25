'use client';

import * as React from 'react';
import Link from 'next/link';
import { Pill as PillIcon, MagnifyingGlass } from '@med/icons';
import { Btn, Surface, Empty, ErrorBox, SkeletonRow, Pill } from '../../../components/uikit';
import { listMedications } from '../../../lib/data';
import type { Medication } from '../../../lib/types';
import { filterMedications, sortMedications, estimatedDaysLeft, MED_SORTS, type MedSortKey } from '../../../lib/medication-sort';
import { SupplySparkline } from '../../../components/SupplySparkline';

export default function MedicationsPage() {
  const [meds, setMeds] = React.useState<Medication[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  const [sortBy, setSortBy] = React.useState<MedSortKey>('name');
  const searchRef = React.useRef<HTMLInputElement | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try { setMeds(await listMedications()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load medications.'); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  // "/" focuses the search box (without typing the slash) when not already typing.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || t?.isContentEditable) return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (error && !meds) return <ErrorBox message={error} onRetry={load} />;

  const visible = meds ? sortMedications(filterMedications(meds, query), sortBy) : [];

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="eyebrow">your pillbox</div>
          <h1 className="display text-[36px] leading-none tracking-tight mt-1">Medications</h1>
          <p className="text-[13px] text-[var(--ink-muted)] mt-2">
            {meds?.length ?? 0} on file{query && meds ? ` · ${visible.length} shown` : ''}
          </p>
        </div>
        <Link href="/medications/new"><Btn variant="primary">Add a medication</Btn></Link>
      </header>

      {/* Search + sort control row */}
      <div className="flex items-center gap-2 flex-wrap">
        <Surface className="flex-1 min-w-[200px] flex items-center gap-2 px-3 py-1.5">
          <MagnifyingGlass size={16} className="text-[var(--ink-muted)] shrink-0" />
          <input
            ref={searchRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search name, strength, or form"
            aria-label="Search medications"
            className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--ink-muted)]"
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); searchRef.current?.focus(); }}
              className="text-[11px] text-[var(--ink-muted)] hover:text-[var(--ink)] shrink-0"
              aria-label="Clear search"
            >
              clear
            </button>
          )}
          {!query && <kbd className="capsule tabular text-[10px] shrink-0" aria-hidden>/</kbd>}
        </Surface>
        <div className="flex items-center gap-1 shrink-0" role="group" aria-label="Sort medications">
          {MED_SORTS.map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setSortBy(opt.key)}
              aria-pressed={sortBy === opt.key}
              className={`h-9 px-3 rounded-full text-[12px] font-medium border transition-colors ${
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

      {meds === null ? (
        <Surface><SkeletonRow /><SkeletonRow /><SkeletonRow /></Surface>
      ) : visible.length === 0 ? (
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
            {visible.map(m => {
              const daysLeft = estimatedDaysLeft(m);
              return (
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
                    <SupplySparkline med={m} className="hidden sm:block shrink-0" />
                    {sortBy === 'runout' && daysLeft !== null ? (
                      <Pill tone={daysLeft < 7 ? 'danger' : daysLeft < 14 ? 'warn' : 'neutral'}>
                        ~{daysLeft}d left
                      </Pill>
                    ) : typeof m.remainingDoses === 'number' && (
                      <Pill tone={m.remainingDoses < 10 ? 'danger' : m.remainingDoses < 20 ? 'warn' : 'neutral'}>
                        {m.remainingDoses} left
                      </Pill>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Surface>
      )}
    </div>
  );
}
