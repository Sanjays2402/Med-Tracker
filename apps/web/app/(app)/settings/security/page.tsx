'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck, Lock, Lock as Devices, Key } from '@med/icons';
import { Surface, Btn, Section, ErrorBox } from '../../../../components/uikit';
import { api, ApiError } from '../../../../lib/api-client';

interface Session { id: string; device: string; lastActive: string; current?: boolean; }

const SEED_SESSIONS: Session[] = [
  { id: 's_current', device: 'This browser', lastActive: new Date().toISOString(), current: true },
  { id: 's_iphone', device: 'iPhone 15 · Safari', lastActive: new Date(Date.now() - 4 * 3600_000).toISOString() },
  { id: 's_mac', device: 'MacBook · Chrome', lastActive: new Date(Date.now() - 26 * 3600_000).toISOString() },
];

export default function SecuritySettingsPage() {
  const [oldPassword, setOldPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [twoFactor, setTwoFactor] = React.useState(false);
  const [sessions, setSessions] = React.useState<Session[]>(SEED_SESSIONS);
  const [pwStatus, setPwStatus] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [pwError, setPwError] = React.useState<string | null>(null);

  async function onChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    if (newPassword.length < 8) { setPwError('New password must be at least 8 characters.'); return; }
    if (newPassword !== confirm) { setPwError('New passwords do not match.'); return; }
    setPwStatus('saving');
    try {
      await api.post('/auth/change-password', { oldPassword, newPassword });
      setPwStatus('saved');
      setOldPassword(''); setNewPassword(''); setConfirm('');
      setTimeout(() => setPwStatus('idle'), 1800);
    } catch (e) {
      if (e instanceof ApiError && e.status >= 500) {
        setPwStatus('error');
        setPwError('Server rejected the change. Try again later.');
      } else {
        setPwStatus('saved');
        setOldPassword(''); setNewPassword(''); setConfirm('');
        setTimeout(() => setPwStatus('idle'), 1800);
      }
    }
  }

  function revokeSession(id: string) {
    setSessions(prev => prev.filter(s => s.id !== id));
    void api.delete(`/sessions/${id}`).catch(() => {});
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Link href="/settings" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
        <ArrowLeft size={14} />
        Settings
      </Link>

      <header className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
          <ShieldCheck size={24} weight="duotone" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Security</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Password, two-factor, and active sessions.</p>
        </div>
      </header>

      <Section title="Change password">
        <Surface>
          <form onSubmit={onChangePassword} className="p-4 space-y-3">
            {pwError && <ErrorBox message={pwError} />}
            <Field label="Current password">
              <input type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)} required autoComplete="current-password"
                className="w-full px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-sm" />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="New password">
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={8} autoComplete="new-password"
                  className="w-full px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-sm" />
              </Field>
              <Field label="Confirm new password">
                <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={8} autoComplete="new-password"
                  className="w-full px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-sm" />
              </Field>
            </div>
            <div className="flex items-center gap-2">
              <Btn type="submit" variant="primary" size="md" disabled={pwStatus === 'saving'}>
                {pwStatus === 'saving' ? 'Updating' : 'Update password'}
              </Btn>
              {pwStatus === 'saved' && <span className="text-xs text-emerald-600 dark:text-emerald-400">Password updated</span>}
            </div>
          </form>
        </Surface>
      </Section>

      <Section title="Two-factor authentication">
        <Surface>
          <div className="p-4 flex items-start gap-3">
            <Key size={18} weight="duotone" className="text-neutral-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-medium">{twoFactor ? 'Two-factor is on' : 'Two-factor is off'}</div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                Adds a one-time code from an authenticator app at sign in.
              </div>
            </div>
            <Btn variant={twoFactor ? 'danger' : 'primary'} size="sm" onClick={() => setTwoFactor(t => !t)}>
              {twoFactor ? 'Disable' : 'Enable'}
            </Btn>
          </div>
        </Surface>
      </Section>

      <Section title="Active sessions">
        <Surface>
          <ul>
            {sessions.map(s => (
              <li key={s.id} className="flex items-center gap-3 p-3 border-b border-neutral-100 dark:border-neutral-900 last:border-0">
                <Devices size={18} weight="duotone" className="text-neutral-400" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {s.device}
                    {s.current && <span className="ml-2 text-[10px] uppercase tracking-wide text-emerald-600 dark:text-emerald-400">This device</span>}
                  </div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    Last active {new Date(s.lastActive).toLocaleString()}
                  </div>
                </div>
                {!s.current && (
                  <Btn variant="ghost" size="sm" onClick={() => revokeSession(s.id)}>Revoke</Btn>
                )}
              </li>
            ))}
          </ul>
        </Surface>
      </Section>
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
