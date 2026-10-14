import { TokenEURC, TokenUSDC, TokenUSDT } from "@web3icons/react";
import { cn } from "@/lib/cn";

export type TokenSymbol = "USDC" | "USDT" | "EURC";

const tokens = { USDC: TokenUSDC, USDT: TokenUSDT, EURC: TokenEURC } as const;

/** Token mark from @web3icons/react, unedited, in its branded variant (all three are round and read on light and dark). */
export function TokenIcon({ symbol, size = 20, className }: { symbol: TokenSymbol | (string & {}); size?: number; className?: string }) {
  const Icon = tokens[symbol.toUpperCase() as TokenSymbol];
  if (!Icon) {
    return (
      <span
        role="img"
        aria-label={symbol}
        className={cn("inline-grid shrink-0 place-items-center rounded-full bg-sunk font-semibold text-ink-2", className)}
        style={{ width: size, height: size, fontSize: Math.max(8, size * 0.36) }}
      >
        {symbol.slice(0, 1)}
      </span>
    );
  }
  return <Icon variant="branded" size={size} className={cn("shrink-0", className)} role="img" aria-label={symbol.toUpperCase()} />;
}
