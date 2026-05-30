export const metadata = { title: 'Security. Med Tracker' };

export default function SecurityPage() {
  return (
    <article className="max-w-3xl mx-auto px-5 py-16 prose prose-neutral dark:prose-invert">
      <h1>Security</h1>
      <p>
        Health adjacent data deserves serious handling. Here is how Med Tracker approaches it and how to
        report a vulnerability.
      </p>

      <h2>How the app is built</h2>
      <ul>
        <li>Data in transit uses TLS 1.2 or newer.</li>
        <li>Passwords are hashed with argon2id.</li>
        <li>Session tokens are short lived and rotated on privilege change.</li>
        <li>Authorization checks are enforced at the API layer, not the UI.</li>
        <li>Dependencies are tracked with Renovate and audited weekly.</li>
      </ul>

      <h2>Hosted environment</h2>
      <ul>
        <li>Production data is encrypted at rest.</li>
        <li>Backups run daily and are retained for 30 days, also encrypted.</li>
        <li>Access to production is limited to on call engineers and logged.</li>
        <li>We do not run third party analytics or session replay on app pages.</li>
      </ul>

      <h2>Report a vulnerability</h2>
      <p>
        Email <a href="mailto:security@medtracker.app">security@medtracker.app</a> with a description and
        reproduction steps. We will acknowledge within two business days and keep you updated. Please give us
        a reasonable window to fix the issue before public disclosure.
      </p>
    </article>
  );
}
