export const metadata = { title: 'Terms. Med Tracker' };

export default function TermsPage() {
  return (
    <article className="max-w-3xl mx-auto px-5 py-16 prose prose-neutral dark:prose-invert">
      <h1>Terms</h1>
      <p>Last updated: 2026-05-29.</p>

      <h2>The short version</h2>
      <p>
        Med Tracker is a logging and reminder tool. It is not a medical device, and it does not provide
        medical advice. Always talk to a licensed clinician about your medications. Use the software in good
        faith and do not abuse the hosted service.
      </p>

      <h2>Software license</h2>
      <p>
        The Med Tracker codebase is released under the GNU Affero General Public License, version 3. You can
        read, modify, and self host it. If you offer Med Tracker as a network service, your modifications
        must be made available under the same license.
      </p>

      <h2>Hosted service</h2>
      <p>
        Hosted accounts are provided as is, without warranty. We may suspend accounts that abuse the service,
        attempt to extract data they do not own, or use it to harass other users. We will give you reasonable
        notice and an opportunity to export your data unless the abuse is severe.
      </p>

      <h2>Not medical advice</h2>
      <p>
        Nothing in this app or its documentation constitutes medical advice, diagnosis, or treatment. Do not
        delay seeking care because of something you read here.
      </p>

      <h2>Liability</h2>
      <p>
        To the extent allowed by law, Med Tracker and its contributors are not liable for indirect or
        consequential damages. Our total liability for the hosted service is capped at fees paid in the last
        twelve months.
      </p>
    </article>
  );
}
