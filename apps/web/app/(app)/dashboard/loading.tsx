export default function Loading() {
  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="h-7 w-48 rounded bg-neutral-100 dark:bg-neutral-900 animate-pulse" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-950/60 animate-pulse" />
        ))}
      </div>
      <div className="h-48 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-950/60 animate-pulse" />
    </div>
  );
}
