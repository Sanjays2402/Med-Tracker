import Link from 'next/link';
import { Check } from '@med/icons';

export const metadata = {
  title: 'Pricing. Med Tracker',
  description: 'Free to self host. Hosted plans for individuals, families, and clinics.',
};

const TIERS = [
  {
    name: 'Self host',
    price: 'Free',
    cadence: 'forever',
    description: 'Run it on your own machine or server. AGPL licensed.',
    cta: { label: 'View on GitHub', href: 'https://github.com/Sanjays2402/Med-Tracker' },
    features: [
      'Every feature, unrestricted',
      'Local storage or your own database',
      'Bring your own notifications',
      'Community support',
    ],
  },
  {
    name: 'Personal',
    price: '$0',
    cadence: 'while in beta',
    description: 'For individuals tracking their own medications.',
    cta: { label: 'Open dashboard', href: '/dashboard' },
    highlight: true,
    features: [
      'Up to 25 active medications',
      'Push notifications on web and mobile',
      'Caregiver share links',
      'Email support',
    ],
  },
  {
    name: 'Clinic',
    price: 'Contact',
    cadence: 'per patient',
    description: 'For practices managing adherence across a panel.',
    cta: { label: 'Talk to us', href: '/contact' },
    features: [
      'Multi patient dashboard',
      'Audit log and export',
      'SSO and role based access',
      'SLA and onboarding',
    ],
  },
];

export default function PricingPage() {
  return (
    <div className="max-w-5xl mx-auto px-5 py-16">
      <header className="text-center max-w-2xl mx-auto">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Simple pricing.</h1>
        <p className="mt-3 text-neutral-600 dark:text-neutral-400">
          Free forever if you self host. Hosted plans cover the running costs without locking up features.
        </p>
      </header>

      <div className="mt-12 grid md:grid-cols-3 gap-4">
        {TIERS.map(tier => (
          <div
            key={tier.name}
            className={`rounded-xl border p-6 flex flex-col ${
              tier.highlight
                ? 'border-brand-500/40 bg-brand-500/5 dark:bg-brand-500/10'
                : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950'
            }`}
          >
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold tracking-tight">{tier.name}</h2>
              {tier.highlight && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-brand-500/15 text-brand-700 dark:text-brand-300">
                  Most common
                </span>
              )}
            </div>
            <div className="mt-4">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-semibold tracking-tight">{tier.price}</span>
                <span className="text-sm text-neutral-500">{tier.cadence}</span>
              </div>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{tier.description}</p>
            </div>
            <ul className="mt-6 space-y-2 text-sm flex-1">
              {tier.features.map(f => (
                <li key={f} className="flex gap-2 text-neutral-700 dark:text-neutral-300">
                  <Check size={16} className="mt-0.5 flex-shrink-0 text-brand-500" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Link
              href={tier.cta.href}
              className={`mt-6 inline-flex items-center justify-center text-sm font-medium px-3 py-2 rounded-md transition-colors ${
                tier.highlight
                  ? 'bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200'
                  : 'border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-900'
              }`}
            >
              {tier.cta.label}
            </Link>
          </div>
        ))}
      </div>

      <p className="mt-12 text-center text-sm text-neutral-500">
        Questions about a plan? <Link href="/contact" className="underline hover:text-neutral-900 dark:hover:text-neutral-100">Get in touch</Link>.
      </p>
    </div>
  );
}
