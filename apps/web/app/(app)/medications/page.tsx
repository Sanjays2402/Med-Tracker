'use client';

import * as React from 'react';
import Link from 'next/link';
import { Pill as PillIcon, MagnifyingGlass } from '@med/icons';
import { Btn, Surface, Empty, ErrorBox, SkeletonRow, Pill } from '../../../components/uikit';
import { listMedications } from '../../../lib/data';
import type { Medication } from '../../../lib/types';
import { filterMedications, sortMedications, MED_SORTS, type MedSortKey } from '../../../lib/medication-sort';
import { runoutChip, remainingChip, buildSupplyBar, supplyBarAriaLabel, supplyBarColor, supplyLegendCounts } from '../../../lib/days-left-tone';
import { SupplySparkline } from '../../../components/SupplySparkline';
import {
  DENSITY_OPTIONS,
  DENSITY_STORAGE_KEY,
  DEFAULT_DENSITY,
  parseDensity,
  densityConfig,
  type Density,
} from '../../../lib/density-pref';
import { summarizeRunout, type RunoutBandMeta } from '../../../lib/runout-group';
import {
  RUNOUT_GROUP_STORAGE_KEY,
  DEFAULT_RUNOUT_GROUP,
  parseRunoutGroup,
  serializeRunoutGroup,
} from '../../../lib/runout-group-pref';
import {
  MED_SORT_STORAGE_KEY,
  DEFAULT_MED_SORT,
  parseMedSort,
  serializeMedSort,
} from '../../../lib/med-sort-pref';
import { medSortCaption, medSortMatchClause, runoutUrgentClause } from '../../../lib/med-sort-caption';
import { cycleMedSort } from '../../../lib/sort-cycle';

