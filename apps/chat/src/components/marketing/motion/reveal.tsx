"use client";
import { useReduced } from "./use-reduced";
import { useRef } from "react";
import { motion, useInView } from "motion/react";
import { cn } from "@/lib/cn";

const EASE = [0.16, 1, 0.3, 1] as const;

/** Fades and lifts its children into place once, when they scroll into view. Static under reduced motion. */
export function Reveal({ children, className, delay = 0, y = 18, as = "div" }: { children: React.ReactNode; className?: string; delay?: number; y?: number; as?: "div" | "li" | "section" | "article" | "p" }) {
  const reduce = useReduced();
  const Tag = motion[as] as typeof motion.div;
  if (reduce) {
    const Plain = as as "div";
    return <Plain className={className}>{children}</Plain>;
  }
  return (
    <Tag className={className} initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "0px 0px -12% 0px" }} transition={{ duration: 0.75, ease: EASE, delay }}>
      {children}
    </Tag>
  );
}

type Part = [text: string, className?: string];

/**
 * Two-tone headline revealed out of masks when scrolled into view.
 * mode "word" (default): words rise one after another. "char": every character rises with a fine stagger.
 * "line": each clause is a line that rises from a slanted mask. `parts` is a list of [text, className] clauses.
 */
export function RevealHeading({ parts, as = "h2", className, delay = 0, stagger, immediate, mode = "word", id }: { id?: string; parts: Part[]; as?: "h1" | "h2" | "h3"; className?: string; delay?: number; stagger?: number; immediate?: boolean; mode?: "word" | "char" | "line" }) {
  const reduce = useReduced();
  const Tag = as;
  const label = parts.map((p) => p[0]).join(" ");
  const box = useRef<HTMLHeadingElement>(null);
  /* observe the heading box, not the masked words: a word translated out of its mask is clipped and would never intersect */
  const seen = useInView(box, { once: true, margin: "0px 0px -8% 0px" });
  const trigger = { animate: immediate || seen ? { y: 0, rotate: 0 } : undefined };
  const mask = "inline-block overflow-hidden pb-[0.14em] align-top [margin-bottom:-0.14em]";

  if (mode === "line") {
    return (
      <Tag id={id} ref={box} className={className} aria-label={label}>
        {parts.map(([text, cls], pi) => (
          <span key={pi} className={cn("block overflow-hidden pb-[0.14em] [margin-bottom:-0.14em]", cls)} aria-hidden>
            {reduce ? text : (
              <motion.span className="block origin-left" initial={{ y: "110%", rotate: 3 }} {...trigger} transition={{ duration: 1, ease: EASE, delay: delay + pi * (stagger ?? 0.14) }}>{text}</motion.span>
            )}
          </span>
        ))}
      </Tag>
    );
  }

  const step = stagger ?? (mode === "char" ? 0.016 : 0.035);
  let n = 0;
  return (
    <Tag id={id} ref={box} className={className} aria-label={label}>
      {parts.map(([text, cls], pi) => (
        <span key={pi} className={cls} aria-hidden>
          {text.split(" ").filter(Boolean).map((w, wi) => {
            const base = n;
            n += mode === "char" ? w.length + 1 : 1;
            return (
              <span key={wi}>
                <span className={cn(mask, mode === "char" && "whitespace-nowrap")}>
                  {reduce ? (
                    <span className="inline-block">{w}</span>
                  ) : mode === "char" ? (
                    Array.from(w).map((ch, ci) => (
                      <motion.span key={ci} className="inline-block" initial={{ y: "112%", rotate: 4 }} {...trigger} transition={{ duration: 0.85, ease: EASE, delay: delay + (base + ci) * step }}>{ch}</motion.span>
                    ))
                  ) : (
                    <motion.span className="inline-block" initial={{ y: "108%", rotate: 0 }} {...trigger} transition={{ duration: 0.8, ease: EASE, delay: delay + base * step }}>
                      {w}
                    </motion.span>
                  )}
                </span>
                {/* the space sits outside the clipped mask: inside an overflow-hidden inline-block it collapses and words fuse */}
                {" "}
              </span>
            );
          })}
        </span>
      ))}
    </Tag>
  );
}

export function SectionTag({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("mb-5 inline-flex items-center gap-2 text-sm font-medium text-ink-3", className)}>{children}</p>;
}
