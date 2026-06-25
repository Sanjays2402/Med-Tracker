'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Pill as PillIcon,
  Bell,
  Calendar,
  ChartBar,
  Dashboard,
  MagnifyingGlass,
  Users,
  Sun,
  Moon,
} from '@med/icons';
import { listMedications } from '../lib/data';
import type { Medication } from '../lib/types';
import { useTheme } from '../lib/use-theme';
import {
  pushRecent,
  parseRecents,
  serializeRecents,
  RECENTS_KEY,
  type RecentEntry,
} from '../lib/command-recents';

/**
 * CommandPalette — Linear/Raycast-style ⌘K palette.
 *
 * Open with: ⌘K (mac) / Ctrl+K (win/linux) / `/` anywhere
 * Close with: Esc
 * Navigate:   ↑/↓
 * Select:     Enter
 *
 * Sections:
 *   - Pages   (top-level navigation)
 *   - Actions (theme toggle, add medication, etc)
 *   - Medications (fuzzy-matched against user's list)
 */

type Item =
  | { kind: 'link'; id: string; title: string; subtitle?: string; href: string; icon: React.ComponentType<{ size?: number }> }
  | { kind: 'action'; id: string; title: string; subtitle?: string; run: () => void; icon: React.ComponentType<{ size?: number }> };

interface Section {
  label: string;
  items: Item[];
}

const STATIC_PAGES: ReadonlyArray<Omit<Extract<Item, { kind: 'link' }>, 'kind'>> = [
  { id: 'p-dashboard', title: 'Dashboard', subtitle: 'Today at a glance',  href: '/dashboard',     icon: Dashboard },
  { id: 'p-today',     title: 'Today',     subtitle: 'Dose schedule',      href: '/today',         icon: Bell },
  { id: 'p-meds',      title: 'Medications', subtitle: 'Your pillbox',     href: '/medications',   icon: PillIcon },
  { id: 'p-add',       title: 'Add a medication', subtitle: 'New entry',   href: '/medications/new', icon: PillIcon },
  { id: 'p-schedule',  title: 'Schedule',  subtitle: 'The week ahead',     href: '/schedule',      icon: Calendar },
  { id: 'p-refills',   title: 'Refills',   subtitle: 'What needs filling', href: '/refills',       icon: ChartBar },
  { id: 'p-history',   title: 'History',   subtitle: 'Past days',          href: '/history',       icon: Calendar },
  { id: 'p-reports',   title: 'Reports',   subtitle: 'Adherence and more', href: '/reports',       icon: ChartBar },
  { id: 'p-pills',     title: 'Identify a pill', subtitle: 'By imprint',   href: '/pills',         icon: MagnifyingGlass },
  { id: 'p-notifs',    title: 'Notifications', subtitle: 'Alerts inbox',   href: '/notifications', icon: Bell },
  { id: 'p-caregivers', title: 'Caregivers', subtitle: 'People who can see your meds', href: '/caregivers', icon: Users },
  { id: 'p-settings',  title: 'Settings',  subtitle: 'Profile, privacy, theme', href: '/settings', icon: Dashboard },
];

function fuzzyScore(needle: string, haystack: string): number {
  // Simple subsequence match scoring. Higher = better.
  const n = needle.toLowerCase();
  const h = haystack.toLowerCase();
  if (!n) return 1;
  if (h.startsWith(n)) return 1000 + (n.length / Math.max(1, h.length)) * 100;
  if (h.includes(n)) return 500 + (n.length / Math.max(1, h.length)) * 50;
  // subsequence
  let i = 0;
  let last = -1;
  let consecutive = 0;
  let best = 0;
  for (let j = 0; j < h.length && i < n.length; j++) {
    if (h[j] === n[i]) {
      if (last === j - 1) consecutive++;
      else { best = Math.max(best, consecutive); consecutive = 1; }
      last = j;
      i++;
    }
  }
  best = Math.max(best, consecutive);
  if (i === n.length) return 100 + best * 10;
  return 0;
}

