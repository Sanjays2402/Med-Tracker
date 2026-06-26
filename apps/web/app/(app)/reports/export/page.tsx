'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, FileArrowDown, FileCsv, FilePdf, Calendar, Check } from '@med/icons';
import { Surface, Section, ErrorBox, Btn } from '../../../../components/uikit';
import { API_BASE_URL } from '@med/config';
import { listTodayDoses, listMedications, listSchedules } from '../../../../lib/data';
import {
  buildExportCards,
  type ExportFormat,
  type ExportCard,
  type ExportCounts,
} from '../../../../lib/export-formats';

const FORMAT_ICON: Record<ExportFormat, React.ReactNode> = {
  csv: <FileCsv size={20} weight="duotone" />,
  json: <FileArrowDown size={20} weight="duotone" />,
  ics: <Calendar size={20} weight="duotone" />,
  pdf: <FilePdf size={20} weight="duotone" />,
};

export default function ReportsExportPage() {
  const [selected, setSelected] = React.useState<ExportFormat>('csv');
  const [busy, setBusy] = React.useState<ExportFormat | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [counts, setCounts] = React.useState<ExportCounts | null>(null);

  // Pull record counts so the size estimate on each card reflects the real
  // export window. Non-fatal: the cards still render with a base estimate if
  // this can't load.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [doses, meds, schedules] = await Promise.all([
          listTodayDoses(),
          listMedications(),
          listSchedules(),
        ]);
        if (cancelled) return;
        // Project today's dose count across a ~90-day export window for the estimate.
        setCounts({
          doses: Math.max(doses.length * 90, doses.length),
          medications: meds.length,
          schedules: schedules.length,
        });
      } catch {
        if (!cancelled) setCounts({ doses: 0, medications: 0, schedules: 0 });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const cards = buildExportCards(counts ?? { doses: 0, medications: 0, schedules: 0 });
  const active = cards.find((c) => c.format === selected) ?? cards[0]!;

  async function download(card: ExportCard) {
    setBusy(card.format);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}${card.endpoint}`, { method: 'GET' });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `med-tracker.${card.extension}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not export.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <Link href="/reports" className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)]">
        <ArrowLeft size={14} />
        Reports
      </Link>

      <header>
        <div className="eyebrow">take your data with you</div>
        <h1 className="display text-[36px] leading-none tracking-tight mt-1">Export</h1>
        <p className="text-[13px] text-[var(--ink-muted)] mt-2">
          Pick a format. Estimated sizes reflect your last 90 days.
        </p>
      </header>

      {error && <ErrorBox message={error} />}

      <Section title="Choose a format">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {cards.map((card) => {
            const isSelected = card.format === selected;
            return (
              <button
                key={card.format}
                type="button"
                onClick={() => setSelected(card.format)}
                aria-pressed={isSelected}
                className="sheet text-left p-4 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                style={{
                  borderColor: isSelected ? 'var(--accent)' : 'var(--line)',
                  boxShadow: isSelected
                    ? '0 0 0 1px var(--accent), 0 8px 24px -16px color-mix(in srgb, var(--accent) 80%, transparent)'
                    : undefined,
                  background: isSelected ? 'color-mix(in srgb, var(--accent-soft) 36%, var(--bg-elev))' : undefined,
                }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-[var(--radius-capsule)] flex items-center justify-center shrink-0"
                    style={{
                      background: isSelected ? 'var(--accent-soft)' : 'var(--bg-sunk)',
                      color: isSelected ? 'var(--accent-ink)' : 'var(--ink-soft)',
                    }}
                  >
                    {FORMAT_ICON[card.format]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[14.5px] font-semibold">{card.label}</span>
                      <span className="capsule tabular text-[11px]">~{card.estimatedSize}</span>
                      {isSelected && (
                        <span
                          className="ml-auto inline-flex items-center justify-center w-5 h-5 rounded-full shrink-0"
                          style={{ background: 'var(--accent)', color: 'var(--bg-elev)' }}
                          aria-hidden
                        >
                          <Check size={12} />
                        </span>
                      )}
                    </div>
                    <p className="text-[12.5px] text-[var(--ink-soft)] mt-1 leading-snug">{card.summary}</p>
                    <p className="text-[11.5px] text-[var(--ink-muted)] mt-1.5">{card.bestFor}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      <Surface>
        <div className="p-4 flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[180px]">
            <div className="text-[13.5px] font-medium">
              Download as {active.label}
              <span className="text-[var(--ink-muted)] font-normal"> · .{active.extension}</span>
            </div>
            <div className="text-[12px] text-[var(--ink-muted)] mt-0.5">
              {counts === null ? 'Sizing your export…' : `About ${active.estimatedSize}. ${active.bestFor}.`}
            </div>
          </div>
          <Btn variant="primary" size="md" disabled={busy !== null} onClick={() => download(active)}>
            {busy === active.format ? (
              'Preparing…'
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <FileArrowDown size={15} /> Download {active.label}
              </span>
            )}
          </Btn>
        </div>
      </Surface>

      <p className="text-[12px] text-[var(--ink-muted)]">
        Files generate on the server against your account. If a download stalls, try again or pick a smaller window.
      </p>
    </div>
  );
}
