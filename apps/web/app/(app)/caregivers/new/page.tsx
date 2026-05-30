'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Users } from '@med/icons';
import { Surface, Btn, ErrorBox, Section } from '../../../../components/uikit';
import { createCaregiver } from '../../../../lib/data';

const SCOPES = [
  { id: 'view-meds', label: 'View medications', desc: 'See current medications and dosages.' },
  { id: 'view-adherence', label: 'View adherence', desc: 'See how often doses are taken or missed.' },
  { id: 'view-refills', label: 'View refills', desc: 'See refill status and pharmacy info.' },
  { id: 'request-refill', label: 'Request refills', desc: 'Submit refill requests on your behalf.' },
];

const TTL_OPTIONS = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 365, label: '1 year' },
  { value: 0, label: 'No expiry' },
];

export default function NewCaregiverPage() {
  const router = useRouter();
  const [label, setLabel] = React.useState('');
  const [scopes, setScopes] = React.useState<string[]>(['view-meds']);
  const [ttlDays, setTtlDays] = React.useState(30);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function toggleScope(id: string) {
    setScopes(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!label.trim()) { setError('Please enter a label for this share.'); return; }
    if (scopes.length === 0) { setError('Pick at least one permission.'); return; }
    setSubmitting(true);
    try {
      const created = await createCaregiver({
        label: label.trim(),
        scopes,
        ttlDays: ttlDays === 0 ? null : ttlDays,
      });
      router.push(`/caregivers/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create share.');
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Link href="/caregivers" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
        <ArrowLeft size={14} />
        Caregivers
      </Link>

      <header className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
          <Users size={24} weight="duotone" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">New caregiver share</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Pick a label, choose what they can see, and set an expiry.
          </p>
        </div>
      </header>

      {error && <ErrorBox message={error} />}

      <form onSubmit={onSubmit} className="space-y-6">
        <Section title="Label">
          <Surface>
            <div className="p-4">
              <input
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="Dr. Reyes, Mom, CVS pharmacy"
                className="w-full px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                maxLength={80}
                autoFocus
                required
              />
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">
                Visible only to you. Helps you recognize the share later.
              </p>
            </div>
          </Surface>
        </Section>

        <Section title="Permissions">
          <Surface>
            <ul>
              {SCOPES.map(s => {
                const checked = scopes.includes(s.id);
                return (
                  <li key={s.id} className="border-b border-neutral-100 dark:border-neutral-900 last:border-0">
                    <label className="flex items-start gap-3 p-3 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-900/40">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleScope(s.id)}
                        className="mt-0.5 h-4 w-4 rounded border-neutral-300 dark:border-neutral-700"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{s.label}</div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">{s.desc}</div>
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          </Surface>
        </Section>

        <Section title="Expiry">
          <Surface>
            <div className="p-4 flex flex-wrap gap-2">
              {TTL_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTtlDays(opt.value)}
                  className={`px-3 h-8 text-sm rounded-md border transition-colors ${
                    ttlDays === opt.value
                      ? 'border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-300'
                      : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </Surface>
        </Section>

        <div className="flex items-center gap-2">
          <Btn type="submit" variant="primary" size="md" disabled={submitting}>
            {submitting ? 'Creating' : 'Create share'}
          </Btn>
          <Link href="/caregivers" className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 px-2">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