export function CommandPalette() {
  const router = useRouter();
  const [, setTheme] = useTheme();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [activeIdx, setActiveIdx] = React.useState(0);
  const [meds, setMeds] = React.useState<Medication[]>([]);
  const [recents, setRecents] = React.useState<RecentEntry[]>([]);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);

  // Lazy-load meds the first time the palette opens (no network ping on every page load)
  const [medsLoaded, setMedsLoaded] = React.useState(false);
  React.useEffect(() => {
    if (open && !medsLoaded) {
      void listMedications().then((m) => setMeds(m)).catch(() => setMeds([]));
      setMedsLoaded(true);
    }
  }, [open, medsLoaded]);

  // Load recents from localStorage each time the palette opens (so a run in a
  // previous open shows up on the next open).
  React.useEffect(() => {
    if (!open) return;
    try {
      setRecents(parseRecents(window.localStorage.getItem(RECENTS_KEY)));
    } catch {
      setRecents([]);
    }
  }, [open]);

  // Keybinds: ⌘K / Ctrl+K / `/` to open. Esc to close.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if ((isMod && e.key.toLowerCase() === 'k') || (e.key === '/' && !isTextField(e.target))) {
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Reset state when closed
  React.useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveIdx(0);
    } else {
      // Focus input on open. RAF to wait for portal mount.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Build action list (depends on theme setter, recreated each render is fine — cheap)
  const actions: Array<Extract<Item, { kind: 'action' }>> = React.useMemo(
    () => [
      { kind: 'action', id: 'a-theme-light', title: 'Switch to light theme', subtitle: 'Warm paper', run: () => setTheme('light'), icon: Sun },
      { kind: 'action', id: 'a-theme-dark',  title: 'Switch to dark theme',  subtitle: 'Warm ink',    run: () => setTheme('dark'),  icon: Moon },
      { kind: 'action', id: 'a-theme-system', title: 'Match system theme',   subtitle: 'Auto',        run: () => setTheme('system'),icon: Sun },
    ],
    [setTheme],
  );

  // Build sections, filtered + scored by query.
  const sections: Section[] = React.useMemo(() => {
    const pageItems = STATIC_PAGES.map((p) => ({ ...p, kind: 'link' as const }));
    function rank(items: Item[]): Item[] {
      if (!query.trim()) return items;
      return items
        .map((it) => {
          const titleScore = fuzzyScore(query, it.title) * 1.5;
          const subScore = it.subtitle ? fuzzyScore(query, it.subtitle) * 0.6 : 0;
          return { it, score: Math.max(titleScore, subScore) };
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((x) => x.it);
    }
    const medItems: Item[] = meds.slice(0, 50).map((m) => ({
      kind: 'link',
      id: `m-${m.id}`,
      title: m.name,
      subtitle: [m.strength, m.schedule].filter(Boolean).join(' · '),
      href: `/medications/${m.id}`,
      icon: PillIcon,
    }));

    // Index every runnable item by id so recents can resolve to a live item
    // (and pick up renamed medications / removed entries).
    const byId = new Map<string, Item>();
    for (const it of [...pageItems, ...actions, ...medItems]) byId.set(it.id, it);

    const out: Section[] = [];

    // Recent section: only on an empty query, only entries that still resolve.
    if (!query.trim() && recents.length > 0) {
      const recentItems: Item[] = [];
      for (const r of recents) {
        const live = byId.get(r.id);
        if (live) recentItems.push(live);
      }
      if (recentItems.length > 0) out.push({ label: 'Recent', items: recentItems });
    }

    out.push(
      { label: 'Pages',       items: rank(pageItems) },
      { label: 'Actions',     items: rank(actions) },
      { label: 'Medications', items: rank(medItems) },
    );
    return out.filter((s) => s.items.length > 0);
  }, [query, actions, meds, recents]);

  // Flatten for keyboard nav
  const flat = React.useMemo(() => sections.flatMap((s) => s.items), [sections]);

  // Clamp active index when results change
  React.useEffect(() => {
    if (activeIdx >= flat.length) setActiveIdx(Math.max(0, flat.length - 1));
  }, [flat.length, activeIdx]);

  function runItem(item: Item) {
    // Record this run as a recent (newest-first, deduped, capped).
    try {
      const entry: RecentEntry = { id: item.id, title: item.title, at: Date.now() };
      if (item.subtitle) entry.subtitle = item.subtitle;
      if (item.kind === 'link') entry.href = item.href;
      const next = pushRecent(parseRecents(window.localStorage.getItem(RECENTS_KEY)), entry);
      window.localStorage.setItem(RECENTS_KEY, serializeRecents(next));
      setRecents(next);
    } catch {
      /* localStorage unavailable (private mode / SSR) - recents are best-effort */
    }

    if (item.kind === 'link') {
      router.push(item.href);
    } else {
      item.run();
    }
    setOpen(false);
  }

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(flat.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = flat[activeIdx];
      if (item) runItem(item);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveIdx(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveIdx(flat.length - 1);
    }
  }

  // Scroll active row into view
  React.useEffect(() => {
    if (!open) return;
    const root = listRef.current;
    if (!root) return;
    const el = root.querySelector<HTMLElement>(`[data-cmd-idx="${activeIdx}"]`);
    if (!el) return;
    const rb = root.getBoundingClientRect();
    const eb = el.getBoundingClientRect();
    if (eb.top < rb.top) el.scrollIntoView({ block: 'nearest' });
    else if (eb.bottom > rb.bottom) el.scrollIntoView({ block: 'nearest' });
  }, [activeIdx, open]);

  if (!open) return null;

  let runningIdx = -1;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-start justify-center px-4 sm:px-0 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      {/* Backdrop */}
      <button
        aria-hidden="true"
        tabIndex={-1}
        onClick={() => setOpen(false)}
        className="absolute inset-0 cursor-default"
        style={{
          background: 'color-mix(in srgb, var(--ink) 28%, transparent)',
          backdropFilter: 'blur(8px)',
        }}
      />
      {/* Sheet */}
      <div
        className="relative w-full max-w-xl rounded-[18px] overflow-hidden anim-in"
        style={{
          background: 'var(--bg-elev)',
          border: '1px solid var(--line)',
          boxShadow: '0 30px 60px -20px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.04)',
        }}
      >
        <div className="flex items-center gap-3 px-5 h-14 border-b" style={{ borderColor: 'var(--line-soft)' }}>
          <MagnifyingGlass size={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
            onKeyDown={onInputKey}
            placeholder="Jump to anything…"
            aria-label="Command palette search"
            className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-[var(--ink-muted)]"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd
            className="capsule tabular text-[11px]"
            aria-hidden
          >
            esc
          </kbd>
        </div>

        <div
          ref={listRef}
          className="max-h-[58vh] overflow-y-auto"
          role="listbox"
          aria-label="Command palette results"
        >
          {sections.length === 0 ? (
            <div className="px-5 py-10 text-center text-[13.5px] text-[var(--ink-muted)]">
              Nothing matches "{query}".
            </div>
          ) : (
            sections.map((section) => (
              <div key={section.label} className="py-1">
                <div className="px-5 pt-3 pb-1 eyebrow">{section.label}</div>
                <ul>
                  {section.items.map((it) => {
                    runningIdx++;
                    const idx = runningIdx;
                    const active = idx === activeIdx;
                    const Icon = it.icon;
                    return (
                      <li key={it.id}>
                        <button
                          data-cmd-idx={idx}
                          role="option"
                          aria-selected={active}
                          onMouseEnter={() => setActiveIdx(idx)}
                          onClick={() => runItem(it)}
                          className="w-full text-left flex items-center gap-3 px-5 py-2.5 transition-colors"
                          style={{
                            background: active ? 'var(--bg-sunk)' : 'transparent',
                          }}
                        >
                          <span
                            className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                            style={{
                              background: active ? 'var(--accent-soft)' : 'var(--bg-sunk)',
                              color: active ? 'var(--accent-ink)' : 'var(--ink-muted)',
                            }}
                          >
                            <Icon size={14} />
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-[14px] font-medium text-[var(--ink)] truncate">
                              {it.title}
                            </span>
                            {it.subtitle && (
                              <span className="block text-[12px] text-[var(--ink-muted)] truncate">
                                {it.subtitle}
                              </span>
                            )}
                          </span>
                          {active && (
                            <span className="capsule tabular text-[10.5px]" aria-hidden>
                              ↵
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>

        <div
          className="flex items-center justify-between px-5 py-2.5 border-t text-[11px] text-[var(--ink-muted)]"
          style={{ borderColor: 'var(--line-soft)', background: 'var(--bg-sunk)' }}
        >
          <span className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1"><kbd className="capsule tabular text-[10px]">↑↓</kbd> navigate</span>
            <span className="inline-flex items-center gap-1"><kbd className="capsule tabular text-[10px]">↵</kbd> open</span>
          </span>
          <span className="inline-flex items-center gap-1"><kbd className="capsule tabular text-[10px]">⌘K</kbd> toggle</span>
        </div>
      </div>
    </div>
  );
}

function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (target.isContentEditable) return true;
  return false;
}
