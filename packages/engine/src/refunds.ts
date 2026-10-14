import { and, desc, eq, schema } from "@plinth/db";
import { formatUsdc, newId, parseUsdc } from "@plinth/shared";
import { getAddress, isAddressEqual, parseAbiItem, decodeEventLog, type Hex } from "viem";
import { audit } from "./audit";
import { requirePermission, type AuthContext } from "./auth";
import { EngineError, norm, type Engine } from "./context";
import { recomputeIntent } from "./recompute";
import { emitEvent } from "./webhooks";

const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

/**
 * A refund is a NEW, merchant-authorised transfer out of their vault — never a reversal. The gateway
 * records the request; the merchant sends the USDC from their own wallet (vault.withdraw); the refund
 * completes only after that transfer is verified on-chain.
 */
export async function requestRefund(e: Engine, ctx: AuthContext, input: { payment_intent_id: string; amount: string; recipient: string; reason?: string }) {
  requirePermission(ctx, "payments");
  const [intent] = await e.db.select().from(schema.paymentIntents).where(and(eq(schema.paymentIntents.id, input.payment_intent_id), eq(schema.paymentIntents.merchantId, ctx.merchantId)));
  if (!intent) throw new EngineError("NOT_FOUND", "Payment not found", 404);
  const amount = parseUsdc(input.amount);
  const refunds = await e.db.select().from(schema.refunds).where(eq(schema.refunds.paymentIntentId, intent.id));
  const committed = refunds.filter((r) => r.status === "REQUESTED" || r.status === "COMPLETED").reduce((a, r) => a + r.amount, 0n);
  if (amount + committed > intent.amountFinal) throw new EngineError("REFUND_EXCEEDS_PAYMENT", `Only ${formatUsdc(intent.amountFinal - committed)} USDC remains refundable`, 422);

  // Refunds go to the network the funds arrived on.
  const [firstTx] = await e.db.select().from(schema.transactions).where(and(eq(schema.transactions.paymentIntentId, intent.id), eq(schema.transactions.status, "FINAL"), eq(schema.transactions.isOfficialAsset, true))).orderBy(desc(schema.transactions.finalizedAt));
  if (!firstTx) throw new EngineError("NOTHING_TO_REFUND", "No finalized payment to refund", 422);
  const id = newId("ref");
  await e.db.transaction(async (tx) => {
    await tx.insert(schema.refunds).values({ id, merchantId: ctx.merchantId, paymentIntentId: intent.id, networkId: firstTx.networkId, amount, recipient: norm(getAddress(input.recipient)), reason: input.reason ?? null });
    await tx.insert(schema.paymentEvents).values({ id: newId("pev"), paymentIntentId: intent.id, type: "refund.requested", data: { refund_id: id, amount_units: amount.toString() } });
    await emitEvent(e, tx, { merchantId: ctx.merchantId, environment: intent.environment, type: "refund.requested", paymentIntentId: intent.id, dedupeKey: `refund.requested:${id}`, extra: { refund: { id, amount: formatUsdc(amount), recipient: input.recipient } } });
    await audit(tx, { merchantId: ctx.merchantId, actor: ctx.actor, action: "refund.requested", targetType: "refund", targetId: id });
    await recomputeIntent(e, tx, intent.id);
  });
  return getRefund(e, ctx, id);
}

