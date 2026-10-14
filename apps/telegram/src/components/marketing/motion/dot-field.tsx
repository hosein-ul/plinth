"use client";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

/**
 * A grid of small dots on a canvas that swell and turn mint near the pointer. Dependency free.
 * Draws once when motion is reduced, and only animates while visible.
 */
export function DotField({ className, dark = true, gap = 22 }: { className?: string; dark?: boolean; gap?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, raf = 0, visible = true;
    const mouse = { x: -999, y: -999, a: 0, ta: 0 };
    const base = dark ? "255,255,255" : "15,23,42";
    const hot = dark ? "52,211,153" : "14,166,107";
    const baseA = dark ? 0.16 : 0.13;
    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      const R = 150;
      for (let y = gap / 2; y < h; y += gap) {
        for (let x = gap / 2; x < w; x += gap) {
          const dx = x - mouse.x, dy = y - mouse.y;
          const k = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / R) * mouse.a;
          // a slow travelling wave keeps the field alive without being busy
          const wave = reduce ? 0 : (Math.sin(x * 0.012 + t * 0.0006) + Math.sin(y * 0.015 - t * 0.0005)) * 0.5;
          ctx.beginPath();
          ctx.arc(x, y, Math.max(0.6, 1 + k * 1.9 + wave * 0.25), 0, Math.PI * 2);
          ctx.fillStyle = k > 0.02 ? `rgba(${hot},${Math.min(1, baseA + k * 0.8)})` : `rgba(${base},${baseA + wave * 0.03})`;
          ctx.fill();
        }
      }
    };
    const loop = (t: number) => {
      mouse.a += (mouse.ta - mouse.a) * 0.12;
      draw(t);
      if (visible && !reduce) raf = requestAnimationFrame(loop);
    };
    const resize = () => {
      const r = cv.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width; h = r.height;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(performance.now());
    };
    const ro = new ResizeObserver(resize);
    ro.observe(cv);
    const io = new IntersectionObserver(([e]) => {
      if (!e) return;
      visible = e.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible && !reduce) raf = requestAnimationFrame(loop);
    });
    io.observe(cv);
    const parent = cv.parentElement!;
    const move = (e: PointerEvent) => { const r = cv.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; mouse.ta = 1; };
    const leave = () => { mouse.ta = 0; };
    parent.addEventListener("pointermove", move);
    parent.addEventListener("pointerleave", leave);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); parent.removeEventListener("pointermove", move); parent.removeEventListener("pointerleave", leave); };
  }, [dark, gap]);
  return <canvas ref={ref} aria-hidden className={cn("pointer-events-none absolute inset-0 size-full", className)} />;
}
