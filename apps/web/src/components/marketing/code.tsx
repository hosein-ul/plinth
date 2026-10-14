import { cn } from "@/lib/cn";

/** Code sample on an ink surface. The only dark surface in the system besides the footer. */
export function Code({ label, children, className }: { label: string; children: string; className?: string }) {
  return (
    <figure className={cn("overflow-hidden rounded-card bg-ink shadow-soft", className)}>
      <figcaption className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5 text-xs text-white/55">
        <span aria-hidden className="flex gap-1.5"><i className="size-2 rounded-full bg-white/20" /><i className="size-2 rounded-full bg-white/20" /><i className="size-2 rounded-full bg-white/20" /></span>
        <span className="ml-1 font-mono">{label}</span>
      </figcaption>
      <pre className="overflow-x-auto p-4 font-mono text-[0.8125rem] leading-6 text-white/85"><code>{children}</code></pre>
    </figure>
  );
}

/** Inline code in prose. */
export function C({ children }: { children: React.ReactNode }) {
  return <code className="rounded-md bg-sunk px-1.5 py-0.5 font-mono text-[0.8125em] text-ink">{children}</code>;
}
