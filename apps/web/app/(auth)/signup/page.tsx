'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Btn, ErrorBox } from '../../../components/uikit';
import { api, ApiError } from '../../../lib/api-client';
import { safeLocalStorage } from '@med/utils';
import { STORAGE_KEYS } from '@med/config';
import { AuthShell } from '../login/page';

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setSubmitting(true);
    try {
      const res = await api.post<{ token?: string }>('/auth/signup', { name, email, password });
      if (res?.token) safeLocalStorage.set(STORAGE_KEYS.authToken, res.token);
      else safeLocalStorage.set(STORAGE_KEYS.authToken, `demo_${Date.now().toString(36)}`);
      router.push('/verify?email=' + encodeURIComponent(email));
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setError('An account with that email already exists.');
      else setError(e instanceof Error ? e.message : 'Could not create account.');
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title="Create your account" subtitle="Stay on top of your medications.">
      {error && <ErrorBox message={error} />}
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Name">
          <input required autoFocus value={name} onChange={e => setName(e.target.value)} autoComplete="name"
            className="w-full px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
        </Field>
        <Field label="Email">
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email"
            className="w-full px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
        </Field>
        <Field label="Password">
          <input type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password"
            className="w-full px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">At least 8 characters.</p>
        </Field>
        <Btn type="submit" variant="primary" size="md" disabled={submitting} className="w-full">
          {submitting ? 'Creating account' : 'Create account'}
        </Btn>
      </form>
      <p className="text-xs text-center text-neutral-500 dark:text-neutral-400">
        Already have an account? <Link href="/login" className="text-brand-600 hover:underline">Sign in</Link>
      </p>
    </AuthShell>
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
