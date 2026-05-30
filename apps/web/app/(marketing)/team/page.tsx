import Link from 'next/link';
import { User } from '@med/icons';

export const metadata = {
  title: 'Team · Med Tracker',
  description: 'The people building Med Tracker.',
};

interface Member { name: string; role: string; bio: string; }

const TEAM: Member[] = [
  { name: 'Engineering', role: 'Web, API, mobile', bio: 'Builds and maintains the product across web, API, iOS, and Android.' },
  { name: 'Clinical advisors', role: 'Pharmacists and physicians', bio: 'Reviews dosing logic, interaction data, and adherence patterns.' },
  { name: 'Community', role: 'Open source contributors', bio: 'Everyone who has filed an issue, opened a PR, or shipped a fix.' },
];

export default function TeamPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12 sm:py-20 space-y-10">
      <header className="space-y-2">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Team</h1>
        <p className="text-neutral-500 dark:text-neutral-400">
          A small group with a clear mandate: make medications easier to manage.
        </p>
      </header>

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {TEAM.map(m => (
          <li key={m.name} className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-md bg-brand-500/10 text-brand-600 dark:text-brand-400 flex items-center justify-center">
                <User size={20} weight="duotone" />
              </div>
              <div>
                <div className="text-sm font-medium">{m.name}</div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">{m.role}</div>
              </div>
            </div>
            <p className="text-sm text-neutral-700 dark:text-neutral-300">{m.bio}</p>
          </li>
        ))}
      </ul>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Join us</h2>
        <p className="text-sm">
          We are not actively hiring full time. If you want to contribute, the fastest path is
          opening a PR on <a href="https://github.com/Sanjays2402/Med-Tracker" target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">GitHub</a> or
          starting a conversation on the <Link href="/contact" className="text-brand-600 hover:underline">contact page</Link>.
        </p>
      </section>
    </div>
  );
}
