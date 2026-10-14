"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";

/** Same look as the ink `Code` sample, with a copy button in the caption bar. */
export function CopyCode({ label, children, className }: { label: string; children: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <figure className={cn("overflow-hidden rounded-card bg-ink shadow-soft", className)}>
      <figcaption className="flex items-center gap-2 border-b border-white/10 py-1.5 pl-4 pr-2 text-xs text-white/55">
        <span aria-hidden className="flex gap-1.5"><i className="size-2 rounded-full bg-white/20" /><i className="size-2 rounded-full bg-white/20" /><i className="size-2 rounded-full bg-white/20" /></span>
        <span className="ml-1 min-w-0 flex-1 truncate font-mono">{label}</span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(children);
              setDone(true);
              setTimeout(() => setDone(false), 1600);
            } catch {
              /* clipboard unavailable: the sample stays selectable */
            }
          }}
          className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-white/70 transition-colors duration-[var(--duration-fast)] hover:bg-white/10 hover:text-white"
          aria-label={done ? "Copied" : `Copy ${label}`}
        >
          {done ? <Check className="size-3.5 text-signal" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          <span aria-live="polite">{done ? "Copied" : "Copy"}</span>
        </button>
      </figcaption>
      <pre className="overflow-x-auto p-4 font-mono text-[0.8125rem] leading-6 text-white/85"><code>{children}</code></pre>
    </figure>
  );
}
