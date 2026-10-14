import { describe, expect, it } from "vitest";
import type { PublicClient } from "viem";
import { NETWORKS } from "@plinth/shared";
import { bumpFees, quoteFees } from "../src";

const GWEI = 1_000_000_000n;
const fakeClient = (est: { maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint }, gasPrice = 0n) =>
  ({ estimateFeesPerGas: async () => est, getGasPrice: async () => gasPrice }) as unknown as PublicClient;

describe("fees come from the live network at send time", () => {
  it("follows whatever the node quotes, with only a proportional safety margin", async () => {
    const base = NETWORKS["base-mainnet"];
    const cheap = await quoteFees(fakeClient({ maxFeePerGas: 1_000_000n, maxPriorityFeePerGas: 1_000n }), base);
    const busy = await quoteFees(fakeClient({ maxFeePerGas: 50n * GWEI, maxPriorityFeePerGas: 2n * GWEI }), base);
    expect(cheap.maxFeePerGas).toBe(1_200_000n); // +20% headroom over the quote, no fixed price
    expect(busy.maxFeePerGas).toBe(60n * GWEI);
    expect(busy.maxPriorityFeePerGas).toBe(2n * GWEI);
  });

  it("falls back to the node's gas price when it gives no EIP-1559 estimate", async () => {
    const q = await quoteFees(fakeClient({}, 7_000_000n), NETWORKS["base-mainnet"]);
    expect(q.maxFeePerGas).toBe(8_400_000n);
  });

  it("applies a network's own fee floor (Arc) but only as a floor", async () => {
    const arc = NETWORKS["arc-testnet"];
    expect((await quoteFees(fakeClient({ maxFeePerGas: GWEI, maxPriorityFeePerGas: 0n }), arc)).maxFeePerGas).toBe((20n * GWEI * 120n) / 100n);
    expect((await quoteFees(fakeClient({ maxFeePerGas: 100n * GWEI, maxPriorityFeePerGas: 0n }), arc)).maxFeePerGas).toBe(120n * GWEI);
  });

  it("a replacement raises the fee that was actually quoted, never to a fixed value", () => {
    const b = bumpFees({ maxFeePerGas: 10n * GWEI, maxPriorityFeePerGas: 2n * GWEI });
    expect(b.maxFeePerGas).toBe(12_500_000_001n);
    expect(b.maxPriorityFeePerGas).toBe(2_500_000_001n);
    // a zero tip still moves up (by one wei), it is not replaced by a hardcoded 1 gwei
    expect(bumpFees({ maxFeePerGas: GWEI, maxPriorityFeePerGas: 0n }).maxPriorityFeePerGas).toBe(1n);
  });
});
