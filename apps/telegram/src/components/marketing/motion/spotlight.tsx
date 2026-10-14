"use client";
import { useRef } from "react";
import { cn } from "@/lib/cn";

/** A surface that lights up under the pointer. Writes two CSS variables; never re-renders. */
export function Spotlight({ children, className, dark }: { children: React.ReactNode; className?: string; dark?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      className={cn("relative", dark ? "spot-dark" : "spot", className)}
      onPointerMove={(e) => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${e.clientX - r.left}px`);
        el.style.setProperty("--my", `${e.clientY - r.top}px`);
      }}
    >
      {children}
    </div>
  );
}
