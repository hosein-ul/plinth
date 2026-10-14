import { Skeleton } from "@/components/page";
import { LogoMark } from "@/components/brand";

export default function Loading() {
  return (
    <div className="bg-daylight dotgrid min-h-dvh [--dot-x:50%] [--dot-y:20%]" aria-busy="true">
      <header className="mx-auto flex h-16 max-w-[70rem] items-center px-5 sm:px-8">
        <span className="inline-flex items-center gap-2 text-sm text-ink-3"><LogoMark size={20} />Secure checkout</span>
      </header>
      <main id="main" className="mx-auto grid max-w-[70rem] items-start gap-x-14 gap-y-6 px-5 pt-2 sm:px-8 lg:grid-cols-[minmax(0,1fr)_30rem] lg:pt-8">
        <section>
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-ctl" />
            <div className="space-y-2"><Skeleton className="h-3 w-16" /><Skeleton className="h-5 w-40" /></div>
          </div>
          <Skeleton className="mt-9 h-3 w-20" />
          <Skeleton className="mt-3 h-14 w-64" />
          <Skeleton className="mt-8 h-24 w-full max-w-sm" />
        </section>
        <section className="card p-5 sm:p-6">
          <p className="sr-only" role="status">Loading payment</p>
          <Skeleton className="h-4 w-20" />
          <Skeleton className="mt-3 h-14 w-full" />
          <Skeleton className="mt-6 h-10 w-full" />
          <Skeleton className="mt-5 h-44 w-full" />
          <Skeleton className="mt-5 h-12 w-full" />
        </section>
      </main>
    </div>
  );
}
