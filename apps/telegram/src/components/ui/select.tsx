"use client";
import * as React from "react";
import * as S from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export interface Option { value: string; label: string; hint?: string; disabled?: boolean }

export function Select({
  value, onValueChange, options, placeholder, id, className, disabled, "aria-label": ariaLabel,
}: { value: string; onValueChange: (v: string) => void; options: Option[]; placeholder?: string; id?: string; className?: string; disabled?: boolean; "aria-label"?: string }) {
  return (
    <S.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <S.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          "group inline-flex h-10 w-full items-center justify-between gap-2 rounded-ctl border border-line-strong bg-raised px-3 text-sm text-ink shadow-ctl transition-[border-color,box-shadow] duration-[var(--duration-fast)] hover:border-ink-4 focus-visible:border-signal focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-signal/20 disabled:bg-sunk disabled:text-ink-3 data-[placeholder]:text-ink-4",
          className,
        )}
      >
        <S.Value placeholder={placeholder} />
        <S.Icon><ChevronDown className="size-4 text-ink-3 transition-transform duration-[var(--duration-fast)] group-data-[state=open]:rotate-180" aria-hidden /></S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content position="popper" sideOffset={6} className="z-50 min-w-[var(--radix-select-trigger-width)] origin-[var(--radix-select-content-transform-origin)] overflow-hidden rounded-card border border-line bg-raised shadow-float data-[state=open]:animate-[menu-in_var(--duration-fast)_var(--ease-out)]">
          <S.Viewport className="p-1.5">
            {options.map((o) => (
              <S.Item key={o.value} value={o.value} disabled={o.disabled} className="relative flex cursor-default select-none items-center justify-between gap-6 rounded-[9px] py-2 pl-3 pr-9 text-sm text-ink outline-none data-[disabled]:text-ink-4 data-[highlighted]:bg-sunk">
                <S.ItemText>{o.label}</S.ItemText>
                {o.hint && <span className="text-xs text-ink-3">{o.hint}</span>}
                <S.ItemIndicator className="absolute right-2.5"><Check className="size-4 text-signal" aria-hidden /></S.ItemIndicator>
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
}
