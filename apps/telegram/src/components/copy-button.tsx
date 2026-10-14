"use client";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";

export function CopyButton({ value, label = "Copy", className, compact }: { value: string; label?: string; className?: string; compact?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch {
          /* clipboard unavailable (insecure context): the value stays selectable on screen */
        }
      }}
      className={cn(
        "inline-flex items-center gap-1.5 text-sm font-medium transition-colors duration-[var(--duration-fast)]",
        compact ? "size-6 justify-center rounded-md text-ink-4 hover:bg-sunk hover:text-ink" : "h-8 rounded-ctl border border-line-strong bg-raised px-2.5 text-ink shadow-ctl hover:bg-wash",
        className,
      )}
      aria-label={done ? "Copied" : `${label} ${value.slice(0, 10)}…`}
    >
      {done ? <Check className="size-3.5 text-signal animate-[tick-in_var(--duration-fast)_var(--ease-out)]" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      {!compact && <span aria-live="polite">{done ? "Copied" : label}</span>}
    </button>
  );
}
