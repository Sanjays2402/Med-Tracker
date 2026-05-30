'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Pill as PillIcon, ChartLine, ShieldCheck, Eye } from '@med/icons';
import { Surface, ErrorBox, SkeletonRow, Section, Pill } from '../../../components/uikit';
import { fetchSharedView } from '../../../lib/data';
import type { SharedView } from '../../../lib/data';

export default function SharedViewPage() {
  const routed = useParams<{ token: string }>();
  const token = routed?.token ?? '';
  const [data, setData] = React.useState<SharedView | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetchSharedView(token);
      if ('error' in res) setError(res.error);
      else setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load shared view.');
    } finally {
      setLoading(false);
    }
  }, [token]);
  React.useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-4">
        <Surface><SkeletonRow /><SkeletonRow /></Surface>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto p-6 space-y-4">
        <Surface>
          <div className="p-8 text-center">
            <ShieldCheck size={32} weight="duotone" className="mx-auto text-neutral-400 mb-2" />
            <h2 className="text-base font-medium">Cannot open this link</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">{error}</p>
            <Link href="/" className="inline-block mt-4 text-sm text-brand-600 hover:underline">
              Back to Med-Tracker
            </Link>
          </div>
        </Surface>
      </div>
    );
  }

  if (!data) return null;
  const { share, medications, adherence, refills } = data;

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <header className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
          <Eye size={24} weight="duotone" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Shared view</div>
          <h1 className="text-2xl font-semibold tracking-tight truncate">{share.label}</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Read-only access · {share.scopes.join(', ')}
            {share.expiresAt && ` · expires ${new Date(share.expiresAt).toLocaleDateString()}`}
          </p>
        </div>
      </header>

      {adherence && (
        <Section title="Adherence">
          <Surface>
            <div className="p-4 grid grid-cols-3 gap-3">
              <Stat label={`Last ${adherence.windowDays}d`} value={`${Math.round(adherence.taken / Math.max(adherence.scheduled, 1) * 100)}%`} />
              <Stat label="Streak" value={`${adherence.streakDays}d`} />
              <Stat label="Trend" value={adherence.trend === 'up' ? 'Improving' : adherence.trend === 'down' ? 'Declining' : 'Steady'} />
            </div>
          </Surface>
        </Section>
      )}

      {medications && medications.length > 0 && (
        <Section title={`Medications (${medications.length})`}>
          <Surface>
            <ul>
              {medications.map(m => (
                <li key={m.id} className="flex items-center gap-3 p-3 border-b border-neutral-100 dark:border-neutral-900 last:border-0">
                  <div className="w-9 h-9 rounded-md bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
                    <PillIcon size={18} weight="duotone" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {m.name}
                      {m.strength && <span className="text-neutral-500 dark:text-neutral-400 font-normal"> · {m.strength}</span>}
                    </div>
                    {m.schedule && <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{m.schedule}</div>}
                  </div>
                </li>
              ))}
            </ul>
          </Surface>
        </Section>
      )}

      {refills && refills.length > 0 && (
        <Section title={`Refills (${refills.length})`}>
          <Surface>
            <ul>
              {refills.map(r => (
                <li key={r.id} className="flex items-center gap-3 p-3 border-b border-neutral-100 dark:border-neutral-900 last:border-0">
                  <div className="text-sm flex-1 truncate">{r.medicationName}</div>
                  <Pill tone={r.status === 'needed' ? 'warn' : r.status === 'ready' ? 'ok' : 'neutral'}>{r.status}</Pill>
                </li>
              ))}
            </ul>
          </Surface>
        </Section>
      )}

      {(!medications || medications.length === 0) && !adherence && (!refills || refills.length === 0) && (
        <Surface>
          <div className="p-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
            The share is valid but the patient has not shared any data in these scopes yet.
          </div>
        </Surface>
      )}

      <div className="text-center pt-4">
        <Link href="/" className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
          Powered by Med-Tracker
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-neutral-500 dark:text-neutral-400">{label}</div>
      <div className="text-xl font-semibold tracking-tight mt-1">{value}</div>
    </div>
  );
}

function ChartLineHidden() { return <ChartLine size={1} />; }
