'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Pill, Dashboard, Calendar, Bell, ChartBar, Sun, Moon, MagnifyingGlass } from '@med/icons';
import { useTheme } from '../../lib/use-theme';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: Dashboard },
  { href: '/today', label: 'Today', icon: Bell },
  { href: '/medications', label: 'Medications', icon: Pill },
  { href: '/schedule', label: 'Schedule', icon: Calendar },
  { href: '/refills', label: 'Refills', icon: ChartBar },
  { href: '/pills', label: 'Identify pill', icon: MagnifyingGlass },
] as const;

export default function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const [theme, setTheme] = useTheme();
  const [navOpen, setNavOpen] = React.useState(false);
  const effectiveDark =
    theme === 'dark' ||
    (theme === 'system' && typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);

  return (
    <div className="min-h-screen flex bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-60 border-r border-neutral-200/70 dark:border-neutral-800/80 bg-white/90 dark:bg-neutral-950/90 backdrop-blur transform transition-transform md:static md:translate-x-0 ${
          navOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-14 flex items-center gap-2 px-4 border-b border-neutral-200/70 dark:border-neutral-800/80">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-brand-500/10 text-brand-600 dark:text-brand-400">
            <Pill size={18} />
          </span>
          <span className="font-semibold tracking-tight">Med Tracker</span>
        </div>
        <nav className="p-2 space-y-0.5">
          {NAV.map(item => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setNavOpen(false)}
                className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                  active
                    ? 'bg-neutral-100 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-50 font-medium'
                    : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100/70 dark:hover:bg-neutral-900/60 hover:text-neutral-900 dark:hover:text-neutral-100'
                }`}
              >
                <Icon size={16} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="absolute bottom-0 inset-x-0 p-3 text-xs text-neutral-500 dark:text-neutral-500 border-t border-neutral-200/60 dark:border-neutral-800/70">
          Local data shown when the API has no records yet.
        </div>
      </aside>

      {navOpen && (
        <button
          aria-label="Close menu"
          onClick={() => setNavOpen(false)}
          className="md:hidden fixed inset-0 z-30 bg-black/30 backdrop-blur-sm"
        />
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 h-14 flex items-center gap-3 px-4 border-b border-neutral-200/70 dark:border-neutral-800/80 bg-white/80 dark:bg-neutral-950/80 backdrop-blur">
          <button
            className="md:hidden inline-flex items-center justify-center w-8 h-8 rounded-md border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400"
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
          >
            <span className="block w-3.5 h-0.5 bg-current relative before:content-[''] before:absolute before:-top-1.5 before:left-0 before:w-3.5 before:h-0.5 before:bg-current after:content-[''] after:absolute after:top-1.5 after:left-0 after:w-3.5 after:h-0.5 after:bg-current" />
          </button>
          <div className="flex-1 text-sm text-neutral-500 dark:text-neutral-400 truncate">
            {pageTitle(pathname)}
          </div>
          <button
            onClick={() => setTheme(effectiveDark ? 'light' : 'dark')}
            className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-900"
            aria-label="Toggle theme"
          >
            {effectiveDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </header>
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 max-w-6xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}

function pageTitle(path: string): string {
  if (path.startsWith('/dashboard')) return 'Dashboard';
  if (path.startsWith('/today')) return 'Today';
  if (path.startsWith('/medications')) return 'Medications';
  if (path.startsWith('/schedule')) return 'Schedule';
  if (path.startsWith('/refills')) return 'Refills';
  return '';
}
