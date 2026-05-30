import Link from 'next/link';

export const metadata = {
  title: 'Press · Med Tracker',
  description: 'Press kit, brand assets, and contact information for journalists writing about Med Tracker.',
};

export default function PressPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12 sm:py-20 space-y-10">
      <header className="space-y-2">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Press</h1>
        <p className="text-neutral-500 dark:text-neutral-400">
          Resources for journalists, researchers, and partners.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">About Med Tracker</h2>
        <p className="text-sm leading-relaxed">
          Med Tracker is an open source medication adherence platform. It helps patients,
          families, and caregivers manage daily medications, refills, and clinical handoffs
          without surrendering personal health data to ad networks. The codebase is public
          on GitHub and the data lives on infrastructure the user chooses.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Quick facts</h2>
        <ul className="text-sm space-y-1.5 list-disc list-inside text-neutral-700 dark:text-neutral-300">
          <li>Founded 2026, distributed team.</li>
          <li>License: MIT for the web and API, content under CC BY 4.0.</li>
          <li>Stack: Next.js, Fastify, TypeScript, Tailwind, Phosphor icons.</li>
          <li>No third party analytics in the default build.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Contact</h2>
        <p className="text-sm">
          For interviews or quotes, reach out via the{' '}
          <Link href="/contact" className="text-brand-600 hover:underline">contact form</Link>{' '}
          and mention <span className="font-medium">press</span>. We respond within two business days.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Brand assets</h2>
        <ul className="text-sm space-y-1.5">
          <li><a className="text-brand-600 hover:underline" href="https://github.com/Sanjays2402/Med-Tracker" target="_blank" rel="noreferrer">Logo and wordmark on GitHub</a></li>
          <li><Link className="text-brand-600 hover:underline" href="/security">Security overview</Link></li>
          <li><Link className="text-brand-600 hover:underline" href="/changelog">Release notes</Link></li>
        </ul>
      </section>
    </div>
  );
}
