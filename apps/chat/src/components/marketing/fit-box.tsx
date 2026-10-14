"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Lets an illustration be drawn in one fixed pixel coordinate system (w by h) and scaled to whatever width it is given.
 * The outer box takes the scaled height, so the layout never jumps once the first measurement lands.
 */
export function FitBox({ w, h, children, className, max = 1 }: { w: number; h: number; children: React.ReactNode; className?: string; max?: number }) {
  const outer = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);
  useEffect(() => {
    const el = outer.current;
    if (!el) return;
    const fit = () => setScale(Math.min(max, el.clientWidth / w));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w, max]);
  const s = scale ?? 1;
  return (
    <div ref={outer} className={cn("relative w-full", className)} style={{ height: h * s }}>
      <div className="absolute left-0 top-0 origin-top-left" style={{ width: w, height: h, transform: `scale(${s})`, visibility: scale === null ? "hidden" : "visible" }}>
        {children}
      </div>
    </div>
  );
}
