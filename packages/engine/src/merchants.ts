import { and, eq, schema } from "@plinth/db";
import { formatFeePercent, MAX_FEE_BPS, NETWORKS, newId, operationalGate, toBytes32Id, treasuryFor } from "@plinth/shared";
import { encodeFunctionData, getAddress, type Address } from "viem";
import { MerchantVaultAbi } from "@plinth/blockchain";
import { audit } from "./audit";
import { requirePermission, type AuthContext } from "./auth";
import { chainOf, EngineError, norm, type Engine } from "./context";
import { consumeChallenge, verifyVaultOwnerProof } from "./payout-config";
import { feeBpsFor } from "./payout-route";

/**
 * Enable a network for a merchant: derive their vault address, record it, and have the gateway relayer
 * deploy it. The vault's OWNER is the merchant-supplied address; the gateway never holds a role in it.
 */
export async function enableNetwork(e: Engine, ctx: AuthContext, input: { network: string; owner_address: string; proof?: { nonce: string; signature: string } }) {
  requirePermission(ctx, "wallets");
  const chain = e.chains.get(input.network);
  if (!chain) throw new EngineError("UNKNOWN_NETWORK", `Unknown network ${input.network}`, 400);
  if (!chain.operational) throw new EngineError("NETWORK_NOT_OPERATIONAL", `${chain.network.name} is not operational`, 409, { reasons: chain.gateReasons });
  const owner = getAddress(input.owner_address);
  const merchantId32 = toBytes32Id(ctx.merchantId);

  const [existing] = await e.db.select().from(schema.merchantVaults).where(and(eq(schema.merchantVaults.merchantId, ctx.merchantId), eq(schema.merchantVaults.networkId, input.network)));
  if (existing) {
    if (norm(existing.ownerAddress) !== norm(owner)) {
      throw new EngineError("VAULT_EXISTS", "A vault already exists for this network. Ownership changes happen on-chain (transferOwnership/acceptOwnership), not through the gateway.", 409);
    }
    return vaultSummary(chain.network.explorerUrl, existing);
  }

  // A new vault is owned by whatever address is given here, so the owner must prove they control it (required in production).
  const proven = await verifyVaultOwnerProof(e, ctx, { network: input.network, owner, proof: input.proof });
  const vault = await chain.adapter.predictVault(merchantId32, owner);
  const alreadyDeployed = await chain.adapter.isRegisteredVault(vault);
  const id = newId("vlt");
  let opId: string | null = null;

  await e.db.transaction(async (tx) => {
    if (proven) await consumeChallenge(e, tx, proven.nonce);
    if (!alreadyDeployed) {
      if (!chain.signer) throw new EngineError("RELAYER_UNAVAILABLE", "No relayer is configured for this network; deploy the vault yourself via VaultFactory.createVault and retry.", 503);
      opId = newId("rop");
      const call = chain.adapter.encodeCreateVault(merchantId32, owner);
      await tx.insert(schema.relayerOperations).values({ id: opId, networkId: input.network, kind: "CREATE_VAULT", dedupeKey: `vault:${input.network}:${norm(vault)}`, toAddress: norm(call.to), calldata: call.data, relatedType: "merchant_vault", relatedId: id }).onConflictDoNothing();
    }
    await tx.insert(schema.merchantWallets).values({ id: newId("wal"), merchantId: ctx.merchantId, networkId: input.network, kind: "VAULT_OWNER", address: norm(owner), label: "Vault owner" }).onConflictDoNothing();
    await tx.insert(schema.merchantVaults).values({
      id, merchantId: ctx.merchantId, networkId: input.network, ownerAddress: norm(owner), vaultAddress: norm(vault),
      status: alreadyDeployed ? "ACTIVE" : "PENDING", createRelayerOpId: opId, configDelaySeconds: chain.deployment.vaultConfigDelaySeconds,
    });
    await audit(tx, { merchantId: ctx.merchantId, actor: ctx.actor, action: "network.enabled", targetType: "merchant_vault", targetId: id, data: { network: input.network, owner, vault } });
  });
  const [row] = await e.db.select().from(schema.merchantVaults).where(eq(schema.merchantVaults.id, id));
  return vaultSummary(chain.network.explorerUrl, row!);
}

export function vaultSummary(explorerUrl: string, v: typeof schema.merchantVaults.$inferSelect) {
  return {
    id: v.id, network: v.networkId, status: v.status,
    owner_address: getAddress(v.ownerAddress), vault_address: getAddress(v.vaultAddress),
    vault_explorer_url: `${explorerUrl}/address/${getAddress(v.vaultAddress)}`,
    config_delay_seconds: v.configDelaySeconds, created_tx_hash: v.createTxHash,
  };
}

