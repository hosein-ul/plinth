"use client";
import { useRef } from "react";
import { cn } from "@/lib/cn";

/**
 * island: an even large radius on all four corners.
 * leaf-a / leaf-b: the same island with the radii made unequal (two big corners, two small), used once or twice per page.
 */
export type IslandShape = "island" | "leaf-a" | "leaf-b";

const SHAPE: Record<IslandShape, string> = { island: "island", "leaf-a": "island-leaf-a", "leaf-b": "island-leaf-b" };

export interface BandProps {
  tone: "light" | "dark";
  shape?: IslandShape;
  /** Dark islands only: the structural grid (default), lit under the pointer. */
  grid?: boolean;
  /** Fills the whole island (padding included), under the content. */
  backdrop?: React.ReactNode;
  id?: string;
  labelledBy?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * One band of the page. Light bands sit directly on the page ground. Dark bands are islands: a deep ink panel inset from the
 * viewport edge with a large corner radius, a masked grid that lights up under the pointer and a soft glow that follows it.
 * Islands never overlap their neighbours; the light ground shows between them.
 */
export function Band({ tone, shape = "island", grid = true, backdrop, id, labelledBy, className, children }: BandProps) {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--gx", `${e.clientX - r.left}px`);
    el.style.setProperty("--gy", `${e.clientY - r.top}px`);
    el.dataset.lit = "1";
  };
  const onLeave = () => { const el = ref.current; if (el) el.dataset.lit = "0"; };

  if (tone === "light") {
    return (
      <section id={id} aria-labelledby={labelledBy} className={cn("relative py-[var(--band-pad)]", className)}>
        <div className="relative z-[1]">{children}</div>
      </section>
    );
  }
  return (
    <section id={id} aria-labelledby={labelledBy} className="relative px-3 py-3 sm:px-5">
      <div
        ref={ref}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        className={cn("surface-ink relative isolate overflow-clip py-[var(--band-pad)]", SHAPE[shape], grid && "grid-ink grid-ink-lit", className)}
      >
        {backdrop && <div aria-hidden className="pointer-events-none absolute inset-0 z-0">{backdrop}</div>}
        <div aria-hidden className="band-glow" />
        <div className="relative z-[1]">{children}</div>
      </div>
    </section>
  );
}
