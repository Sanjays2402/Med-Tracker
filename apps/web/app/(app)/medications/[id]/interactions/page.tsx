'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, ShieldWarning, Warning, CheckCircle } from '@med/icons';
import { Surface, Empty, ErrorBox, SkeletonRow, Pill, Section } from '../../../../../components/uikit';
import { getMedication, listMedications, checkInteractions, medicationNameToDrugId, getDrug } from '../../../../../lib/data';
import type { InteractionReport } from '../../../../../lib/data';
import type { Medication, Drug } from '../../../../../lib/types';

export default function MedicationInteractionsPage() {
  const routed = useParams<{ id: string }>();
  const id = routed?.id ?? '';
  const [med, setMed] = React.useState<Medication | null | undefined>(undefined);
  const [others, setOthers] = React.useState<Medication[]>([]);
  const [drug, setDrug] = React.useState<Drug | null>(null);
  const [report, setReport] = React.useState<InteractionReport | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const [m, all] = await Promise.all([getMedication(id), listMedications()]);
      setMed(m);
      const rest = all.filter(x => x.id !== id && !x.archived);
      setOthers(rest);
      if (m) {
        const drugId = medicationNameToDrugId(m.name);
        const [d, r] = await Promise.all([
          getDrug(drugId),
          checkInteractions([drugId, ...rest.map(o => medicationNameToDrugId(o.name))]),
        ]);
        setDrug(d);
        setReport(r);
      } else {
        setReport({ pairs: [], unknownDrugIds: [] });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load interactions.');
    }
  }, [id]);
  React.useEffect(() => { void load(); }, [load]);

  if (error && !report) return <ErrorBox message={error} onRetry={load} />;

  const knownInteractions = drug?.interactions ?? [];
  const namesOfOthers = others.map(o => o.name.toLowerCase());
  const flagged = knownInteractions.filter(i =>
    namesOfOthers.some(n => n.includes(i.toLowerCase()) || i.toLowerCase().includes(n))
  );

  return (
    <div className="space-y-6">
      <Link href={`/medications/${id}`} className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
        <ArrowLeft size={14} />
        Back to medication
      </Link>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {med ? `${med.name} interactions` : 'Interactions'}
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Cross-checked against your active medications and the drug reference.
        </p>
      </header>

      {report === null ? (
        <Surface><SkeletonRow /><SkeletonRow /></Surface>
      ) : (
        <>
          {report.pairs.length > 0 ? (
            <Section title={`${report.pairs.length} potential interaction${report.pairs.length === 1 ? '' : 's'} from the API`}>
              <Surface>
                <ul>
                  {report.pairs.map((p: InteractionReport['pairs'][number], i: number) => (
                    <li key={i} className="flex items-start gap-3 p-3 border-b border-neutral-100 dark:border-neutral-900 last:border-0">
                      <ShieldWarning size={18} weight="duotone" className={
                        p.severity === 'high' ? 'text-red-600 dark:text-red-400 shrink-0 mt-0.5'
                        : p.severity === 'moderate' ? 'text-amber-600 dark:text-amber-400 shrink-0 mt-0.5'
                        : 'text-neutral-500 shrink-0 mt-0.5'
                      } />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium capitalize">{p.a} + {p.b}</div>
                        {p.note && <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{p.note}</div>}
                      </div>
                      <Pill tone={p.severity === 'high' ? 'danger' : p.severity === 'moderate' ? 'warn' : 'neutral'}>
                        {p.severity}
                      </Pill>
                    </li>
                  ))}
                </ul>
              </Surface>
            </Section>
          ) : flagged.length > 0 ? (
            <Section title={`${flagged.length} possible interaction${flagged.length === 1 ? '' : 's'} from drug reference`}>
              <Surface>
                <ul>
                  {flagged.map((f, i) => {
                    const conflict = others.find(o => o.name.toLowerCase().includes(f.toLowerCase()) || f.toLowerCase().includes(o.name.toLowerCase()));
                    return (
                      <li key={i} className="flex items-start gap-3 p-3 border-b border-neutral-100 dark:border-neutral-900 last:border-0">
                        <Warning size={18} weight="duotone" className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">
                            {conflict ? (
                              <Link href={`/medications/${conflict.id}`} className="hover:underline">{conflict.name}</Link>
                            ) : (
                              <span className="capitalize">{f}</span>
                            )}
                          </div>
                          <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                            Listed as a known interaction for {med?.name}.
                          </div>
                        </div>
                        <Pill tone="warn">caution</Pill>
                      </li>
                    );
                  })}
                </ul>
              </Surface>
            </Section>
          ) : (
            <Empty
              icon={<CheckCircle size={32} weight="duotone" />}
              title="No flagged interactions"
              description={others.length === 0
                ? 'You have no other active medications to compare against.'
                : `Checked against ${others.length} other active medication${others.length === 1 ? '' : 's'}. Always confirm with a clinician.`}
            />
          )}

          {knownInteractions.length > 0 && (
            <Section title="All known interactions for this drug">
              <Surface>
                <div className="p-3 flex flex-wrap gap-2">
                  {knownInteractions.map((x, i) => (
                    <span key={i} className="text-xs px-2 py-1 rounded-md bg-neutral-100 dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 capitalize">
                      {x}
                    </span>
                  ))}
                </div>
              </Surface>
            </Section>
          )}
        </>
      )}

      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Not medical advice. Verify with your clinician or pharmacist before changing anything.
      </p>
    </div>
  );
}
