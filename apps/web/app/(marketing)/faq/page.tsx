export const metadata = { title: 'FAQ. Med Tracker' };

const QA = [
  {
    q: 'Is my data sent anywhere?',
    a: 'In the local demo, no. The web app talks to a REST API you control. If you use the hosted version, data lives in our database and is never sold or used for training.',
  },
  {
    q: 'Does this replace my doctor or pharmacist?',
    a: 'No. Med Tracker is a logging and reminder tool. It does not provide medical advice. Talk to a clinician about your medications.',
  },
  {
    q: 'Can I use it for a family member?',
    a: 'Yes. The caregivers feature lets you share a read only view of a patient with another person, including PRN caps and shift notes.',
  },
  {
    q: 'What about controlled substances?',
    a: 'You can log them like anything else. The PRN cap and refill ledger features were built with controlled substance workflows in mind.',
  },
  {
    q: 'Does it work offline?',
    a: 'The web app loads with the last known state and queues dose logs locally. They sync when you regain connectivity.',
  },
  {
    q: 'How do I self host?',
    a: 'Clone the repo, run docker compose up, and you have an API and web app running locally. See docs in the repository for production setup.',
  },
];

export default function FAQPage() {
  return (
    <div className="max-w-3xl mx-auto px-5 py-16">
      <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Frequently asked</h1>
      <p className="mt-3 text-neutral-600 dark:text-neutral-400">If your question is not here, send it to us.</p>
      <div className="mt-10 divide-y divide-neutral-200 dark:divide-neutral-800 border-y border-neutral-200 dark:border-neutral-800">
        {QA.map((item, i) => (
          <details key={i} className="group py-4">
            <summary className="cursor-pointer list-none flex items-center justify-between gap-4 font-medium tracking-tight">
              {item.q}
              <span className="text-neutral-400 group-open:rotate-45 transition-transform text-xl leading-none">+</span>
            </summary>
            <p className="mt-3 text-neutral-600 dark:text-neutral-400 leading-relaxed">{item.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
