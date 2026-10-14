"use client";
import { useEffect, useState } from "react";

/**
 * True on phones and other coarse-pointer small screens. Scroll-linked and clip-path effects are expensive on the main thread,
 * so on these screens the motion components fall back to compositor-only fades and rises, or to nothing. False on the server
 * and during hydration so markup matches.
 */
export function useCompact(): boolean {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setCompact(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return compact;
}
