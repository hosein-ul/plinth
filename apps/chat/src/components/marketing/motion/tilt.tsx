"use client";
import { useRef } from "react";
import { motion, useMotionValue, useSpring } from "motion/react";
import { useReduced } from "./use-reduced";
import { cn } from "@/lib/cn";

/** Physically responds to the pointer: the surface leans toward it and lifts. Mouse only; static under reduced motion. */
export function Tilt({ children, className, max = 5, lift = 5 }: { children: React.ReactNode; className?: string; max?: number; lift?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReduced();
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const srx = useSpring(rx, { stiffness: 220, damping: 22, mass: 0.5 });
  const sry = useSpring(ry, { stiffness: 220, damping: 22, mass: 0.5 });
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      ref={ref}
      className={cn("will-change-transform", className)}
      style={{ rotateX: srx, rotateY: sry, transformPerspective: 900 }}
      whileHover={{ y: -lift }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse") return;
        const r = ref.current!.getBoundingClientRect();
        ry.set(((e.clientX - r.left) / r.width - 0.5) * 2 * max);
        rx.set(-((e.clientY - r.top) / r.height - 0.5) * 2 * max);
      }}
      onPointerLeave={() => { rx.set(0); ry.set(0); }}
    >
      {children}
    </motion.div>
  );
}
