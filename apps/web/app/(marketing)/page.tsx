import Link from 'next/link';
import { Pill, Bell, Calendar, ChartBar, Flame, TrendingUp } from '@med/icons';
import { PillMark } from '../../components/uikit';

export const metadata = {
  title: 'Med Tracker. Your daily pillbox.',
  description:
    'A calm, clinical pillbox app. Doses, schedules, refills, and adherence in one place. Open source and privacy first.',
};

const FEATURES = [
  {
    icon: Bell,
    title: 'Reminders that respect you',
    body: 'Time of day, food windows, snooze logic. No nagging, no guilt. Just the right tap at the right minute.',
  },
  {
    icon: Calendar,
    title: 'Schedules that fit real life',
    body: 'Daily, weekly, tapers, short courses. The next fourteen days laid out the way a pharmacist would write it.',
  },
  {
    icon: ChartBar,
    title: 'Refills before the bottle is empty',
    body: 'Days of supply, pharmacy on file, one tap to request. Reminded the week before you run out.',
  },
  {
    icon: TrendingUp,
    title: 'Adherence you can actually read',
    body: 'Thirty day window. Streak. Trend. No vanity score. Just what happened, in plain numbers.',
  },
  {
    icon: Flame,
    title: 'Caregiver handoff',
    body: 'Share a read only view with family, a nurse, or a clinician. PRN caps and shift notes included.',
  },
  {
    icon: Pill,
    title: 'Interactions and pediatrics',
    body: 'Weight based dosing, food timing, cold chain potency, and an interaction checker. Built for real life.',
  },
];

export default function MarketingHome() {
  return (
    <div className="relative">
      <section className="px-5">
        <div className="max-w-3xl mx-auto pt-20 pb-16 text-center">
          <div
            className="inline-flex items-center gap-2 text-[12px] font-medium px-3 py-1.5 rounded-full mb-7"
            style={{ background: 'var(--bg-elev)', border: '1px solid var(--line)', color: 'var(--ink-soft)' }}
          >
            <PillMark />
            Open source. Self hostable. Privacy first.
          </div>
          <h1 className="display text-[44px] sm:text-[64px] md:text-[76px] leading-[0.96] tracking-tight">
            A calm pillbox
            <br />
            <span style={{ color: 'var(--ink-muted)' }}>for the meds that matter.</span>
          </h1>
          <p className="mt-7 text-[17px] text-[var(--ink-soft)] max-w-xl mx-auto leading-relaxed">
            Doses, schedules, refills, and adherence in one quiet dashboard.
            Built for people on multiple medications, and the caregivers who help them.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
            <Link
              href="/dashboard"
              className="inline-flex items-center text-[14px] font-medium px-5 py-2.5 rounded-full bg-[var(--ink)] text-[var(--bg)] hover:bg-[var(--ink-soft)] transition-colors"
            >
              Open the pillbox
            </Link>
            <Link
              href="/about"
              className="inline-flex items-center text-[14px] font-medium px-5 py-2.5 rounded-full text-[var(--ink)] hover:bg-[var(--bg-sunk)] transition-colors"
              style={{ border: '1px solid var(--line)' }}
            >
              How it works
            </Link>
          </div>
        </div>

        {/* Hero preview: a stylized day rail */}
        <div className="max-w-5xl mx-auto">
          <div className="sheet p-2">
            <div className="rounded-[calc(var(--radius-card)-6px)] p-6 sm:p-8" style={{ background: 'var(--bg)' }}>
              <div className="flex items-end justify-between gap-4 mb-6">
                <div>
                  <div className="eyebrow">Today's pillbox</div>
                  <div className="display text-[22px] sm:text-[26px] mt-1 leading-none">Metformin 500 mg up next</div>
                </div>
                <div className="text-right">
                  <div className="eyebrow">next dose</div>
                  <div className="display text-[26px] sm:text-[30px] leading-none tabular mt-1">in 42m</div>
                </div>
              </div>
              <FakeRail />
              <div className="mt-6 grid grid-cols-3 gap-3">
                <PreviewTile label="today" value="5/7" hint="71% logged" tone="warn" />
                <PreviewTile label="last 30 days" value="92%" hint="trending up" />
                <PreviewTile label="refills" value="2" hint="need filling" tone="warn" />
              </div>
            </div>
          </div>
          <div className="mt-3 text-center text-[11.5px] text-[var(--ink-muted)]">
            Demo data. Your day rail will look like this.
          </div>
        </div>
      </section>

      <section className="px-5 mt-28">
        <div className="max-w-5xl mx-auto">
          <div className="mb-10">
            <div className="eyebrow mb-2">what's inside</div>
            <h2 className="display text-[32px] sm:text-[44px] leading-tight tracking-tight max-w-2xl">
              Everything you need. None of the noise.
            </h2>
            <p className="mt-3 text-[15px] text-[var(--ink-soft)] max-w-2xl">
              A focused set of tools that cover the actual hard parts of staying on a medication plan.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="sheet p-6">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center mb-4"
                    style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}
                  >
                    <Icon size={18} />
                  </div>
                  <h3 className="display text-[19px] leading-tight tracking-tight">{f.title}</h3>
                  <p className="mt-2 text-[13.5px] text-[var(--ink-soft)] leading-relaxed">{f.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-5 mt-28 mb-16">
        <div
          className="max-w-3xl mx-auto sheet p-10 sm:p-12 text-center"
          style={{ background: 'var(--bg-elev)' }}
        >
          <PillMark size="lg" />
          <h2 className="display text-[30px] sm:text-[40px] leading-tight tracking-tight mt-5">
            Set up in under a minute.
          </h2>
          <p className="mt-3 text-[14.5px] text-[var(--ink-soft)] max-w-md mx-auto">
            No account for the local demo. Add a medication, watch the schedule fill itself.
          </p>
          <div className="mt-7 flex items-center justify-center gap-3 flex-wrap">
            <Link
              href="/medications/new"
              className="inline-flex items-center text-[14px] font-medium px-5 py-2.5 rounded-full bg-[var(--ink)] text-[var(--bg)] hover:bg-[var(--ink-soft)] transition-colors"
            >
              Add a medication
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center text-[14px] font-medium px-5 py-2.5 rounded-full text-[var(--ink)] hover:bg-[var(--bg-sunk)] transition-colors"
              style={{ border: '1px solid var(--line)' }}
            >
              Open the pillbox
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function PreviewTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: 'warn';
}) {
  return (
    <div className="sheet p-4">
      <div className="eyebrow">{label}</div>
      <div
        className="mt-1.5 display text-[26px] tabular leading-none"
        style={{ color: tone === 'warn' ? 'var(--warn)' : 'var(--ink)' }}
      >
        {value}
      </div>
      <div className="mt-1.5 text-[11.5px] text-[var(--ink-muted)]">{hint}</div>
    </div>
  );
}

