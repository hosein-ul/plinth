/* eslint-disable @next/next/no-img-element */
import { HeroGlassLive } from "@/components/marketing/hero-glass-live";

/**
 * The hero background: large sheets of iridescent glass, drawn live by a WebGL shader (hero-glass-live.tsx) on every device that
 * has WebGL. These two images are frames of that same shader. They paint first, stay if WebGL is missing, and the live canvas
 * fades in over them once its first frame is drawn, so the swap is invisible.
 *
 * The art is quiet on the left (top on phones) on purpose: the headline sits there.
 */
export function HeroGlass() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <picture>
        <source media="(min-aspect-ratio: 11/10)" srcSet="/hero/glass-desktop.webp" />
        <img
          src="/hero/glass-mobile.webp"
          alt=""
          width={780}
          height={2008}
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 h-full w-full select-none object-cover object-top [@media(min-aspect-ratio:11/10)]:object-fill"
        />
      </picture>
      <HeroGlassLive />
    </div>
  );
}
