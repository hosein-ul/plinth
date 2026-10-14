/* eslint-disable @next/next/no-img-element */
import { HeroGlassLive } from "@/components/marketing/hero-glass-live";

/**
 * The hero background: a sculpted, iridescent liquid-glass ribbon, rendered once offline (a physically based material under a
 * studio environment) and shipped as a small image. A live shader cannot reach this finish at a cost a phone can pay, and an
 * image costs nothing per frame. The only motion is a slow CSS drift, which stops for reduced motion.
 *
 * On a desktop with a mouse the same scene then runs live over this poster (hero-glass-live.tsx) and takes over once drawn.
 *
 * The art is white at the top-left on purpose: the headline sits there. Desktop and phone have their own crops.
 */
export function HeroGlass() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <picture>
        <source media="(min-width: 1280px)" srcSet="/hero/glass-desktop.webp" />
        <img
          src="/hero/glass-mobile.webp"
          alt=""
          width={1170}
          height={1500}
          fetchPriority="high"
          decoding="async"
          className="hero-glass-drift absolute bottom-0 right-0 h-[min(78%,52rem)] w-full select-none object-cover object-top xl:inset-0 xl:h-full xl:w-full xl:object-[right_bottom]"
        />
      </picture>
      <HeroGlassLive />
    </div>
  );
}
