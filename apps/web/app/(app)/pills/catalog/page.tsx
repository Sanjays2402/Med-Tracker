'use client';

import * as React from 'react';
import Link from 'next/link';
import { Pill as PillIcon, MagnifyingGlass } from '@med/icons';
import { Surface, Empty, ErrorBox, SkeletonRow, Pill, Section } from '../../../../components/uikit';
import { listPillCatalog } from '../../../../lib/data';
import type { PillDescriptor } from '../../../../lib/types';

export default function PillCatalogPage() {
  const [entries, setEntries] = React.useState<PillDescriptor[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [q, setQ] = React.useState('');

  const load = React.useCallback(async () => {
    setError(null);
    try { setEntries(await listPillCatalog()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load catalog.'); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  const filtered = React.useMemo(() => {
    if (!entries) return null;
    const needle = q.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter(e =>
      e.name.toLowerCase().includes(needle) ||
      (e.imprint?.toLowerCase().includes(needle) ?? false) ||
      e.id.toLowerCase().includes(needle),
    );
  }, [entries, q]);

  if (error && !entries) return <ErrorBox message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pill catalog</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Reference of known pills used by the identifier.
          </p>
        </div>
        <Link href="/pills" className="text-sm text-brand-600 dark:text-brand-400 hover:underline">
          Open identifier
        </Link>
      </header>

      <div className="relative max-w-md">
        <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Filter by name, imprint, or id"
          className="w-full h-9 pl-8 pr-3 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        />
      </div>

      {entries === null ? (
        <Surface><SkeletonRow /><SkeletonRow /><SkeletonRow /></Surface>
      ) : (filtered ?? []).length === 0 ? (
        <Empty
          icon={<PillIcon size={32} />}
          title={entries.length === 0 ? 'Catalog is empty' : 'No matches'}
          description={entries.length === 0 ? 'No pills are registered on this server.' : 'Try a different search term.'}
        />
      ) : (
        <Section
          title="Entries"
          action={<span className="text-xs text-neutral-500">{filtered!.length} of {entries.length}</span>}
        >
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {filtered!.map(p => (
              <li key={p.id}>
                <Link
                  href={`/pills/catalog/${encodeURIComponent(p.id)}`}
                  className="flex items-center gap-3 p-4 hover:bg-neutral-50 dark:hover:bg-neutral-900/60"
                >
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-brand-500/10 text-brand-600 dark:text-brand-400">
                    <PillIcon size={18} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{p.name}</div>
                    <div className="text-xs text-neutral-500 truncate">
                      {p.imprint ? `imprint ${p.imprint}` : 'no imprint'}
                      {p.shape ? ` · ${p.shape}` : ''}
                      {p.sizeMm ? ` · ${p.sizeMm} mm` : ''}
                    </div>
                  </div>
                  {p.colors?.length ? <Pill tone="neutral">{p.colors.join('/')}</Pill> : null}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
