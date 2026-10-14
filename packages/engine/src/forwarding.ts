import { and, eq, schema } from "@plinth/db";
import { newId } from "@plinth/shared";
import { getAddress } from "viem";
import { chainOf, norm, type Engine } from "./context";

/**
 * Drives vault-level settlement policy for vaults whose OWNER enabled INSTANT_FORWARD or
 * THRESHOLD_OR_PERIODIC. The relayer only calls permissionless functions; the vault itself enforces
 * the owner-authorised destination, so this code cannot misdirect funds even if it is compromised.
 */
export async function forwardTick(e: Engine, networkId: string): Promise<{ forwarded: number; activated: number }> {
  const chain = chainOf(e, networkId);
  const res = { forwarded: 0, activated: 0 };
  if (!chain.operational || !chain.signer) return res;
  const vaults = await e.db.select().from(schema.merchantVaults).where(and(eq(schema.merchantVaults.networkId, networkId), eq(schema.merchantVaults.status, "ACTIVE")));
  const block = await chain.client.getBlock();
  for (const v of vaults) {
    const s = await chain.adapter.readVault(getAddress(v.vaultAddress)).catch(() => null);
    if (!s) continue;
    await e.db.update(schema.merchantVaults).set({ cachedMode: s.mode, cachedDestination: norm(s.destination), cachedBalance: s.balance, cachedAt: e.now() }).where(eq(schema.merchantVaults.id, v.id));

    if (s.pending && block.timestamp >= s.pending.effectiveAt) {
      const call = chain.adapter.encodeApplyPending(s.address); // vault calls do not depend on the token
      const r = await e.db.insert(schema.relayerOperations).values({ id: newId("rop"), networkId, kind: "APPLY_SETTLEMENT", tokenSymbol: v.tokenSymbol, dedupeKey: `apply:${norm(v.vaultAddress)}:${s.pending.effectiveAt}`, toAddress: norm(call.to), calldata: call.data, relatedType: "merchant_vault", relatedId: v.id }).onConflictDoNothing().returning({ id: schema.relayerOperations.id });
      if (r.length) res.activated++;
    }
    if (s.mode !== "BALANCE_IN_VAULT" && s.canForward) {
      const call = chain.adapter.encodeForward(s.address);
      const r = await e.db.insert(schema.relayerOperations).values({ id: newId("rop"), networkId, kind: "FORWARD", tokenSymbol: v.tokenSymbol, dedupeKey: `forward:${norm(v.vaultAddress)}:${s.balance}:${block.number}`.slice(0, 200), toAddress: norm(call.to), calldata: call.data, relatedType: "merchant_vault", relatedId: v.id }).onConflictDoNothing().returning({ id: schema.relayerOperations.id });
      if (r.length) res.forwarded++;
    }
  }
  return res;
}
