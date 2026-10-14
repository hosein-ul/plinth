"use client";
import * as React from "react";
import * as T from "@radix-ui/react-tabs";
import { cn } from "@/lib/cn";

export const Tabs = T.Root;

/** Segmented control: a sunk track with a raised active segment. */
export function TabsList({ className, ...p }: React.ComponentProps<typeof T.List>) {
  return <T.List className={cn("inline-flex gap-0.5 rounded-[13px] bg-sunk p-1", className)} {...p} />;
}

export function TabsTrigger({ className, ...p }: React.ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        "h-8 rounded-[10px] px-3.5 text-sm font-medium text-ink-3 transition-[background-color,color,box-shadow] duration-[var(--duration-fast)] hover:text-ink data-[state=active]:bg-raised data-[state=active]:text-ink data-[state=active]:shadow-[0_1px_2px_rgb(15_23_42/0.12)]",
        className,
      )}
      {...p}
    />
  );
}

export const TabsContent = T.Content;
