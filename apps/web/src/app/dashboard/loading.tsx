import { Skeleton } from "@/components/page";

export default function DashboardLoading() {
  return (
    <div role="status" aria-label="Loading" className="space-y-6">
      <div className="space-y-2.5 pb-1">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card-flat p-5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="mt-4 h-8 w-32" />
          </div>
        ))}
      </div>
      <div className="card-flat overflow-hidden">
        <Skeleton className="h-10 w-full rounded-none" />
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex h-12 items-center justify-between gap-6 border-t border-line px-5">
            <Skeleton className="h-3.5 w-40 max-w-[40%]" />
            <Skeleton className="h-3.5 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
