import type { ReactNode } from 'react';
import Link from 'next/link';
import { Pill } from '@med/icons';

const NAV = [
  { href: '/about', label: 'About' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/faq', label: 'FAQ' },
  { href: '/changelog', label: 'Changelog' },
];

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="sticky top-0 z-30 border-b border-neutral-200/70 dark:border-neutral-900 bg-white/80 dark:bg-neutral-950/80 backdrop-blur">
        <div className="max-w-6xl mx-auto h-14 px-5 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-brand-500/10 text-brand-600 dark:text-brand-400">
              <Pill size={18} />
            </span>
            Med Tracker
          </Link>
          <nav className="hidden md:flex items-center gap-1 text-sm text-neutral-600 dark:text-neutral-400">
            {NAV.map(n => (
              <Link
                key={n.href}
                href={n.href}
                className="px-3 py-1.5 rounded-md hover:text-neutral-900 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors"
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden sm:inline-flex text-sm px-3 py-1.5 rounded-md text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              Sign in
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex text-sm font-medium px-3 py-1.5 rounded-md bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 transition-colors"
            >
              Open app
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-neutral-200/70 dark:border-neutral-900 mt-16">
        <div className="max-w-6xl mx-auto px-5 py-10 text-sm text-neutral-500 dark:text-neutral-500 flex flex-col md:flex-row gap-4 md:items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-brand-500/10 text-brand-600 dark:text-brand-400">
              <Pill size={12} />
            </span>
            <span>Med Tracker. Open source medication adherence.</span>
          </div>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-neutral-900 dark:hover:text-neutral-200">Privacy</Link>
            <Link href="/terms" className="hover:text-neutral-900 dark:hover:text-neutral-200">Terms</Link>
            <Link href="/security" className="hover:text-neutral-900 dark:hover:text-neutral-200">Security</Link>
            <Link href="/contact" className="hover:text-neutral-900 dark:hover:text-neutral-200">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
