'use client';

import * as React from 'react';
import Link from 'next/link';
import { CalendarCheck, ArrowRight } from '@med/icons';
import { Surface, Empty } from '../../../components/uikit';

function lastNDays(n: number): { iso: string; label: string; weekday: string }[] {
  const out: { iso: string; label: string; weekday: string }[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.push({
      iso,
      label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
    });
  }
  return out;
}

export default function HistoryPage() {
  const days = React.useMemo(() => lastNDays(30), []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Browse past days to review what was taken or missed.
        </p>
      </header>

      {days.length === 0 ? (
        <Empty
          icon={<CalendarCheck size={32} weight="duotone" />}
          title="No history yet"
          description="Once you log doses, days appear here."
        />
      ) : (
        <Surface>
          <ul>
            {days.map((d, idx) => (
              <li key={d.iso} className="border-b border-neutral-100 dark:border-neutral-900 last:border-0">
                <Link
                  href={`/history/${d.iso}`}
                  className="flex items-center gap-3 p-3 hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors"
                >
                  <div className="w-9 h-9 rounded-md bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 flex flex-col items-center justify-center shrink-0">
                    <span className="text-[10px] uppercase tracking-wide leading-none">{d.weekday}</span>
                    <span className="text-xs font-medium leading-none mt-0.5">{d.label.split(' ')[1]}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{idx === 0 ? 'Today' : idx === 1 ? 'Yesterday' : `${d.weekday}, ${d.label}`}</div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">{d.iso}</div>
                  </div>
                  <ArrowRight size={16} className="text-neutral-400" />
                </Link>
              </li>
            ))}
          </ul>
        </Surface>
      )}
    </div>
  );
}
