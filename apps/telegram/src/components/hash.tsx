import { ArrowUpRight } from "lucide-react";
import { shortHash } from "@/lib/format";
import { cn } from "@/lib/cn";
import { CopyButton } from "./copy-button";

/** Address / hash in mono with copy and an optional explorer link. Full value stays in the DOM for selection. */
export function Hash({ value, href, lead = 6, tail = 4, className, copy = true }: { value: string; href?: string | null; lead?: number; tail?: number; className?: string; copy?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5 whitespace-nowrap font-mono text-[0.8125rem] text-ink-2", className)}>
      <span title={value}>{shortHash(value, lead, tail)}</span>
      {copy && <CopyButton value={value} compact />}
      {href && (
        <a href={href} target="_blank" rel="noreferrer noopener" className="inline-grid size-6 place-items-center rounded-md text-ink-4 transition-colors hover:bg-sunk hover:text-ink" aria-label="Open in block explorer">
          <ArrowUpRight className="size-3.5" aria-hidden />
        </a>
      )}
    </span>
  );
}
