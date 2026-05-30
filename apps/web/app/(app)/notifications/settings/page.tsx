'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Bell, BellSlash, ClockCheck, Pill as PillIcon, Users } from '@med/icons';
import { Surface, Section } from '../../../../components/uikit';
import { api, ApiError } from '../../../../lib/api-client';

interface Prefs {
  doseReminders: boolean;
  refillAlerts: boolean;
  caregiverEvents: boolean;
  quietHours: boolean;
  quietStart: string;
  quietEnd: string;
}

const DEFAULTS: Prefs = {
  doseReminders: true,
  refillAlerts: true,
  caregiverEvents: false,
  quietHours: true,
  quietStart: '22:00',
  quietEnd: '07:00',
};

const STORAGE_KEY = 'med:notif-prefs';

function readLocal(): Prefs {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch { return DEFAULTS; }
}

function writeLocal(p: Prefs) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch {}
}

export default function NotificationSettingsPage() {
  const [prefs, setPrefs] = React.useState<Prefs>(DEFAULTS);
  const [status, setStatus] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  React.useEffect(() => {
    setPrefs(readLocal());
    (async () => {
      try {
        const res = await api.get<unknown>('/preferences');
        if (res && typeof res === 'object' && (res as any).notifications) {
          const n = (res as any).notifications as Partial<Prefs>;
          setPrefs(p => ({ ...p, ...n }));
        }
      } catch (e) {
        if (e instanceof ApiError && e.status >= 500) setStatus('error');
      }
    })();
  }, []);

  async function update<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    writeLocal(next);
    setStatus('saving');
    try {
      await api.patch('/preferences', { notifications: next });
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 1500);
    } catch (e) {
      if (e instanceof ApiError && e.status >= 500) setStatus('error');
      else setStatus('saved');
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Link href="/notifications" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
        <ArrowLeft size={14} />
        Notifications
      </Link>

      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notification settings</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Control which alerts you receive and when.
          </p>
        </div>
        {status === 'saving' && <span className="text-xs text-neutral-500">Saving...</span>}
        {status === 'saved' && <span className="text-xs text-emerald-600 dark:text-emerald-400">Saved</span>}
        {status === 'error' && <span className="text-xs text-red-600 dark:text-red-400">Could not save</span>}
      </header>

      <Section title="Alerts">
        <Surface>
          <ToggleRow icon={<PillIcon size={18} weight="duotone" />} title="Dose reminders" desc="Get reminded when it is time for a dose."
            checked={prefs.doseReminders} onChange={(v) => update('doseReminders', v)} />
          <ToggleRow icon={<Bell size={18} weight="duotone" />} title="Refill alerts" desc="Warn me when supply is running low."
            checked={prefs.refillAlerts} onChange={(v) => update('refillAlerts', v)} />
          <ToggleRow icon={<Users size={18} weight="duotone" />} title="Caregiver events" desc="Notify me when a caregiver views my share."
            checked={prefs.caregiverEvents} onChange={(v) => update('caregiverEvents', v)} />
        </Surface>
      </Section>

      <Section title="Quiet hours">
        <Surface>
          <ToggleRow icon={<BellSlash size={18} weight="duotone" />} title="Pause notifications overnight"
            desc="Reminders within quiet hours are batched until morning."
            checked={prefs.quietHours} onChange={(v) => update('quietHours', v)} />
          {prefs.quietHours && (
            <div className="flex items-center gap-3 p-3 border-t border-neutral-100 dark:border-neutral-900">
              <ClockCheck size={18} weight="duotone" className="text-neutral-400" />
              <div className="flex-1 grid grid-cols-2 gap-3">
                <label className="text-xs">
                  Start
                  <input type="time" value={prefs.quietStart} onChange={e => update('quietStart', e.target.value)}
                    className="mt-1 w-full px-2 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-sm" />
                </label>
                <label className="text-xs">
                  End
                  <input type="time" value={prefs.quietEnd} onChange={e => update('quietEnd', e.target.value)}
                    className="mt-1 w-full px-2 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-sm" />
                </label>
              </div>
            </div>
          )}
        </Surface>
      </Section>
    </div>
  );
}

function ToggleRow({ icon, title, desc, checked, onChange }: {
  icon: React.ReactNode; title: string; desc: string;
  checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 p-3 border-b border-neutral-100 dark:border-neutral-900 last:border-0 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-900/40">
      <div className="w-9 h-9 rounded-md bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-neutral-500 dark:text-neutral-400">{desc}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 rounded-full transition-colors shrink-0 mt-0.5 ${
          checked ? 'bg-brand-500' : 'bg-neutral-200 dark:bg-neutral-800'
        }`}
      >
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
    </label>
  );
}
