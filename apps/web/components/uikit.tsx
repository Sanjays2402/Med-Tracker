'use client';

import * as React from 'react';

/* ------------------------------------------------------------------
   uikit — pillbox-shaped primitives.
   Visual language:
   - Capsules (rounded-full) for chips, tags, status, time blocks.
   - Sheets (rounded-card) with hairline border, no heavy shadows.
   - Sage accent. Coral overdue. Amber upcoming. Sage taken.
   ------------------------------------------------------------------ */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export function Btn({
  variant = 'secondary',
  size = 'md',
  className = '',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-full font-medium tracking-tight ' +
    'disabled:opacity-50 disabled:pointer-events-none ' +
    'focus:outline-none';
  const sizes: Record<Size, string> = {
    sm: 'h-7 px-3 text-[12px]',
    md: 'h-9 px-4 text-[13px]',
    lg: 'h-11 px-5 text-sm',
  };
  const variants: Record<Variant, string> = {
    primary:
      'bg-[var(--ink)] text-[var(--bg)] hover:bg-[var(--ink-soft)]',
    secondary:
      'bg-[var(--bg-elev)] text-[var(--ink)] border border-[var(--line)] hover:bg-[var(--bg-sunk)]',
    ghost:
      'text-[var(--ink-soft)] hover:bg-[var(--bg-sunk)] hover:text-[var(--ink)]',
    danger:
      'bg-[var(--danger-bg)] text-[var(--danger)] hover:brightness-95 border border-transparent',
  };
  return <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...rest} />;
}

export function Surface({
  className = '',
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`sheet ${className}`} {...rest} />;
}

export function Section({
  title,
  action,
  children,
  display = false,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  display?: boolean;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <h2
          className={
            display
              ? 'display text-[22px] leading-none text-[var(--ink)]'
              : 'eyebrow'
          }
        >
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function StatTile({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  accent?: 'ok' | 'warn' | 'danger';
}) {
  const dotColor =
    accent === 'ok'
      ? 'var(--ok)'
      : accent === 'warn'
      ? 'var(--warn)'
      : accent === 'danger'
      ? 'var(--danger)'
      : 'var(--accent)';
  return (
    <div className="sheet p-5">
      <div className="flex items-center gap-2 eyebrow">
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ background: dotColor }}
        />
        {label}
      </div>
      <div className="mt-2 display text-[34px] leading-none tabular text-[var(--ink)]">
        {value}
      </div>
      {hint && (
        <div className="mt-2 text-[12.5px] text-[var(--ink-muted)]">{hint}</div>
      )}
    </div>
  );
}

export function Empty({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="sheet p-10 flex flex-col items-center text-center">
      {icon && (
        <div className="mb-4 inline-flex items-center justify-center w-12 h-12 rounded-full bg-[var(--bg-sunk)] text-[var(--ink-muted)]">
          {icon}
        </div>
      )}
      <div className="display text-[20px] leading-tight">{title}</div>
      {description && (
        <div className="mt-1.5 text-[13.5px] text-[var(--ink-muted)] max-w-sm">
          {description}
        </div>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorBox({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="sheet p-4 border-[color:var(--danger)]/30 bg-[var(--danger-bg)]">
      <div className="text-[13px] text-[var(--danger)]">{message}</div>
      {onRetry && (
        <div className="mt-2">
          <Btn size="sm" variant="secondary" onClick={onRetry}>
            Try again
          </Btn>
        </div>
      )}
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 p-4 border-b border-[var(--line-soft)] last:border-0 animate-pulse">
      <div className="w-10 h-10 rounded-full bg-[var(--bg-sunk)]" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-32 bg-[var(--bg-sunk)] rounded-full" />
        <div className="h-3 w-48 bg-[var(--bg-sunk)] rounded-full" />
      </div>
      <div className="w-16 h-7 bg-[var(--bg-sunk)] rounded-full" />
    </div>
  );
}

/**
 * Pill chip. The signature shape. Used for status and tags.
 */
export function Pill({
  children,
  tone = 'neutral',
  size = 'sm',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'accent';
  size?: 'sm' | 'md';
}) {
  const cls = `capsule ${size === 'md' ? 'capsule-lg' : ''} ${
    tone === 'ok'
      ? 'capsule-ok'
      : tone === 'warn'
      ? 'capsule-warn'
      : tone === 'danger'
      ? 'capsule-danger'
      : tone === 'info'
      ? 'capsule-info'
      : tone === 'accent'
      ? 'capsule-accent'
      : ''
  }`;
  return <span className={cls}>{children}</span>;
}

/**
 * The decorative pill capsule mark. Two-tone capsule glyph.
 */
export function PillMark({
  tone = 'accent',
  size = 'sm',
  className = '',
}: {
  tone?: 'accent' | 'ok' | 'warn' | 'danger';
  size?: 'sm' | 'lg';
  className?: string;
}) {
  const t =
    tone === 'ok'
      ? 'pill-mark-ok'
      : tone === 'warn'
      ? 'pill-mark-warn'
      : tone === 'danger'
      ? 'pill-mark-danger'
      : '';
  return <span aria-hidden className={`pill-mark ${size === 'lg' ? 'pill-mark-lg' : ''} ${t} ${className}`} />;
}

export function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

/** Animated check mark used after dose taken. */
export function CheckBurst({ size = 16 }: { size?: number }) {
  return (
    <svg
      className="check-sweep"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12.5 L10 17 L19 7" />
    </svg>
  );
}
