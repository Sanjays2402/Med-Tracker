'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Pill as PillIcon, ArrowLeft } from '@med/icons';
import { Btn, Surface, Empty, ErrorBox, SkeletonRow, Pill, Section } from '../../../../../components/uikit';
import { getPill } from '../../../../../lib/data';
import type { PillDescriptor } from '../../../../../lib/types';

export default function PillDetailPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(String(params?.id ?? ''));
  const [pill, setPill] = React.useState<PillDescriptor | null | undefined>(undefined);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!id) return;
    setError(null);
    try { setPill(await getPill(id)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load pill.'); }
  }, [id]);
  React.useEffect(() => { void load(); }, [load]);

  if (error) return <ErrorBox message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/pills/catalog" className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200">
          <ArrowLeft size={14} /> Catalog
        </Link>
      </div>

      {pill === undefined ? (
        <Surface><SkeletonRow /><SkeletonRow /></Surface>
      ) : pill === null ? (
        <Empty
          icon={<PillIcon size={32} />}
          title="Pill not found"
          description={`No catalog entry with id ${id}.`}
          action={<Link href="/pills/catalog"><Btn>Back to catalog</Btn></Link>}
        />
      ) : (
        <>
          <header className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-md bg-brand-500/10 text-brand-600 dark:text-brand-400">
              <PillIcon size={22} />
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight truncate">{pill.name}</h1>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 font-mono truncate">{pill.id}</p>
            </div>
          </header>

          <Section title="Attributes">
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-4 text-sm">
              <Attr label="Imprint" value={pill.imprint ?? 'Not set'} mono />
              <Attr label="Shape" value={pill.shape ?? 'Not set'} />
              <Attr label="Size" value={pill.sizeMm ? `${pill.sizeMm} mm` : 'Not set'} />
              <Attr label="Scored" value={pill.scored === undefined ? 'Not set' : pill.scored ? 'Yes' : 'No'} />
              <div className="col-span-2">
                <dt className="text-xs text-neutral-500">Colors</dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">
                  {pill.colors?.length
                    ? pill.colors.map(c => <Pill key={c} tone="neutral">{c}</Pill>)
                    : <span className="text-neutral-500">Not set</span>}
                </dd>
              </div>
            </dl>
          </Section>

          <div className="flex gap-2">
            <Link href={`/pills?prefill=${encodeURIComponent(pill.id)}`}>
              <Btn>Use as identifier query</Btn>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function Attr({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className={`mt-0.5 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}
