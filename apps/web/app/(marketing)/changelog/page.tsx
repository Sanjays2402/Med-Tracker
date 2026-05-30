export const metadata = { title: 'Changelog. Med Tracker' };

const ENTRIES = [
  {
    date: '2026-05-29',
    title: 'Real marketing site and full dashboard wiring',
    items: [
      'New marketing landing, about, pricing, FAQ, contact, privacy, terms, and security pages.',
      'Dashboard, today, medications, schedule, and refills now read from the live API with seed fallback.',
      'Add medication form posts to the API and routes to the new record.',
    ],
  },
  {
    date: '2026-05-28',
    title: 'In memory store backs the API',
    items: [
      'Medications, doses, and refills persist for the lifetime of the API process.',
      'Pediatric weight based dose calculator with per dose and per day caps.',
      'Food window validation slides reminders to a compliant time.',
    ],
  },
  {
    date: '2026-05-27',
    title: 'Edge case features',
    items: [
      'Linear and exponential taper plan generator.',
      'FEFO lot ledger with expiry and recall impact.',
      'Caregiver shift handoff with PRN cap tracking.',
      'Cold chain potency budget with temperature derated excursions.',
    ],
  },
];

export default function ChangelogPage() {
  return (
    <div className="max-w-3xl mx-auto px-5 py-16">
      <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Changelog</h1>
      <p className="mt-3 text-neutral-600 dark:text-neutral-400">What shipped, in chronological order.</p>
      <ol className="mt-10 space-y-10">
        {ENTRIES.map(e => (
          <li key={e.date}>
            <div className="text-xs font-mono text-neutral-500">{e.date}</div>
            <h2 className="mt-1 font-semibold tracking-tight text-lg">{e.title}</h2>
            <ul className="mt-3 space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
              {e.items.map((it, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-2 w-1.5 h-1.5 rounded-full bg-brand-500 flex-shrink-0" />
                  <span>{it}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
