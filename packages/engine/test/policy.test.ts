import { describe, expect, it } from "vitest";
import { NETWORKS } from "@plinth/shared";
import { resolvePolicyDetails, resolveRelayerPolicy } from "../src";

describe("relayer spending policy defaults", () => {
  it("every registry network resolves a policy without any configuration", () => {
    for (const net of Object.values(NETWORKS)) {
      const r = resolvePolicyDetails(net, {});
      expect(r.source).toBe("default");
      expect(r.policy.maxFeePerTxWei).toBeGreaterThan(0n);
      expect(r.policy.maxDailyGasWei).toBeGreaterThanOrEqual(r.policy.maxFeePerTxWei);
      expect(r.policy.lowBalanceAlertWei).toBeGreaterThanOrEqual(r.policy.minBalanceWei);
      expect(r.policy.maxOpsPerDay).toBeGreaterThan(0);
    }
  });

  it("L2 mainnets are capped low and Ethereum mainnet is allowed more", () => {
    const l2 = ["base-mainnet", "optimism-mainnet", "arbitrum-mainnet"].map((id) => resolveRelayerPolicy(NETWORKS[id as keyof typeof NETWORKS], {}));
    const eth = resolveRelayerPolicy(NETWORKS["ethereum-mainnet"], {});
    for (const p of l2) {
      expect(p.maxFeePerTxWei).toBeLessThan(eth.maxFeePerTxWei);
      expect(p.maxDailyGasWei).toBeLessThan(eth.maxDailyGasWei);
    }
    // Ethereum also asks for a bigger minimum sweep, since each operation costs far more.
    expect(eth.minSweepUnits).toBeGreaterThan(l2[0]!.minSweepUnits);
  });

  it("each network can override any field through RELAYER_POLICY_<NETWORK>; the rest keeps its tier default", () => {
    const base = resolveRelayerPolicy(NETWORKS["base-mainnet"], {});
    const r = resolvePolicyDetails(NETWORKS["base-mainnet"], { RELAYER_POLICY_BASE_MAINNET: JSON.stringify({ maxFeePerTxWei: "123456789", maxOpsPerDay: 7 }) });
    expect(r.source).toBe("env");
    expect(r.policy.maxFeePerTxWei).toBe(123456789n);
    expect(r.policy.maxOpsPerDay).toBe(7);
    expect(r.policy.maxDailyGasWei).toBe(base.maxDailyGasWei);
    // another network is unaffected
    expect(resolveRelayerPolicy(NETWORKS["optimism-mainnet"], { RELAYER_POLICY_BASE_MAINNET: "{}" }).maxOpsPerDay).toBe(base.maxOpsPerDay);
  });

  it("a malformed override fails loudly instead of silently using a default", () => {
    expect(() => resolveRelayerPolicy(NETWORKS["base-mainnet"], { RELAYER_POLICY_BASE_MAINNET: "{not json" })).toThrow();
  });
});
