import { cn } from "@/lib/cn";

/**
 * A dashed line with a mint dot that travels along it: the one ambient motion of the brand.
 * `d` is an SVG path in a viewBox of `w` x `h`. The dot is hidden under reduced motion.
 */
export function Connector({ d, w, h, className, dark, seconds = 2.6 }: { d: string; w: number; h: number; className?: string; dark?: boolean; seconds?: number }) {
  return (
    <svg aria-hidden viewBox={`0 0 ${w} ${h}`} className={cn("overflow-visible", className)} fill="none">
      <path d={d} className={dark ? "stroke-white/25" : "stroke-line-strong"} strokeWidth="1.3" strokeDasharray="3 4" style={{ animation: "dash-flow 1.2s linear infinite" }} />
      <circle r="3.5" className="fill-signal motion-reduce:hidden" style={{ offsetPath: `path("${d}")`, animation: `travel ${seconds}s cubic-bezier(.65,0,.35,1) infinite` }} />
    </svg>
  );
}
