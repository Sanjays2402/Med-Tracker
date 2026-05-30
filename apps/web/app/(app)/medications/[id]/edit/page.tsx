'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from '@med/icons';
import { Surface, Btn, ErrorBox, SkeletonRow, Section } from '../../../../../components/uikit';
import { getMedication, updateMedication } from '../../../../../lib/data';
import type { Medication } from '../../../../../lib/types';

const FORMS = ['tablet', 'capsule', 'softgel', 'liquid', 'injection', 'topical', 'inhaler', 'patch'];

export default function EditMedicationPage() {
  const router = useRouter();
  const routed = useParams<{ id: string }>();
  const id = routed?.id ?? '';
  const [med, setMed] = React.useState<Medication | null | undefined>(undefined);
  const [name, setName] = React.useState('');
  const [strength, setStrength] = React.useState('');
  const [form, setForm] = React.useState('tablet');
  const [instructions, setInstructions] = React.useState('');
  const [remainingDoses, setRemainingDoses] = React.useState('');
  const [refillThresholdDays, setRefillThresholdDays] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        const m = await getMedication(id);
        setMed(m);
        if (m) {
          setName(m.name);
          setStrength(m.strength ?? '');
          setForm(m.form ?? 'tablet');
          setInstructions(m.instructions ?? '');
          setRemainingDoses(String(m.remainingDoses ?? ''));
          setRefillThresholdDays(String(m.refillThresholdDays ?? ''));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load medication.');
      }
    })();
  }, [id]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError('Name is required.'); return; }
    setSubmitting(true);
    try {
      const remaining = remainingDoses ? Number(remainingDoses) : undefined;
      const threshold = refillThresholdDays ? Number(refillThresholdDays) : undefined;
      await updateMedication(id, {
        name: name.trim(),
        strength: strength.trim() || undefined,
        form,
        instructions: instructions.trim() || undefined,
        remainingDoses: Number.isFinite(remaining) ? remaining : undefined,
        refillThresholdDays: Number.isFinite(threshold) ? threshold : undefined,
      });
      router.push(`/medications/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save medication.');
      setSubmitting(false);
    }
  }

  if (med === undefined) return <Surface><SkeletonRow /><SkeletonRow /></Surface>;
  if (med === null) {
    return (
      <div className="space-y-6">
        <BackLink id={id} />
        <Surface>
          <div className="p-8 text-center text-sm text-neutral-500">
            Medication not found.
          </div>
        </Surface>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <BackLink id={id} />

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Edit {med.name}</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Update details for this medication.</p>
      </header>

      {error && <ErrorBox message={error} />}

      <form onSubmit={onSubmit} className="space-y-6">
        <Section title="Basics">
          <Surface>
            <div className="p-4 space-y-4">
              <Field label="Name" required>
                <input value={name} onChange={e => setName(e.target.value)} maxLength={80} required
                  className="w-full px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Strength">
                  <input value={strength} onChange={e => setStrength(e.target.value)} placeholder="10 mg" maxLength={32}
                    className="w-full px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
                </Field>
                <Field label="Form">
                  <select value={form} onChange={e => setForm(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500">
                    {FORMS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Instructions">
                <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={3} maxLength={500}
                  placeholder="Take with food. Avoid grapefruit."
                  className="w-full px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
              </Field>
            </div>
          </Surface>
        </Section>

        <Section title="Supply">
          <Surface>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Doses remaining">
                <input type="number" min={0} max={9999} value={remainingDoses} onChange={e => setRemainingDoses(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
              </Field>
              <Field label="Refill threshold (days)">
                <input type="number" min={0} max={90} value={refillThresholdDays} onChange={e => setRefillThresholdDays(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
              </Field>
            </div>
          </Surface>
        </Section>

        <div className="flex items-center gap-2">
          <Btn type="submit" variant="primary" size="md" disabled={submitting}>
            {submitting ? 'Saving' : 'Save changes'}
          </Btn>
          <Link href={`/medications/${id}`} className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 px-2">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function BackLink({ id }: { id: string }) {
  return (
    <Link href={`/medications/${id}`} className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
      <ArrowLeft size={14} />
      Back to medication
    </Link>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}
