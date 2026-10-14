"use client";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { useReduced } from "@/components/marketing/motion/use-reduced";
import { cn } from "@/lib/cn";

const INPUTS = ["merchant", "invoice", "USDC contract", "your vault", "chain"];
const ROW = 40;
const GAP = 8;
const H = INPUTS.length * ROW + (INPUTS.length - 1) * GAP;

/** Smooth S-curve between two points, control points on the horizontal midline. Computed from the endpoints. */
const curve = (x0: number, y0: number, x1: number, y1: number) => {
  const mx = (x0 + x1) / 2;
  return `M${x0} ${y0}C${mx} ${y0} ${mx} ${y1} ${x1} ${y1}`;
};

/** Five inputs whose lines draw in and converge on one address. */
export function Derivation() {
  const reduce = useReduced();
  const cy = H / 2;
  return (
    <div className="grid grid-cols-[auto_minmax(2.5rem,1fr)_auto] items-stretch">
      <ul className="flex flex-col" style={{ gap: GAP }}>
        {INPUTS.map((p, i) => (
          <motion.li
            key={p}
            className="flex items-center rounded-lg border border-white/12 bg-white/[0.05] px-3 font-mono text-xs text-white/80"
            style={{ height: ROW }}
            initial={reduce ? false : { opacity: 0, x: -16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "0px 0px -15% 0px" }}
            transition={{ duration: 0.7, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
          >
            {p}
          </motion.li>
        ))}
      </ul>
      <div className="relative min-w-0">
        <svg aria-hidden viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" fill="none">
          {INPUTS.map((p, i) => (
            <motion.path
              key={p}
              d={curve(0, ROW / 2 + i * (ROW + GAP), 100, cy)}
              className="stroke-white/35"
              strokeWidth={1.2}
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
              initial={reduce ? false : { pathLength: 0 }}
              whileInView={{ pathLength: 1 }}
              viewport={{ once: true, margin: "0px 0px -15% 0px" }}
              transition={{ duration: 1.1, delay: 0.35 + i * 0.08, ease: [0.65, 0, 0.35, 1] }}
            />
          ))}
        </svg>
      </div>
      <div className="flex items-center">
        <motion.span
          className="inline-flex items-center gap-2 rounded-lg bg-signal px-3.5 py-3 font-mono text-xs font-medium text-ink shadow-[0_0_0_6px_rgb(14_166_107/0.16)]"
          initial={reduce ? false : { opacity: 0, scale: 0.8 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "0px 0px -15% 0px" }}
          transition={{ type: "spring", stiffness: 260, damping: 20, delay: 1.2 }}
        >
          <ArrowRight className="size-3.5" aria-hidden />one address
        </motion.span>
      </div>
    </div>
  );
}

/** Three phases with a rule that fills across each in turn. */
export function Phases({ phases }: { phases: { n: string; title: string; text: string; gas: string; on?: boolean }[] }) {
  const reduce = useReduced();
  return (
    <ol className="grid divide-y divide-white/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {phases.map((p, i) => (
        <li key={p.n} className="relative p-5 pt-7 sm:px-6">
          <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-white/12" />
          <motion.span
            aria-hidden
            className={cn("absolute inset-x-0 top-0 h-[3px] origin-left", p.on ? "bg-signal" : "bg-white/55")}
            initial={reduce ? false : { scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true, margin: "0px 0px -10% 0px" }}
            transition={{ duration: 1, delay: 0.2 + i * 0.35, ease: [0.76, 0, 0.24, 1] }}
          />
          <span className="tnum font-mono text-2xs text-white/40">0{p.n}</span>
          <h3 className="mt-1.5 text-base font-semibold tracking-[-0.015em] text-on-ink">{p.title}</h3>
          <p className="mt-1.5 text-sm text-white/60">{p.text}</p>
          <p className={cn("mt-4 inline-block rounded-md px-2 py-1 text-xs font-medium", p.on ? "bg-signal-quiet text-signal-ink" : "bg-white/10 text-white/80")}>{p.gas}</p>
        </li>
      ))}
    </ol>
  );
}
