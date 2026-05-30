'use client';

import * as React from 'react';
import Link from 'next/link';
import { MagnifyingGlass, Pill as PillIcon, Info } from '@med/icons';
import { Btn, Surface, Empty, ErrorBox, SkeletonRow, Pill, Section } from '../../../components/uikit';
import { identifyPills } from '../../../lib/data';
import type { PillIdentifyResponse, PillShape, PillColor, PillQuery } from '../../../lib/types';

const SHAPES: PillShape[] = ['round', 'oval', 'oblong', 'capsule', 'triangle', 'square', 'rectangle', 'diamond', 'pentagon', 'hexagon', 'other'];
const COLORS: PillColor[] = ['white', 'off-white', 'yellow', 'orange', 'red', 'pink', 'purple', 'blue', 'green', 'brown', 'gray', 'black', 'clear'];

const COLOR_SWATCH: Record<PillColor, string> = {
  white: 'bg-white border-neutral-300',
  'off-white': 'bg-amber-50 border-amber-200',
  yellow: 'bg-yellow-300 border-yellow-400',
  orange: 'bg-orange-400 border-orange-500',
  red: 'bg-red-500 border-red-600',
  pink: 'bg-pink-300 border-pink-400',
  purple: 'bg-purple-500 border-purple-600',
  blue: 'bg-blue-500 border-blue-600',
  green: 'bg-green-500 border-green-600',
  brown: 'bg-amber-800 border-amber-900',
  gray: 'bg-neutral-400 border-neutral-500',
  black: 'bg-neutral-900 border-neutral-950',
  clear: 'bg-transparent border-neutral-400 border-dashed',
};

export default function PillsPage() {
  const [imprint, setImprint] = React.useState('');
  const [shape, setShape] = React.useState<PillShape | ''>('');
  const [colors, setColors] = React.useState<PillColor[]>([]);
  const [scored, setScored] = React.useState<'yes' | 'no' | ''>('');
  const [sizeMm, setSizeMm] = React.useState('');

  const [result, setResult] = React.useState<PillIdentifyResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  const hasInput =
    imprint.trim().length > 0 ||
    shape !== '' ||
    colors.length > 0 ||
    scored !== '' ||
    sizeMm.trim().length > 0;

  function toggleColor(c: PillColor) {
    setColors(prev => prev.includes(c) ? prev.filter(x => x !== c) : prev.length >= 4 ? prev : [...prev, c]);
  }

  function reset() {
    setImprint(''); setShape(''); setColors([]); setScored(''); setSizeMm('');
    setResult(null); setError(null); setSubmitted(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hasInput) return;
    setBusy(true);
    setError(null);
    setSubmitted(true);
    const q: PillQuery = {};
    if (imprint.trim()) q.imprint = imprint.trim();
    if (shape) q.shape = shape;
    if (colors.length) q.colors = colors;
    if (scored) q.scored = scored === 'yes';
    if (sizeMm.trim()) {
      const n = Number(sizeMm);
      if (!Number.isNaN(n) && n > 0) q.sizeMm = n;
    }
    try {
      setResult(await identifyPills(q));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not search.');
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pill identifier</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Match a loose pill against the catalog using imprint, shape, color, size, or score.
          </p>
        </div>
        <Link href="/pills/catalog" className="text-sm text-brand-600 dark:text-brand-400 hover:underline">
          Browse catalog
        </Link>
      </header>

      <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
        <Surface className="p-4 space-y-5 h-fit">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400" htmlFor="imprint">
              Imprint
            </label>
            <input
              id="imprint"
              value={imprint}
              onChange={e => setImprint(e.target.value)}
              placeholder="e.g. M367"
              maxLength={64}
              className="w-full h-9 px-2.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
            <p className="text-[11px] text-neutral-500">Case and spacing are normalized.</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400" htmlFor="shape">Shape</label>
            <select
              id="shape"
              value={shape}
              onChange={e => setShape(e.target.value as PillShape | '')}
              className="w-full h-9 px-2 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950"
            >
              <option value="">Any</option>
              {SHAPES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">Colors</span>
              <span className="text-[11px] text-neutral-500">{colors.length}/4</span>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {COLORS.map(c => {
                const on = colors.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleColor(c)}
                    aria-pressed={on}
                    title={c}
                    className={`h-7 w-7 rounded-full border ${COLOR_SWATCH[c]} ring-offset-2 ring-offset-white dark:ring-offset-neutral-950 transition ${on ? 'ring-2 ring-brand-500' : ''}`}
                  />
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400" htmlFor="scored">Scored</label>
              <select
                id="scored"
                value={scored}
                onChange={e => setScored(e.target.value as 'yes' | 'no' | '')}
                className="w-full h-9 px-2 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950"
              >
                <option value="">Any</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400" htmlFor="size">Size (mm)</label>
              <input
                id="size"
                type="number"
                min={0}
                max={50}
                step={0.1}
                value={sizeMm}
                onChange={e => setSizeMm(e.target.value)}
                placeholder="e.g. 12"
                className="w-full h-9 px-2.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Btn type="submit" variant="primary" disabled={!hasInput || busy}>
              <MagnifyingGlass size={14} />
              {busy ? 'Searching' : 'Identify'}
            </Btn>
            <Btn type="button" onClick={reset} disabled={busy}>Clear</Btn>
          </div>
        </Surface>

        <div className="space-y-4">
          {busy && (
            <Surface><SkeletonRow /><SkeletonRow /><SkeletonRow /></Surface>
          )}

          {!busy && error && <ErrorBox message={error} />}

          {!busy && !error && !submitted && (
            <Empty
              icon={<Info size={32} />}
              title="Describe the pill"
              description="Add an imprint or any visible attribute, then run identify."
            />
          )}

          {!busy && !error && submitted && result && result.matches.length === 0 && (
            <Empty
              icon={<MagnifyingGlass size={32} />}
              title="No matches"
              description={`Searched ${result.catalogSize} catalog entries. Try fewer attributes or a different imprint.`}
            />
          )}

          {!busy && !error && result && result.matches.length > 0 && (
            <Section
              title={`${result.count} match${result.count === 1 ? '' : 'es'}`}
              action={<span className="text-xs text-neutral-500">of {result.catalogSize} entries</span>}
            >
              <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {result.matches.map(m => (
                  <li key={m.descriptor.id} className="p-4 flex items-start gap-3">
                    <span className="mt-0.5 inline-flex items-center justify-center w-8 h-8 rounded-md bg-brand-500/10 text-brand-600 dark:text-brand-400">
                      <PillIcon size={18} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/pills/catalog/${encodeURIComponent(m.descriptor.id)}`}
                          className="font-medium hover:underline truncate"
                        >
                          {m.descriptor.name}
                        </Link>
                        <Pill tone={m.score >= 0.7 ? 'ok' : m.score >= 0.4 ? 'info' : 'neutral'}>
                          {(m.score * 100).toFixed(0)}% match
                        </Pill>
                      </div>
                      <div className="text-xs text-neutral-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                        {m.descriptor.imprint && <span>imprint {m.descriptor.imprint}</span>}
                        {m.descriptor.shape && <span>{m.descriptor.shape}</span>}
                        {m.descriptor.colors?.length ? <span>{m.descriptor.colors.join(' / ')}</span> : null}
                        {m.descriptor.sizeMm ? <span>{m.descriptor.sizeMm} mm</span> : null}
                        {m.descriptor.scored ? <span>scored</span> : null}
                      </div>
                      {m.reasons.length > 0 && (
                        <p className="text-xs text-neutral-500 mt-1 truncate">{m.reasons.join(' · ')}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </form>
    </div>
  );
}
