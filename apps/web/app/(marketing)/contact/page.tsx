'use client';

import * as React from 'react';

export default function ContactPage() {
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [status, setStatus] = React.useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorText, setErrorText] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrorText(null);
    if (!name.trim() || !email.trim() || !message.trim()) {
      setErrorText('Please fill in name, email, and message.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrorText('That email does not look right.');
      return;
    }
    setStatus('sending');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, email, message }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setStatus('sent');
      setName(''); setEmail(''); setMessage('');
    } catch (err) {
      setStatus('error');
      setErrorText(err instanceof Error ? err.message : 'Could not send.');
    }
  }

  const input =
    'w-full rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-3 py-2 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500';

  return (
    <div className="max-w-xl mx-auto px-5 py-16">
      <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Contact</h1>
      <p className="mt-3 text-neutral-600 dark:text-neutral-400">
        Questions about the project, hosted plans, or partnerships. We read everything.
      </p>

      <form onSubmit={submit} className="mt-10 space-y-4">
        <label className="block">
          <span className="text-sm font-medium">Name</span>
          <input value={name} onChange={e => setName(e.target.value)} className={`mt-1 ${input}`} placeholder="Your name" />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Email</span>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className={`mt-1 ${input}`}
            placeholder="you@example.com"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Message</span>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={5}
            className={`mt-1 ${input}`}
            placeholder="What is on your mind?"
          />
        </label>

        {errorText && (
          <div className="text-sm rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 px-3 py-2">
            {errorText}
          </div>
        )}
        {status === 'sent' && (
          <div className="text-sm rounded-md border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 px-3 py-2">
            Got it. We will get back to you within a few business days.
          </div>
        )}

        <button
          type="submit"
          disabled={status === 'sending'}
          className="inline-flex items-center text-sm font-medium px-4 py-2 rounded-md bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 disabled:opacity-60 transition-colors"
        >
          {status === 'sending' ? 'Sending' : 'Send message'}
        </button>
      </form>
    </div>
  );
}
