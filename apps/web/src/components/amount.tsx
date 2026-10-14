import { cn } from "@/lib/cn";
import { splitAmount } from "@/lib/format";

const sizes = {
  sm: "text-sm",
  md: "text-[0.9375rem]",
  lg: "text-xl",
  xl: "text-[2rem] leading-none",
  display: "text-[3.25rem] leading-none",
} as const;

/** Token amount (USDC unless `symbol` says otherwise) with a dimmed fractional part so magnitudes read at a glance. Exact decimal string in. */
export function Amount({ value, size = "md", unit = true, symbol = "USDC", className }: { value: string; size?: keyof typeof sizes; unit?: boolean; symbol?: string; className?: string; serif?: boolean }) {
  const { whole, fraction } = splitAmount(value);
  const big = size === "lg" || size === "xl" || size === "display";
  return (
    <span className={cn("tnum whitespace-nowrap font-medium", big ? "tracking-[-0.04em]" : "tracking-[-0.01em]", sizes[size], className)}>
      <span className="text-ink">{whole}</span>
      <span className="text-ink-4">{fraction}</span>
      {unit && <span className={cn("ml-1.5 font-medium tracking-normal text-ink-3", big ? "text-[0.4em]" : "text-[0.8em]")}>{symbol}</span>}
    </span>
  );
}
