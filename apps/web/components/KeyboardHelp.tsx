'use client';

import * as React from 'react';
import { X as XIcon } from '@med/icons';

/**
 * KeyboardHelp — Linear-style "press ? for shortcuts" overlay.
 *
 * Trigger: press `?` (shift+/) anywhere outside a text field.
 * Close:   Esc, click backdrop, or click the X.
 *
 * The list is grouped by area (Navigation / Actions / Help) with a kbd
 * key block on the right of each row. Mac/non-mac platforms get the right
 * modifier glyph automatically.
 */

interface Shortcut {
  keys: string[]; // Tokens like 'Mod', 'K', '?', '↵' — see renderKeys
  label: string;
}

interface Group {
  heading: string;
  shortcuts: Shortcut[];
}

const GROUPS: Group[] = [
  {
    heading: 'Navigation',
    shortcuts: [
      { keys: ['Mod', 'K'], label: 'Open command palette' },
      { keys: ['/'],        label: 'Open command palette' },
      { keys: ['G', 'D'],   label: 'Go to dashboard' },
      { keys: ['G', 'T'],   label: 'Go to today' },
      { keys: ['G', 'M'],   label: 'Go to medications' },
      { keys: ['G', 'S'],   label: 'Go to schedule' },
      { keys: ['G', 'R'],   label: 'Go to refills' },
      { keys: ['G', 'H'],   label: 'Go to history' },
    ],
  },
  {
    heading: 'Actions',
    shortcuts: [
      { keys: ['N'],        label: 'New medication' },
      { keys: ['T'],        label: 'Toggle theme' },
      { keys: ['Esc'],      label: 'Close dialog / overlay' },
    ],
  },
  {
    heading: 'Help',
    shortcuts: [
      { keys: ['?'],        label: 'Show keyboard shortcuts' },
    ],
  },
];

const ROUTE_FOR_LEADER: Record<string, string> = {
  d: '/dashboard',
  t: '/today',
  m: '/medications',
  s: '/schedule',
  r: '/refills',
  h: '/history',
};

