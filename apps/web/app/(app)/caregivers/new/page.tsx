'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Users, Eye, Check } from '@med/icons';
import { Surface, Btn, ErrorBox, Section } from '../../../../components/uikit';
import { createCaregiver } from '../../../../lib/data';
import {
  groupedScopes,
  toggleScope as toggleScopeId,
  validateScopes,
  summarizeScopes,
} from '../../../../lib/scope-model';

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

  const groups = groupedScopes();
  const validation = validateScopes(scopes);
  const summary = summarizeScopes(scopes);

  function toggleScope(id: string) {
    setScopes((s) => toggleScopeId(s, id));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!label.trim()) { setError('Please enter a label for this share.'); return; }
    if (!validation.valid) { setError(validation.message ?? 'Pick at least one permission.'); return; }
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
          <div className="space-y-3">
            {groups.map((g) => (
              <Surface key={g.group}>
                <div className="px-4 pt-3 pb-1 flex items-center gap-2">
                  <span className="eyebrow">{g.label}</span>
                  {g.group === 'view' && <Eye size={13} className="text-[var(--ink-muted)]" />}
                </div>
                <ul>
                  {g.scopes.map((s) => {
                    const checked = scopes.includes(s.id);
                    return (
                      <li key={s.id} className="border-b border-[var(--line-soft)] last:border-0">
                        <label className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-[var(--bg-sunk)] transition-colors">
                          <span
                            className="mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-md shrink-0 transition-colors"
                            style={{
                              background: checked ? 'var(--accent)' : 'transparent',
                              border: `1.5px solid ${checked ? 'var(--accent)' : 'var(--line)'}`,
                              color: 'var(--bg-elev)',
                            }}
                          >
                            {checked && <Check size={13} />}
                          </span>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleScope(s.id)}
                            className="sr-only"
                          />
                          <span className="min-w-0">
                            <span className="block text-[14px] font-medium">{s.label}</span>
                            <span className="block text-[12.5px] text-[var(--ink-muted)]">{s.desc}</span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </Surface>
            ))}

            {/* Live plain-language summary of the current selection. */}
            <div
              className="sheet px-4 py-3"
              style={{
                background: validation.actWithoutView ? 'var(--warn-bg)' : 'var(--accent-soft)',
                borderColor: 'transparent',
              }}
            >
              <div className="eyebrow mb-1" style={{ color: validation.actWithoutView ? 'var(--warn)' : 'var(--accent-ink)' }}>
                {validation.actWithoutView ? 'check this' : 'this share'}
              </div>
              <p className="text-[13.5px]" style={{ color: validation.actWithoutView ? 'var(--warn)' : 'var(--accent-ink)' }}>
                {summary}
              </p>
              {validation.actWithoutView && validation.message && (
                <p className="text-[12px] mt-1" style={{ color: 'var(--warn)' }}>{validation.message}</p>
              )}
            </div>
          </div>
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
