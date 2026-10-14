"use client";
import { useRef } from "react";
import { motion, useInView, useScroll, useTransform } from "motion/react";
import { useReduced } from "./use-reduced";
import { useCompact } from "./use-compact";

type Variant = "circle" | "inset" | "inset-x" | "polygon";

/* targets overshoot the box a little so shadows and hover lifts are never cut once revealed */
const FROM: Record<Variant, string> = {
  circle: "circle(0% at ORIGIN)",
  inset: "inset(-20% -10% 120% -10% round 0px)",
  "inset-x": "inset(-20% 110% -20% -10% round 0px)",
  polygon: "polygon(-30% -30%, -30% -30%, -60% 130%, -60% 130%)",
};
const TO: Record<Variant, string> = {
  circle: "circle(90% at ORIGIN)",
  inset: "inset(-20% -10% -20% -10% round 0px)",
  "inset-x": "inset(-20% -10% -20% -10% round 0px)",
  polygon: "polygon(-30% -30%, 130% -30%, 130% 130%, -30% 130%)",
};

interface Props { children: React.ReactNode; variant?: Variant; className?: string; delay?: number; scrub?: boolean; origin?: string; duration?: number; as?: "div" | "li" }

/** The mask follows scroll position. Kept apart so plain reveals never register a scroll listener. */
function ScrubMask({ outer, from, to, children }: { outer: React.RefObject<HTMLDivElement | null>; from: string; to: string; children: React.ReactNode }) {
  const { scrollYProgress } = useScroll({ target: outer, offset: ["start 92%", "start 45%"] });
  const clipPath = useTransform(scrollYProgress, [0, 1], [from, to]);
  return <motion.div className="paint-clip h-full" initial={{ clipPath: from }} style={{ clipPath }}>{children}</motion.div>;
}

/**
 * Mask reveal: a circle that opens, an inset that wipes down or across, or a slanted polygon that sweeps over.
 * Plays once in view; with `scrub` the mask follows scroll position instead. `origin` positions the circle ("20% 80%").
 * On phones the mask is replaced by a short fade and rise, which runs on the compositor.
 */
export function ClipReveal({ children, variant = "inset", className, delay = 0, scrub, origin = "50% 50%", duration = 1.1, as = "div" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReduced();
  const compact = useCompact();
  /* the plain outer box is observed; a fully clipped element is not reliably reported as intersecting */
  const seen = useInView(ref, { once: true, margin: "0px 0px -8% 0px" });
  const from = FROM[variant].replace("ORIGIN", origin);
  const to = TO[variant].replace("ORIGIN", origin);
  const Outer = as as "div";
  if (reduce) return <Outer className={className}>{children}</Outer>;
  if (compact) {
    return (
      <Outer ref={ref} className={className}>
        <motion.div key="rise" initial={{ opacity: 0, y: 14 }} animate={seen ? { opacity: 1, y: 0 } : undefined} transition={{ duration: 0.5, delay: Math.min(delay, 0.2), ease: [0.16, 1, 0.3, 1] }} className="h-full">{children}</motion.div>
      </Outer>
    );
  }
  return (
    <Outer ref={ref} className={className}>
      {scrub ? (
        <ScrubMask key="scrub" outer={ref} from={from} to={to}>{children}</ScrubMask>
      ) : (
        <motion.div key="mask" className="paint-clip h-full" initial={{ clipPath: from }} animate={{ clipPath: seen ? to : from }} transition={{ duration, delay, ease: [0.76, 0, 0.24, 1] }}>
          {children}
        </motion.div>
      )}
    </Outer>
  );
}
