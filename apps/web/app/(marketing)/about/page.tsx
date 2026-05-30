import Link from 'next/link';

export const metadata = {
  title: 'About. Med Tracker',
  description: 'Why Med Tracker exists and how it stays out of your way.',
};

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto px-5 py-16 space-y-10">
      <header>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">About</h1>
        <p className="mt-3 text-neutral-600 dark:text-neutral-400">
          Med Tracker started as a weekend tool for a family member on six daily medications. It grew because the existing apps either nagged constantly, locked features behind subscriptions, or sent data places it had no business going.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">What we care about</h2>
        <ul className="space-y-3 text-neutral-700 dark:text-neutral-300">
          <li className="flex gap-3">
            <span className="mt-2 w-1.5 h-1.5 rounded-full bg-brand-500 flex-shrink-0" />
            <span><strong className="font-medium">Calm by default.</strong> Reminders fire when they should. The rest of the time the app is silent.</span>
          </li>
          <li className="flex gap-3">
            <span className="mt-2 w-1.5 h-1.5 rounded-full bg-brand-500 flex-shrink-0" />
            <span><strong className="font-medium">Your data, your machine.</strong> Self host or use the hosted version. No third party trackers, no ad networks.</span>
          </li>
          <li className="flex gap-3">
            <span className="mt-2 w-1.5 h-1.5 rounded-full bg-brand-500 flex-shrink-0" />
            <span><strong className="font-medium">Real edge cases.</strong> Tapers, PRN caps, cold chain, weight based pediatric doses, and food windows. Built because someone needed them.</span>
          </li>
          <li className="flex gap-3">
            <span className="mt-2 w-1.5 h-1.5 rounded-full bg-brand-500 flex-shrink-0" />
            <span><strong className="font-medium">Open source.</strong> AGPL. Read the code. File issues. Send patches.</span>
          </li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">What we don&rsquo;t do</h2>
        <p className="text-neutral-600 dark:text-neutral-400">
          We don&rsquo;t give medical advice. We don&rsquo;t replace your pharmacist or doctor. We won&rsquo;t monetize your health data. We won&rsquo;t add a streak shaming mechanic.
        </p>
      </section>

      <div className="pt-4 flex items-center gap-3">
        <Link
          href="/dashboard"
          className="inline-flex text-sm font-medium px-4 py-2 rounded-md bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 transition-colors"
        >
          Open dashboard
        </Link>
        <Link
          href="/pricing"
          className="inline-flex text-sm font-medium px-4 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors"
        >
          See pricing
        </Link>
      </div>
    </div>
  );
}
