import { RingSet } from "@/components/marketing/motion/draw";
import { cn } from "@/lib/cn";

const RADII = [92, 140, 190];

/**
 * One large ring set that straddles the seam between two bands. Render `half="dark"` at the bottom of the upper (dark) band
 * and `half="light"` at the top of the lower (light) band: same centre, same radii, so the circle reads as one object
 * that changes colour as it crosses from ink to paper.
 */
export function SeamRing({ half, className }: { half: "dark" | "light" | "join"; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute left-[6%] z-0 size-[clamp(20rem,38vw,40rem)] -translate-x-1/2 -translate-y-1/2",
        half === "dark" ? "top-full" : half === "join" ? "top-0" : "top-[var(--seam)]",
        className,
      )}
    >
      <RingSet radii={RADII} className="size-full" stroke={half === "light" ? "stroke-ink/15" : "stroke-white/20"} dashedOuter />
    </div>
  );
}
