"use client";
import Link from "next/link";
import { motion } from "motion/react";
import { useReduced } from "./marketing/motion/use-reduced";
import { cn } from "@/lib/cn";

/**
 * The Plinth mark: a stepped pedestal (wide base, narrower shaft) carrying one round value. The
 * value is the only coloured element, and it is always resting on the plinth.
 * Built from rect and circle primitives on a 32 grid; the downloadable SVGs in /public/brand
 * use identical geometry.
 *
 * tone="light"  ink tile, white plinth, mint value   (use on light surfaces; the default)
 * tone="dark"   white tile, ink plinth, mint value   (use on ink or photographic surfaces)
 * tone="mono"   ink tile, everything else knocked out in white (one-colour print, stamps)
 */
export type LogoTone = "light" | "dark" | "mono";

const tones: Record<LogoTone, { tile: string; base: string; shaft: string; coin: string }> = {
  light: { tile: "fill-ink", base: "fill-on-ink", shaft: "fill-on-ink/70", coin: "fill-signal" },
  dark: { tile: "fill-on-ink", base: "fill-ink", shaft: "fill-ink/70", coin: "fill-signal" },
  mono: { tile: "fill-current", base: "fill-on-ink", shaft: "fill-on-ink/70", coin: "fill-on-ink" },
};

export interface LogoMarkProps {
  className?: string;
  /** Pixel size of the square mark. Default 22. Minimum recommended: 16. */
  size?: number;
  tone?: LogoTone;
}

function Plinth({ tone, coin }: { tone: LogoTone; coin: React.ReactNode }) {
  const t = tones[tone];
  return (
    <>
      <rect width="32" height="32" rx="9" className={t.tile} />
      <rect x="6" y="21" width="20" height="4" rx="1" className={t.base} />
      <rect x="9" y="16" width="14" height="5" className={t.shaft} />
      {coin}
    </>
  );
}

export function LogoMark({ className, size = 22, tone = "light" }: LogoMarkProps) {
  return (
    <svg aria-hidden viewBox="0 0 32 32" width={size} height={size} className={cn("shrink-0 text-ink", className)}>
      <Plinth tone={tone} coin={<circle cx="16" cy="12" r="4" className={tones[tone].coin} />} />
    </svg>
  );
}

/** Same mark; on mount the value drops onto the plinth once. Static under prefers-reduced-motion. */
export function LogoMarkAnimated({ className, size = 22, tone = "light" }: LogoMarkProps) {
  const reduce = useReduced();
  return (
    <svg aria-hidden viewBox="0 0 32 32" width={size} height={size} className={cn("shrink-0 overflow-visible text-ink", className)}>
      <Plinth
        tone={tone}
        coin={
          <motion.circle
            cx="16"
            cy="12"
            r="4"
            className={tones[tone].coin}
            initial={reduce ? false : { y: -14, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ y: { duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0.12 }, opacity: { duration: 0.15, delay: 0.12 } }}
          />
        }
      />
    </svg>
  );
}

export interface LogoProps {
  className?: string;
  href?: string;
  tone?: LogoTone;
  /** Mark height in px; the wordmark scales with it. Default 22. */
  size?: number;
  /** Render without a link (brand page, documents). */
  asStatic?: boolean;
  animated?: boolean;
}

export function Logo({ className, href = "/", tone = "light", size = 22, asStatic, animated }: LogoProps) {
  const Mark = animated ? LogoMarkAnimated : LogoMark;
  const body = (
    <>
      <Mark size={size} tone={tone} />
      <span
        className={cn("font-semibold leading-none", tone === "dark" ? "text-on-ink" : "text-ink")}
        style={{ fontSize: Math.round(size * 0.8 * 100) / 100, letterSpacing: "-0.035em", marginLeft: size * 0.36 }}
      >
        Plinth
      </span>
    </>
  );
  const cls = cn("inline-flex items-center", className);
  if (asStatic) return <span className={cls} aria-label="Plinth">{body}</span>;
  return (
    <Link href={href} className={cls} aria-label="Plinth home">
      {body}
    </Link>
  );
}
