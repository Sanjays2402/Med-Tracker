export default function Loading() {
  return (
    <div className="space-y-4 p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="h-7 w-32 rounded bg-neutral-100 dark:bg-neutral-900 animate-pulse" />
      <div className="h-3 w-48 rounded bg-neutral-100 dark:bg-neutral-900 animate-pulse" />
      <div className="space-y-2 pt-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-14 rounded-lg border border-neutral-200 dark:border-neutral-800 animate-pulse" />
        ))}
      </div>
    </div>
  );
}
