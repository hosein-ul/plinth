import { describe, expect, it } from "vitest";
import {
  DEFAULT_FEE_BPS,
  DEFAULT_TREASURY,
  MAX_FEE_BPS,
  NETWORK_IDS,
  TREASURY_BY_NETWORK,
  assertValidFeeBps,
  computeFee,
  destinationKindFromIndex,
  destinationKindIndex,
  formatFeePercent,
  resolveFeeBps,
  treasuryFor,
} from "../src";

describe("platform fee", () => {
  it("defaults to 0.20% with a 1% cap", () => {
    expect(DEFAULT_FEE_BPS).toBe(20);
    expect(MAX_FEE_BPS).toBe(100);
    expect(formatFeePercent(DEFAULT_FEE_BPS)).toBe("0.2%");
    expect(formatFeePercent(MAX_FEE_BPS)).toBe("1%");
    expect(formatFeePercent(0)).toBe("0%");
    expect(formatFeePercent(25)).toBe("0.25%");
  });

  it("computes the same floor(amount * bps / 10000) as the contract", () => {
    expect(computeFee(125_000_000n, 20)).toBe(250_000n);
    expect(computeFee(499n, 20)).toBe(0n);
    expect(computeFee(500n, 20)).toBe(1n);
    expect(computeFee(1_000_000_000n, 0)).toBe(0n);
    expect(computeFee(1_000_000_000n, 100)).toBe(10_000_000n);
    // outputs always add up
    for (const a of [1n, 7n, 999n, 123_456_789n]) expect(computeFee(a, 20) + (a - computeFee(a, 20))).toBe(a);
  });

  it("a merchant override is bounded by the cap and falls back to the platform default", () => {
    expect(resolveFeeBps(null)).toBe(20);
    expect(resolveFeeBps(undefined)).toBe(20);
    expect(resolveFeeBps(0)).toBe(0);
    expect(resolveFeeBps(100)).toBe(100);
    expect(() => resolveFeeBps(101)).toThrow();
    expect(() => resolveFeeBps(-1)).toThrow();
    expect(() => resolveFeeBps(1.5)).toThrow();
    expect(() => assertValidFeeBps(500)).toThrow();
    expect(assertValidFeeBps(500, 1000)).toBe(500);
  });

  it("destination kinds map to the Solidity enum", () => {
    expect(destinationKindIndex("VAULT")).toBe(0);
    expect(destinationKindIndex("DIRECT")).toBe(1);
    expect(destinationKindFromIndex(0)).toBe("VAULT");
    expect(destinationKindFromIndex(1)).toBe("DIRECT");
    expect(() => destinationKindFromIndex(2)).toThrow();
  });

  it("every registry network has a treasury entry", () => {
    for (const id of NETWORK_IDS) expect(TREASURY_BY_NETWORK[id]).toBe(DEFAULT_TREASURY);
    expect(treasuryFor("arc-testnet")).toBe("0xC0d1AC70A3A32BceA4a124e65eb22eb5f0d0Adc2");
    expect(treasuryFor("some-local-net")).toBe("0xC0d1AC70A3A32BceA4a124e65eb22eb5f0d0Adc2");
  });
});
