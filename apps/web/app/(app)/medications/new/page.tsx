'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Btn, Surface, ErrorBox } from '../../../../components/uikit';
import { createMedication } from '../../../../lib/data';

type Errors = Partial<Record<'name' | 'strength' | 'schedule' | 'remainingDoses', string>>;

const COMMON_TIMES = ['07:00', '08:00', '12:00', '14:00', '18:00', '20:00', '22:00'];

export default function NewMedicationPage() {
  const router = useRouter();
  const [name, setName] = React.useState('');
  const [strength, setStrength] = React.useState('');
  const [form, setForm] = React.useState('tablet');
  const [instructions, setInstructions] = React.useState('');
  const [times, setTimes] = React.useState<string[]>(['08:00']);
  const [remainingDoses, setRemainingDoses] = React.useState('30');
  const [refillThresholdDays, setRefillThresholdDays] = React.useState('7');
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Errors>({});

  function validate(): Errors {
    const next: Errors = {};
    if (!name.trim()) next.name = 'Name is required.';
    else if (name.trim().length > 80) next.name = 'Keep the name under 80 characters.';
    if (strength.trim().length > 32) next.strength = 'Strength looks too long.';
    if (times.length === 0) next.schedule = 'Pick at least one time of day.';
    const n = Number(remainingDoses);
    if (!Number.isFinite(n) || n < 0 || n > 9999) next.remainingDoses = 'Use a whole number between 0 and 9999.';
    return next;
  }

  function toggleTime(t: string) {
    setTimes(prev => (prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t].sort()));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = validate();
    setErrors(v);
    if (Object.keys(v).length > 0) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const schedule = `${times.join(', ')} daily`;
      const created = await createMedication({
        name: name.trim(),
        strength: strength.trim() || undefined,
        form,
        instructions: instructions.trim() || undefined,
        schedule,
        remainingDoses: Number(remainingDoses),
        refillThresholdDays: Number(refillThresholdDays),
      });
      router.push(`/medications/${created.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not save medication.');
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
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Name" required error={errors.name}>
            <input
              value={name}
              onChange={e => { setName(e.target.value); if (errors.name) setErrors({ ...errors, name: undefined }); }}
              placeholder="Lisinopril"
              className={inputCls(!!errors.name)}
              autoFocus
              maxLength={80}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Strength" error={errors.strength}>
              <input value={strength} onChange={e => setStrength(e.target.value)} placeholder="10 mg" className={inputCls(!!errors.strength)} />
            </Field>
            <Field label="Form">
              <select value={form} onChange={e => setForm(e.target.value)} className={inputCls(false)}>
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

          <Field label="Times of day" required error={errors.schedule} hint="Tap to toggle. Daily schedule.">
            <div className="flex flex-wrap gap-1.5">
              {COMMON_TIMES.map(t => {
                const active = times.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTime(t)}
                    className={`text-sm px-3 py-1.5 rounded-md border transition-colors ${
                      active
                        ? 'bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900 dark:border-white'
                        : 'border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-900'
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Doses on hand" error={errors.remainingDoses}>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={9999}
                value={remainingDoses}
                onChange={e => setRemainingDoses(e.target.value)}
                className={inputCls(!!errors.remainingDoses)}
              />
            </Field>
            <Field label="Refill alert (days)" hint="Warn this many days before you run out.">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={60}
                value={refillThresholdDays}
                onChange={e => setRefillThresholdDays(e.target.value)}
                className={inputCls(false)}
              />
            </Field>
          </div>

          <Field label="Instructions">
            <textarea
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              placeholder="Take with food in the morning."
              rows={3}
              className={inputCls(false)}
            />
          </Field>

          {submitError && <ErrorBox message={submitError} />}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Link href="/medications"><Btn type="button" variant="ghost">Cancel</Btn></Link>
            <Btn type="submit" variant="primary" disabled={submitting}>{submitting ? 'Saving' : 'Save medication'}</Btn>
          </div>
        </form>
      </Surface>
    </div>
  );
}

function Field({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200 flex items-center gap-1">
        {label}
        {required && <span className="text-red-500" aria-hidden>*</span>}
      </span>
      {children}
      {error ? (
        <span className="block text-xs text-red-600 dark:text-red-400">{error}</span>
      ) : hint ? (
        <span className="block text-xs text-neutral-500 dark:text-neutral-500">{hint}</span>
      ) : null}
    </label>
  );
}

function inputCls(hasError: boolean): string {
  const base =
    'w-full rounded-md border bg-white dark:bg-neutral-950 px-3 py-2 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 transition-colors';
  return hasError
    ? `${base} border-red-300 dark:border-red-800 focus:ring-red-500/30 focus:border-red-500`
    : `${base} border-neutral-200 dark:border-neutral-800 focus:ring-brand-500/40 focus:border-brand-500`;
}
