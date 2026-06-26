'use client';

import * as React from 'react';
import {
  ADHERENCE_WINDOWS,
  cycleWindow,
  windowCaption,
  type AdherenceWindowKey,
} from '../lib/adherence-window';

/**
 * WindowPicker — the shared 7d / 30d / 90d adherence window chip row.
 *
 * Lifted out of /reports so every adherence surface (/reports, /reports/adherence,
 * /reports/weekly via the caption) shares ONE control with identical styling,
 * a11y semantics, and keyboard behaviour. The pure key model lives in
 * lib/adherence-window; this component is a thin render over it.
 *
 * Keyboard: when a chip is focused, Left/Right cycle through the windows
 * (wrapping), matching the Linear segmented-control feel. Each chip is a real
 * button with aria-pressed so screen readers announce the active window.
 */
export function WindowPicker({
  value,
  onChange,
  size = 'md',
  label = 'Adherence window',
  className = '',
}: {
  value: AdherenceWindowKey;
  onChange: (key: AdherenceWindowKey) => void;
  /** 'sm' is the tighter 28px chip used in section actions; 'md' is 32px. */
  size?: 'sm' | 'md';
  label?: string;
  className?: string;
}) {
  const h = size === 'sm' ? 'h-7' : 'h-8';
  const text = size === 'sm' ? 'text-[11.5px]' : 'text-[12px]';

  function onKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      onChange(cycleWindow(value, 1));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onChange(cycleWindow(value, -1));
    }
  }

  return (
    <div
      role="group"
      aria-label={label}
      onKeyDown={onKey}
      className={`flex items-center gap-1 ${className}`}
    >
      {ADHERENCE_WINDOWS.map((opt) => {
        const active = value === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            aria-pressed={active}
            title={opt.label}
            className={`${h} px-2.5 rounded-full ${text} font-medium border transition-colors ${
              active
                ? 'border-transparent bg-[var(--accent-soft)] text-[var(--accent-ink)]'
                : 'border-[var(--line)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--bg-sunk)]'
            }`}
          >
            {opt.short}
          </button>
        );
      })}
    </div>
  );
}

/** The small "last 30 days" subhead caption, kept next to the picker exports. */
export function WindowCaption({ value, className = '' }: { value: AdherenceWindowKey; className?: string }) {
  return <span className={className}>{windowCaption(value)}</span>;
}
