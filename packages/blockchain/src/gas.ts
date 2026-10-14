import type { PublicClient } from "viem";
import { arcNativeToUsdcUnits, type NetworkConfig } from "@plinth/shared";

export interface FeeQuote {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

/** Fee quote respecting per-network floors (Arc rejects maxFeePerGas < 20 gwei). */
export async function quoteFees(client: PublicClient, net: NetworkConfig): Promise<FeeQuote> {
  const est = await client.estimateFeesPerGas();
  let maxFeePerGas = est.maxFeePerGas ?? (await client.getGasPrice());
  const maxPriorityFeePerGas = est.maxPriorityFeePerGas ?? 0n;
  const floor = net.gas.minMaxFeePerGasWei;
  if (floor !== undefined && maxFeePerGas < floor) maxFeePerGas = floor;
  // 20% headroom: base fee can rise between quote and inclusion.
  maxFeePerGas = (maxFeePerGas * 120n) / 100n;
  return { maxFeePerGas, maxPriorityFeePerGas };
}

/**
 * Replacement transactions must raise both fee fields by >= 10%; use 25% to be safe. The bump is relative to
 * the fee that was actually quoted (plus 1 wei, so a zero tip still increases): there is no fixed fee here.
 */
export function bumpFees(prev: FeeQuote, pct = 25n): FeeQuote {
  const bump = (v: bigint) => (v * (100n + pct)) / 100n + 1n;
  return { maxFeePerGas: bump(prev.maxFeePerGas), maxPriorityFeePerGas: bump(prev.maxPriorityFeePerGas) };
}

export interface GasCost {
  /** Raw fee in the chain's native unit (wei; 18 decimals on every supported chain). */
  nativeWei: bigint;
  nativeSymbol: string;
  /** On Arc the native unit IS USDC: cost in 6-decimal USDC base units. Null elsewhere. */
  usdcUnits: bigint | null;
}

export function gasCost(net: NetworkConfig, gasUsed: bigint, effectiveGasPrice: bigint): GasCost {
  const nativeWei = gasUsed * effectiveGasPrice;
  return {
    nativeWei,
    nativeSymbol: net.nativeCurrency.symbol,
    usdcUnits: net.gas.model === "usdc-native" ? arcNativeToUsdcUnits(nativeWei) : null,
  };
}
