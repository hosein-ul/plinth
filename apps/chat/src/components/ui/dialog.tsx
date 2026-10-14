"use client";
import * as React from "react";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({ title, description, children, className }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-40 bg-ink/35 data-[state=open]:animate-[fade-in_var(--duration-base)_var(--ease-out)]" />
      <D.Content
        className={cn(
          "fixed left-1/2 top-[8vh] z-50 w-[min(92vw,34rem)] -translate-x-1/2 rounded-card border border-line bg-raised shadow-float focus:outline-none data-[state=open]:animate-[pop-in_var(--duration-base)_var(--ease-out)]",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 px-6 pb-1 pt-6">
          <div>
            <D.Title className="t-3 text-ink">{title}</D.Title>
            {description && <D.Description className="mt-1 text-sm text-ink-3">{description}</D.Description>}
          </div>
          <D.Close className="-mr-2 -mt-2 grid size-8 place-items-center rounded-ctl text-ink-3 transition-colors hover:bg-sunk hover:text-ink" aria-label="Close">
            <X className="size-4" aria-hidden />
          </D.Close>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-6 pb-6 pt-4">{children}</div>
      </D.Content>
    </D.Portal>
  );
}
