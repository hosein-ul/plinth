import { and, desc, eq, lte, schema, type Executor } from "@plinth/db";
import { assertValidFeeBps, resolveFeeBps, type DestinationKind } from "@plinth/shared";
import { getAddress, isAddressEqual, recoverMessageAddress, type Address, type Hex } from "viem";
import { parseSiweMessage } from "viem/siwe";
import type { ChainRuntime, Engine } from "./context";
import { norm } from "./context";

type PayoutConfig = typeof schema.merchantPayoutConfigs.$inferSelect;

/** Where one network's money goes for a NEW invoice, and what the platform takes. Committed into the address. */
export interface PayoutRoute {
  networkId: string;
  kind: DestinationKind;
  /** The merchant's vault (VAULT) or the registered payout wallet (DIRECT). */
  destination: Address;
  feeBps: number;
  treasury: Address;
  /** The payout config that selected DIRECT or CUSTODIAL mode; null when the default (vault) applies. */
  payoutConfigId: string | null;
  /**
   * The destination is the platform's custody wallet. On-chain this is an ordinary DIRECT address; the difference is that
   * the net amount is credited to the merchant's custody balance in the ledger and withdrawn later.
   */
  custodial: boolean;
}

/** What the wallet signed for each mode. The statement text is part of the signed message, so a proof cannot be reused across modes. */
export const PROOF_STATEMENT = { DIRECT: "receive stablecoin payouts directly", CUSTODIAL: "withdraw your Plinth custody balance" } as const;

/**
 * Where a merchant's custody balance may be sent: the newest CONFIRMED custodial config whose cooldown has passed. It does not
 * matter whether custodial is still the active mode: a balance already held can always be withdrawn to the wallet that was proven.
 */