/** A static decorative day-rail used on the marketing hero. */
function FakeRail() {
  // hours 6..24, sample 5 doses
  const doses = [
    { h: 7.5,  tone: 'ok' },
    { h: 10,   tone: 'ok' },
    { h: 13,   tone: 'warn' },
    { h: 18,   tone: 'warn' },
    { h: 21.5, tone: 'muted' },
  ] as const;
  const START = 6;
  const END = 24;
  const ticks = [6, 9, 12, 15, 18, 21, 24];
  const colors: Record<string, { bg: string; fg: string; ring: string }> = {
    ok:    { bg: 'var(--ok-bg)',    fg: 'var(--ok)',    ring: 'var(--ok)' },
    warn:  { bg: 'var(--warn-bg)',  fg: 'var(--warn)',  ring: 'var(--warn)' },
    muted: { bg: 'var(--bg-sunk)',  fg: 'var(--ink-muted)', ring: 'var(--line)' },
  };
  return (
    <div>
      <div
        className="relative h-14 rounded-full"
        style={{ background: 'var(--bg-sunk)', border: '1px solid var(--line-soft)' }}
      >
        {ticks.map((h) => (
          <div
            key={h}
            className="absolute top-0 bottom-0 w-px"
            style={{
              left: `${((h - START) / (END - START)) * 100}%`,
              background: 'var(--line)',
              opacity: 0.6,
            }}
          />
        ))}
        {/* now indicator at 14:30 */}
        <div
          className="absolute top-[-5px] bottom-[-5px] flex flex-col items-center"
          style={{ left: `${((14.5 - START) / (END - START)) * 100}%` }}
        >
          <div className="w-px flex-1" style={{ background: 'var(--accent)' }} />
          <div className="w-2 h-2 rounded-full -mt-1" style={{ background: 'var(--accent)' }} />
        </div>
        {doses.map((d, i) => {
          const c = colors[d.tone];
          if (!c) return null;
          return (
            <span
              key={i}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-8 px-3 rounded-full text-[11px] font-medium tabular inline-flex items-center gap-1.5"
              style={{
                left: `${((d.h - START) / (END - START)) * 100}%`,
                background: c.bg,
                color: c.fg,
                border: `1px solid ${c.ring}`,
              }}
            >
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: c.fg }} />
              {fmt(d.h)}
            </span>
          );
        })}
      </div>
      <div className="mt-2 relative h-4 text-[10.5px] text-[var(--ink-muted)] tabular">
        {ticks.map((h) => {
          const pct = ((h - START) / (END - START)) * 100;
          const label = h === 24 ? '12a' : h === 12 ? '12p' : h > 12 ? `${h - 12}p` : `${h}a`;
          return (
            <span key={h} className="absolute -translate-x-1/2" style={{ left: `${pct}%` }}>
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function fmt(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  const period = hh >= 12 ? 'p' : 'a';
  const display = hh % 12 === 0 ? 12 : hh % 12;
  return `${display}:${mm.toString().padStart(2, '0')}${period}`;
}
