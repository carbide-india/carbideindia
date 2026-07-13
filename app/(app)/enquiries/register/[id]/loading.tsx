/**
 * Instant skeleton for the SM Workspace. Rendered by the Enquiries module shell
 * the moment a register row is clicked, so navigation feels immediate while the
 * server component streams in the real data. Mirrors the workspace's shape:
 * breadcrumb, header card + pipeline stepper + next-action bar, tab rail, and
 * the two Overview cards.
 */
function Block({ className = "" }: { className?: string }) {
  return <div className={`rounded-md bg-[#e6e8ef] ${className}`} />;
}

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1400px] animate-pulse">
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2">
        <Block className="h-4 w-32" />
        <Block className="h-4 w-16" />
      </div>

      {/* Header card */}
      <div className="rounded-2xl border border-hairline bg-surface-card p-6">
        <Block className="h-3 w-28" />
        <div className="mt-3 flex items-center gap-3">
          <Block className="h-8 w-40" />
          <Block className="h-6 w-20 rounded-full" />
        </div>
        <Block className="mt-3 h-4 w-80" />

        {/* Pipeline stepper */}
        <div className="mt-6 flex items-center gap-2 overflow-hidden">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <Block className="h-7 w-7 shrink-0 rounded-full" />
              <Block className="h-3 w-16" />
            </div>
          ))}
        </div>

        {/* Next-action bar */}
        <div className="mt-5 flex items-center justify-between rounded-xl border border-hairline bg-surface-soft p-4">
          <Block className="h-4 w-72" />
          <Block className="h-9 w-20 rounded-lg" />
        </div>
      </div>

      {/* Tab rail */}
      <div className="mt-6 flex flex-wrap gap-5 border-b border-hairline pb-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Block key={i} className="h-4 w-20" />
        ))}
      </div>

      {/* Overview cards */}
      <div className="mt-5 grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <div className="rounded-xl border border-hairline bg-surface-card p-5">
          <Block className="h-3 w-24" />
          <Block className="mt-3 h-5 w-48" />
          <Block className="mt-2 h-4 w-64" />
          <Block className="mt-4 h-9 w-36 rounded-lg" />
        </div>
        <div className="rounded-xl border border-hairline bg-surface-card p-5">
          <Block className="h-3 w-20" />
          <Block className="mt-3 h-4 w-40" />
          <Block className="mt-2 h-4 w-52" />
        </div>
      </div>
    </div>
  );
}
