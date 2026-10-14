"use client";
import { useEffect, useState } from "react";

/**
 * True when the visitor asks for reduced motion. Always false on the server and during hydration so
 * markup matches, then updates after mount.
 */
export function useReduced(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}