export default function MedicationsPage() {
  const [meds, setMeds] = React.useState<Medication[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  const [sortBy, setSortBy] = React.useState<MedSortKey>(DEFAULT_MED_SORT);
  const [density, setDensity] = React.useState<Density>(DEFAULT_DENSITY);
  const [grouped, setGrouped] = React.useState(DEFAULT_RUNOUT_GROUP);
  const searchRef = React.useRef<HTMLInputElement | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try { setMeds(await listMedications()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load medications.'); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  // Restore the persisted density on mount.
  React.useEffect(() => {
    try { setDensity(parseDensity(window.localStorage.getItem(DENSITY_STORAGE_KEY))); }
    catch { /* localStorage unavailable - keep the default */ }
  }, []);

  // Restore the persisted "group by run-out" choice on mount.
  React.useEffect(() => {
    try { setGrouped(parseRunoutGroup(window.localStorage.getItem(RUNOUT_GROUP_STORAGE_KEY))); }
    catch { /* localStorage unavailable - keep the default */ }
  }, []);

  // Restore the persisted sort choice on mount.
  React.useEffect(() => {
    try { setSortBy(parseMedSort(window.localStorage.getItem(MED_SORT_STORAGE_KEY))); }
    catch { /* localStorage unavailable - keep the default */ }
  }, []);

  const chooseSort = React.useCallback((next: MedSortKey) => {
    setSortBy(next);
    try { window.localStorage.setItem(MED_SORT_STORAGE_KEY, serializeMedSort(next)); }
    catch { /* best-effort persistence */ }
  }, []);

  const chooseDensity = React.useCallback((next: Density) => {
    setDensity(next);
    try { window.localStorage.setItem(DENSITY_STORAGE_KEY, JSON.stringify(next)); }
    catch { /* best-effort persistence */ }
  }, []);

  const toggleGrouped = React.useCallback(() => {
    setGrouped((prev) => {
      const next = !prev;
      try { window.localStorage.setItem(RUNOUT_GROUP_STORAGE_KEY, serializeRunoutGroup(next)); }
      catch { /* best-effort persistence */ }
      return next;
    });
  }, []);

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

  // "s" cycles the sort key (Name -> Lowest supply -> Soonest refill -> Name),
  // parallel to the reports window picker's keyboard cycling. Skipped while a
  // text field is focused or a modifier is held (so it never fights the browser
  // or the global g-then-s "go to schedule" leader, which carries no bare "s").
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== 's' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || t?.isContentEditable) return;
      e.preventDefault();
      chooseSort(cycleMedSort(sortBy));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sortBy, chooseSort]);

  if (error && !meds) return <ErrorBox message={error} onRetry={load} />;

  const visible = meds ? sortMedications(filterMedications(meds, query), sortBy) : [];
  const cfg = densityConfig(density);
  const runout = grouped ? summarizeRunout(visible) : null;
  // The inline supply bars are only rendered at this density AND only on rows
  // with supply data; show the colour key only when at least one bar is on
  // screen, so the legend never decodes bars that aren't there.
  const showSupplyLegend = cfg.showSupplyBar && visible.some((m) => buildSupplyBar(m).hasData);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="eyebrow">your pillbox</div>
          <h1 className="display text-[36px] leading-none tracking-tight mt-1">Medications</h1>
          <p className="text-[13px] text-[var(--ink-muted)] mt-2">
            {meds?.length ?? 0} on file{query && meds ? ` · ${visible.length} shown` : ''}
          </p>
        </div>
        <Link href="/medications/new"><Btn variant="primary">Add a medication</Btn></Link>
      </header>

      {/* Search + sort control row */}
      <div className="flex items-center gap-2 flex-wrap">
        <Surface className="flex-1 min-w-[200px] flex items-center gap-2 px-3 py-1.5">
          <MagnifyingGlass size={16} className="text-[var(--ink-muted)] shrink-0" />
          <input
            ref={searchRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search name, strength, or form"
            aria-label="Search medications"
            className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--ink-muted)]"
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); searchRef.current?.focus(); }}
              className="text-[11px] text-[var(--ink-muted)] hover:text-[var(--ink)] shrink-0"
              aria-label="Clear search"
            >
              clear
            </button>
          )}
          {!query && <kbd className="capsule tabular text-[10px] shrink-0" aria-hidden>/</kbd>}
        </Surface>
        <div className="flex items-center gap-1 shrink-0" role="group" aria-label="Sort medications">
          {MED_SORTS.map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={() => chooseSort(opt.key)}
              aria-pressed={sortBy === opt.key}
              className={`h-9 px-3 rounded-full text-[12px] font-medium border transition-colors ${
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
        <div
          className="flex items-center rounded-full border border-[var(--line)] p-0.5 shrink-0"
          role="group"
          aria-label="Row density"
        >
          {DENSITY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => chooseDensity(opt.value)}
              aria-pressed={density === opt.value}
              title={`${opt.label} rows`}
              className={`h-8 px-3 rounded-full text-[11.5px] font-medium transition-colors ${
                density === opt.value
                  ? 'bg-[var(--accent-soft)] text-[var(--accent-ink)]'
                  : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={toggleGrouped}
          aria-pressed={grouped}
          title="Group by run-out urgency"
          className={`h-9 px-3 rounded-full text-[12px] font-medium border transition-colors shrink-0 ${
            grouped
              ? 'border-transparent bg-[var(--accent-soft)] text-[var(--accent-ink)]'
              : 'border-[var(--line)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--bg-sunk)]'
          }`}
        >
          Group by run-out
        </button>
      </div>

      {/* Active-sort caption — makes the current ordering legible at a glance,
          and folds in the search match-count when a query is narrowing the list.
          When grouping by run-out, it also names how many rows need attention. */}
      {meds && visible.length > 0 && (
        <p className="-mt-2 text-[12px] text-[var(--ink-muted)]" aria-live="polite">
          {medSortCaption(sortBy, grouped)}
          {medSortMatchClause(meds.length, visible.length, query.trim().length > 0)}
          {runoutUrgentClause(grouped, runout?.urgentCount ?? 0)}
        </p>
      )}

      {meds === null ? (
        <Surface><SkeletonRow /><SkeletonRow /><SkeletonRow /></Surface>
      ) : visible.length === 0 ? (
        meds.length === 0 ? (
          <Empty
            icon={<PillIcon size={32} />}
            title="An empty pillbox"
            description="Add your first medication. Doses, refills, and reminders wire themselves up."
            action={<Link href="/medications/new"><Btn variant="primary" size="sm">Add a medication</Btn></Link>}
          />
        ) : (
          <Empty title="Nothing matches" description={`No medications match "${query}".`} />
        )
      ) : grouped ? (
        <div className="space-y-5">
          {runout!.groups.map(group => (
            <section key={group.meta.band} className="space-y-2">
              <div className="sticky top-2 z-10 flex items-center gap-2 px-1">
                <span className="eyebrow inline-flex items-center gap-1.5">
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ background: BAND_DOT[group.meta.tone] }}
                  />
                  {group.meta.label}
                </span>
                <span className="text-[11px] tabular text-[var(--ink-muted)]">{group.meds.length}</span>
                <span className="text-[11px] text-[var(--ink-muted)] hidden sm:inline normal-case">· {group.meta.hint}</span>
                <span className="flex-1 h-px" style={{ background: 'var(--line-soft)' }} />
              </div>
              <Surface>
                <ul>
                  {group.meds.map(m => (
                    <MedRow key={m.id} med={m} cfg={cfg} forceRunout />
                  ))}
                </ul>
              </Surface>
            </section>
          ))}
        </div>
      ) : (
        <Surface>
          <ul>
            {visible.map(m => (
              <MedRow key={m.id} med={m} cfg={cfg} forceRunout={sortBy === 'runout'} />
            ))}
          </ul>
        </Surface>
      )}

      {/* Supply-bar colour key — only when bars are actually on screen, so the
          ok/warn/danger swatches decode the tiny days-left runways below each row.
          Bands forwarded from supplyLegendCounts so the labels never drift from
          bars, and each swatch carries the count of visible meds in that band so
          the key also tallies the at-a-glance shape of the pillbox. */}
      {showSupplyLegend && (
        <div className="flex items-center gap-3 flex-wrap px-1 text-[11px] text-[var(--ink-muted)]" aria-label="Supply bar colour key">
          <span className="uppercase tracking-wide text-[10px]">Supply</span>
          {supplyLegendCounts(visible).map((e) => (
            <span key={e.tone} className="inline-flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: e.color }} aria-hidden />
              {e.label}
              <span className="tabular text-[10px] font-medium text-[var(--ink-soft)]" aria-label={`${e.count} in this band`}>
                · {e.count}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const BAND_DOT: Record<RunoutBandMeta['tone'], string> = {
  danger: 'var(--danger)',
  warn: 'var(--warn)',
  info: 'var(--accent)',
  ok: 'var(--ok)',
  neutral: 'var(--ink-muted)',
};

/**
 * One medication row. Shared by the flat list and the run-out grouped view.
 * `forceRunout` shows the "~Nd left" estimate chip (used when sorting by /
 * grouping by run-out); otherwise the row falls back to the raw doses-left chip.
 */
function MedRow({
  med: m,
  cfg,
  forceRunout,
}: {
  med: Medication;
  cfg: ReturnType<typeof densityConfig>;
  forceRunout: boolean;
}) {
  // Run-out chip toned by the SAME daysLeftTone bands the detail-hero supply bar
  // uses, so a med reads the same colour in the list and on its detail page.
  const chip = runoutChip(m);
  const restChip = remainingChip(m.remainingDoses);
  const supplyBar = cfg.showSupplyBar ? buildSupplyBar(m) : null;
  return (
    <li>
      <Link
        href={`/medications/${m.id}`}
        className={`flex items-center gap-3 ${cfg.rowPadding} border-b border-neutral-100 dark:border-neutral-900 last:border-0 hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors`}
      >
        <div
          className="rounded-md bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0"
          style={{ width: cfg.iconSize + 18, height: cfg.iconSize + 18 }}
        >
          <PillIcon size={cfg.iconSize} />
        </div>
        <div className="flex-1 min-w-0">
          <div className={`${cfg.nameClass} font-medium truncate`}>{m.name} {m.strength && <span className="text-neutral-500 font-normal">{m.strength}</span>}</div>
          {cfg.showSubline && (
            <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{m.schedule ?? 'No schedule'} {m.form ? `, ${m.form}` : ''}</div>
          )}
          {/* Inline supply bar — a tiny days-left runway, shown on small screens
              where the sm-only sparkline is hidden, so each row still carries a
              glanceable supply read. Reuses buildSupplyBar's pct + tone. */}
          {supplyBar?.hasData && (
            <div className={`${cfg.showSupplyBarSmUp ? '' : 'sm:hidden'} mt-1.5 flex items-center gap-1.5`} role="img" aria-label={supplyBarAriaLabel(supplyBar) ?? undefined}>
              <div className="h-1 flex-1 rounded-full overflow-hidden max-w-[120px]" style={{ background: 'var(--bg-sunk)' }} aria-hidden>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${supplyBar.pct}%`,
                    background: supplyBarColor(supplyBar.tone),
                  }}
                />
              </div>
              <span className="text-[10.5px] tabular text-[var(--ink-muted)]" aria-hidden>{supplyBar.daysLeft}d</span>
            </div>
          )}
        </div>
        {cfg.showSparkline && <SupplySparkline med={m} className="hidden sm:block shrink-0" />}
        {forceRunout && chip.label ? (
          <Pill tone={runoutPillTone(chip.tone)}>
            {chip.label}
          </Pill>
        ) : restChip.label && (
          <Pill tone={runoutPillTone(restChip.tone)}>
            {restChip.label}
          </Pill>
        )}
      </Link>
    </li>
  );
}

/** Map a DaysLeftTone onto the Pill tone vocabulary (neutral fallback). */
function runoutPillTone(tone: ReturnType<typeof runoutChip>['tone']): 'ok' | 'warn' | 'danger' | 'neutral' {
  return tone === 'neutral' ? 'neutral' : tone;
}
