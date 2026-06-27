'use client';

import * as React from 'react';
import Link from 'next/link';
import { Users, Plus, Eye, Clock, MagnifyingGlass } from '@med/icons';
import { Surface, Empty, ErrorBox, SkeletonRow, Pill, formatDate } from '../../../components/uikit';
import { listCaregivers } from '../../../lib/data';
import type { CaregiverShare } from '../../../lib/types';
import {
  summarizeCaregiverSort,
  cycleCaregiverSort,
  CAREGIVER_SORTS,
  type CaregiverSortKey,
} from '../../../lib/caregiver-sort';
import { summarizeCaregiverFilter } from '../../../lib/caregiver-filter';
import { caregiverSortCaption, caregiverSortMatchClause } from '../../../lib/caregiver-sort-caption';
import { expiryPill, expiryTooltip, summarizeExpiry, expiringHeadline } from '../../../lib/caregiver-expiry';
import { expiryBar } from '../../../lib/expiry-bar';

export default function CaregiversPage() {
  const [items, setItems] = React.useState<CaregiverShare[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [sortBy, setSortBy] = React.useState<CaregiverSortKey>('recent');
  const [query, setQuery] = React.useState('');
  const searchRef = React.useRef<HTMLInputElement | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try { setItems(await listCaregivers()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load caregivers.'); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  // "/" focuses the search box (without typing the slash) when not already typing.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || t?.isContentEditable) return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // "s" cycles the sort key (Recently viewed -> Least recent -> Never viewed ->
  // Expiring soonest -> wrap), parallel to the medications list. Skipped while a
  // text field is focused or a modifier is held so it never fights the browser
  // or the global g-then-s leader (which carries no bare "s").
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== 's' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || t?.isContentEditable) return;
      e.preventDefault();
      setSortBy((prev) => cycleCaregiverSort(prev));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (error && !items) return <ErrorBox message={error} onRetry={load} />;

  // Filter first, then sort the survivors. The sort summary's never-opened count
  // reflects the filtered view so the header stays honest.
  const filtered = items ? summarizeCaregiverFilter(items, query) : null;
  const sorted = filtered ? summarizeCaregiverSort(filtered.shares, sortBy) : null;

  // Expiry tally across ALL shares (not the filtered view) so the header always
  // reflects how many shares need renewing, regardless of the active search.
  const expirySummary = items ? summarizeExpiry(items) : null;
  const expiringText = expirySummary ? expiringHeadline(expirySummary) : null;
  // Stacked active / soon / expired bar under the header so a glance reads the
  // health of the whole share list, not just the soon count. Only shown when
  // there is something at risk (a soon or expired share) and >1 share exists.
  const bar = expirySummary && items && items.length > 1 ? expiryBar(expirySummary) : null;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Caregivers</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            People with read-only or limited access to your medications.
          </p>
          {expiringText && (
            <span
              className="inline-flex items-center gap-1.5 mt-2 capsule capsule-warn text-[11.5px]"
              title="Renew these shares before they lapse"
            >
              <Clock size={12} />
              {expiringText}
            </span>
          )}
        </div>
        <Link
          href="/caregivers/new"
          className="inline-flex items-center gap-1.5 h-8 px-3 text-sm font-medium rounded-md bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
        >
          <Plus size={14} />
          New share
        </Link>
      </header>

      {items && items.length > 0 && (
        <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Surface className="flex-1 min-w-[200px] flex items-center gap-2 px-3 py-1.5">
            <MagnifyingGlass size={16} className="text-[var(--ink-muted)] shrink-0" />
            <input
              ref={searchRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name or access"
              aria-label="Search caregivers"
              className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--ink-muted)]"
              autoComplete="off"
              spellCheck={false}
            />
            {query ? (
              <button
                type="button"
                onClick={() => { setQuery(''); searchRef.current?.focus(); }}
                className="text-[11px] text-[var(--ink-muted)] hover:text-[var(--ink)] shrink-0"
                aria-label="Clear search"
              >
                clear
              </button>
            ) : (
              <kbd className="capsule tabular text-[10px] shrink-0" aria-hidden>/</kbd>
            )}
          </Surface>
          {items.length > 1 && (
            <div className="flex items-center gap-1 shrink-0" role="group" aria-label="Sort caregivers">
              {CAREGIVER_SORTS.map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setSortBy(opt.key)}
                  aria-pressed={sortBy === opt.key}
                  className={`h-8 px-3 rounded-full text-[12px] font-medium border transition-colors ${
                    sortBy === opt.key
                      ? 'border-transparent bg-[var(--accent-soft)] text-[var(--accent-ink)]'
                      : 'border-[var(--line)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--bg-sunk)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
              <kbd
                className="capsule tabular text-[10px] shrink-0 hidden sm:inline-flex"
                title="Press s to cycle the sort"
                aria-hidden
              >
                s
              </kbd>
            </div>
          )}
          {filtered?.filtering ? (
            <span className="ml-auto text-[12px] text-[var(--ink-muted)]">
              {filtered.matchCount} of {filtered.total}
            </span>
          ) : sorted && sorted.neverViewedCount > 0 ? (
            <span className="ml-auto text-[12px] text-[var(--ink-muted)]">
              {sorted.neverViewedCount} never opened
            </span>
          ) : null}
        </div>
        {/* Active-sort caption — mirrors the medications list so the current
            ordering is legible at a glance, with a search match-count clause. */}
        {items.length > 1 && sorted && sorted.shares.length > 0 && (
          <p className="text-[12px] text-[var(--ink-muted)]" aria-live="polite">
            {caregiverSortCaption(sortBy)}
            {caregiverSortMatchClause(
              filtered?.total ?? items.length,
              sorted.shares.length,
              filtered?.filtering ?? false,
            )}
          </p>
        )}
        </div>
      )}

      {/* Stacked active / soon / expired bar — a glance read of how healthy the
          whole share list is. Only rendered when something is actually at risk
          so a tidy all-active list stays uncluttered. */}
      {bar && bar.hasRisk && (
        <div className="space-y-1.5">
          <div
            className="flex h-2 rounded-full overflow-hidden"
            style={{ background: 'var(--bg-sunk)' }}
            role="img"
            aria-label={`Share access: ${bar.segments.map((s) => s.label).join(', ')}`}
          >
            {bar.segments.map((seg) => (
              <div
                key={seg.kind}
                style={{
                  width: `${seg.pct}%`,
                  minWidth: seg.count > 0 ? '4px' : undefined,
                  background:
                    seg.tone === 'ok'
                      ? 'var(--ok)'
                      : seg.tone === 'warn'
                      ? 'var(--warn)'
                      : 'var(--danger)',
                }}
                title={seg.label}
              />
            ))}
          </div>
          <div className="flex items-center gap-3 flex-wrap text-[11px] text-[var(--ink-muted)]">
            {bar.segments.map((seg) => (
              <span key={seg.kind} className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{
                    background:
                      seg.tone === 'ok'
                        ? 'var(--ok)'
                        : seg.tone === 'warn'
                        ? 'var(--warn)'
                        : 'var(--danger)',
                  }}
                />
                {seg.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {items === null ? (
        <Surface><SkeletonRow /><SkeletonRow /></Surface>
      ) : items.length === 0 ? (
        <Empty
          icon={<Users size={32} weight="duotone" />}
          title="No caregivers yet"
          description="Share read-only access with a family member, doctor, or pharmacy."
          action={
            <Link href="/caregivers/new" className="text-sm text-brand-600 hover:underline">
              Create your first share
            </Link>
          }
        />
      ) : sorted && sorted.shares.length === 0 ? (
        <Empty
          icon={<MagnifyingGlass size={32} weight="duotone" />}
          title="Nothing matches"
          description={`No caregivers match "${query}".`}
          action={
            <button type="button" onClick={() => { setQuery(''); searchRef.current?.focus(); }} className="text-sm text-brand-600 hover:underline">
              Clear search
            </button>
          }
        />
      ) : (
        <Surface>
          <ul>
            {(sorted?.shares ?? items).map(c => {
              const expiry = expiryPill(c);
              return (
                <li key={c.id} className="border-b border-neutral-100 dark:border-neutral-900 last:border-0">
                  <Link href={`/caregivers/${c.id}`} className="flex items-center gap-3 p-3 hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors">
                    <div className="w-9 h-9 rounded-md bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
                      <Users size={18} weight="duotone" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{c.label}</div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                        {c.scopes.join(', ')}
                      </div>
                    </div>
                    <div className="text-right shrink-0 hidden sm:block">
                      {c.lastViewedAt ? (
                        <div className="text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-1 justify-end">
                          <Eye size={12} />
                          {formatDate(c.lastViewedAt)}
                        </div>
                      ) : (
                        <div className="text-xs text-neutral-400">Not viewed yet</div>
                      )}
                      <div className="text-[11px] text-neutral-400 flex items-center gap-1 justify-end mt-0.5">
                        <Clock size={11} />
                        {c.expiresAt ? `Expires ${formatDate(c.expiresAt)}` : 'No expiry'}
                      </div>
                    </div>
                    {/* Soon-to-expire shares get an amber day-count pill so the
                        list flags shares that need renewing before they lapse.
                        Expired -> danger, otherwise the plain Active pill. */}
                    {expiry.status === 'soon' && expiry.label ? (
                      <span title={expiryTooltip(c) ?? undefined} className="shrink-0">
                        <Pill tone="warn">{expiry.label}</Pill>
                      </span>
                    ) : expiry.status === 'expired' ? (
                      <Pill tone="danger">Expired</Pill>
                    ) : (
                      <Pill tone="ok">Active</Pill>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Surface>
      )}

      {error && items && <ErrorBox message={error} onRetry={load} />}
    </div>
  );
}
