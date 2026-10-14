import { cn } from "@/lib/cn";

export const wrap = "mx-auto max-w-[75rem] px-5 sm:px-8";

/** A white card holding a wide table, scrollable on small screens. */
export function TableCard({ caption, head, children, minWidth = "44rem" }: { caption: string; head: string[]; children: React.ReactNode; minWidth?: string }) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm" style={{ minWidth }}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-line bg-wash">
              {head.map((h) => <th key={h} scope="col" className="whitespace-nowrap px-4 py-3 text-xs font-medium text-ink-3 first:pl-6 last:pr-6">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-line align-top">{children}</tbody>
        </table>
      </div>
    </div>
  );
}

export const td = "px-4 py-4 first:pl-6 last:pr-6";

/** Section heading inside inner marketing pages. */
export function H2({ children, id, className }: { children: React.ReactNode; id?: string; className?: string }) {
  return <h2 id={id} className={cn("t-2 text-ink", className)}>{children}</h2>;
}

/** Bulleted list with mint check-free neutral dots. */
export function Dots({ items, className }: { items: React.ReactNode[]; className?: string }) {
  return (
    <ul className={cn("space-y-2.5 text-[0.9375rem] text-ink-2", className)}>
      {items.map((c, i) => <li key={i} className="grid grid-cols-[1rem_1fr] gap-1"><span aria-hidden className="mt-[0.6em] size-1.5 rounded-full bg-ink-4" /><span>{c}</span></li>)}
    </ul>
  );
}
