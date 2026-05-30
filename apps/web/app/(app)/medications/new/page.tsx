'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Btn, Surface, ErrorBox } from '../../../../components/uikit';
import { createMedication } from '../../../../lib/data';

export default function NewMedicationPage() {
  const router = useRouter();
  const [name, setName] = React.useState('');
  const [strength, setStrength] = React.useState('');
  const [form, setForm] = React.useState('tablet');
  const [instructions, setInstructions] = React.useState('');
  const [schedule, setSchedule] = React.useState('08:00 daily');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const created = await createMedication({
        name: name.trim(),
        strength: strength.trim() || undefined,
        form,
        instructions: instructions.trim() || undefined,
        schedule,
        remainingDoses: 30,
        refillThresholdDays: 7,
      });
      router.push(`/medications/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save medication.');
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <div className="text-sm text-neutral-500 dark:text-neutral-400">
        <Link href="/medications" className="hover:text-neutral-900 dark:hover:text-neutral-100">Medications</Link>
        <span className="mx-1.5">/</span>
        <span className="text-neutral-900 dark:text-neutral-100">New</span>
      </div>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Add medication</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Set up a new prescription or over the counter medication.</p>
      </header>

      <Surface className="p-5">
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Name" required>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Lisinopril"
              className={inputCls}
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Strength">
              <input value={strength} onChange={e => setStrength(e.target.value)} placeholder="10 mg" className={inputCls} />
            </Field>
            <Field label="Form">
              <select value={form} onChange={e => setForm(e.target.value)} className={inputCls}>
                <option value="tablet">Tablet</option>
                <option value="capsule">Capsule</option>
                <option value="softgel">Softgel</option>
                <option value="liquid">Liquid</option>
                <option value="injection">Injection</option>
                <option value="patch">Patch</option>
                <option value="inhaler">Inhaler</option>
              </select>
            </Field>
          </div>
          <Field label="Schedule">
            <input value={schedule} onChange={e => setSchedule(e.target.value)} placeholder="08:00 daily" className={inputCls} />
          </Field>
          <Field label="Instructions">
            <textarea
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              placeholder="Take with food in the morning."
              rows={3}
              className={inputCls}
            />
          </Field>
          {error && <ErrorBox message={error} />}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Link href="/medications"><Btn type="button" variant="ghost">Cancel</Btn></Link>
            <Btn type="submit" variant="primary" disabled={submitting}>{submitting ? 'Saving' : 'Save medication'}</Btn>
          </div>
        </form>
      </Surface>
    </div>
  );
}

const inputCls =
  'w-full h-9 px-2.5 rounded-md bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 placeholder:text-neutral-400';

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}
