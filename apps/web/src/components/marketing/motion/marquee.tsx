import { cn } from "@/lib/cn";

/** Endless horizontal drift. Pure CSS (transform only), pauses on hover, static and wrapped under reduced motion. */
export function Marquee({ children, className, seconds = 46, reverse }: { children: React.ReactNode; className?: string; seconds?: number; reverse?: boolean }) {
  return (
    <div className={cn("group/marquee mask-fade-x overflow-hidden motion-reduce:[mask:none]", className)}>
      <div
        className={cn(
          "flex w-max [animation:marquee_var(--mq)_linear_infinite] group-hover/marquee:[animation-play-state:paused] motion-reduce:w-auto motion-reduce:animate-none motion-reduce:flex-wrap motion-reduce:justify-center",
          reverse && "[animation-direction:reverse]",
        )}
        style={{ "--mq": `${seconds}s` } as React.CSSProperties}
      >
        <div className="flex shrink-0 items-center gap-3 pr-3 motion-reduce:min-w-0 motion-reduce:shrink motion-reduce:flex-wrap motion-reduce:justify-center">{children}</div>
        <div aria-hidden className="flex shrink-0 items-center gap-3 pr-3 motion-reduce:hidden">{children}</div>
      </div>
    </div>
  );
}
