"use client";
import { useRef, useState } from "react";
import { motion } from "motion/react";
import { useReduced } from "./use-reduced";
import { cn } from "@/lib/cn";

/**
 * View-transition style cross-fade for tabs. All panels sit in one grid cell (so the height never jumps); the newly
 * selected panel is revealed by a circular clip that grows from where the tab was pressed while the old one stays
 * underneath until the wipe lands.
 */
export function useWipe(count: number, initial = 0) {
  const [cur, setCur] = useState(initial);
  const [prev, setPrev] = useState<number | null>(null);
  const origin = useRef({ x: 50, y: 20 });
  const frame = useRef<HTMLDivElement>(null);
  const go = (i: number, e?: { clientX: number; clientY: number }) => {
    if (i === cur || i < 0 || i >= count) return;
    const box = frame.current?.getBoundingClientRect();
    if (box && e && box.width > 0) {
      origin.current = {
        x: Math.min(100, Math.max(0, ((e.clientX - box.left) / box.width) * 100)),
        y: Math.min(100, Math.max(0, ((e.clientY - box.top) / box.height) * 100)),
      };
    }
    setPrev(cur);
    setCur(i);
  };
  return { cur, prev, go, origin, frame, done: () => setPrev(null) };
}

export function WipeStack({ wipe, panels, className }: { wipe: ReturnType<typeof useWipe>; panels: React.ReactNode[]; className?: string }) {
  const reduce = useReduced();
  const { cur, prev, origin, frame, done } = wipe;
  const at = `${origin.current.x.toFixed(1)}% ${origin.current.y.toFixed(1)}%`;
  return (
    <div ref={frame} className={cn("grid", className)}>
      {panels.map((p, i) => {
        const state = i === cur ? "on" : i === prev ? "under" : "off";
        if (reduce) {
          return <div key={i} className={cn("[grid-area:1/1]", state === "on" ? "visible" : "invisible")} aria-hidden={state !== "on"} inert={state !== "on"}>{p}</div>;
        }
        return (
          <motion.div
            key={i}
            className="paint-clip [grid-area:1/1]"
            style={{ zIndex: state === "on" ? 2 : state === "under" ? 1 : 0 }}
            aria-hidden={state !== "on"}
            inert={state !== "on"}
            initial={false}
            animate={
              state === "on"
                ? { clipPath: `circle(150% at ${at})`, scale: 1, opacity: 1, transition: { duration: 0.8, ease: [0.76, 0, 0.24, 1] } }
                : state === "under"
                  ? { clipPath: `circle(150% at ${at})`, scale: 0.97, opacity: 0, transition: { duration: 0.8, ease: [0.76, 0, 0.24, 1] } }
                  : { clipPath: `circle(0% at ${at})`, scale: 1, opacity: 1, transition: { duration: 0 } }
            }
            onAnimationComplete={() => { if (state === "on") done(); }}
          >
            {p}
          </motion.div>
        );
      })}
    </div>
  );
}

/**
 * Text swap for tabs: all panels share one grid cell (the height never jumps). The leaving panel fades out quickly,
 * then the arriving one rises in, so the two never overlap.
 */
export function FadeSwap({ index, panels, className }: { index: number; panels: React.ReactNode[]; className?: string }) {
  const reduce = useReduced();
  return (
    <div className={cn("grid", className)}>
      {panels.map((p, i) => {
        const on = i === index;
        return (
          <motion.div
            key={i}
            className="[grid-area:1/1]"
            aria-hidden={!on}
            inert={!on}
            initial={false}
            animate={{ opacity: on ? 1 : 0, y: reduce || on ? 0 : -8 }}
            transition={reduce ? { duration: 0 } : on ? { delay: 0.16, duration: 0.45, ease: [0.16, 1, 0.3, 1] } : { duration: 0.14, ease: "easeOut" }}
          >
            {p}
          </motion.div>
        );
      })}
    </div>
  );
}
