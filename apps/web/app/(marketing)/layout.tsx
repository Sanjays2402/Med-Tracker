import type { ReactNode } from 'react';
import Link from 'next/link';
import { PillMark } from '../../components/uikit';

const NAV = [
  { href: '/about', label: 'About' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/faq', label: 'FAQ' },
  { href: '/changelog', label: 'Changelog' },
];

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header
        className="sticky top-0 z-30"
        style={{
          background: 'color-mix(in srgb, var(--bg) 88%, transparent)',
          borderBottom: '1px solid var(--line-soft)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div className="max-w-6xl mx-auto h-16 px-5 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <PillMark size="lg" />
            <div className="flex flex-col leading-none">
              <span className="display text-[17px] tracking-tight">Med Tracker</span>
              <span className="eyebrow mt-1">your daily pillbox</span>
            </div>
          </Link>
          <nav className="hidden md:flex items-center gap-1 text-[13px] text-[var(--ink-soft)]">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="px-3.5 py-2 rounded-full hover:text-[var(--ink)] hover:bg-[var(--bg-sunk)] transition-colors"
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden sm:inline-flex text-[13px] px-3.5 py-2 rounded-full text-[var(--ink-soft)] hover:text-[var(--ink)] hover:bg-[var(--bg-sunk)]"
            >
              Sign in
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex text-[13px] font-medium px-4 py-2 rounded-full bg-[var(--ink)] text-[var(--bg)] hover:bg-[var(--ink-soft)] transition-colors"
            >
              Open the pillbox
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 relative">{children}</main>

      <footer
        className="mt-16"
        style={{ borderTop: '1px solid var(--line-soft)' }}
      >
        <div className="max-w-6xl mx-auto px-5 py-10 text-[12.5px] text-[var(--ink-muted)] flex flex-col md:flex-row gap-4 md:items-center justify-between">
          <div className="flex items-center gap-2">
            <PillMark />
            <span>Med Tracker. Open source. Built like a real pharmacy printout.</span>
          </div>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-[var(--ink)]">Privacy</Link>
            <Link href="/terms" className="hover:text-[var(--ink)]">Terms</Link>
            <Link href="/security" className="hover:text-[var(--ink)]">Security</Link>
            <Link href="/contact" className="hover:text-[var(--ink)]">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
