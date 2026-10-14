"use client";
import { useReduced } from "./use-reduced";
import { useEffect, useRef, useState } from "react";
import { animate, useInView } from "motion/react";

/** Counts up to a REAL value the first time it is visible. Only use with data that comes from the network. */
export function Ticker({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const reduce = useReduced();
  const [n, setN] = useState(value);
  useEffect(() => {
    if (!inView || reduce) return;
    const from = Math.max(0, value - Math.min(value, 400));
    setN(from);
    const c = animate(from, value, { duration: 1.1, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => setN(Math.round(v)) });
    return () => c.stop();
  }, [inView, reduce, value]);
  return <span ref={ref} className={className}>{n.toLocaleString("en-US")}</span>;
}
