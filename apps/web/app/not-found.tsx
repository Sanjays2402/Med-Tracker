import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center">
      <div className="text-6xl font-semibold text-neutral-300 dark:text-neutral-700">404</div>
      <h1 className="mt-3 text-lg font-medium">Page not found</h1>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">The page you are looking for does not exist.</p>
      <Link
        href="/dashboard"
        className="mt-5 inline-flex h-8 items-center px-3 rounded-md bg-neutral-900 text-white text-sm dark:bg-neutral-100 dark:text-neutral-900"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
