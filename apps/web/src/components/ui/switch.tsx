"use client";
import * as React from "react";
import * as S from "@radix-ui/react-switch";
import { cn } from "@/lib/cn";

export function Switch({ className, ...p }: React.ComponentProps<typeof S.Root>) {
  return (
    <S.Root
      className={cn("relative h-6 w-[42px] shrink-0 rounded-full bg-line-strong shadow-[inset_0_1px_2px_rgb(15_23_42/0.12)] transition-colors duration-[var(--duration-fast)] data-[state=checked]:bg-signal disabled:opacity-50", className)}
      {...p}
    >
      <S.Thumb className="block size-[18px] translate-x-[3px] rounded-full bg-raised shadow-[0_1px_2px_rgb(15_23_42/0.25),0_2px_6px_rgb(15_23_42/0.15)] transition-transform duration-[var(--duration-base)] ease-[var(--ease-out)] data-[state=checked]:translate-x-[21px]" />
    </S.Root>
  );
}
