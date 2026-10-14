"use client";
import { useReduced } from "./use-reduced";
import { useRef, useState } from "react";
import { motion, useMotionValueEvent, useScroll, useSpring } from "motion/react";
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
  const { scrollYProgress: rawProgress } = useScroll({ target: outer, offset: ["start 64px", "end end"] });
  const scrollYProgress = useSpring(rawProgress, { stiffness: 140, damping: 32, restDelta: 0.0005 });
  useMotionValueEvent(rawProgress, "change", (v) => {
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
                  <ScrubPanel key={s.id} i={i} current={active} still={reduce} active={i === active}>
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
 * One visual of the sequence. The active step is chosen from scroll position, but the change itself is a timed
 * cross-fade with a short rise, so it stays smooth however the page is scrolled (wheel notches, flicks, keyboard).
 * The arriving panel waits a beat for the leaving one, so two visuals never overlap.
 */
function ScrubPanel({ i, children, still, active, current }: { i: number; children: React.ReactNode; still?: boolean; active: boolean; current: number }) {
  const state = active ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: i < current ? -22 : 22, scale: 0.975 };
  return (
    <motion.div
      className="[grid-area:1/1]"
      initial={false}
      animate={still ? { opacity: active ? 1 : 0 } : state}
      transition={still ? { duration: 0 } : { duration: active ? 0.7 : 0.4, delay: active ? 0.18 : 0, ease: [0.16, 1, 0.3, 1] }}
      style={{ pointerEvents: active ? "auto" : "none" }}
      aria-hidden={!active}
      inert={!active}
    >
      {children}
    </motion.div>
  );
}
