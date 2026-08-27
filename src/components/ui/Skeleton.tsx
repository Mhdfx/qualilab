/**
 * Route-level skeletons: what a space looks like while the server renders
 * it. Every dashboard shares the same anatomy — banner, stat tiles, a list
 * card — so one composite covers all of them and navigation feels
 * instantaneous instead of frozen (content appears in place, no layout
 * shift when the real page streams in).
 */

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-slate-200/70 ${className}`}
      aria-hidden="true"
    />
  );
}

export function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Chargement de la page">
      {/* PageHeader banner */}
      <div className="page-header mb-8">
        <Skeleton className="h-3 w-24 bg-white/20" />
        <Skeleton className="mt-3 h-7 w-64 bg-white/25" />
        <Skeleton className="mt-3 h-3 w-96 max-w-full bg-white/15" />
      </div>

      {/* Stat tiles */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm"
          >
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-8 w-16" />
          </div>
        ))}
      </div>

      {/* List card */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <Skeleton className="h-4 w-48" />
        <div className="mt-5 space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex items-center gap-4">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
