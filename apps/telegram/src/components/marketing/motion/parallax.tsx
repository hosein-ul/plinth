"use client";
import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { useReduced } from "./use-reduced";
import { useCompact } from "./use-compact";

function Shifted({ children, distance, className }: { children: React.ReactNode; distance: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [distance, -distance]);
  return (
    <div ref={ref} className={className}>
      <motion.div className="h-full" style={{ y }}>{children}</motion.div>
    </div>
  );
}

/** Moves its child vertically by `distance` px across the time it is on screen. Transform only; off on phones and for reduced motion. */
export function Parallax({ children, distance = 40, className }: { children: React.ReactNode; distance?: number; className?: string }) {
  const reduce = useReduced();
  const compact = useCompact();
  if (reduce || compact) return <div className={className}><div className="h-full">{children}</div></div>;
  return <Shifted distance={distance} className={className}>{children}</Shifted>;
}
