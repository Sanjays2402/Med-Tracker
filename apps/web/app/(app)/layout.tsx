'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Pill as PillIcon,
  Dashboard,
  Calendar,
  Bell,
  ChartBar,
  Sun,
  Moon,
  MagnifyingGlass,
} from '@med/icons';
import { useTheme } from '../../lib/use-theme';
import { PillMark } from '../../components/uikit';
import { CommandPalette } from '../../components/CommandPalette';
import { ToastProvider } from '../../components/Toast';
import { KeyboardHelp } from '../../components/KeyboardHelp';

const NAV = [
  { href: '/dashboard', label: 'Today at a glance', short: 'Glance', icon: Dashboard },
  { href: '/today', label: 'Dose schedule', short: 'Doses', icon: Bell },
  { href: '/medications', label: 'Medications', short: 'Meds', icon: PillIcon },
  { href: '/schedule', label: 'Calendar', short: 'Calendar', icon: Calendar },
  { href: '/refills', label: 'Refills', short: 'Refills', icon: ChartBar },
  { href: '/pills', label: 'Identify a pill', short: 'Identify', icon: MagnifyingGlass },
] as const;

export default function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const [theme, setTheme] = useTheme();
  const [navOpen, setNavOpen] = React.useState(false);
  const effectiveDark =
    theme === 'dark' ||
    (theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches);

  return (
    <ToastProvider>
    <div className="min-h-screen flex relative">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform transition-transform md:static md:translate-x-0 ${
          navOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{
          background: 'var(--bg)',
          borderRight: '1px solid var(--line)',
        }}
      >
        <div className="h-16 flex items-center gap-3 px-5">
          <PillMark size="lg" />
          <div className="flex flex-col leading-none">
            <span className="display text-[18px] tracking-tight">Med Tracker</span>
            <span className="eyebrow mt-1">your daily pillbox</span>
          </div>
        </div>

        <nav className="px-3 mt-2 space-y-0.5">
          {NAV.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setNavOpen(false)}
                className={`group relative flex items-center gap-3 pl-4 pr-3 h-10 rounded-full text-[13.5px] transition-colors ${
                  active
                    ? 'bg-[var(--bg-elev)] text-[var(--ink)] font-medium border border-[var(--line)]'
                    : 'text-[var(--ink-soft)] hover:text-[var(--ink)] hover:bg-[var(--bg-sunk)] border border-transparent'
                }`}
              >
                <span
                  className={`flex items-center justify-center w-5 h-5 rounded-full ${
                    active ? 'text-[var(--accent)]' : 'text-[var(--ink-muted)]'
                  }`}
                >
                  <Icon size={16} />
                </span>
                {item.label}
                {active && (
                  <span
                    aria-hidden
                    className="absolute right-3 w-1.5 h-1.5 rounded-full"
                    style={{ background: 'var(--accent)' }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 inset-x-0 p-5">
          <div className="divider-script mb-4" />
          <div className="flex items-center gap-2 text-[11px] text-[var(--ink-muted)]">
            <span className="pill-mark" />
            <span>Filled fresh from your records.</span>
          </div>
        </div>
      </aside>

      {navOpen && (
        <button
          aria-label="Close menu"
          onClick={() => setNavOpen(false)}
          className="md:hidden fixed inset-0 z-30 bg-[var(--ink)]/40 backdrop-blur-sm"
        />
      )}

      <div className="flex-1 min-w-0 flex flex-col relative">
        <header
          className="sticky top-0 z-20 h-16 flex items-center gap-3 px-5"
          style={{
            background: 'color-mix(in srgb, var(--bg) 88%, transparent)',
            borderBottom: '1px solid var(--line-soft)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <button
            className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-full text-[var(--ink-soft)]"
            style={{ border: '1px solid var(--line)' }}
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
          >
            <span className="block w-3.5 h-0.5 bg-current relative before:content-[''] before:absolute before:-top-1.5 before:left-0 before:w-3.5 before:h-0.5 before:bg-current after:content-[''] after:absolute after:top-1.5 after:left-0 after:w-3.5 after:h-0.5 after:bg-current" />
          </button>

          <div className="flex-1 min-w-0">
            <div className="eyebrow">Med Tracker</div>
            <div className="display text-[18px] leading-none tracking-tight truncate">
              {pageTitle(pathname)}
            </div>
          </div>

          <CommandKHint />

          <button
            type="button"
            onClick={() => {
              if (typeof window === 'undefined') return;
              const ev = new KeyboardEvent('keydown', { key: '?', bubbles: true });
              window.dispatchEvent(ev);
            }}
            className="hidden sm:inline-flex items-center justify-center w-9 h-9 rounded-full text-[var(--ink-soft)] hover:text-[var(--ink)] hover:bg-[var(--bg-sunk)]"
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
          >
            <span className="tabular text-[13px] font-medium">?</span>
          </button>

          <Link
            href="/notifications"
            className="hidden sm:inline-flex items-center justify-center w-9 h-9 rounded-full text-[var(--ink-soft)] hover:text-[var(--ink)] hover:bg-[var(--bg-sunk)]"
            aria-label="Notifications"
          >
            <Bell size={16} />
          </Link>

          <button
            onClick={() => setTheme(effectiveDark ? 'light' : 'dark')}
            className="inline-flex items-center justify-center w-9 h-9 rounded-full text-[var(--ink-soft)] hover:text-[var(--ink)] hover:bg-[var(--bg-sunk)]"
            aria-label="Toggle theme"
          >
            {effectiveDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </header>

        <main className="flex-1 min-w-0 px-5 sm:px-8 py-8 max-w-6xl w-full mx-auto relative">
          {children}
        </main>
      </div>
      <CommandPalette />
      <KeyboardHelp />
    </div>
    </ToastProvider>
  );
}

/**
 * Subtle pill-shaped ⌘K hint that doubles as a click-to-open trigger.
 * Renders only on viewports wide enough to show the keyboard shortcut.
 */
function CommandKHint() {
  const [mac, setMac] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    if (typeof navigator !== 'undefined') {
      // userAgentData where available, else userAgent. Either way: deterministic local hint.
      const ua = navigator.userAgent || '';
      setMac(/Mac|iPhone|iPad/.test(ua));
    }
  }, []);
  function openPalette() {
    // CommandPalette listens for ⌘K. Dispatch the same key event to open it without prop drilling.
    if (typeof window === 'undefined') return;
    const ev = new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true, bubbles: true });
    window.dispatchEvent(ev);
  }
  return (
    <button
      type="button"
      onClick={openPalette}
      className="hidden md:inline-flex items-center gap-2 h-9 pl-3 pr-2 rounded-full text-[12.5px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--bg-sunk)] transition-colors"
      style={{ border: '1px solid var(--line)' }}
      aria-label="Open command palette"
      title="Open command palette"
    >
      <span>Search or jump…</span>
      <kbd
        className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-md tabular text-[10.5px]"
        style={{
          background: 'var(--bg-sunk)',
          border: '1px solid var(--line)',
          color: 'var(--ink-soft)',
        }}
      >
        {mac === null ? '⌘K' : mac ? '⌘K' : 'Ctrl K'}
      </kbd>
    </button>
  );
}

function pageTitle(path: string): string {
  if (path.startsWith('/dashboard')) return 'Today at a glance';
  if (path.startsWith('/today')) return 'Today';
  if (path.startsWith('/medications/new')) return 'Add a medication';
  if (path.startsWith('/medications')) return 'Medications';
  if (path.startsWith('/schedule')) return 'Schedule';
  if (path.startsWith('/refills')) return 'Refills';
  if (path.startsWith('/pills')) return 'Identify a pill';
  if (path.startsWith('/history')) return 'History';
  if (path.startsWith('/reports')) return 'Reports';
  if (path.startsWith('/notifications')) return 'Notifications';
  if (path.startsWith('/caregivers')) return 'Caregivers';
  if (path.startsWith('/settings')) return 'Settings';
  if (path.startsWith('/upcoming')) return 'Upcoming';
  return 'Dashboard';
}
