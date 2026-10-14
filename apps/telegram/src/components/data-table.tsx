"use client";
import * as React from "react";
import { cn } from "@/lib/cn";
import { Skeleton } from "./page";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  align?: "left" | "right";
  className?: string;
  /** Hide below this breakpoint to keep tables legible on phones. */
  hideBelow?: "sm" | "md" | "lg";
}

const hide = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" } as const;

/** A white card holding a table: sunk header, 52 px rows, hover wash, right-aligned figures. */
export function DataTable<T>({
  columns, rows, loading, empty, onRowClick, rowKey, caption,
}: { columns: Column<T>[]; rows: T[] | undefined; loading?: boolean; empty?: React.ReactNode; onRowClick?: (row: T) => void; rowKey: (row: T) => string; caption: string }) {
  const showEmpty = !loading && rows && rows.length === 0;
  if (showEmpty) return <>{empty}</>;
  return (
    <div className="card-flat w-full overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-line bg-wash">
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cn("whitespace-nowrap px-2.5 py-2.5 text-xs font-medium text-ink-3 first:pl-4 last:pr-4 sm:px-4 sm:first:pl-5 sm:last:pr-5", c.align === "right" && "text-right", c.hideBelow && hide[c.hideBelow])}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  {columns.map((c) => (
                    <td key={c.key} className={cn("h-[52px] px-2.5 first:pl-4 last:pr-4 sm:px-4 sm:first:pl-5 sm:last:pr-5", c.hideBelow && hide[c.hideBelow])}>
                      <Skeleton className="h-3.5 w-full max-w-28" />
                    </td>
                  ))}
                </tr>
              ))}
            {!loading &&
              rows?.map((r) => (
                <tr
                  key={rowKey(r)}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                  onKeyDown={onRowClick ? (e) => { if (e.key === "Enter") onRowClick(r); } : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  className={cn("border-b border-line transition-colors duration-[var(--duration-fast)] last:border-0", onRowClick && "cursor-pointer hover:bg-wash focus-visible:bg-wash focus-visible:outline-none focus-visible:shadow-[inset_2px_0_0_var(--color-signal)]")}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={cn("h-[52px] px-2.5 align-middle text-sm text-ink first:pl-4 last:pr-4 sm:px-4 sm:first:pl-5 sm:last:pr-5", c.align === "right" && "text-right", c.hideBelow && hide[c.hideBelow], c.className)}>
                      {c.cell(r)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
