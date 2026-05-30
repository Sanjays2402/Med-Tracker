export const metadata = { title: 'Privacy. Med Tracker' };

export default function PrivacyPage() {
  return (
    <article className="max-w-3xl mx-auto px-5 py-16 prose prose-neutral dark:prose-invert">
      <h1>Privacy</h1>
      <p>Last updated: 2026-05-29.</p>
      <p>
        Med Tracker is built so you can keep control of your medication data. This page describes what the
        software collects, what we collect when you use the hosted version, and what we do with it.
      </p>

      <h2>What the software collects</h2>
      <p>
        When you run Med Tracker yourself, the app stores medications, schedules, doses, and refill records
        in the database you configure. Nothing is sent to us. Optional integrations like push notifications
        or pharmacy lookups only run when you enable them.
      </p>

      <h2>What the hosted version collects</h2>
      <ul>
        <li>Account info: email, display name, locale, time zone.</li>
        <li>Medication data: the records you create in the app.</li>
        <li>Usage logs: standard server logs with IP, user agent, request paths, and timing. Retained 30 days.</li>
        <li>Diagnostics: error reports if you opt in. No medication data is included.</li>
      </ul>

      <h2>What we do not do</h2>
      <ul>
        <li>We do not sell your data.</li>
        <li>We do not use your data to train AI models.</li>
        <li>We do not run third party ad trackers on app pages.</li>
        <li>We do not share medication data with insurers or employers.</li>
      </ul>

      <h2>Your rights</h2>
      <p>
        You can export your data from Settings, delete your account at any time, and request a copy of any
        logs associated with your account by writing to us at the contact address.
      </p>
    </article>
  );
}
