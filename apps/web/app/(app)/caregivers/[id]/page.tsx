'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Users, Eye, Clock, Trash, CalendarPlus } from '@med/icons';
import { Surface, Btn, ErrorBox, SkeletonRow, Pill, Section, formatDate } from '../../../../components/uikit';
import { getCaregiver, revokeCaregiver } from '../../../../lib/data';
import type { CaregiverShare } from '../../../../lib/types';
import { summarizeActivity, scopeLabel, type ActivityEvent } from '../../../../lib/caregiver-activity';

const EVENT_ICON: Record<ActivityEvent['kind'], React.ComponentType<{ size?: number }>> = {
  viewed: Eye,
  'never-viewed': Eye,
  created: CalendarPlus,
  expires: Clock,
  expired: Clock,
};

const EVENT_DOT: Record<NonNullable<ActivityEvent['tone']>, string> = {
  neutral: 'var(--ink-muted)',
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  danger: 'var(--danger)',
};

export default function CaregiverDetailPage() {
  const router = useRouter();
  const routed = useParams<{ id: string }>();
  const id = routed?.id ?? '';
  const [item, setItem] = React.useState<CaregiverShare | null | undefined>(undefined);
  const [error, setError] = React.useState<string | null>(null);
  const [revoking, setRevoking] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);

  const load = React.useCallback(async () => {
    setError(null);
    try { setItem(await getCaregiver(id)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load caregiver.'); }
  }, [id]);
  React.useEffect(() => { void load(); }, [load]);

  async function onRevoke() {
    setRevoking(true);
    try {
      await revokeCaregiver(id);
      router.push('/caregivers');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not revoke share.');
      setRevoking(false);
    }
  }

  if (error && !item) return <ErrorBox message={error} onRetry={load} />;
  if (item === undefined) return <Surface><SkeletonRow /><SkeletonRow /></Surface>;
  if (item === null) {
    return (
      <div className="space-y-6">
        <BackLink />
        <Surface>
          <div className="p-8 text-center">
            <h2 className="text-base font-medium">Share not found</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
              The share id <code className="font-mono text-xs">{id}</code> does not exist or was revoked.
            </p>
          </div>
        </Surface>
      </div>
    );
  }

  const expired = item.expiresAt && +new Date(item.expiresAt) < Date.now();
  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/share/${item.id}` : `/share/${item.id}`;
  const activity = summarizeActivity(item);

  return (
    <div className="space-y-6 max-w-2xl">
      <BackLink />

      <header className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
          <Users size={24} weight="duotone" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight truncate">{item.label}</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Created {formatDate(item.createdAt)}
          </p>
        </div>
        {expired ? <Pill tone="danger">Expired</Pill> : activity.expiringSoon ? <Pill tone="warn">Expiring soon</Pill> : <Pill tone="ok">Active</Pill>}
      </header>

      <Section title="Permissions">
        <Surface>
          <div className="p-4 flex flex-wrap gap-2">
            {item.scopes.map(s => (
              <span key={s} className="text-xs px-2.5 py-1 rounded-full bg-[var(--accent-soft)] text-[var(--accent-ink)] font-medium">
                {scopeLabel(s)}
              </span>
            ))}
          </div>
        </Surface>
      </Section>

      <Section
        title="Activity"
        action={
          <span className="text-[12px] text-[var(--ink-muted)]">
            {activity.viewed
              ? activity.daysSinceViewed === 0
                ? 'Viewed today'
                : `Last seen ${activity.events.find(e => e.kind === 'viewed')?.relative ?? ''}`
              : 'Not opened yet'}
          </span>
        }
      >
        <Surface>
          <ul>
            {activity.events.map((e, i) => {
              const Icon = EVENT_ICON[e.kind];
              return (
                <li
                  key={e.kind}
                  className={`flex items-center gap-3 p-3 ${i < activity.events.length - 1 ? 'border-b border-neutral-100 dark:border-neutral-900' : ''}`}
                >
                  <span
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: 'var(--bg-sunk)', color: EVENT_DOT[e.tone] }}
                  >
                    <Icon size={15} />
                  </span>
                  <span className="text-sm flex-1 min-w-0">
                    <span className="block font-medium">{e.label}</span>
                    {e.at && <span className="block text-[12px] text-[var(--ink-muted)]">{formatDate(e.at)}</span>}
                  </span>
                  <span
                    className="text-[12.5px] tabular shrink-0"
                    style={{ color: e.tone === 'neutral' ? 'var(--ink-muted)' : EVENT_DOT[e.tone] }}
                  >
                    {e.relative}
                  </span>
                </li>
              );
            })}
          </ul>
          {!activity.viewed && (
            <div className="px-3 pb-3 pt-1">
              <p className="text-[12px] text-[var(--ink-muted)]">
                {item.label} hasn&apos;t opened this share yet. They can view it any time using the link below.
              </p>
            </div>
          )}
        </Surface>
      </Section>

      <Section title="Share link">
        <Surface>
          <div className="p-4 space-y-2">
            <code className="block text-xs font-mono px-3 py-2 rounded-md bg-neutral-50 dark:bg-neutral-900 break-all">
              {shareUrl}
            </code>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Anyone with this link can view based on the permissions above, until it expires.
            </p>
          </div>
        </Surface>
      </Section>

      <Section title="Danger zone">
        <Surface>
          <div className="p-4 space-y-3">
            {!confirm ? (
              <Btn variant="danger" size="md" onClick={() => setConfirm(true)}>
                <Trash size={14} weight="duotone" />
                Revoke share
              </Btn>
            ) : (
              <div className="space-y-2">
                <p className="text-sm">Revoke access for {item.label}? This cannot be undone.</p>
                <div className="flex items-center gap-2">
                  <Btn variant="danger" size="md" onClick={onRevoke} disabled={revoking}>
                    {revoking ? 'Revoking' : 'Yes, revoke'}
                  </Btn>
                  <button
                    type="button"
                    onClick={() => setConfirm(false)}
                    className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 px-2"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </Surface>
      </Section>

      {error && <ErrorBox message={error} />}
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/caregivers" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
      <ArrowLeft size={14} />
      Caregivers
    </Link>
  );
}
