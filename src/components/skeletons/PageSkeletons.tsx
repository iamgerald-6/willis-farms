/** Reusable skeleton placeholders for page-level loading states. */

function Bone({ className = "" }: { className?: string }) {
  return <div className={`bg-gray-100 animate-pulse rounded ${className}`} />;
}

export function PageShell({ children }: { children: React.ReactNode }) {
  return <div className="p-4 md:p-6 max-w-6xl mx-auto">{children}</div>;
}

export function PageHeaderSkeleton({ subtitle = true }: { subtitle?: boolean }) {
  return (
    <div className="mb-6 space-y-2">
      <Bone className="h-8 w-48 sm:w-64" />
      {subtitle && <Bone className="h-4 w-full max-w-md" />}
    </div>
  );
}

export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-4"
        >
          <Bone className="w-10 h-10 rounded-xl shrink-0" />
          <div className="flex-1 space-y-2">
            <Bone className="h-3 w-20" />
            <Bone className="h-6 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({
  rows = 6,
  cols = 4,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="hidden md:grid gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50/60"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: cols }).map((_, i) => (
          <Bone key={i} className="h-3 w-20" />
        ))}
      </div>
      <div className="divide-y divide-gray-100">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-4 py-4 md:grid md:gap-3 md:items-center"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: cols }).map((_, j) => (
              <Bone key={j} className={`h-4 ${j === 0 ? "w-3/4" : "w-2/3"}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-2xl border border-gray-100 overflow-hidden animate-pulse"
        >
          <Bone className="h-36 w-full rounded-none" />
          <div className="p-4 space-y-3">
            <Bone className="h-4 w-3/4" />
            <Bone className="h-3 w-1/2" />
            <Bone className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ListRowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-xl border border-gray-200 p-4 space-y-2"
        >
          <Bone className="h-4 w-2/3" />
          <Bone className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export function FormPageSkeleton() {
  return (
    <PageShell>
      <PageHeaderSkeleton />
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <Bone className="h-10 w-full" />
        <Bone className="h-10 w-full" />
        <Bone className="h-32 w-full" />
        <Bone className="h-10 w-32" />
      </div>
    </PageShell>
  );
}

export function DashboardOverviewSkeleton() {
  return (
    <div className="bg-white min-h-full">
      <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
        <Bone className="h-32 w-full rounded-2xl" />
        <StatCardsSkeleton />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Bone key={i} className="h-56 w-full rounded-2xl" />
          ))}
        </div>
        <Bone className="h-40 w-full rounded-2xl" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Bone key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Bone className="h-64 w-full rounded-2xl" />
          <Bone className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

export function TaskManagerTasksSkeleton() {
  return (
    <PageShell>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div className="space-y-2 flex-1">
          <Bone className="h-8 w-40" />
          <Bone className="h-4 w-full max-w-sm" />
        </div>
        <div className="flex gap-2">
          <Bone className="h-10 w-28" />
          <Bone className="h-10 w-28" />
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mb-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <Bone key={i} className="h-9 w-28 rounded-full" />
        ))}
      </div>
      <div className="flex gap-2 mb-5 border-b border-gray-100 pb-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Bone key={i} className="h-8 w-24" />
        ))}
      </div>
      <TableSkeleton rows={5} cols={5} />
    </PageShell>
  );
}

export function CalendarPageSkeleton() {
  return (
    <PageShell>
      <PageHeaderSkeleton />
      <StatCardsSkeleton count={4} />
      <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 mb-6 space-y-3">
        <Bone className="h-5 w-48" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <Bone key={i} className="h-9 w-14 rounded-xl" />
          ))}
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5">
        <div className="flex justify-between mb-5">
          <Bone className="h-8 w-48" />
          <Bone className="h-8 w-24" />
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }).map((_, i) => (
            <Bone key={i} className="h-16 sm:h-20 rounded-xl" />
          ))}
        </div>
      </div>
    </PageShell>
  );
}

export function AccessControlTableSkeleton() {
  return (
    <PageShell>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageHeaderSkeleton subtitle />
        <Bone className="h-10 w-full sm:w-64 rounded-xl" />
      </div>
      <TableSkeleton rows={8} cols={4} />
    </PageShell>
  );
}

export function AccessControlManageSkeleton() {
  return (
    <PageShell>
      <Bone className="h-4 w-28 mb-4" />
      <PageHeaderSkeleton subtitle={false} />
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-5 border-b border-gray-100 space-y-3">
          <Bone className="h-10 w-full max-w-md" />
          <Bone className="h-5 w-40" />
        </div>
        <TableSkeleton rows={12} cols={2} />
        <div className="p-5 border-t border-gray-100">
          <Bone className="h-10 w-32" />
        </div>
      </div>
    </PageShell>
  );
}

export function DetailHeroSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-4 sm:px-6 pt-4 pb-2">
        <Bone className="h-4 w-36" />
      </div>
      <Bone className="h-56 sm:h-72 md:h-80 w-full rounded-none" />
      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-4">
        <Bone className="h-6 w-3/4" />
        <Bone className="h-4 w-full" />
        <Bone className="h-4 w-full" />
        <Bone className="h-4 w-2/3" />
        <Bone className="h-64 w-full rounded-xl" />
      </div>
    </div>
  );
}

export function GanttBarsSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Bone className="h-4 w-1/2" />
          <Bone className="h-3 w-full rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function SummaryCardsSkeleton() {
  return (
    <div>
      <Bone className="h-4 w-40 mb-4" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
            <Bone className="h-8 w-12" />
            <Bone className="h-3 w-20" />
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Bone key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}

export function RouteGuardSkeleton() {
  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <Bone className="h-8 w-48" />
      <Bone className="h-4 w-72" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
        <Bone className="h-32 rounded-xl" />
        <Bone className="h-32 rounded-xl" />
      </div>
      <Bone className="h-48 w-full rounded-xl" />
    </div>
  );
}

export function AuthLayoutSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50 flex">
      <div className="hidden md:block w-64 border-r border-gray-200 p-4 space-y-3 bg-white">
        <Bone className="h-10 w-10 rounded-full mx-auto" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Bone key={i} className="h-9 w-full rounded-lg" />
        ))}
      </div>
      <div className="flex-1 flex flex-col">
        <Bone className="h-14 w-full rounded-none shrink-0" />
        <RouteGuardSkeleton />
      </div>
    </div>
  );
}

export function ModalListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 py-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Bone key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}
