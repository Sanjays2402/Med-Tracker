'use client';


import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Btn, ErrorBox } from '../../../components/uikit';
import { api, ApiError } from '../../../lib/api-client';
import { AuthShell } from '../login/page';

export default function VerifyPage() {
  return (
    <React.Suspense fallback={<AuthShell title="Verify your email"><div className="h-32" /></AuthShell>}>
      <VerifyForm />
    </React.Suspense>
  );
}

function VerifyForm() {
  const search = useSearchParams();
  const router = useRouter();
  const email = search?.get('email') ?? '';
  const linkToken = search?.get('token');
  const [code, setCode] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [resending, setResending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [resent, setResent] = React.useState(false);

  // If a token came from email link, auto-verify
  React.useEffect(() => {
    if (!linkToken) return;
    (async () => {
      setSubmitting(true);
      try {
        await api.post('/auth/verify', { token: linkToken });
        router.push('/dashboard');
      } catch (e) {
        if (e instanceof ApiError && e.status === 410) setError('This link expired. Request a new one below.');
        else setError(e instanceof Error ? e.message : 'Could not verify.');
        setSubmitting(false);
      }
    })();
  }, [linkToken, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/auth/verify', { email, code });
      router.push('/dashboard');
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) setError('That code is not correct.');
      else setError(e instanceof Error ? e.message : 'Could not verify.');
      setSubmitting(false);
    }
  }

  async function resend() {
    setResending(true);
    setError(null);
    try {
      await api.post('/auth/verify/resend', { email });
      setResent(true);
      setTimeout(() => setResent(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not resend.');
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthShell title="Verify your email" subtitle={email ? `We sent a 6 digit code to ${email}.` : 'Enter the code from your email.'}>
      {error && <ErrorBox message={error} />}
      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block">
          <span className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">Verification code</span>
          <input required autoFocus inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
            className="w-full px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-center text-lg font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500" />
        </label>
        <Btn type="submit" variant="primary" size="md" disabled={submitting || code.length !== 6} className="w-full">
          {submitting ? 'Verifying' : 'Verify'}
        </Btn>
      </form>
      <div className="text-center text-xs">
        <button type="button" onClick={resend} disabled={resending} className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
          {resending ? 'Sending' : resent ? 'Sent. Check your inbox.' : 'Resend code'}
        </button>
      </div>
      <Link href="/login" className="block text-center text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
        Back to sign in
      </Link>
    </AuthShell>
  );
}
