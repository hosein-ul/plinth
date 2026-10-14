/**
 * Formerly pulled its child toward the pointer. That made buttons jitter under the cursor (the button moves, the pointer is
 * then over a different part of it, the spring pulls again), so it is now a plain wrapper. Kept so call sites need no change.
 */
export function Magnetic({ children, className }: { children: React.ReactNode; strength?: number; className?: string }) {
  return <span className={className} style={{ display: "inline-flex" }}>{children}</span>;
}
