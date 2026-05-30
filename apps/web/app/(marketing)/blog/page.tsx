import Link from 'next/link';
import { ArrowRight } from '@med/icons';

export const metadata = {
  title: 'Blog · Med Tracker',
  description: 'Notes from the team behind Med Tracker on adherence, tooling, and open source.',
};

interface Post { slug: string; title: string; date: string; excerpt: string; tag: string; }

const POSTS: Post[] = [
  {
    slug: 'why-we-built-med-tracker',
    title: 'Why we built Med Tracker',
    date: '2026-05-12',
    excerpt: 'A short note on the gap between pill reminders and real medication adherence, and what we wanted to fix.',
    tag: 'Product',
  },
  {
    slug: 'open-source-from-day-one',
    title: 'Open source from day one',
    date: '2026-05-05',
    excerpt: 'How keeping the codebase public changes the tradeoffs we make on privacy, telemetry, and trust.',
    tag: 'Engineering',
  },
  {
    slug: 'adherence-vs-compliance',
    title: 'Adherence is not compliance',
    date: '2026-04-22',
    excerpt: 'Compliance puts the burden on the patient. Adherence asks what gets in the way, and removes it.',
    tag: 'Research',
  },
  {
    slug: 'pediatric-dosing-calculator',
    title: 'Inside the pediatric dosing calculator',
    date: '2026-04-08',
    excerpt: 'Per-dose and per-day caps, weight bands, and the unit tests that keep us honest.',
    tag: 'Engineering',
  },
];

export default function BlogIndex() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12 sm:py-20 space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Blog</h1>
        <p className="text-neutral-500 dark:text-neutral-400">
          Notes from the team on what we are building and why.
        </p>
      </header>

      <ul className="divide-y divide-neutral-100 dark:divide-neutral-900 border-y border-neutral-100 dark:border-neutral-900">
        {POSTS.map(p => (
          <li key={p.slug}>
            <Link href={`/blog/${p.slug}`} className="group flex items-start gap-4 py-6 hover:bg-neutral-50 dark:hover:bg-neutral-900/40 -mx-4 px-4 rounded-md transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400 mb-1.5">
                  <span>{new Date(p.date).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>
                  <span>·</span>
                  <span className="uppercase tracking-wide">{p.tag}</span>
                </div>
                <h2 className="text-lg font-medium group-hover:underline">{p.title}</h2>
                <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">{p.excerpt}</p>
              </div>
              <ArrowRight size={16} className="text-neutral-300 group-hover:text-neutral-600 dark:group-hover:text-neutral-300 mt-2 shrink-0" />
            </Link>
          </li>
        ))}
      </ul>

      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Want to write here? Open a PR against <code className="font-mono">content/blog</code> on GitHub.
      </p>
    </div>
  );
}
