'use client';

import * as React from 'react';
import { CheckCircle, Warning, Info, XCircle, X as XIcon } from '@med/icons';

/**
 * Toast system — sage-themed transient feedback.
 *
 * Usage:
 *   1. Wrap app tree with <ToastProvider>
 *   2. Use the `useToast` hook anywhere: `const { toast } = useToast();`
 *   3. Call `toast({ kind: 'success', title: 'Dose logged' })`
 *
 * Behaviors:
 *   - Stacks bottom-right (desktop) / bottom-full-width (mobile)
 *   - Auto-dismiss after `durationMs` (default 4000; 0 = sticky)
 *   - Hover pauses dismiss; mouse leave resumes
 *   - Click X to dismiss; optional action button for inline undo / retry
 *   - Reduced motion respected (no slide-in animation)
 *   - aria-live="polite" announces each toast
 */

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface ToastInput {
  kind?: ToastKind;
  title: string;
  description?: string;
  /** Milliseconds before auto-dismiss. 0 = sticky. Default 4000. */
  durationMs?: number;
  /** Optional inline action (e.g. "Undo"). When clicked, the toast dismisses. */
  action?: { label: string; run: () => void };
  /** Optional id to deduplicate; later toasts replace earlier ones with same id. */
  id?: string;
}

interface ToastItem extends Required<Omit<ToastInput, 'description' | 'action' | 'id'>> {
  internalId: number;
  externalId?: string;
  description?: string;
  action?: ToastInput['action'];
  createdAt: number;
}

interface ToastApi {
  toast: (input: ToastInput) => number;
  dismiss: (id: number | string) => void;
  dismissAll: () => void;
}

const ToastContext = React.createContext<ToastApi | null>(null);

let counter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const itemsRef = React.useRef(items);
  itemsRef.current = items;

  const dismiss = React.useCallback((id: number | string) => {
    setItems((prev) =>
      prev.filter((t) =>
        typeof id === 'number' ? t.internalId !== id : t.externalId !== id,
      ),
    );
  }, []);

  const dismissAll = React.useCallback(() => setItems([]), []);

  const toast = React.useCallback((input: ToastInput): number => {
    const internalId = ++counter;
    const item: ToastItem = {
      internalId,
      externalId: input.id,
      kind: input.kind ?? 'info',
      title: input.title,
      description: input.description,
      durationMs: input.durationMs ?? 4000,
      action: input.action,
      createdAt: Date.now(),
    };
    setItems((prev) => {
      // Deduplicate by externalId
      const filtered = input.id ? prev.filter((t) => t.externalId !== input.id) : prev;
      return [...filtered, item];
    });
    return internalId;
  }, []);

  const api = React.useMemo<ToastApi>(() => ({ toast, dismiss, dismissAll }), [toast, dismiss, dismissAll]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport items={items} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    // Graceful fallback so a missing provider doesn't crash the page.
    // Logs to console so the gap is discoverable in dev.
    return {
      toast: (input) => {
        if (typeof console !== 'undefined') {
          // eslint-disable-next-line no-console
          console.warn('[toast] no ToastProvider mounted:', input.title);
        }
        return 0;
      },
      dismiss: () => undefined,
      dismissAll: () => undefined,
    };
  }
  return ctx;
}

function ToastViewport({ items, dismiss }: { items: ToastItem[]; dismiss: (id: number) => void }) {
  if (items.length === 0) return null;
  return (
    <div
      className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-6 sm:bottom-6 z-[1100] flex flex-col gap-2 items-stretch sm:items-end pointer-events-none"
      aria-live="polite"
      aria-label="Notifications"
      role="region"
    >
      {items.map((t) => (
        <ToastRow key={t.internalId} item={t} onDismiss={() => dismiss(t.internalId)} />
      ))}
    </div>
  );
}

function ToastRow({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const [paused, setPaused] = React.useState(false);
  const [leaving, setLeaving] = React.useState(false);
  const remainingRef = React.useRef(item.durationMs);
  const startRef = React.useRef(Date.now());
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismissNow = React.useCallback(() => {
    setLeaving(true);
    // Wait for leave animation to play (160ms) before unmounting from state
    setTimeout(onDismiss, 160);
  }, [onDismiss]);

  // Schedule auto-dismiss; pause/resume on hover
  React.useEffect(() => {
    if (item.durationMs <= 0) return; // sticky
    if (paused) {
      if (timerRef.current) clearTimeout(timerRef.current);
      remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startRef.current));
      return;
    }
    startRef.current = Date.now();
    timerRef.current = setTimeout(dismissNow, remainingRef.current);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [paused, item.durationMs, dismissNow]);

  const styles = TONE_STYLES[item.kind];

  return (
    <div
      role="status"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={`pointer-events-auto sheet flex items-start gap-3 p-3.5 pr-3 min-w-0 sm:min-w-[320px] sm:max-w-[420px] ${
        leaving ? 'anim-toast-out' : 'anim-toast-in'
      }`}
      style={{
        background: 'var(--bg-elev)',
        borderColor: styles.border,
        boxShadow: '0 14px 28px -10px rgba(0,0,0,0.18), 0 4px 10px -4px rgba(0,0,0,0.08)',
      }}
    >
      <span
        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
        style={{ background: styles.iconBg, color: styles.iconFg }}
        aria-hidden
      >
        <styles.Icon size={15} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-medium text-[var(--ink)] leading-tight">
          {item.title}
        </div>
        {item.description && (
          <div className="mt-1 text-[12.5px] text-[var(--ink-soft)] leading-snug">
            {item.description}
          </div>
        )}
        {item.action && (
          <button
            type="button"
            onClick={() => {
              item.action?.run();
              dismissNow();
            }}
            className="mt-2 inline-flex items-center h-7 px-3 rounded-full text-[12px] font-medium transition-colors"
            style={{
              background: styles.actionBg,
              color: styles.actionFg,
              border: `1px solid ${styles.border}`,
            }}
          >
            {item.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={dismissNow}
        aria-label="Dismiss"
        className="shrink-0 w-7 h-7 rounded-full inline-flex items-center justify-center text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--bg-sunk)] transition-colors"
      >
        <XIcon size={12} />
      </button>
    </div>
  );
}

interface ToneStyle {
  Icon: React.ComponentType<{ size?: number }>;
  iconBg: string;
  iconFg: string;
  border: string;
  actionBg: string;
  actionFg: string;
}

const TONE_STYLES: Record<ToastKind, ToneStyle> = {
  success: {
    Icon: CheckCircle,
    iconBg: 'var(--ok-bg)',
    iconFg: 'var(--ok)',
    border: 'var(--ok)',
    actionBg: 'var(--ok-bg)',
    actionFg: 'var(--ok)',
  },
  error: {
    Icon: XCircle,
    iconBg: 'var(--danger-bg)',
    iconFg: 'var(--danger)',
    border: 'var(--danger)',
    actionBg: 'var(--danger-bg)',
    actionFg: 'var(--danger)',
  },
  warning: {
    Icon: Warning,
    iconBg: 'var(--warn-bg)',
    iconFg: 'var(--warn)',
    border: 'var(--warn)',
    actionBg: 'var(--warn-bg)',
    actionFg: 'var(--warn)',
  },
  info: {
    Icon: Info,
    iconBg: 'var(--info-bg)',
    iconFg: 'var(--info)',
    border: 'var(--info)',
    actionBg: 'var(--info-bg)',
    actionFg: 'var(--info)',
  },
};
