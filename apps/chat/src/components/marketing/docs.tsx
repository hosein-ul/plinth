"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

export type DocsNavItem = { id: string; label: string };

/**
 * "On this page" navigation with scroll-spy. Sticky list on lg+, a horizontally scrolling pill row below.
 * The active item is a raised pill. Highlighting follows the section that crosses the upper part of the viewport.
 */
export function OnThisPage({ items }: { items: DocsNavItem[] }) {
  const [active, setActive] = useState(items[0]?.id ?? "");

  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
    if (!els.length || typeof IntersectionObserver === "undefined") return;
    const visible = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        }
        const first = items.find((i) => visible.has(i.id));
        if (first) setActive(first.id);
      },
      { rootMargin: "-120px 0px -60% 0px", threshold: 0 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items]);

  const link = (i: DocsNavItem, extra?: string) => (
    <a
      href={`#${i.id}`}
      aria-current={active === i.id ? "location" : undefined}
      onClick={() => setActive(i.id)}
      className={cn(
        "block rounded-ctl border px-3 py-1.5 text-sm font-medium transition-[background-color,border-color,color,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-snap)]",
        active === i.id
          ? "border-line bg-raised text-ink shadow-ctl"
          : "border-transparent text-ink-3 hover:bg-sunk hover:text-ink",
        extra,
      )}
    >
      {i.label}
    </a>
  );

  return (
    <>
      <nav aria-label="On this page" className="-mx-5 overflow-x-auto px-5 sm:-mx-8 sm:px-8 lg:hidden">
        <ul className="flex w-max gap-1.5">
          {items.map((i) => <li key={i.id}>{link(i, "whitespace-nowrap")}</li>)}
        </ul>
      </nav>
      <nav aria-label="On this page" className="hidden lg:block">
        <div className="sticky top-24">
          <p className="label px-3">On this page</p>
          <ul className="mt-3 space-y-1">
            {items.map((i) => <li key={i.id}>{link(i)}</li>)}
          </ul>
        </div>
      </nav>
    </>
  );
}

/** HTTP method badge in mono. GET is neutral, POST carries the quiet signal tint. */
export function Method({ children }: { children: "GET" | "POST" }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 w-12 items-center justify-center rounded-md font-mono text-2xs font-medium",
        children === "POST" ? "bg-signal-quiet text-signal-ink" : "bg-sunk text-ink-2",
      )}
    >
      {children}
    </span>
  );
}

/** Numbered step heading used above a code sample. */
export function Step({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="tnum mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-medium text-on-ink">{n}</span>
      <div className="min-w-0">
        <h3 className="t-3">{title}</h3>
        {children && <p className="mt-1 text-sm text-ink-3">{children}</p>}
      </div>
    </div>
  );
}
