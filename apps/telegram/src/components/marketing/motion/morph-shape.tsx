"use client";
import { motion, useTransform, type MotionValue } from "motion/react";
import { cn } from "@/lib/cn";

/**
 * Shape morphing from geometry. Every shape is sampled at the same N angles around its centre, so any two
 * of them can be blended point by point and written out as a clip-path polygon. Nothing here is hand-drawn path data.
 */
const N = 96;
type Pt = [number, number];

/** Ray-cast the boundary of a super-ellipse |x|^n + |y|^n = 1 (n=2 circle, large n square). */
const superEllipse = (n: number) => (t: number): Pt => {
  const c = Math.cos(t), s = Math.sin(t);
  const r = Math.pow(Math.pow(Math.abs(c), n) + Math.pow(Math.abs(s), n), -1 / n);
  return [c * r, s * r];
};
/** Semicircle on top, flat bottom with square corners: an arch standing on a plinth. */
const arch = (t: number): Pt => {
  const c = Math.cos(t), s = Math.sin(t);
  if (s <= 0) return [c, s];
  const r = 1 / Math.max(Math.abs(c), Math.abs(s));
  return [c * r, s * r];
};

export const SHAPES = {
  circle: superEllipse(2),
  squircle: superEllipse(4),
  arch,
  plinth: superEllipse(40),
} as const;
export type ShapeName = keyof typeof SHAPES;

const sample = (f: (t: number) => Pt): Pt[] => Array.from({ length: N }, (_, i) => f(-Math.PI + (i / N) * Math.PI * 2));
const CACHE = new Map<string, Pt[]>();
const pts = (name: ShapeName): Pt[] => {
  let p = CACHE.get(name);
  if (!p) { p = sample(SHAPES[name]); CACHE.set(name, p); }
  return p;
};

const ease = (x: number) => x * x * (3 - 2 * x);
const poly = (a: Pt[]) => `polygon(${a.map(([x, y]) => `${(50 + x * 50).toFixed(2)}% ${(50 + y * 50).toFixed(2)}%`).join(",")})`;

/** Polygon for progress p in 0..1 across a list of shapes (equal spans, eased between neighbours). */
export function morphPolygon(names: ShapeName[], p: number): string {
  const n = names.length - 1;
  const v = Math.min(0.99999, Math.max(0, p)) * n;
  const i = Math.floor(v);
  const k = ease(v - i);
  const A = pts(names[i]!), B = pts(names[i + 1]!);
  return poly(A.map(([ax, ay], j) => [ax + (B[j]![0] - ax) * k, ay + (B[j]![1] - ay) * k] as Pt));
}

/** A box clipped to a shape that morphs as `progress` runs 0..1. `still` renders the final shape with no motion. */
export function MorphShape({ progress, names, className, children, still }: { progress: MotionValue<number>; names: ShapeName[]; className?: string; children?: React.ReactNode; still?: boolean }) {
  const clipPath = useTransform(progress, (p) => morphPolygon(names, p));
  const last = poly(pts(names[names.length - 1]!));
  return (
    <motion.div className={cn("paint-clip", className)} style={{ clipPath: still ? last : clipPath }}>
      {children}
    </motion.div>
  );
}
