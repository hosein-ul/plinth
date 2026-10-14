"use client";
import { motion, useInView, type MotionValue } from "motion/react";
import { useRef } from "react";
import { useReduced } from "./use-reduced";
import { cn } from "@/lib/cn";

/** SVG arc path from centre, radius and two angles in degrees (0 = right, clockwise). Pure geometry. */
export function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const rad = (d: number) => (d * Math.PI) / 180;
  const x0 = cx + r * Math.cos(rad(a0)), y0 = cy + r * Math.sin(rad(a0));
  const x1 = cx + r * Math.cos(rad(a1)), y1 = cy + r * Math.sin(rad(a1));
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${large} ${a1 > a0 ? 1 : 0} ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/** Elbow connector between two points: horizontal, a circular corner of radius `r`, then vertical. Computed, never hand-drawn. */
export function elbowPath(x0: number, y0: number, x1: number, y1: number, r = 14): string {
  const dx = Math.sign(x1 - x0) || 1, dy = Math.sign(y1 - y0) || 1;
  const rr = Math.min(r, Math.abs(x1 - x0), Math.abs(y1 - y0));
  return `M${x0} ${y0}H${x1 - dx * rr}A${rr} ${rr} 0 0 ${dx * dy > 0 ? 1 : 0} ${x1} ${y0 + dy * rr}V${y1}`;
}

interface DrawProps {
  /** Path data from arcPath / elbowPath, or a plain line like "M0 0L100 0". */
  d: string;
  w: number;
  h: number;
  className?: string;
  /** Tailwind stroke classes, e.g. "stroke-line-strong". */
  stroke?: string;
  strokeWidth?: number;
  dashed?: boolean;
  delay?: number;
  duration?: number;
  /** Scrub the drawing with a scroll progress value instead of playing once in view. */
  progress?: MotionValue<number>;
}

/** A stroke that draws itself (stroke-dashoffset via pathLength). Plays once in view, or follows a scroll progress. */
export function DrawPath({ d, w, h, className, stroke = "stroke-line-strong", strokeWidth = 1.3, dashed, delay = 0, duration = 1.2, progress }: DrawProps) {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const reduce = useReduced();
  return (
    <svg ref={ref} aria-hidden viewBox={`0 0 ${w} ${h}`} className={cn("overflow-visible", className)} fill="none">
      <motion.path
        d={d}
        className={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={dashed ? "3 5" : undefined}
        style={progress && !reduce ? { pathLength: progress } : undefined}
        initial={progress || reduce ? false : { pathLength: 0 }}
        animate={progress || reduce ? undefined : { pathLength: inView ? 1 : 0 }}
        transition={{ duration, delay, ease: [0.65, 0, 0.35, 1] }}
      />
    </svg>
  );
}

/** Concentric rings centred in a square viewBox; each ring draws itself in, outer ones later. */
export function RingSet({ radii, className, stroke = "stroke-line-strong", dashedOuter }: { radii: number[]; className?: string; stroke?: string; dashedOuter?: boolean }) {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -5% 0px" });
  const reduce = useReduced();
  const size = Math.max(...radii) * 2 + 4;
  const c = size / 2;
  return (
    <svg ref={ref} aria-hidden viewBox={`0 0 ${size} ${size}`} className={cn("overflow-visible", className)} fill="none">
      {radii.map((r, i) => (
        <motion.circle
          key={r}
          cx={c}
          cy={c}
          r={r}
          className={stroke}
          strokeWidth={1}
          strokeDasharray={dashedOuter && i === radii.length - 1 ? "2 7" : undefined}
          initial={reduce ? false : { pathLength: 0, rotate: -90 }}
          animate={reduce ? undefined : { pathLength: inView ? 1 : 0, rotate: -90 }}
          style={{ transformOrigin: "50% 50%", transformBox: "fill-box" }}
          transition={{ duration: 1.6, delay: i * 0.18, ease: [0.16, 1, 0.3, 1] }}
        />
      ))}
    </svg>
  );
}
