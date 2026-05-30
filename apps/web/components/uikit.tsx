'use client';

import * as React from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

export function Btn({
  variant = 'secondary',
  size = 'md',
  className = '',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40';
  const sizes: Record<Size, string> = {
    sm: 'h-7 px-2.5 text-xs',
    md: 'h-8 px-3 text-sm',
  };
  const variants: Record<Variant, string> = {
    primary: 'bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white',
    secondary:
      'border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-900',
    ghost:
      'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-900',
    danger:
      'border border-red-200 dark:border-red-900/60 bg-white dark:bg-neutral-950 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40',
  };
  return <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...rest} />;
}

export function Surface({
  className = '',
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 ${className}`}
      {...rest}
    />
  );
}

export function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function StatTile({ label, value, hint, accent }: { label: string; value: React.ReactNode; hint?: React.ReactNode; accent?: 'ok' | 'warn' | 'danger' }) {
  const accentClass =
    accent === 'ok'
      ? 'text-emerald-600 dark:text-emerald-400'
      : accent === 'warn'
      ? 'text-amber-600 dark:text-amber-400'
      : accent === 'danger'
      ? 'text-red-600 dark:text-red-400'
      : 'text-neutral-900 dark:text-neutral-100';
  return (
    <Surface className="p-4">
      <div className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${accentClass}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{hint}</div>}
    </Surface>
  );
}

export function Empty({ icon, title, description, action }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <Surface className="p-10 flex flex-col items-center text-center">
      {icon && <div className="mb-3 text-neutral-400 dark:text-neutral-600">{icon}</div>}
      <div className="font-medium">{title}</div>
      {description && <div className="mt-1 text-sm text-neutral-500 dark:text-neutral-400 max-w-sm">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </Surface>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Surface className="p-4 border-red-200 dark:border-red-900/60 bg-red-50/60 dark:bg-red-950/30">
      <div className="text-sm text-red-700 dark:text-red-300">{message}</div>
      {onRetry && (
        <div className="mt-2">
          <Btn size="sm" variant="secondary" onClick={onRetry}>Try again</Btn>
        </div>
      )}
    </Surface>
  );
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 p-3 border-b border-neutral-100 dark:border-neutral-900 last:border-0 animate-pulse">
      <div className="w-8 h-8 rounded-md bg-neutral-100 dark:bg-neutral-900" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-32 bg-neutral-100 dark:bg-neutral-900 rounded" />
        <div className="h-3 w-48 bg-neutral-100 dark:bg-neutral-900 rounded" />
      </div>
      <div className="w-16 h-7 bg-neutral-100 dark:bg-neutral-900 rounded" />
    </div>
  );
}

export function Pill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'ok' | 'warn' | 'danger' | 'info' }) {
  const tones: Record<string, string> = {
    neutral: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300',
    ok: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    warn: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    danger: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
    info: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
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
