'use client';

import * as React from 'react';
import Link from 'next/link';
import { User, Gear, Bell, ShieldCheck, Cloud, FileArrowDown, Info } from '@med/icons';
import { Surface, Section } from '../../../components/uikit';

const ITEMS = [
  { href: '/settings/profile', icon: <User size={18} weight="duotone" />, title: 'Profile', desc: 'Name, email, time zone.' },
  { href: '/settings/preferences', icon: <Gear size={18} weight="duotone" />, title: 'Preferences', desc: 'Theme, language, units.' },
  { href: '/settings/notifications', icon: <Bell size={18} weight="duotone" />, title: 'Notifications', desc: 'Alert channels and quiet hours.' },
  { href: '/settings/security', icon: <ShieldCheck size={18} weight="duotone" />, title: 'Security', desc: 'Password, sessions, two-factor.' },
  { href: '/settings/integrations', icon: <Cloud size={18} weight="duotone" />, title: 'Integrations', desc: 'Apple Health, Google Fit, pharmacies.' },
  { href: '/settings/data', icon: <FileArrowDown size={18} weight="duotone" />, title: 'Data', desc: 'Export, import, delete your data.' },
  { href: '/settings/about', icon: <Info size={18} weight="duotone" />, title: 'About', desc: 'App version, licenses, credits.' },
];

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Manage your account and how Med-Tracker behaves.
        </p>
      </header>

      <Section title="Account">
        <Surface>
          <ul>
            {ITEMS.map(item => (
              <li key={item.href} className="border-b border-neutral-100 dark:border-neutral-900 last:border-0">
                <Link href={item.href} className="flex items-center gap-3 p-3 hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors">
                  <div className="w-9 h-9 rounded-md bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 flex items-center justify-center shrink-0">
                    {item.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{item.title}</div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">{item.desc}</div>
                  </div>
                  <span className="text-xs text-neutral-400">›</span>
                </Link>
              </li>
            ))}
          </ul>
        </Surface>
      </Section>
    </div>
  );
}
