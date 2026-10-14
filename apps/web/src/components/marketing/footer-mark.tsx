"use client";
import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { useReduced } from "@/components/marketing/motion/use-reduced";
import { useCompact } from "@/components/marketing/motion/use-compact";

const MARK = "text-[21.5vw] font-semibold leading-[0.74] tracking-[-0.06em] text-white/[0.06] xl:text-[17.5rem]";

function Rising() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end end"] });
  const y = useTransform(scrollYProgress, [0, 1], ["42%", "0%"]);
  return (
    <div ref={ref} aria-hidden className="select-none overflow-hidden px-5 text-center sm:px-10">
      <motion.div style={{ y }} className={MARK}>Plinth</motion.div>
    </div>
  );
}

/** The oversized wordmark at the foot of the page rises into place as the footer scrolls into view (still on phones). */
export function FooterMark() {
  const reduce = useReduced();
  const compact = useCompact();
  if (reduce || compact) return <div aria-hidden className="select-none overflow-hidden px-5 text-center sm:px-10"><div className={MARK}>Plinth</div></div>;
  return <Rising />;
}
