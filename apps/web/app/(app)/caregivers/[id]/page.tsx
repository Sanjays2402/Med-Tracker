'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Users, Eye, Clock, Trash } from '@med/icons';
import { Surface, Btn, ErrorBox, SkeletonRow, Pill, Section, formatDate } from '../../../../components/uikit';
import { getCaregiver, revokeCaregiver } from '../../../../lib/data';
import type { CaregiverShare } from '../../../../lib/types';

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
        {expired ? <Pill tone="danger">Expired</Pill> : <Pill tone="ok">Active</Pill>}
      </header>

      <Section title="Permissions">
        <Surface>
          <div className="p-4 flex flex-wrap gap-2">
            {item.scopes.map(s => (
              <span key={s} className="text-xs px-2 py-1 rounded-md bg-neutral-100 dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300">
                {s}
              </span>
            ))}
          </div>
        </Surface>
      </Section>

      <Section title="Activity">
        <Surface>
          <ul>
            <li className="flex items-center gap-3 p-3 border-b border-neutral-100 dark:border-neutral-900">
              <Eye size={16} className="text-neutral-400" />
              <span className="text-sm flex-1">Last viewed</span>
              <span className="text-sm text-neutral-500 dark:text-neutral-400">
                {item.lastViewedAt ? formatDate(item.lastViewedAt) : 'Never'}
              </span>
            </li>
            <li className="flex items-center gap-3 p-3">
              <Clock size={16} className="text-neutral-400" />
              <span className="text-sm flex-1">Expires</span>
              <span className="text-sm text-neutral-500 dark:text-neutral-400">
                {item.expiresAt ? formatDate(item.expiresAt) : 'No expiry'}
              </span>
            </li>
          </ul>
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
