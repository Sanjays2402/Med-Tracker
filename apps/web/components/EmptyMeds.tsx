import Link from 'next/link';
import { Pill as PillIcon } from '@med/icons';

export function EmptyMeds() {
  return (
    <div className="sheet p-10 flex flex-col items-center text-center">
      <div
        className="mb-4 inline-flex items-center justify-center w-12 h-12 rounded-full"
        style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}
      >
        <PillIcon size={20} />
      </div>
      <div className="display text-[22px] leading-tight">An empty pillbox</div>
      <p className="mt-2 text-[13.5px] text-[var(--ink-muted)] max-w-sm">
        Add your first medication and the schedule, refills, and reminders
        wire themselves up.
      </p>
      <Link
        href="/medications/new"
        className="mt-5 inline-flex items-center text-[13px] font-medium px-4 py-2 rounded-full bg-[var(--ink)] text-[var(--bg)] hover:bg-[var(--ink-soft)] transition-colors"
      >
        Add a medication
      </Link>
    </div>
  );
}
