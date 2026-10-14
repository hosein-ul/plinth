import { getAddress, type Address } from "viem";
import { NETWORKS } from "./networks";

/** Where an invoice's funds finally go. Mirrors the Solidity `DestinationKind` enum (VAULT = 0, DIRECT = 1). */
export type DestinationKind = "VAULT" | "DIRECT";
export const DESTINATION_KINDS: readonly DestinationKind[] = ["VAULT", "DIRECT"];
export const destinationKindIndex = (k: DestinationKind): 0 | 1 => (k === "VAULT" ? 0 : 1);
export const destinationKindFromIndex = (i: number): DestinationKind => {
  if (i !== 0 && i !== 1) throw new Error(`Unknown destination kind ${i}`);
  return i === 0 ? "VAULT" : "DIRECT";
};

/** Platform fee in basis points: 20 = 0.20%. */
export const DEFAULT_FEE_BPS = 20;
/** The immutable cap baked into every deployed implementation (1%). No invoice can carry more. */
export const MAX_FEE_BPS = 100;

/** Plain EOA (assumed, and checked for code on every network before use). Rotating it means deploying a new implementation version. */
export const DEFAULT_TREASURY: Address = "0xc0d1ac70a3a32bcea4a124e65eb22eb5f0d0adc2";

/**
 * Treasury per network. Every network points at the same address today; change one entry to use a different
 * address on a single network. The value is read by the deploy tooling and compared with what the deployed
 * implementation reports on-chain (`InvoiceDeposit.TREASURY()`), so a mismatch is caught before a network opens.
 */
export const TREASURY_BY_NETWORK: Record<string, Address> = Object.fromEntries(
  Object.keys(NETWORKS).map((id) => [id, DEFAULT_TREASURY]),
);

export function treasuryFor(networkId: string): Address {
  return getAddress(TREASURY_BY_NETWORK[networkId] ?? DEFAULT_TREASURY);
}

/** floor(amount * feeBps / 10_000): exactly what the contract computes, in the payment token's own units. */
export function computeFee(amount: bigint, feeBps: number): bigint {
  return (amount * BigInt(feeBps)) / 10_000n;
}

export function assertValidFeeBps(feeBps: number, cap: number = MAX_FEE_BPS): number {
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > cap) throw new Error(`Fee must be a whole number of basis points between 0 and ${cap}`);
  return feeBps;
}

/**
 * The fee for a merchant: their own override when set, otherwise the platform default. Always within the
 * on-chain cap, so a bad config value can never produce an address the factory would refuse.
 */
export function resolveFeeBps(merchantOverride: number | null | undefined, platformDefault: number = DEFAULT_FEE_BPS, cap: number = MAX_FEE_BPS): number {
  return assertValidFeeBps(merchantOverride ?? platformDefault, cap);
}

/** "0.20%" for 20, "1%" for 100. */
export function formatFeePercent(feeBps: number): string {
  const pct = feeBps / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}%`;
}
