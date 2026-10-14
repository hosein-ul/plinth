import { and, desc, eq, gte, inArray, schema, sql } from "@plinth/db";
import { formatUsdc } from "@plinth/shared";
import { getAddress } from "viem";
import type { AuthContext } from "./auth";
import type { Engine } from "./context";

const FULFILLED = ["PAID", "OVERPAID", "SETTLEMENT_PENDING", "SETTLED", "SETTLEMENT_FAILED", "REFUND_REQUESTED", "PARTIALLY_REFUNDED", "REFUNDED"];
const FAILED = ["EXPIRED", "UNDERPAID", "LATE_PAYMENT", "INVALID_ASSET"];
const OPEN = ["CREATED", "AWAITING_PAYMENT", "DETECTED", "CONFIRMING"];

/**
 * Dashboard overview. Every figure is labelled with what it actually measures:
 *  - `received_final`  = finalized on-chain at invoice addresses / via wallet (NOT necessarily settled),
 *  - `settled_to_vault`= confirmed inside the merchant vault,
 *  - `pending`         = detected but not yet final.
 */
export async function overview(e: Engine, ctx: AuthContext, days = 30) {
  const since = new Date(e.now().getTime() - days * 86_400_000);
  const base = and(eq(schema.paymentIntents.merchantId, ctx.merchantId), eq(schema.paymentIntents.environment, ctx.environment), gte(schema.paymentIntents.createdAt, since));
  const [agg] = await e.db
    .select({
      total: sql<number>`count(*)::int`,
      fulfilled: sql<number>`count(*) filter (where ${schema.paymentIntents.status} in (${sql.raw(FULFILLED.map((s) => `'${s}'`).join(","))}))::int`,
      failed: sql<number>`count(*) filter (where ${schema.paymentIntents.status} in (${sql.raw(FAILED.map((s) => `'${s}'`).join(","))}))::int`,
      open: sql<number>`count(*) filter (where ${schema.paymentIntents.status} in (${sql.raw(OPEN.map((s) => `'${s}'`).join(","))}))::int`,
      settlementFailed: sql<number>`count(*) filter (where ${schema.paymentIntents.status} = 'SETTLEMENT_FAILED')::int`,
      receivedFinal: sql<string>`coalesce(sum(${schema.paymentIntents.amountFinal}), 0)`,
      settled: sql<string>`coalesce(sum(${schema.paymentIntents.amountSettled}), 0)`,
      pending: sql<string>`coalesce(sum(${schema.paymentIntents.amountPending}), 0)`,
      refunded: sql<string>`coalesce(sum(${schema.paymentIntents.amountRefunded}), 0)`,
    })
    .from(schema.paymentIntents)
    .where(base);
  const byStatus = await e.db
    .select({ status: schema.paymentIntents.status, n: sql<number>`count(*)::int` })
    .from(schema.paymentIntents)
    .where(base)
    .groupBy(schema.paymentIntents.status);
  const dist = await e.db
    .select({ network: schema.transactions.networkId, units: sql<string>`coalesce(sum(${schema.transactions.amount}), 0)`, n: sql<number>`count(*)::int` })
    .from(schema.transactions)
    .innerJoin(schema.paymentIntents, eq(schema.paymentIntents.id, schema.transactions.paymentIntentId))
    .where(and(base, inArray(schema.transactions.kind, ["INCOMING_TRANSFER", "WALLET_PAYMENT"]), eq(schema.transactions.status, "FINAL"), eq(schema.transactions.isOfficialAsset, true)))
    .groupBy(schema.transactions.networkId);
  const decided = (agg?.fulfilled ?? 0) + (agg?.failed ?? 0);
  const daily = await e.db
    .select({ day: sql<string>`to_char(date_trunc('day', ${schema.paymentIntents.createdAt}), 'YYYY-MM-DD')`, units: sql<string>`coalesce(sum(${schema.paymentIntents.amountFinal}), 0)`, n: sql<number>`count(*)::int` })
    .from(schema.paymentIntents)
    .where(base)
    .groupBy(sql`date_trunc('day', ${schema.paymentIntents.createdAt})`)
    .orderBy(sql`date_trunc('day', ${schema.paymentIntents.createdAt})`);
  const money = (v: string | undefined) => ({ amount: formatUsdc(BigInt(v ?? "0")), units: v ?? "0" });
  return {
    window_days: days,
    livemode: ctx.environment === "live",
    received_final: money(agg?.receivedFinal),
    settled_to_vault: money(agg?.settled),
    pending: money(agg?.pending),
    refunded: money(agg?.refunded),
    counts: { total: agg?.total ?? 0, successful: agg?.fulfilled ?? 0, pending: agg?.open ?? 0, failed: agg?.failed ?? 0, settlement_failed: agg?.settlementFailed ?? 0 },
    // Share of decided payments (success + failure) that were paid. Open payments are excluded.
    success_rate: decided > 0 ? Math.round(((agg?.fulfilled ?? 0) / decided) * 1000) / 10 : null,
    by_status: Object.fromEntries(byStatus.map((s) => [s.status, s.n])),
    network_distribution: dist.map((d) => ({ network: d.network, name: e.chains.get(d.network)?.network.name ?? d.network, ...money(d.units), payments: d.n })),
    daily: daily.map((d) => ({ day: d.day, received_final_units: d.units, payments: d.n })),
  };
}