/** Attach the merchant's own vault->recipient transfer. Verified independently before anything completes. */
export async function submitRefundProof(e: Engine, ctx: AuthContext, refundId: string, txHash: Hex) {
  requirePermission(ctx, "payments");
  const [r] = await e.db.select().from(schema.refunds).where(and(eq(schema.refunds.id, refundId), eq(schema.refunds.merchantId, ctx.merchantId)));
  if (!r) throw new EngineError("NOT_FOUND", "Refund not found", 404);
  if (r.status !== "REQUESTED") throw new EngineError("INVALID_STATE", `Refund is ${r.status}`, 409);
  const chain = e.chains.get(r.networkId);
  if (!chain) throw new EngineError("UNKNOWN_NETWORK", "Network unavailable", 400);
  const [vault] = await e.db.select().from(schema.merchantVaults).where(and(eq(schema.merchantVaults.merchantId, ctx.merchantId), eq(schema.merchantVaults.networkId, r.networkId)));
  if (!vault) throw new EngineError("NOT_FOUND", "Vault not found", 404);

  const receipt = await chain.client.getTransactionReceipt({ hash: txHash }).catch(() => null);
  if (!receipt || receipt.status !== "success") throw new EngineError("PROOF_INVALID", "Transaction not found or reverted", 422);
  const info = await chain.adapter.getHeadInfo();
  if (!chain.adapter.isFinal(receipt.blockNumber, info)) throw new EngineError("PROOF_PENDING", "Transaction is not final yet; retry shortly", 409);

  const match = receipt.logs.find((l) => {
    if (!isAddressEqual(l.address, chain.network.usdc.address)) return false;
    try {
      const d = decodeEventLog({ abi: [transferEvent], data: l.data, topics: l.topics });
      return isAddressEqual(d.args.from, vault.vaultAddress as Hex) && isAddressEqual(d.args.to, r.recipient as Hex) && d.args.value === r.amount;
    } catch {
      return false;
    }
  });
  if (!match) throw new EngineError("PROOF_INVALID", "No matching USDC transfer from your vault to the recipient for this amount was found in that transaction", 422);

  await e.db.transaction(async (tx) => {
    const updated = await tx.update(schema.refunds).set({ status: "COMPLETED", txHash, logIndex: match.logIndex, completedAt: e.now() }).where(and(eq(schema.refunds.id, r.id), eq(schema.refunds.status, "REQUESTED"))).returning();
    if (updated.length === 0) return;
    await tx.insert(schema.ledgerEntries).values({ id: newId("led"), merchantId: ctx.merchantId, paymentIntentId: r.paymentIntentId, networkId: r.networkId, account: "REFUNDED", direction: "CREDIT", amount: r.amount, refType: "refund", refId: r.id, idempotencyKey: `REFUNDED:${r.id}:CREDIT` }).onConflictDoNothing();
    await tx.insert(schema.paymentEvents).values({ id: newId("pev"), paymentIntentId: r.paymentIntentId, type: "refund.completed", data: { refund_id: r.id, tx_hash: txHash } });
    const [intent] = await tx.select().from(schema.paymentIntents).where(eq(schema.paymentIntents.id, r.paymentIntentId));
    await recomputeIntent(e, tx, r.paymentIntentId);
    await emitEvent(e, tx, { merchantId: ctx.merchantId, environment: intent!.environment, type: "refund.completed", paymentIntentId: r.paymentIntentId, dedupeKey: `refund.completed:${r.id}`, extra: { refund: { id: r.id, amount: formatUsdc(r.amount), tx_hash: txHash } } });
    await audit(tx, { merchantId: ctx.merchantId, actor: ctx.actor, action: "refund.completed", targetType: "refund", targetId: r.id, data: { txHash } });
  });
  return getRefund(e, ctx, refundId);
}

export async function rejectRefund(e: Engine, ctx: AuthContext, refundId: string) {
  requirePermission(ctx, "payments");
  const res = await e.db.transaction(async (tx) => {
    const u = await tx.update(schema.refunds).set({ status: "REJECTED" }).where(and(eq(schema.refunds.id, refundId), eq(schema.refunds.merchantId, ctx.merchantId), eq(schema.refunds.status, "REQUESTED"))).returning();
    if (u[0]) await recomputeIntent(e, tx, u[0].paymentIntentId);
    return u[0];
  });
  if (!res) throw new EngineError("NOT_FOUND", "Open refund request not found", 404);
  return getRefund(e, ctx, refundId);
}

const view = (e: Engine, r: typeof schema.refunds.$inferSelect) => ({
  id: r.id, object: "refund_request", payment_intent_id: r.paymentIntentId, network: r.networkId, status: r.status, amount: formatUsdc(r.amount), amount_units: r.amount.toString(),
  recipient: getAddress(r.recipient), reason: r.reason, tx_hash: r.txHash, explorer_url: r.txHash ? `${e.chains.get(r.networkId)?.network.explorerUrl}/tx/${r.txHash}` : null,
  created_at: r.createdAt.toISOString(), completed_at: r.completedAt?.toISOString() ?? null,
});

export async function getRefund(e: Engine, ctx: AuthContext, id: string) {
  const [r] = await e.db.select().from(schema.refunds).where(and(eq(schema.refunds.id, id), eq(schema.refunds.merchantId, ctx.merchantId)));
  if (!r) throw new EngineError("NOT_FOUND", "Refund not found", 404);
  return view(e, r);
}

export async function listRefunds(e: Engine, ctx: AuthContext) {
  const rows = await e.db.select().from(schema.refunds).where(eq(schema.refunds.merchantId, ctx.merchantId)).orderBy(desc(schema.refunds.createdAt)).limit(100);
  return rows.map((r) => view(e, r));
}