/** Live on-chain truth for a vault: owner, settlement policy, balance. Never trust the cache for decisions. */
export async function readVaultState(e: Engine, ctx: AuthContext, network: string) {
  const chain = chainOf(e, network);
  const [v] = await e.db.select().from(schema.merchantVaults).where(and(eq(schema.merchantVaults.merchantId, ctx.merchantId), eq(schema.merchantVaults.networkId, network)));
  if (!v) throw new EngineError("NOT_FOUND", "No vault for this network", 404);
  if (v.status !== "ACTIVE") return { ...vaultSummary(chain.network.explorerUrl, v), onchain: null };
  const s = await chain.adapter.readVault(getAddress(v.vaultAddress));
  await e.db.update(schema.merchantVaults).set({ cachedMode: s.mode, cachedDestination: norm(s.destination), cachedBalance: s.balance, cachedAt: e.now() }).where(eq(schema.merchantVaults.id, v.id));
  return {
    ...vaultSummary(chain.network.explorerUrl, v),
    onchain: {
      owner: s.owner, pending_owner: s.pendingOwner, mode: s.mode, destination: s.destination,
      threshold_units: s.threshold.toString(), interval_seconds: s.interval.toString(), balance_units: s.balance.toString(),
      can_forward: s.canForward, gateway_has_admin_role: false,
    },
  };
}

/** If the relayer is unavailable the merchant can deploy the vault themselves; this re-checks the chain. */
export async function confirmVault(e: Engine, ctx: AuthContext, network: string) {
  const chain = chainOf(e, network);
  const [v] = await e.db.select().from(schema.merchantVaults).where(and(eq(schema.merchantVaults.merchantId, ctx.merchantId), eq(schema.merchantVaults.networkId, network)));
  if (!v) throw new EngineError("NOT_FOUND", "No vault for this network", 404);
  if (await chain.adapter.isRegisteredVault(getAddress(v.vaultAddress))) {
    await e.db.update(schema.merchantVaults).set({ status: "ACTIVE" }).where(eq(schema.merchantVaults.id, v.id));
  }
  const [fresh] = await e.db.select().from(schema.merchantVaults).where(eq(schema.merchantVaults.id, v.id));
  return vaultSummary(chain.network.explorerUrl, fresh!);
}

/**
 * Build (never send) the transaction a merchant's own wallet must sign to change the on-chain settlement
 * policy. The gateway cannot execute it: only the vault owner can.
 */
export function buildSettlementPolicyTx(
  e: Engine,
  vaultAddress: Address,
  input: { mode: "BALANCE_IN_VAULT" | "INSTANT_FORWARD" | "THRESHOLD_OR_PERIODIC"; destination?: string; threshold_units?: string; interval_seconds?: number },
) {
  const modeIdx = { BALANCE_IN_VAULT: 0, INSTANT_FORWARD: 1, THRESHOLD_OR_PERIODIC: 2 }[input.mode];
  if (input.mode !== "BALANCE_IN_VAULT" && !input.destination) throw new EngineError("INVALID_POLICY", "A destination address is required", 400);
  const data = encodeFunctionData({
    abi: MerchantVaultAbi, functionName: "scheduleSettlement",
    args: [{ mode: modeIdx, destination: input.mode === "BALANCE_IN_VAULT" ? "0x0000000000000000000000000000000000000000" : getAddress(input.destination!), threshold: BigInt(input.threshold_units ?? "0"), interval: BigInt(input.interval_seconds ?? 0) }],
  });
  return { to: vaultAddress, data, note: "Sign and send from the vault owner wallet. Policies that forward funds take effect after the vault's configuration delay." };
}

/** The gate's reasons are written for operators. A merchant should read what they mean, not the name of an environment variable. */
function readable(reason: string): string {
  if (/ENABLED_NETWORKS/.test(reason)) return "Not switched on yet";
  if (/no deployment record/.test(reason)) return "Contracts are not deployed on this network yet";
  if (/ALLOW_MAINNET/.test(reason)) return "Mainnet stays off until it is explicitly approved";
  if (/capabilities not verified/i.test(reason)) return "This network's USDC has not been verified yet";
  if (/relayer policy/i.test(reason)) return "Mainnet needs a spending policy before it can run";
  return reason;
}

