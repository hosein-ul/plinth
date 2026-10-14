"use client";
import { useReduced } from "./use-reduced";
import { useRef, useState } from "react";
import { motion, useMotionValueEvent, useScroll, useTransform, type MotionValue } from "motion/react";
import { DrawPath, arcPath } from "./draw";
import { WipeStack, useWipe } from "./wipe-stack";
import { cn } from "@/lib/cn";

export interface StickyStep {
  id: string;
  title: string;
  body: string;
  /** Short mono tag under the title, e.g. the API route or contract call involved. */
  tag?: string;
  visual: React.ReactNode;
}

/**
 * Scroll-driven sequence. On large screens the stage pins to the viewport while the page scroll
 * advances through the steps and swaps the visual; below `lg` it becomes a plain stacked list.
 */
export function StickySteps({ steps, className }: { steps: StickyStep[]; className?: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const reduce = useReduced();
  const n = steps.length;
  const wipe = useWipe(n);
  const { scrollYProgress } = useScroll({ target: outer, offset: ["start 64px", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const i = Math.max(0, Math.min(n - 1, Math.floor(v * n * 0.999)));
    setActive(i);
  });

  const jump = (i: number) => {
    const el = outer.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const span = el.offsetHeight - (window.innerHeight - 64);
    window.scrollTo({ top: top - 64 + ((i + 0.5) / n) * span, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <div className={className}>
      {/* pinned (lg and up) */}
      <div ref={outer} className="relative hidden lg:block" style={{ height: `${n * 78 + 22}dvh` }}>
        <div className="sticky top-16 flex h-[calc(100dvh-4rem)] items-center">
          <div className="grid w-full grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-center gap-14">
            <ol className="relative">
              <span aria-hidden className="absolute bottom-3 left-[15px] top-3 w-px bg-line-strong" />
              <motion.span aria-hidden className="absolute left-[15px] top-3 w-px origin-top bg-signal" style={{ scaleY: scrollYProgress, bottom: "0.75rem" }} />
              {steps.map((s, i) => {
                const on = i === active;
                return (
                  <li key={s.id}>
                    <button type="button" onClick={() => jump(i)} aria-current={on ? "step" : undefined} className="group/step relative grid w-full grid-cols-[2rem_1fr] gap-x-5 py-3 text-left">
                      <span className={cn("relative z-10 mt-0.5 grid size-[31px] place-items-center rounded-full border text-sm font-medium tabular-nums transition-colors duration-[var(--duration-base)]", i < active ? "border-signal bg-signal text-on-ink" : on ? "border-ink bg-ink text-on-ink" : "border-line-strong bg-ground text-ink-3")}>{i + 1}</span>
                      <span className="min-w-0">
                        <span className={cn("block text-[1.375rem] font-medium leading-tight tracking-[-0.03em] transition-colors duration-[var(--duration-base)]", on ? "text-ink" : "text-ink-4 group-hover/step:text-ink-3")}>{s.title}</span>
                        <span className={cn("grid transition-[grid-template-rows,opacity] duration-[var(--duration-slow)] ease-[var(--ease-out)]", on ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                          <span className="overflow-hidden">
                            <span className="mt-2 block max-w-md text-[0.9375rem] text-ink-2">{s.body}</span>
                            {s.tag && <span className="mt-3 inline-block rounded-md bg-sunk px-2 py-1 font-mono text-2xs text-ink-2">{s.tag}</span>}
                          </span>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <div className="relative h-[min(30rem,calc(100dvh-8rem))]">
              <div className="grid h-full">
                {steps.map((s, i) => (
                  <ScrubPanel key={s.id} progress={scrollYProgress} i={i} n={n} still={reduce} active={i === active}>
                    <div className="grid h-full place-items-center px-2 py-8 xl:px-8"><div className="w-full max-w-[34rem]">{s.visual}</div></div>
                  </ScrubPanel>
                ))}
              </div>
              <p className="absolute bottom-2 right-4 font-mono text-2xs text-ink-4">{String(active + 1).padStart(2, "0")} / {String(n).padStart(2, "0")}</p>
            </div>
          </div>
        </div>
      </div>

      {/* stacked (below lg) */}
      <ol className="space-y-10 lg:hidden">
        {steps.map((s, i) => (
          <li key={s.id}>
            <div className="flex items-start gap-3.5">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-ink text-sm font-medium tabular-nums text-on-ink">{i + 1}</span>
              <div>
                <h3 className="text-xl font-medium tracking-[-0.03em] text-ink">{s.title}</h3>
                <p className="mt-1.5 text-[0.9375rem] text-ink-2">{s.body}</p>
              </div>
            </div>
            <div className="mt-5 rounded-[1.75rem] bg-sunk p-5 sm:p-8">{s.visual}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * One visual of the sequence, driven directly by the scroll position (no timers, so no lag and fully reversible).
 * At each boundary the leaving panel fades out first and the arriving one fades in after it, so two visuals never overlap.
 */
function ScrubPanel({ progress, i, n, children, still, active }: { progress: MotionValue<number>; i: number; n: number; children: React.ReactNode; still?: boolean; active: boolean }) {
  const w = 0.05;
  const a = i / n;
  const b = (i + 1) / n;
  const inFrom = i === 0 ? -1 : a;
  const inTo = i === 0 ? -0.5 : a + w;
  const outFrom = i === n - 1 ? 2 : b - w;
  const outTo = i === n - 1 ? 3 : b;
  const opacity = useTransform(progress, [inFrom, inTo, outFrom, outTo], [i === 0 ? 1 : 0, 1, 1, i === n - 1 ? 1 : 0]);
  const y = useTransform(progress, [inFrom, inTo, outFrom, outTo], [i === 0 ? 0 : 18, 0, 0, i === n - 1 ? 0 : -18]);
  const scale = useTransform(progress, [inFrom, inTo, outFrom, outTo], [i === 0 ? 1 : 0.97, 1, 1, i === n - 1 ? 1 : 0.97]);
  return (
    <motion.div className="[grid-area:1/1]" style={still ? { opacity: active ? 1 : 0 } : { opacity, y, scale }} aria-hidden={!active} inert={!active}>
      {children}
    </motion.div>
  );
}
