'use client';

import * as React from 'react';
import Link from 'next/link';
import { MagnifyingGlass, Pill as PillIcon, Warning } from '@med/icons';
import { Surface, Empty, ErrorBox, SkeletonRow, Pill } from '../../../components/uikit';
import { searchDrugs } from '../../../lib/data';
import type { Drug } from '../../../lib/types';

export default function DrugsPage() {
  const [q, setQ] = React.useState('');
  const [results, setResults] = React.useState<Drug[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const run = React.useCallback(async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      const r = await searchDrugs(query, 30);
      setResults(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not search drugs.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void run('');
  }, [run]);

  React.useEffect(() => {
    const t = setTimeout(() => { void run(q); }, 250);
    return () => clearTimeout(t);
  }, [q, run]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Drug reference</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Search the medication catalog by generic or brand name.
        </p>
      </header>

      <div className="relative">
        <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search ibuprofen, lisinopril, atorvastatin"
          className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
          aria-label="Search drugs"
        />
      </div>

      {error && <ErrorBox message={error} onRetry={() => run(q)} />}

      {loading && !results ? (
        <Surface>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </Surface>
      ) : results && results.length === 0 ? (
        <Empty
          icon={<MagnifyingGlass size={32} />}
          title={q ? `No drugs match "${q}"` : 'No drugs available'}
          description={q ? 'Try a generic name like ibuprofen.' : 'The catalog appears empty.'}
        />
      ) : (
        <Surface>
          <ul>
            {(results ?? []).map((d) => (
              <li key={d.id} className="border-b border-neutral-100 dark:border-neutral-900 last:border-0">
                <Link
                  href={`/drugs/${d.id}`}
                  className="flex items-center gap-3 p-3 hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors"
                >
                  <div className="w-9 h-9 rounded-md bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
                    <PillIcon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {capitalize(d.generic)}
                      {d.brand && <span className="text-neutral-500 dark:text-neutral-400 font-normal"> · {d.brand}</span>}
                    </div>
                    {d.class && (
                      <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{d.class}</div>
                    )}
                  </div>
                  {d.warnings && d.warnings.length > 0 && (
                    <Pill tone="warn">
                      <Warning size={12} weight="duotone" className="mr-1" />
                      {d.warnings.length} warning{d.warnings.length === 1 ? '' : 's'}
                    </Pill>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </Surface>
      )}

      {results && results.length > 0 && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Showing {results.length} result{results.length === 1 ? '' : 's'}. Not medical advice. Verify with a clinician.
        </p>
      )}
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
