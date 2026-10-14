import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/cn";

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: string }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 pb-7">
      <div className="max-w-2xl">
        <h1 className="t-2 text-ink">{title}</h1>
        {description && <p className="mt-1.5 text-[0.9375rem] text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A white card. The single container of the app; never nested. */
export function Card({ className, children, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card-flat", className)} {...p}>{children}</div>;
}

/** Titled card section. */
export function Section({ title, description, actions, children, className, bare }: { title?: string; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; bare?: boolean }) {
  return (
    <section className={cn("mb-6", !bare && "card-flat p-5 sm:p-6", className)}>
      {(title || actions) && (
        <div className={cn("flex flex-wrap items-start justify-between gap-3", bare ? "mb-3" : "mb-5")}>
          <div>
            {title && <h2 className="t-3 text-ink">{title}</h2>}
            {description && <p className="mt-1 max-w-xl text-sm text-ink-3">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden />;
}

/** Empty state: the dot grid at rest, one sentence, one action. */
export function EmptyState({ title, body, action, className }: { title: string; body: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("card-flat dotgrid relative overflow-hidden px-8 py-14 [--dot-x:85%] [--dot-y:50%]", className)}>
      <div className="relative max-w-md">
        <h3 className="t-3 text-ink">{title}</h3>
        <p className="mt-1.5 text-[0.9375rem] text-ink-3">{body}</p>
        {action && <div className="mt-5">{action}</div>}
      </div>
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const msg = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <div role="alert" className="flex items-start gap-3 rounded-card border border-bad/20 bg-bad-quiet px-4 py-3.5 text-sm text-bad-ink">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>
        <p className="font-medium">We could not load this.</p>
        <p className="mt-0.5 opacity-90">{msg}</p>
        {retry && <button onClick={retry} className="mt-2 font-medium underline underline-offset-4">Try again</button>}
      </div>
    </div>
  );
}

/** Labelled figure. */
export function Stat({ label, children, note, className }: { label: string; children: React.ReactNode; note?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="label">{label}</p>
      <div className="mt-2">{children}</div>
      {note && <p className="mt-2 text-xs text-ink-3">{note}</p>}
    </div>
  );
}

export function KeyValue({ items, className }: { items: { k: string; v: React.ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("divide-y divide-line", className)}>
      {items.map((i) => (
        <div key={i.k} className="grid grid-cols-[9rem_1fr] items-baseline gap-4 py-3 first:pt-0 last:pb-0 sm:grid-cols-[12rem_1fr]">
          <dt className="text-sm text-ink-3">{i.k}</dt>
          <dd className="min-w-0 break-words text-sm text-ink">{i.v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Inline notice inside a card or page. */
export function Notice({ tone = "neutral", children, className }: { tone?: "neutral" | "warn" | "bad" | "info" | "ok"; children: React.ReactNode; className?: string }) {
  const t = { neutral: "bg-sunk text-ink-2", warn: "bg-warn-quiet text-warn-ink", bad: "bg-bad-quiet text-bad-ink", info: "bg-info-quiet text-info-ink", ok: "bg-signal-quiet text-signal-ink" }[tone];
  return <div className={cn("rounded-ctl px-3.5 py-2.5 text-sm", t, className)}>{children}</div>;
}
