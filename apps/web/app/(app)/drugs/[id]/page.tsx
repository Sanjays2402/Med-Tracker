'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Pill as PillIcon, Warning, Info } from '@med/icons';
import { Surface, ErrorBox, SkeletonRow, Pill, Section } from '../../../../components/uikit';
import { getDrug } from '../../../../lib/data';
import type { Drug } from '../../../../lib/types';

export default function DrugDetailPage() {
  const routed = useParams<{ id: string }>();
  const id = routed?.id ?? '';
  const [drug, setDrug] = React.useState<Drug | null | undefined>(undefined);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      setDrug(await getDrug(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load drug.');
    }
  }, [id]);

  React.useEffect(() => { void load(); }, [load]);

  if (error) return <ErrorBox message={error} onRetry={load} />;

  if (drug === undefined) {
    return (
      <div className="space-y-4">
        <Surface><SkeletonRow /><SkeletonRow /><SkeletonRow /></Surface>
      </div>
    );
  }

  if (drug === null) {
    return (
      <div className="space-y-6">
        <BackLink />
        <Surface>
          <div className="p-8 text-center">
            <h2 className="text-base font-medium">Drug not found</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
              The id <code className="font-mono text-xs">{id}</code> is not in the catalog.
            </p>
          </div>
        </Surface>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BackLink />

      <header className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
          <PillIcon size={24} weight="duotone" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{capitalize(drug.generic)}</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {drug.brand ? `Also sold as ${drug.brand}` : 'Generic only'}
            {drug.class && ` · ${drug.class}`}
          </p>
        </div>
        {drug.pregnancyCategory && (
          <Pill tone={drug.pregnancyCategory === 'D' || drug.pregnancyCategory === 'X' ? 'danger' : 'neutral'}>
            Pregnancy {drug.pregnancyCategory}
          </Pill>
        )}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FactList title="Indications" items={drug.indications} empty="No indications listed." />
        <FactList title="Dosages" items={drug.dosages} empty="No dosages listed." />
        <FactList title="Routes" items={drug.routes} empty="No routes listed." />
        <FactList title="Frequencies" items={drug.frequencies} empty="No frequencies listed." />
      </div>

      {drug.warnings && drug.warnings.length > 0 && (
        <Section title="Warnings">
          <Surface>
            <ul>
              {drug.warnings.map((w, i) => (
                <li key={i} className="flex items-start gap-3 p-3 border-b border-neutral-100 dark:border-neutral-900 last:border-0">
                  <Warning size={16} weight="duotone" className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <span className="text-sm">{w}</span>
                </li>
              ))}
            </ul>
          </Surface>
        </Section>
      )}

      {drug.interactions && drug.interactions.length > 0 && (
        <Section title="Interactions">
          <Surface>
            <div className="p-3 flex flex-wrap gap-2">
              {drug.interactions.map((x, i) => (
                <span key={i} className="text-xs px-2 py-1 rounded-md bg-neutral-100 dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300">
                  {x}
                </span>
              ))}
            </div>
          </Surface>
        </Section>
      )}

      {drug.storage && (
        <Section title="Storage">
          <Surface>
            <div className="p-3 text-sm">{drug.storage}</div>
          </Surface>
        </Section>
      )}

      <div className="flex flex-wrap gap-2 pt-2">
        <Link
          href={`/medications/new?name=${encodeURIComponent(capitalize(drug.generic))}`}
          className="inline-flex items-center justify-center h-8 px-3 text-sm font-medium rounded-md bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
        >
          Add to my medications
        </Link>
        <Link
          href="/drugs"
          className="inline-flex items-center justify-center h-8 px-3 text-sm font-medium rounded-md text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-900"
        >
          Back to search
        </Link>
      </div>

      {drug.sourceNote && (
        <div className="flex items-start gap-2 text-xs text-neutral-500 dark:text-neutral-400 pt-2">
          <Info size={12} weight="duotone" className="shrink-0 mt-0.5" />
          <span>{drug.sourceNote}</span>
        </div>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/drugs" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
      <ArrowLeft size={14} />
      All drugs
    </Link>
  );
}

function FactList({ title, items, empty }: { title: string; items?: string[]; empty: string }) {
  return (
    <Section title={title}>
      <Surface>
        {!items || items.length === 0 ? (
          <div className="p-3 text-sm text-neutral-500 dark:text-neutral-400">{empty}</div>
        ) : (
          <ul>
            {items.map((it, i) => (
              <li key={i} className="px-3 py-2 text-sm border-b border-neutral-100 dark:border-neutral-900 last:border-0 capitalize">
                {it}
              </li>
            ))}
          </ul>
        )}
      </Surface>
    </Section>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
