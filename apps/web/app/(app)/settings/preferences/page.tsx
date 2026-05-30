'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Gear, Sun, Moon, Gear as MonitorPlay } from '@med/icons';
import { Surface, Section } from '../../../../components/uikit';
import { api, ApiError } from '../../../../lib/api-client';

interface Prefs { theme: 'system' | 'light' | 'dark'; language: string; doseUnits: 'metric' | 'imperial'; weekStart: 'sun' | 'mon'; }

const STORAGE_KEY = 'med:preferences';
const DEFAULTS: Prefs = { theme: 'system', language: 'en', doseUnits: 'metric', weekStart: 'sun' };
const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pt', label: 'Português' },
  { code: 'hi', label: 'हिन्दी' },
];

function readLocal(): Prefs {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch { return DEFAULTS; }
}

export default function PreferencesPage() {
  const [prefs, setPrefs] = React.useState<Prefs>(DEFAULTS);
  const [status, setStatus] = React.useState<'idle' | 'saved'>('idle');

  React.useEffect(() => {
    setPrefs(readLocal());
    (async () => {
      try {
        const res = await api.get<unknown>('/preferences');
        if (res && typeof res === 'object' && (res as any).preferences) {
          setPrefs(p => ({ ...p, ...(res as any).preferences }));
        }
      } catch (e) {
        if (!(e instanceof ApiError)) console.warn(e);
      }
    })();
  }, []);

  async function update<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
    try { await api.patch('/preferences', next); } catch {}
    setStatus('saved');
    setTimeout(() => setStatus('idle'), 1500);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Link href="/settings" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
        <ArrowLeft size={14} />
        Settings
      </Link>

      <header className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
            <Gear size={24} weight="duotone" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Preferences</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Look and feel, language, units.</p>
          </div>
        </div>
        {status === 'saved' && <span className="text-xs text-emerald-600 dark:text-emerald-400">Saved</span>}
      </header>

      <Section title="Theme">
        <Surface>
          <div className="p-4 grid grid-cols-3 gap-2">
            <ThemeButton current={prefs.theme} value="system" label="System" icon={<MonitorPlay size={16} weight="duotone" />} onClick={(v) => update('theme', v)} />
            <ThemeButton current={prefs.theme} value="light" label="Light" icon={<Sun size={16} weight="duotone" />} onClick={(v) => update('theme', v)} />
            <ThemeButton current={prefs.theme} value="dark" label="Dark" icon={<Moon size={16} weight="duotone" />} onClick={(v) => update('theme', v)} />
          </div>
        </Surface>
      </Section>

      <Section title="Language">
        <Surface>
          <div className="p-4">
            <select value={prefs.language} onChange={e => update('language', e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-sm">
              {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>
        </Surface>
      </Section>

      <Section title="Units">
        <Surface>
          <div className="p-4 grid grid-cols-2 gap-2">
            <RadioButton checked={prefs.doseUnits === 'metric'} label="Metric (mg, mL)" onClick={() => update('doseUnits', 'metric')} />
            <RadioButton checked={prefs.doseUnits === 'imperial'} label="Imperial (gr, fl oz)" onClick={() => update('doseUnits', 'imperial')} />
          </div>
        </Surface>
      </Section>

      <Section title="Week starts on">
        <Surface>
          <div className="p-4 grid grid-cols-2 gap-2">
            <RadioButton checked={prefs.weekStart === 'sun'} label="Sunday" onClick={() => update('weekStart', 'sun')} />
            <RadioButton checked={prefs.weekStart === 'mon'} label="Monday" onClick={() => update('weekStart', 'mon')} />
          </div>
        </Surface>
      </Section>
    </div>
  );
}

function ThemeButton({ current, value, label, icon, onClick }: {
  current: string; value: 'system' | 'light' | 'dark'; label: string; icon: React.ReactNode;
  onClick: (v: 'system' | 'light' | 'dark') => void;
}) {
  const active = current === value;
  return (
    <button type="button" onClick={() => onClick(value)}
      className={`flex flex-col items-center gap-1 p-3 rounded-md border transition-colors ${
        active ? 'border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-300'
        : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900'
      }`}>
      {icon}
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}

function RadioButton({ checked, label, onClick }: { checked: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`px-3 h-10 rounded-md border text-sm transition-colors ${
        checked ? 'border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-300'
        : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900'
      }`}>
      {label}
    </button>
  );
}
