'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, FileArrowDown, FileCsv, FilePdf, Calendar } from '@med/icons';
import { Surface, Section, ErrorBox } from '../../../../components/uikit';
import { API_BASE_URL } from '@med/config';

type Format = 'csv' | 'json' | 'ics' | 'pdf';

interface Item {
  format: Format;
  label: string;
  desc: string;
  endpoint: string;
  icon: React.ReactNode;
}

const ITEMS: Item[] = [
  { format: 'csv', label: 'CSV', desc: 'Spreadsheet of dose events for the last 90 days.', endpoint: '/reports/export/csv', icon: <FileCsv size={18} weight="duotone" /> },
  { format: 'json', label: 'JSON', desc: 'Raw JSON of medications, schedules, and doses.', endpoint: '/reports/export/json', icon: <FileArrowDown size={18} weight="duotone" /> },
  { format: 'ics', label: 'Calendar (ICS)', desc: 'Subscribe in Google Calendar, Apple Calendar, or Outlook.', endpoint: '/reports/export/ics', icon: <Calendar size={18} weight="duotone" /> },
  { format: 'pdf', label: 'PDF report', desc: 'Printable adherence summary for your clinician.', endpoint: '/reports/export/pdf', icon: <FilePdf size={18} weight="duotone" /> },
];

export default function ReportsExportPage() {
  const [busy, setBusy] = React.useState<Format | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function download(item: Item) {
    setBusy(item.format);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}${item.endpoint}`, { method: 'GET' });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `med-tracker.${item.format}`;
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
      <Link href="/reports" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
        <ArrowLeft size={14} />
        Reports
      </Link>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Export</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Take your data with you. All exports happen against your account.
        </p>
      </header>

      {error && <ErrorBox message={error} />}

      <Section title="Choose a format">
        <Surface>
          <ul>
            {ITEMS.map(item => (
              <li key={item.format} className="border-b border-neutral-100 dark:border-neutral-900 last:border-0">
                <button
                  type="button"
                  onClick={() => download(item)}
                  disabled={busy !== null}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors disabled:opacity-60"
                >
                  <div className="w-9 h-9 rounded-md bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
                    {item.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{item.label}</div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">{item.desc}</div>
                  </div>
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                    {busy === item.format ? 'Preparing...' : 'Download'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Surface>
      </Section>

      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Files generate on the server. If a download stalls, try again or pick a smaller window.
      </p>
    </div>
  );
}
