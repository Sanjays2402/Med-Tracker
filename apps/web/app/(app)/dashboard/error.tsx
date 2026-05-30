'use client';

export default function Error({ error, reset }: { error: Error; reset?: () => void }) {
  return (
    <div className="p-8">
      <div className="text-sm text-red-600 dark:text-red-400">Something went wrong: {error.message}</div>
      {reset && (
        <button onClick={reset} className="mt-3 h-8 px-3 text-sm rounded-md border border-neutral-200 dark:border-neutral-800">
          Try again
        </button>
      )}
    </div>
  );
}
