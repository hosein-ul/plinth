"use client";
import * as React from "react";
import { CopyButton } from "@/components/copy-button";
import { shortHash } from "@/lib/format";
import { cn } from "@/lib/cn";

/** Keeps clicks and Enter on inner controls from triggering the surrounding clickable table row. */
export function StopRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center", className)} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      {children}
    </span>
  );
}

/** Two-line payment cell: reference on top, mono id with copy below. */
export function PaymentCell({ title, id, idLead = 10, idTail = 4 }: { title: string; id: string; idLead?: number; idTail?: number }) {
  return (
    <div className="min-w-0">
      <p className="max-w-[18rem] truncate max-sm:max-w-[7rem] font-medium text-ink">{title}</p>
      <div className="-ml-0.5 flex items-center gap-0.5">
        <span className="whitespace-nowrap font-mono text-xs text-ink-3 max-sm:inline-block max-sm:max-w-[5.5rem] max-sm:truncate" title={id}>{shortHash(id, idLead, idTail)}</span>
        <StopRow className="max-sm:hidden"><CopyButton value={id} compact label="Copy ID" /></StopRow>
      </div>
    </div>
  );
}

/** Section heading that sits above a DataTable (the table brings its own card). */
export function TableHeading({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="t-3 text-ink">{title}</h2>
        {description && <p className="mt-0.5 max-w-xl text-sm text-ink-3">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

/** One-line empty message for a table slot inside a detail page. */
export function QuietEmpty({ children }: { children: React.ReactNode }) {
  return <div className="card-flat px-5 py-4 text-sm text-ink-3">{children}</div>;
}
