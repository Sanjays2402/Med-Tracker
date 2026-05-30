'use client';

import * as React from 'react';
import Link from 'next/link';
import { Btn, ErrorBox } from '../../../components/uikit';
import { api, ApiError } from '../../../lib/api-client';
import { AuthShell } from '../login/page';

export default function ForgotPage() {
  const [email, setEmail] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/auth/forgot', { email });
      setSent(true);
    } catch (e) {
      if (e instanceof ApiError && e.status >= 500) {
        setError('Could not send the email. Try again later.');
      } else {
        setSent(true);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <AuthShell title="Check your email" subtitle="If an account exists for that email, a reset link is on the way.">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          The link will work for 1 hour. If you do not see it, check spam.
        </p>
        <Link href="/login" className="block text-center text-sm text-brand-600 hover:underline">
          Back to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset your password" subtitle="Enter the email on your account and we will send a reset link.">
      {error && <ErrorBox message={error} />}
      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block">
          <span className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">Email</span>
          <input type="email" required autoFocus value={email} onChange={e => setEmail(e.target.value)} autoComplete="email"
            className="w-full px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
        </label>
        <Btn type="submit" variant="primary" size="md" disabled={submitting} className="w-full">
          {submitting ? 'Sending' : 'Send reset link'}
        </Btn>
      </form>
      <p className="text-xs text-center text-neutral-500 dark:text-neutral-400">
        Remembered it? <Link href="/login" className="text-brand-600 hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  );
}
