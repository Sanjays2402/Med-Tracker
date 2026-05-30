'use client';


import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Btn, ErrorBox } from '../../../components/uikit';
import { api, ApiError } from '../../../lib/api-client';
import { AuthShell } from '../login/page';

export default function ResetPage() {
  return (
    <React.Suspense fallback={<AuthShell title="Set a new password"><div className="h-32" /></AuthShell>}>
      <ResetForm />
    </React.Suspense>
  );
}

function ResetForm() {
  const router = useRouter();
  const search = useSearchParams();
  const token = search?.get('token') ?? '';
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (!token) { setError('Missing reset token. Use the link from your email.'); return; }
    setSubmitting(true);
    try {
      await api.post('/auth/reset', { token, password });
      router.push('/login?reset=ok');
    } catch (e) {
      if (e instanceof ApiError && e.status === 410) setError('This reset link has expired. Request a new one.');
      else setError(e instanceof Error ? e.message : 'Could not reset password.');
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title="Set a new password">
      {error && <ErrorBox message={error} />}
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="New password">
          <input type="password" required minLength={8} autoFocus value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password"
            className="w-full px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-sm" />
        </Field>
        <Field label="Confirm password">
          <input type="password" required minLength={8} value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password"
            className="w-full px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-sm" />
        </Field>
        <Btn type="submit" variant="primary" size="md" disabled={submitting} className="w-full">
          {submitting ? 'Updating' : 'Update password'}
        </Btn>
      </form>
      <Link href="/login" className="block text-center text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
        Back to sign in
      </Link>
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