export async function withdrawalConfig(e: Engine, tx: Executor, merchantId: string, networkId: string): Promise<PayoutConfig | null> {
  const [row] = await tx
    .select()
    .from(schema.merchantPayoutConfigs)
    .where(and(eq(schema.merchantPayoutConfigs.merchantId, merchantId), eq(schema.merchantPayoutConfigs.networkId, networkId), eq(schema.merchantPayoutConfigs.mode, "CUSTODIAL"), eq(schema.merchantPayoutConfigs.status, "CONFIRMED"), lte(schema.merchantPayoutConfigs.activeFrom, e.now())))
    .orderBy(desc(schema.merchantPayoutConfigs.confirmedAt), desc(schema.merchantPayoutConfigs.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * The newest CONFIRMED payout config whose cooldown has passed. A merchant who never set one is in the
 * default mode: paid into their vault. Switching mode or wallet only affects invoices created afterwards.
 */
export async function activePayoutConfig(e: Engine, tx: Executor, merchantId: string, networkId: string): Promise<PayoutConfig | null> {
  const [row] = await tx
    .select()
    .from(schema.merchantPayoutConfigs)
    .where(
      and(
        eq(schema.merchantPayoutConfigs.merchantId, merchantId),
        eq(schema.merchantPayoutConfigs.networkId, networkId),
        eq(schema.merchantPayoutConfigs.status, "CONFIRMED"),
        lte(schema.merchantPayoutConfigs.activeFrom, e.now()),
      ),
    )
    // The last choice the merchant confirmed wins, so confirming a wallet and then switching back to the vault sticks.
    .orderBy(desc(schema.merchantPayoutConfigs.confirmedAt), desc(schema.merchantPayoutConfigs.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * Check that a payout config is still what the wallet signed: the stored EIP-4361 message names this merchant, this chain
 * and this address, and the stored signature recovers to that address. A database row that was edited (a new address
 * written in by someone who does not hold the wallet's key) fails here, so a payment address is never derived for it.
 * This stops tampering with the database alone. It does not stop an attacker who controls this process.
 */
export async function payoutProofHolds(cfg: PayoutConfig, merchantId: string, chain: ChainRuntime): Promise<boolean> {
  if (!cfg.address || !cfg.proofMessage || !cfg.proofSignature) return false;
  try {
    const m = parseSiweMessage(cfg.proofMessage);
    if (!m.address || !isAddressEqual(m.address, cfg.address as Address)) return false;
    if (m.chainId !== chain.network.chainId || m.requestId !== merchantId) return false;
    const mode = cfg.mode === "CUSTODIAL" ? "CUSTODIAL" : "DIRECT";
    if (!m.statement?.includes(PROOF_STATEMENT[mode])) return false;
    const signer = await recoverMessageAddress({ message: cfg.proofMessage, signature: cfg.proofSignature as Hex });
    return isAddressEqual(signer, cfg.address as Address);
  } catch {
    return false;
  }
}

/** The fee for a merchant on a chain: their override or the platform default, never above the cap deployed on that chain. */
export function feeBpsFor(e: Engine, merchantFeeBps: number | null | undefined, chain: ChainRuntime): number {
  const cap = chain.deployment.maxFeeBps;
  assertValidFeeBps(e.cfg.platformFeeBps, cap);
  return resolveFeeBps(merchantFeeBps, e.cfg.platformFeeBps, cap);
}

/**
 * Pick the route for a new invoice on one network, or null when the merchant cannot be paid there
 * (no active vault and no active payout wallet).
 */
export async function resolveRoute(
  e: Engine,
  tx: Executor,
  merchant: { id: string; feeBps: number | null },
  chain: ChainRuntime,
  vaults: (typeof schema.merchantVaults.$inferSelect)[],
  /** The token the payment is in: a vault holds one token, so the vault must be this token's. A direct wallet works for every token. */
  token: string = "USDC",
): Promise<PayoutRoute | null> {
  const networkId = chain.network.id;
  const feeBps = feeBpsFor(e, merchant.feeBps, chain);
  const treasury = getAddress(chain.deployment.treasury);
  const cfg = await activePayoutConfig(e, tx, merchant.id, networkId);
  if (cfg?.mode === "CUSTODIAL" && cfg.address) {
    // Custodial: the money goes to the platform's custody wallet, and only a proven withdrawal wallet can ever receive it from there.
    if (!e.cfg.custodyEnabled || !chain.custody) return null;
    if (!(await payoutProofHolds(cfg, merchant.id, chain))) {
      await e.alerts.raise({
        key: `payout-proof-invalid:${cfg.id}`, severity: "critical",
        title: "A custodial withdrawal wallet no longer matches the signature stored for it; no payment address was issued",
        detail: { merchantId: merchant.id, network: networkId, payoutConfigId: cfg.id },
      });
      return null;
    }
    return { networkId, kind: "DIRECT", destination: getAddress(chain.custody.address), feeBps, treasury, payoutConfigId: cfg.id, custodial: true };
  }
  if (cfg?.mode === "DIRECT" && cfg.address) {
    if (!(await payoutProofHolds(cfg, merchant.id, chain))) {
      // Fail closed: no address is issued for a payout wallet the wallet did not sign for.
      await e.alerts.raise({
        key: `payout-proof-invalid:${cfg.id}`, severity: "critical",
        title: "A payout wallet no longer matches the signature stored for it; no payment address was issued",
        detail: { merchantId: merchant.id, network: networkId, payoutConfigId: cfg.id },
      });
      return null;
    }
    return { networkId, kind: "DIRECT", destination: getAddress(cfg.address), feeBps, treasury, payoutConfigId: cfg.id, custodial: false };
  }
  const vault = vaults.find((v) => v.networkId === networkId && v.tokenSymbol === token && v.status === "ACTIVE");
  if (!vault) return null;
  return { networkId, kind: "VAULT", destination: getAddress(vault.vaultAddress), feeBps, treasury, payoutConfigId: cfg?.id ?? null, custodial: false };
}

/** The route that was committed to an intent on a network, if it has one (legacy intents may not). */
export async function committedRoute(tx: Executor, paymentIntentId: string, networkId: string) {
  const [r] = await tx
    .select()
    .from(schema.paymentIntentRoutes)
    .where(and(eq(schema.paymentIntentRoutes.paymentIntentId, paymentIntentId), eq(schema.paymentIntentRoutes.networkId, networkId)));
  return r ?? null;
}

export const sameAddress = (a: string, b: string) => norm(a) === norm(b);