export async function listNetworks(e: Engine, ctx: AuthContext) {
  const vaults = await e.db.select().from(schema.merchantVaults).where(eq(schema.merchantVaults.merchantId, ctx.merchantId));
  const [merchant] = await e.db.select().from(schema.merchants).where(eq(schema.merchants.id, ctx.merchantId));
  const live = [...e.chains.values()].map((c) => {
    const v = vaults.find((x) => x.networkId === c.network.id);
    return {
      id: c.network.id, chain_id: c.network.chainId, name: c.network.name, environment: c.network.environment,
      operational: c.operational, not_operational_reasons: c.gateReasons.map(readable), explorer_url: c.network.explorerUrl, public_rpc_urls: c.network.rpcUrls, chain_native: c.network.nativeCurrency,
      native_currency: c.network.nativeCurrency.symbol, gas_model: c.network.gas.model,
      usdc: { address: c.network.usdc.address, decimals: 6 },
      payment_methods: { address: c.operational, wallet: c.operational && !!c.signer && c.network.authorization.receiveWithAuthorization && c.network.authorization.verified },
      authorization: { receive_with_authorization: c.network.authorization.receiveWithAuthorization, transfer_with_authorization: c.network.authorization.transferWithAuthorization, verified_at: c.network.authorization.verifiedAt },
      finality: { strategy: c.network.finality.strategy, confirmations: c.network.finality.confirmations },
      circle: c.network.circle,
      contracts: c.operational ? { vault_factory: c.deployment.vaultFactory, invoice_factory: c.deployment.invoiceFactory, invoice_implementation: c.deployment.invoiceImplementation, payment_router: c.deployment.paymentRouter, version: c.deployment.version } : null,
      relayer_address: c.signer?.address ?? null,
      // What the platform takes on this network for this merchant: committed into every invoice address when it is issued.
      fee: { bps: feeBpsFor(e, merchant?.feeBps, c), percent: formatFeePercent(feeBpsFor(e, merchant?.feeBps, c)), max_bps: c.deployment.maxFeeBps, treasury: getAddress(c.deployment.treasury) },
      vault: v ? vaultSummary(c.network.explorerUrl, v) : null,
    };
  });
  // Networks in the registry whose contracts are not deployed yet are still listed, so the page says what exists and why it is off.
  const pending = Object.values(NETWORKS)
    .filter((n) => !e.chains.has(n.id))
    .map((n) => ({
      id: n.id, chain_id: n.chainId, name: n.name, environment: n.environment,
      operational: false, not_operational_reasons: operationalGate(n, undefined, { enabledNetworks: [], allowMainnet: false }).reasons.map(readable), explorer_url: n.explorerUrl, public_rpc_urls: n.rpcUrls, chain_native: n.nativeCurrency,
      native_currency: n.nativeCurrency.symbol, gas_model: n.gas.model,
      usdc: { address: n.usdc.address, decimals: 6 },
      payment_methods: { address: false, wallet: false },
      authorization: { receive_with_authorization: n.authorization.receiveWithAuthorization, transfer_with_authorization: n.authorization.transferWithAuthorization, verified_at: n.authorization.verifiedAt },
      finality: { strategy: n.finality.strategy, confirmations: n.finality.confirmations },
      circle: n.circle,
      contracts: null, relayer_address: null, vault: null,
      fee: { bps: e.cfg.platformFeeBps, percent: formatFeePercent(e.cfg.platformFeeBps), max_bps: MAX_FEE_BPS, treasury: treasuryFor(n.id) },
    }));
  return [...live, ...pending];
}

export async function updateMerchantSettings(e: Engine, ctx: AuthContext, patch: { name?: string; underpayment_tolerance_bps?: number; overpayment_policy?: "ACCEPT" | "FLAG"; default_expiry_seconds?: number }) {
  requirePermission(ctx, "settings");
  await e.db.transaction(async (tx) => {
    await tx.update(schema.merchants).set({
      ...(patch.name ? { name: patch.name } : {}),
      ...(patch.underpayment_tolerance_bps !== undefined ? { underpaymentToleranceBps: patch.underpayment_tolerance_bps } : {}),
      ...(patch.overpayment_policy ? { overpaymentPolicy: patch.overpayment_policy } : {}),
      ...(patch.default_expiry_seconds ? { defaultExpirySeconds: patch.default_expiry_seconds } : {}),
    }).where(eq(schema.merchants.id, ctx.merchantId));
    await audit(tx, { merchantId: ctx.merchantId, actor: ctx.actor, action: "settings.updated", data: patch });
  });
  const [m] = await e.db.select().from(schema.merchants).where(eq(schema.merchants.id, ctx.merchantId));
  return { id: m!.id, name: m!.name, underpayment_tolerance_bps: m!.underpaymentToleranceBps, overpayment_policy: m!.overpaymentPolicy, default_expiry_seconds: m!.defaultExpirySeconds };
}
