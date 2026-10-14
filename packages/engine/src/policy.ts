import type { NetworkConfig } from "@plinth/shared";
import type { RelayerPolicy } from "./context";

const E18 = 10n ** 18n;

/**
 * Testnet defaults are generous. Mainnet has NO default: an operator must set
 * RELAYER_POLICY_<NETWORK> (JSON) explicitly, otherwise the relayer for that network stays disabled.
 * Wei fields are decimal strings in JSON.
 */
export function resolveRelayerPolicy(net: NetworkConfig, env: Record<string, string | undefined> = process.env): RelayerPolicy | null {
  const key = `RELAYER_POLICY_${net.id.toUpperCase().replace(/-/g, "_")}`;
  const raw = env[key];
  if (raw) {
    const j = JSON.parse(raw) as Record<string, string | number>;
    const big = (k: string) => BigInt(String(j[k] ?? (() => { throw new Error(`${key}.${k} missing`); })()));
    return {
      maxDailyGasWei: big("maxDailyGasWei"),
      maxFeePerTxWei: big("maxFeePerTxWei"),
      maxOpsPerDay: Number(j.maxOpsPerDay ?? 2000),
      minBalanceWei: big("minBalanceWei"),
      lowBalanceAlertWei: big("lowBalanceAlertWei"),
      replaceAfterSeconds: Number(j.replaceAfterSeconds ?? 90),
      maxReplacements: Number(j.maxReplacements ?? 4),
      minSweepUnits: BigInt(String(j.minSweepUnits ?? 10_000)),
      maxSettlementAttempts: Number(j.maxSettlementAttempts ?? 5),
    };
  }
  if (net.environment === "mainnet") return null;
  const arc = net.gas.model === "usdc-native";
  return {
    maxDailyGasWei: arc ? 50n * E18 : E18 / 2n,
    maxFeePerTxWei: arc ? E18 : E18 / 100n,
    maxOpsPerDay: 5000,
    minBalanceWei: arc ? E18 / 10n : E18 / 1000n,
    lowBalanceAlertWei: arc ? 2n * E18 : E18 / 50n,
    replaceAfterSeconds: 60,
    maxReplacements: 4,
    minSweepUnits: 10_000n,
    maxSettlementAttempts: 5,
  };
}
