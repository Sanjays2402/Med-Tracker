'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, User } from '@med/icons';
import { Surface, Btn, ErrorBox, Section } from '../../../../components/uikit';
import { api, ApiError } from '../../../../lib/api-client';

interface Profile {
  name: string;
  email: string;
  timeZone: string;
}

const STORAGE_KEY = 'med:profile';
const DEFAULT_TZ = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';

function readLocal(): Profile {
  if (typeof window === 'undefined') return { name: '', email: '', timeZone: DEFAULT_TZ };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { name: '', email: '', timeZone: DEFAULT_TZ };
    return { name: '', email: '', timeZone: DEFAULT_TZ, ...(JSON.parse(raw) as Partial<Profile>) };
  } catch { return { name: '', email: '', timeZone: DEFAULT_TZ }; }
}

export default function ProfileSettingsPage() {
  const [profile, setProfile] = React.useState<Profile>({ name: '', email: '', timeZone: DEFAULT_TZ });
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setProfile(readLocal());
    (async () => {
      try {
        const res = await api.get<unknown>('/me');
        if (res && typeof res === 'object' && (res as any).user) {
          const u = (res as any).user as Partial<Profile>;
          setProfile(p => ({ ...p, ...u }));
        }
      } catch (e) {
        if (e instanceof ApiError && e.status >= 500) setError('Could not load profile from server.');
      }
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      await api.patch('/me', profile);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (e) {
      if (e instanceof ApiError && e.status >= 500) {
        setError('Saved locally, but the server rejected the update.');
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 1800);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Link href="/settings" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
        <ArrowLeft size={14} />
        Settings
      </Link>

      <header className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
          <User size={24} weight="duotone" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">How you appear inside Med-Tracker.</p>
        </div>
      </header>

      {error && <ErrorBox message={error} />}

      <form onSubmit={onSubmit} className="space-y-6">
        <Section title="Basics">
          <Surface>
            <div className="p-4 space-y-4">
              <Field label="Name">
                <input value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))}
                  placeholder="Jordan Lee" maxLength={80}
                  className="w-full px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
              </Field>
              <Field label="Email">
                <input type="email" value={profile.email} onChange={e => setProfile(p => ({ ...p, email: e.target.value }))}
                  placeholder="you@example.com" maxLength={120}
                  className="w-full px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
              </Field>
              <Field label="Time zone">
                <input value={profile.timeZone} onChange={e => setProfile(p => ({ ...p, timeZone: e.target.value }))}
                  placeholder="America/Los_Angeles"
                  className="w-full px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  Detected from your browser: <code className="font-mono">{DEFAULT_TZ}</code>
                </p>
              </Field>
            </div>
          </Surface>
        </Section>

        <div className="flex items-center gap-2">
          <Btn type="submit" variant="primary" size="md" disabled={saving}>
            {saving ? 'Saving' : 'Save profile'}
          </Btn>
          {saved && <span className="text-xs text-emerald-600 dark:text-emerald-400">Saved</span>}
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">{label}</span>
      {children}
    </label>
  );
}
