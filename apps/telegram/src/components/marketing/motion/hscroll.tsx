"use client";
import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { useReduced } from "./use-reduced";
import { cn } from "@/lib/cn";

/**
 * Pinned horizontal scroll. From `lg` up the stage sticks to the viewport and vertical scroll slides the track sideways
 * (a progress bar shows where you are). Below `lg`, or with reduced motion, the same children simply stack.
 * `head` stays pinned on the left while the track moves.
 */
export function HorizontalScroll({ head, children, className, trackClassName }: { head: React.ReactNode; children: React.ReactNode; className?: string; trackClassName?: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const view = useRef<HTMLDivElement>(null);
  const reduce = useReduced();
  const [travel, setTravel] = useState(900);
  const wide = useRef(false);
  const { scrollYProgress } = useScroll({ target: outer, offset: ["start start", "end end"] });
  const x = useTransform(scrollYProgress, (p) => (wide.current ? -p * travel : 0));
  const bar = useTransform(scrollYProgress, [0, 1], [0.04, 1]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const measure = () => {
      wide.current = mq.matches;
      if (track.current && view.current) setTravel(Math.max(0, track.current.scrollWidth - view.current.clientWidth));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (track.current) ro.observe(track.current);
    mq.addEventListener("change", measure);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); mq.removeEventListener("change", measure); window.removeEventListener("resize", measure); };
  }, []);

  const pinned = !reduce;
  return (
    <div ref={outer} className={cn(pinned && "lg:h-[calc(100dvh-4rem+var(--travel))]", className)} style={{ "--travel": `${travel}px` } as React.CSSProperties}>
      <div className={cn(pinned && "lg:sticky lg:top-16 lg:flex lg:h-[calc(100dvh-4rem)] lg:flex-col lg:justify-center")}>
        <div className="lg:grid lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-center lg:gap-12">
          <div className="relative z-10">{head}</div>
          <div ref={view} className={cn("mt-10 lg:mt-0", pinned && "lg:overflow-hidden")}>
            <motion.div ref={track} style={pinned ? { x } : undefined} className={cn("flex flex-col gap-3 lg:w-max lg:flex-row lg:gap-5", trackClassName)}>
              {children}
            </motion.div>
          </div>
        </div>
        {pinned && (
          <div aria-hidden className="mt-10 hidden h-px w-full bg-line-strong lg:block">
            <motion.div className="h-px origin-left bg-signal" style={{ scaleX: bar }} />
          </div>
        )}
      </div>
    </div>
  );
}
