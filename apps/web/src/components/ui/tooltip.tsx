"use client";
import * as React from "react";
import * as T from "@radix-ui/react-tooltip";

export function Tip({ content, children }: { content: React.ReactNode; children: React.ReactNode }) {
  return (
    <T.Provider delayDuration={250}>
      <T.Root>
        <T.Trigger asChild>{children}</T.Trigger>
        <T.Portal>
          <T.Content sideOffset={6} className="z-50 max-w-72 rounded-[10px] bg-ink px-3 py-2 text-xs leading-relaxed text-on-ink shadow-float data-[state=delayed-open]:animate-[fade-in_var(--duration-fast)_var(--ease-out)]">
            {content}
            <T.Arrow className="fill-ink" />
          </T.Content>
        </T.Portal>
      </T.Root>
    </T.Provider>
  );
}
