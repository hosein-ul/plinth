"use client";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TokenIcon } from "@/components/brand/token-icon";
import type { TokenSymbol } from "@/lib/tokens";

/** Segmented choice of payment token. Rendered only when the merchant can take more than one. */
export function TokenPicker({ tokens, value, onChange, label = "Currency", compact }: { tokens: TokenSymbol[]; value: TokenSymbol; onChange: (t: TokenSymbol) => void; label?: string; compact?: boolean }) {
  if (tokens.length < 2) return null;
  return (
    <div>
      {!compact && <p className="label mb-1.5">{label}</p>}
      <Tabs value={value} onValueChange={(v) => onChange(v as TokenSymbol)}>
        <TabsList aria-label={label}>
          {tokens.map((t) => (
            <TabsTrigger key={t} value={t} className="inline-flex items-center gap-2"><TokenIcon symbol={t} size={16} />{t}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}
