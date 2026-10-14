"use client";
import { useEffect } from "react";

/**
 * Looping CSS animations keep the compositor busy even when nothing is on screen, which is what makes long pages stutter on
 * phones. This marks every section that is far outside the viewport so globals.css can pause the animations inside it.
 */
export function OffscreenPause() {
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.target.toggleAttribute("data-offscreen", !e.isIntersecting)),
      { rootMargin: "20% 0px" },
    );
    document.querySelectorAll("main section, footer").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return null;
}