export function KeyboardHelp() {
  const [open, setOpen] = React.useState(false);
  const [mac, setMac] = React.useState(false);
  // For the `g <letter>` leader: remember the leader pressed and a deadline.
  const leaderRef = React.useRef<number>(0);
  const closeBtnRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    if (typeof navigator !== 'undefined') {
      setMac(/Mac|iPhone|iPad/.test(navigator.userAgent || ''));
    }
  }, []);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTextField(e.target)) return;
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen((prev) => !prev);
        return;
      }
      if (open) return; // While help is open, leader sequences and `t`/`n` are dormant.

      // Toggle theme: `t` (no modifier, not part of a leader)
      if (e.key.toLowerCase() === 't' && Date.now() >= leaderRef.current && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // Avoid hijacking `gt` (go to today) by checking the leader isn't active.
        e.preventDefault();
        toggleThemeViaButton();
        return;
      }

      // New medication: `n`
      if (e.key.toLowerCase() === 'n' && Date.now() >= leaderRef.current && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        navigateTo('/medications/new');
        return;
      }

      // Leader: `g` opens a 1.4-second window for the second key.
      if (e.key.toLowerCase() === 'g' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        leaderRef.current = Date.now() + 1400;
        return;
      }

      if (Date.now() < leaderRef.current) {
        const route = ROUTE_FOR_LEADER[e.key.toLowerCase()];
        if (route) {
          e.preventDefault();
          leaderRef.current = 0;
          navigateTo(route);
        }
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  React.useEffect(() => {
    if (open) {
      // Focus the close button on open so Tab order is sane.
      requestAnimationFrame(() => closeBtnRef.current?.focus());
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1050] flex items-center justify-center px-4 py-10"
      role="dialog"
      aria-modal="true"
      aria-labelledby="keyhelp-title"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={() => setOpen(false)}
        className="absolute inset-0 cursor-default"
        style={{
          background: 'color-mix(in srgb, var(--ink) 30%, transparent)',
          backdropFilter: 'blur(6px)',
        }}
      />
      {/* Sheet */}
      <div
        className="relative w-full max-w-2xl rounded-[18px] overflow-hidden anim-in"
        style={{
          background: 'var(--bg-elev)',
          border: '1px solid var(--line)',
          boxShadow: '0 30px 60px -20px rgba(0,0,0,0.35)',
        }}
      >
        <div
          className="flex items-center justify-between px-6 h-14 border-b"
          style={{ borderColor: 'var(--line-soft)' }}
        >
          <div className="flex items-center gap-3">
            <span className="capsule capsule-accent">
              <kbd className="tabular text-[10.5px]">?</kbd>
            </span>
            <div>
              <div className="eyebrow leading-none">cheat sheet</div>
              <div id="keyhelp-title" className="display text-[18px] leading-none mt-1">
                Keyboard shortcuts
              </div>
            </div>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close shortcuts"
            className="w-9 h-9 rounded-full inline-flex items-center justify-center text-[var(--ink-soft)] hover:text-[var(--ink)] hover:bg-[var(--bg-sunk)] transition-colors"
            style={{ border: '1px solid var(--line)' }}
          >
            <XIcon size={14} />
          </button>
        </div>

        <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
            {GROUPS.map((g) => (
              <section key={g.heading}>
                <div className="eyebrow mb-2.5">{g.heading}</div>
                <ul className="space-y-2">
                  {g.shortcuts.map((sc) => (
                    <li
                      key={`${g.heading}-${sc.keys.join('-')}-${sc.label}`}
                      className="flex items-center justify-between gap-3 text-[13.5px] text-[var(--ink)]"
                    >
                      <span className="truncate">{sc.label}</span>
                      <span className="flex items-center gap-1 shrink-0">
                        {renderKeys(sc.keys, mac)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <div
            className="mt-6 pt-5 border-t text-[12px] text-[var(--ink-muted)]"
            style={{ borderColor: 'var(--line-soft)' }}
          >
            <p>
              Sequences (like <Kbd>G</Kbd>{' '}<Kbd>T</Kbd>) are press-then-press
              within 1.4 seconds. Shortcuts pause while focus is in a text field.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className="inline-flex items-center justify-center min-w-6 h-6 px-1.5 rounded-md tabular text-[11.5px] font-medium"
      style={{
        background: 'var(--bg-sunk)',
        border: '1px solid var(--line)',
        color: 'var(--ink)',
      }}
    >
      {children}
    </kbd>
  );
}

function renderKeys(tokens: string[], mac: boolean): React.ReactNode {
  return tokens.map((tk, i) => {
    const display = tk === 'Mod' ? (mac ? '⌘' : 'Ctrl') : tk;
    return (
      <React.Fragment key={`${tk}-${i}`}>
        <Kbd>{display}</Kbd>
        {i < tokens.length - 1 && (
          <span className="text-[var(--ink-muted)] text-[11px]" aria-hidden>
            {' '}
            then{' '}
          </span>
        )}
      </React.Fragment>
    );
  });
}

function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (target.isContentEditable) return true;
  return false;
}

function navigateTo(href: string) {
  // Lean on the browser; the app shell links use next/link so an href set
  // works fine for navigation. Doing it this way keeps this component free
  // of a useRouter call (and the resulting RSC suspense boundary churn).
  if (typeof window === 'undefined') return;
  window.location.assign(href);
}

function toggleThemeViaButton() {
  if (typeof document === 'undefined') return;
  // Layout renders a "Toggle theme" button. Find it and click it so theme
  // state stays the single-source-of-truth held by useTheme.
  const btn = document.querySelector<HTMLButtonElement>('button[aria-label="Toggle theme"]');
  btn?.click();
}