export async function listTransactions(e: Engine, ctx: AuthContext, limit = 100) {
  const rows = await e.db
    .select({ t: schema.transactions })
    .from(schema.transactions)
    .innerJoin(schema.paymentIntents, eq(schema.paymentIntents.id, schema.transactions.paymentIntentId))
    .where(and(eq(schema.transactions.merchantId, ctx.merchantId), eq(schema.paymentIntents.environment, ctx.environment)))
    .orderBy(desc(schema.transactions.firstSeenAt))
    .limit(Math.min(limit, 200));
  return rows.map(({ t }) => ({
    id: t.id, kind: t.kind, network: t.networkId, tx_hash: t.txHash, log_index: t.logIndex, payment_intent_id: t.paymentIntentId, status: t.status, official_asset: t.isOfficialAsset,
    from: t.fromAddress ? getAddress(t.fromAddress) : null, to: t.toAddress ? getAddress(t.toAddress) : null, amount: formatUsdc(t.amount), amount_units: t.amount.toString(),
    confirmations: t.confirmations, block_number: t.blockNumber?.toString() ?? null, seen_at: t.firstSeenAt.toISOString(),
    explorer_url: `${e.chains.get(t.networkId)?.network.explorerUrl ?? ""}/tx/${t.txHash}`,
  }));
}

export async function listSettlements(e: Engine, ctx: AuthContext, limit = 100) {
  const rows = await e.db.select().from(schema.settlements).where(eq(schema.settlements.merchantId, ctx.merchantId)).orderBy(desc(schema.settlements.createdAt)).limit(Math.min(limit, 200));
  const ops = rows.length ? await e.db.select().from(schema.relayerOperations).where(inArray(schema.relayerOperations.id, rows.map((r) => r.relayerOperationId).filter((x): x is string => !!x))) : [];
  return rows.map((s) => {
    const op = ops.find((o) => o.id === s.relayerOperationId);
    return {
      id: s.id, object: "settlement", payment_intent_id: s.paymentIntentId, network: s.networkId, kind: s.kind, status: s.status, attempt: s.attemptNo,
      vault: getAddress(s.vaultAddress), expected_amount: formatUsdc(s.expectedAmount), swept_amount: s.sweptAmount !== null ? formatUsdc(s.sweptAmount) : null,
      tx_hash: s.txHash, failure_reason: s.failureReason, created_at: s.createdAt.toISOString(), confirmed_at: s.confirmedAt?.toISOString() ?? null,
      relayer_fee: op?.feeNativeWei !== null && op?.feeNativeWei !== undefined ? { native_wei: op.feeNativeWei.toString(), native_symbol: e.chains.get(s.networkId)?.network.nativeCurrency.symbol, usdc: op.feeUsdcUnits !== null && op.feeUsdcUnits !== undefined ? formatUsdc(op.feeUsdcUnits, { minDecimals: 6 }) : null } : null,
      explorer_url: s.txHash ? `${e.chains.get(s.networkId)?.network.explorerUrl}/tx/${s.txHash}` : null,
    };
  });
}

export async function listAudit(e: Engine, ctx: AuthContext, limit = 100) {
  const rows = await e.db.select().from(schema.auditEvents).where(eq(schema.auditEvents.merchantId, ctx.merchantId)).orderBy(desc(schema.auditEvents.createdAt)).limit(Math.min(limit, 500));
  return rows.map((a) => ({ id: a.id, actor_type: a.actorType, actor_id: a.actorId, action: a.action, target_type: a.targetType, target_id: a.targetId, data: a.data, ip: a.ip, created_at: a.createdAt.toISOString() }));
}

export async function listWebhookEndpoints(e: Engine, ctx: AuthContext) {
  const rows = await e.db.select().from(schema.webhookEndpoints).where(eq(schema.webhookEndpoints.merchantId, ctx.merchantId)).orderBy(desc(schema.webhookEndpoints.createdAt));
  return rows.map((w) => ({ id: w.id, url: w.url, description: w.description, events: w.events, status: w.status, livemode: w.environment === "live", consecutive_failures: w.consecutiveFailures, created_at: w.createdAt.toISOString() }));
}

/** Operator view: relayer queue health per network. */
export async function relayerStatus(e: Engine) {
  const out = [];
  for (const c of e.chains.values()) {
    const ops = await e.db
      .select({ status: schema.relayerOperations.status, n: sql<number>`count(*)::int`, fee: sql<string>`coalesce(sum(${schema.relayerOperations.feeNativeWei}), 0)` })
      .from(schema.relayerOperations)
      .where(eq(schema.relayerOperations.networkId, c.network.id))
      .groupBy(schema.relayerOperations.status);
    const balance = c.signer ? await c.client.getBalance({ address: c.signer.address }).catch(() => null) : null;
    out.push({
      network: c.network.id, operational: c.operational, reasons: c.gateReasons, signer: c.signer?.address ?? null,
      balance_wei: balance?.toString() ?? null, native_symbol: c.network.nativeCurrency.symbol,
      queue: Object.fromEntries(ops.map((o) => [o.status, o.n])), total_fees_wei: ops.reduce((a, o) => a + BigInt(o.fee), 0n).toString(),
    });
  }
  return out;
}
