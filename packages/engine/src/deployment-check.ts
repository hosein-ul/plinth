import { isAddressEqual } from "viem";
import { treasuryFor } from "@plinth/shared";
import type { ChainRuntime, Engine } from "./context";

/** How often a network's deployed contracts are re-read from the chain and compared with the records. */
const RECHECK_EVERY_MS = 5 * 60_000;

/**
 * Compare what the deployed contracts report about themselves with what we recorded and configured:
 * token, chain id, version, treasury and fee cap on the implementation, factory and router, plus the
 * wiring between them. A mismatch means invoice addresses could be derived for the wrong contracts, so
 * the network stops accepting new payments. `registry` networks (not local/dev chains) must also use the
 * treasury configured for them in TREASURY_BY_NETWORK.
 */
export async function verifyDeployment(e: Engine, chain: ChainRuntime, registry: boolean): Promise<string[]> {
  const reasons: string[] = [];
  const d = chain.deployment;
  const net = chain.network;
  let f;
  try {
    f = await chain.adapter.readDeploymentFacts();
  } catch (err) {
    return [`deployed contracts could not be read from the chain (${err instanceof Error ? err.message.slice(0, 80) : "RPC error"})`];
  }
  const same = (a: string, b: string) => isAddressEqual(a as `0x${string}`, b as `0x${string}`);
  const need = (cond: boolean, why: string) => {
    if (!cond) reasons.push(why);
  };

  need(same(f.implementation.token, net.usdc.address), "implementation token is not the network's official token");
  need(f.implementation.chainId === net.chainId && f.factory.chainId === net.chainId, "implementation or factory was built for a different chain id");
  need(f.implementation.version === d.version && f.factory.version === d.version, "contract version differs from the deployment record");
  need(same(f.implementation.treasury, d.treasury) && same(f.factory.treasury, d.treasury) && same(f.router.treasury, d.treasury), "treasury on the contracts differs from the deployment record");
  need(f.implementation.maxFeeBps === d.maxFeeBps && f.factory.maxFeeBps === d.maxFeeBps && f.router.maxFeeBps === d.maxFeeBps, "fee cap on the contracts differs from the deployment record");
  need(same(f.factory.implementation, d.invoiceImplementation), "factory points at a different implementation");
  need(same(f.factory.vaults, d.vaultFactory) && same(f.router.vaults, d.vaultFactory), "factory or router points at a different vault registry");
  need(same(f.factory.token, net.usdc.address) && same(f.router.token, net.usdc.address), "factory or router token is not the network's official token");
  need(e.cfg.platformFeeBps <= d.maxFeeBps, "the platform fee is above the fee cap deployed on this network");
  if (registry) need(same(d.treasury, treasuryFor(net.id)), `treasury differs from the one configured for ${net.id}`);

  if (f.treasuryHasCode) {
    // Assumed to be a plain EOA. A contract is not forbidden, but it is unexpected and worth a human check.
    await e.alerts.raise({
      key: `treasury-has-code:${net.id}`, severity: "warning",
      title: `The treasury ${d.treasury} has contract code on ${net.name}. It is assumed to be a plain account.`,
      detail: { network: net.id, treasury: d.treasury },
    });
  }
  return reasons;
}

/** Re-run the check and update whether the network may take new payments. */
export async function checkChain(e: Engine, chain: ChainRuntime, registry: boolean): Promise<void> {
  const reasons = await verifyDeployment(e, chain, registry);
  chain.deploymentCheck = { ok: reasons.length === 0, reasons, at: e.now().getTime(), registry };
  if (reasons.length) e.log.error("deployment verification failed; network closed to new payments", { network: chain.network.id, reasons });
  refreshOperational(chain);
}

export function refreshOperational(chain: ChainRuntime): void {
  const check = chain.deploymentCheck;
  chain.operational = chain.baseOperational && (check?.ok ?? true);
  chain.gateReasons = [...chain.baseReasons, ...(check && !check.ok ? check.reasons.map((r) => `deployment check: ${r}`) : [])];
}

/** Periodic re-verification (worker). Cheap: a handful of eth_calls per network every few minutes. */
export async function recheckDeployments(e: Engine): Promise<void> {
  for (const chain of e.chains.values()) {
    if (!chain.baseOperational) continue;
    const last = chain.deploymentCheck?.at ?? 0;
    if (e.now().getTime() - last < RECHECK_EVERY_MS) continue;
    await checkChain(e, chain, chain.deploymentCheck?.registry ?? true);
  }
}
