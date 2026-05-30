import Link from 'next/link';
import { Pill, Bell, Calendar, ChartBar, Flame, TrendingUp } from '@med/icons';

export const metadata = {
  title: 'Med Tracker. Medication adherence without the noise.',
  description:
    'Track doses, schedules, refills, and adherence in one calm dashboard. Open source and privacy first.',
};

const FEATURES = [
  {
    icon: Bell,
    title: 'Smart reminders',
    body: 'Time of day, food windows, and snooze logic built in. No more guessing whether you took the morning dose.',
  },
  {
    icon: Calendar,
    title: 'Real schedules',
    body: 'Daily, weekly, taper plans, and short courses. The schedule view shows the next two weeks at a glance.',
  },
  {
    icon: ChartBar,
    title: 'Refills that land on time',
    body: 'Days of supply, pharmacy details, and one click requests. Get reminded before you run out, not after.',
  },
  {
    icon: TrendingUp,
    title: 'Adherence you can read',
    body: 'Thirty day window, streaks, and trend direction. No vanity score, just what actually happened.',
  },
  {
    icon: Flame,
    title: 'Caregiver handoff',
    body: 'Share a read only view with family, a nurse, or a clinician. PRN caps and shift notes included.',
  },
  {
    icon: Pill,
    title: 'Interactions and pediatrics',
    body: 'Weight based dosing, cold chain potency, food timing, and an interaction checker. Built for real life.',
  },
];

export default function MarketingHome() {
  return (
    <div>
      <section className="px-5">
        <div className="max-w-3xl mx-auto pt-20 pb-16 text-center">
          <div className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1 rounded-full border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
            Open source, self hostable
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05]">
            Medication tracking
            <br />
            <span className="text-neutral-500 dark:text-neutral-500">without the noise.</span>
          </h1>
          <p className="mt-6 text-lg text-neutral-600 dark:text-neutral-400 max-w-xl mx-auto">
            Doses, schedules, refills, and adherence in one calm dashboard. Built for people on multiple meds and the caregivers who help them.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center text-sm font-medium px-4 py-2 rounded-md bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 transition-colors"
            >
              Open dashboard
            </Link>
            <Link
              href="/about"
              className="inline-flex items-center text-sm font-medium px-4 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors"
            >
              How it works
            </Link>
          </div>
        </div>

        <div className="max-w-5xl mx-auto">
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden bg-gradient-to-b from-neutral-50 to-white dark:from-neutral-900 dark:to-neutral-950 p-1.5 shadow-sm">
            <div className="rounded-lg bg-white dark:bg-neutral-950 p-6 grid sm:grid-cols-3 gap-3">
              <PreviewTile label="Today" value="5 / 7" hint="71% of doses taken" />
              <PreviewTile label="Adherence 30d" value="92%" hint="Trending up" />
              <PreviewTile label="Refills" value="2" hint="Needed this week" tone="warn" />
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 mt-24">
        <div className="max-w-5xl mx-auto">
          <div className="mb-10">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">Everything you need, nothing you don&rsquo;t.</h2>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400 max-w-2xl">
              A focused set of tools that cover the actual hard parts of staying on a medication plan.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {FEATURES.map(f => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-5 bg-white dark:bg-neutral-950 hover:border-neutral-300 dark:hover:border-neutral-700 transition-colors"
                >
                  <div className="w-9 h-9 rounded-md bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center mb-3">
                    <Icon size={18} />
                  </div>
                  <h3 className="font-medium tracking-tight">{f.title}</h3>
                  <p className="mt-1.5 text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">{f.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-5 mt-24 mb-12">
        <div className="max-w-3xl mx-auto rounded-xl border border-neutral-200 dark:border-neutral-800 p-8 sm:p-10 bg-neutral-50 dark:bg-neutral-900/50 text-center">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">Start in under a minute.</h2>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">No account needed for the local demo. Add your first medication and see the schedule fill in.</p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link
              href="/medications/new"
              className="inline-flex items-center text-sm font-medium px-4 py-2 rounded-md bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 transition-colors"
            >
              Add a medication
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center text-sm font-medium px-4 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 hover:bg-white dark:hover:bg-neutral-900 transition-colors"
            >
              Open dashboard
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function PreviewTile({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: 'warn' }) {
  return (
    <div className="rounded-md border border-neutral-100 dark:border-neutral-900 p-4">
      <div className="text-xs text-neutral-500 dark:text-neutral-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tracking-tight ${tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : ''}`}>{value}</div>
      <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{hint}</div>
    </div>
  );
}
