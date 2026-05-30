'use client';


import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Pill as PillIcon } from '@med/icons';
import { Surface, Btn, ErrorBox } from '../../../components/uikit';
import { api, ApiError } from '../../../lib/api-client';
import { safeLocalStorage } from '@med/utils';
import { STORAGE_KEYS } from '@med/config';

export default function LoginPage() {
  return (
    <React.Suspense fallback={<AuthShell title="Welcome back"><div className="h-32" /></AuthShell>}>
      <LoginForm />
    </React.Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search?.get('next') ?? '/dashboard';
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post<{ token?: string }>('/auth/login', { email, password });
      if (res && res.token) {
        safeLocalStorage.set(STORAGE_KEYS.authToken, res.token);
      } else {
        // The reference API still returns an echo. Persist a placeholder so
        // the rest of the app feels signed in for demo purposes.
        safeLocalStorage.set(STORAGE_KEYS.authToken, `demo_${Date.now().toString(36)}`);
      }
      router.push(next);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.status === 401 ? 'Invalid email or password.' : `Sign in failed (${e.status}).`);
      } else {
        setError(e instanceof Error ? e.message : 'Sign in failed.');
      }
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to manage your medications.">
      {error && <ErrorBox message={error} />}
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Email">
          <input type="email" required autoFocus autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
        </Field>
        <Field label="Password">
          <input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
        </Field>
        <Btn type="submit" variant="primary" size="md" disabled={submitting} className="w-full">
          {submitting ? 'Signing in' : 'Sign in'}
        </Btn>
      </form>
      <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400 pt-2">
        <Link href="/forgot" className="hover:text-neutral-900 dark:hover:text-neutral-100">Forgot password</Link>
        <Link href="/signup" className="hover:text-neutral-900 dark:hover:text-neutral-100">Create account</Link>
      </div>
    </AuthShell>
  );
}

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-neutral-50 dark:bg-neutral-950">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-12 h-12 rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
            <PillIcon size={24} weight="duotone" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="text-sm text-neutral-500 dark:text-neutral-400">{subtitle}</p>}
        </div>
        <Surface>
          <div className="p-6 space-y-4">{children}</div>
        </Surface>
        <p className="text-center text-xs text-neutral-400">
          <Link href="/" className="hover:text-neutral-600 dark:hover:text-neutral-300">← Back to home</Link>
        </p>
      </div>
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
