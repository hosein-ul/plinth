import { and, eq, inArray, schema, type Executor } from "@plinth/db";
import { computeFee, formatFeePercent, newId, toBytes32Id, type DestinationKind } from "@plinth/shared";
import type { HeadInfo, ObservedRouterPayment, ObservedSweep, ObservedTransfer } from "@plinth/blockchain";
import { isAddressEqual, type Address, type Hex } from "viem";
import { audit } from "./audit";
import { chainOf, norm, tokenRuntime, type ChainRuntime, type Engine } from "./context";
import { committedRoute } from "./payout-route";
import { recomputeIntent } from "./recompute";
import { emitEvent } from "./webhooks";

type TxRow = typeof schema.transactions.$inferSelect;
type TxInsert = typeof schema.transactions.$inferInsert;

// ------------------------------------------------------------------ ledger helpers

async function ledger(
  tx: Executor,
  row: { merchantId: string | null; paymentIntentId: string | null; networkId: string },
  account: string,
  direction: "CREDIT" | "DEBIT",
  amount: bigint,
  ref: { type: string; id: string },
) {
  if (amount === 0n || !row.merchantId) return;
  // Amounts are in the payment's own token and are never added across tokens, so every entry names its asset.
  let asset = "USDC";
  if (row.paymentIntentId) {
    const [i] = await tx.select({ currency: schema.paymentIntents.currency }).from(schema.paymentIntents).where(eq(schema.paymentIntents.id, row.paymentIntentId));
    if (i) asset = i.currency;
  }
  await tx
    .insert(schema.ledgerEntries)
    .values({
      id: newId("led"), merchantId: row.merchantId, paymentIntentId: row.paymentIntentId, networkId: row.networkId, asset,
      account, direction, amount, refType: ref.type, refId: ref.id, idempotencyKey: `${account}:${ref.id}:${direction}`,
    })
    .onConflictDoNothing();
}

/** The ledger account that records the net amount reaching the merchant, by where it went. */
const settledAccount = (kind: DestinationKind) => (kind === "DIRECT" ? "SETTLED_TO_WALLET" : "SETTLED_TO_VAULT");

async function destinationKindOf(tx: Executor, row: TxRow): Promise<DestinationKind> {
  if (row.invoiceAddressId) {
    const [a] = await tx.select().from(schema.invoiceAddresses).where(eq(schema.invoiceAddresses.id, row.invoiceAddressId));
    if (a) return a.destinationKind as DestinationKind;
  }
  if (row.paymentIntentId) {
    const r = await committedRoute(tx, row.paymentIntentId, row.networkId);
    if (r) return r.destinationKind as DestinationKind;
  }
  return "VAULT";
}

/**
 * The fee the contract reported must be exactly what the address committed to, or zero when the fee leg
 * failed open (FeeSkipped). Anything else cannot happen on genuine contracts and is raised loudly.
 * Facts win: the movement is recorded as observed either way.
 */
async function checkObservedFee(e: Engine, merchantId: string, intentId: string, networkId: string, amount: bigint, fee: bigint, feeBps: number, txHash: string) {
  const expected = computeFee(amount, feeBps);
  if (fee === expected) return;
  if (fee === 0n) {
    await audit(e.db, { merchantId, actor: { type: "SYSTEM" }, action: "fee.skipped", targetType: "payment_intent", targetId: intentId, data: { txHash, expected_units: expected.toString(), fee_bps: feeBps } });
    await e.alerts.raise({ key: `fee-skipped:${txHash}`, severity: "warning", title: "Platform fee skipped (the treasury transfer failed); the merchant received the full amount", detail: { network: networkId, intent: intentId, txHash, expectedFeeUnits: expected.toString(), feePercent: formatFeePercent(feeBps) } });
    return;
  }
  await audit(e.db, { merchantId, actor: { type: "SYSTEM" }, action: "fee.mismatch", targetType: "payment_intent", targetId: intentId, data: { txHash, expected_units: expected.toString(), observed_units: fee.toString() } });
  await e.alerts.raise({ key: `fee-mismatch:${txHash}`, severity: "critical", title: "Observed platform fee differs from the committed fee", detail: { network: networkId, intent: intentId, txHash, expectedFeeUnits: expected.toString(), observedFeeUnits: fee.toString() } });
}

/** Insert an observation, or revive it if a previous sighting was reorged out and it re-appeared. */
async function recordObserved(tx: Executor, row: TxInsert): Promise<{ row: TxRow; isNew: boolean; revived: boolean }> {
  const [existing] = await tx
    .select()
    .from(schema.transactions)
    .where(and(eq(schema.transactions.networkId, row.networkId), eq(schema.transactions.txHash, row.txHash), eq(schema.transactions.logIndex, row.logIndex ?? -1)));
  if (existing) {
    if (existing.status !== "REORGED") return { row: existing, isNew: false, revived: false };
    const [revived] = await tx
      .update(schema.transactions)
      .set({ status: "DETECTED", blockNumber: row.blockNumber, blockHash: row.blockHash, blockTimestamp: row.blockTimestamp, reorgedAt: null, confirmations: 0 })
      .where(eq(schema.transactions.id, existing.id))
      .returning();
    return { row: revived!, isNew: false, revived: true };
  }
  const [inserted] = await tx.insert(schema.transactions).values(row).returning();
  return { row: inserted!, isNew: true, revived: false };
}

// ------------------------------------------------------------------ incoming ERC-20 transfers

/**
 * Handle one ERC-20 Transfer to a registered invoice address. The receipt is re-fetched and the log
 * re-decoded (independent of the getLogs response) BEFORE any state is written.
 */
export async function ingestIncomingTransfer(e: Engine, chain: ChainRuntime, t: ObservedTransfer, info: HeadInfo): Promise<void> {
  const net = chain.network;
  const [addr] = await e.db
    .select()
    .from(schema.invoiceAddresses)
    .where(and(eq(schema.invoiceAddresses.networkId, net.id), eq(schema.invoiceAddresses.address, norm(t.to))));
  if (!addr) return;

  // An address accepts ONE token (it is part of what the address commits to): the same contract at another token is not payment.
  const tr = tokenRuntime(chain, addr.tokenSymbol, { open: false });
  const v = await tr.adapter.verifyTransfer(t.txHash, t.logIndex, t.to);
  if (!v.ok) {
    e.log.warn("transfer failed independent verification", { network: net.id, txHash: t.txHash, reason: v.reason });
    await audit(e.db, { merchantId: addr.merchantId, actor: { type: "SYSTEM" }, action: "transfer.verification_failed", targetType: "payment_intent", targetId: addr.paymentIntentId, data: { txHash: t.txHash, logIndex: t.logIndex, reason: v.reason } });
    return;
  }
  const official = v.official && isAddressEqual(v.transfer.token, tr.config.address);
  const blockTimestamp = new Date(v.blockTimestamp * 1000);

  await e.db.transaction(async (tx) => {
    const { row, isNew, revived } = await recordObserved(tx, {
      id: newId("tx"), networkId: net.id, txHash: t.txHash, logIndex: t.logIndex, kind: "INCOMING_TRANSFER",
      merchantId: addr.merchantId, paymentIntentId: addr.paymentIntentId, invoiceAddressId: addr.id,
      tokenAddress: norm(v.transfer.token), isOfficialAsset: official, fromAddress: norm(v.transfer.from), toAddress: norm(v.transfer.to),
      amount: v.transfer.value, blockNumber: v.transfer.blockNumber, blockHash: v.transfer.blockHash, blockTimestamp,
      status: "DETECTED", verifiedAt: e.now(),
    });
    if (isNew || revived) {
      const ref = { type: "transaction", id: row.id };
      if (official) {
        await ledger(tx, row, "DETECTED", "CREDIT", row.amount, ref);
        await ledger(tx, row, "VERIFIED", "CREDIT", row.amount, ref);
      }
      await tx.insert(schema.paymentEvents).values({
        id: newId("pev"), paymentIntentId: addr.paymentIntentId, type: official ? "transfer.detected" : "transfer.invalid_asset",
        data: { network: net.id, tx_hash: t.txHash, log_index: t.logIndex, amount_units: row.amount.toString(), token: row.tokenAddress, from: row.fromAddress },
      });
      if (!official) {
        await e.alerts.raise({ key: `invalid-asset:${row.id}`, severity: "warning", title: "Unsupported token sent to an invoice address", detail: { network: net.id, token: row.tokenAddress, invoice: addr.paymentIntentId, txHash: t.txHash } });
      }
    }
    await applyConfirmations(e, chain, tx, row, info);
    await recomputeIntent(e, tx, addr.paymentIntentId);
  });
}

// ------------------------------------------------------------------ invoice sweeps (Swept events)

export async function ingestSweep(e: Engine, chain: ChainRuntime, s: ObservedSweep, info: HeadInfo): Promise<void> {
  const net = chain.network;
  const [addr] = await e.db
    .select()
    .from(schema.invoiceAddresses)
    .where(and(eq(schema.invoiceAddresses.networkId, net.id), eq(schema.invoiceAddresses.address, norm(s.emitter))));
  if (!addr) return;
  // The event must describe exactly the invoice this address was derived for.
  const tr = tokenRuntime(chain, addr.tokenSymbol, { open: false });
  if (addr.invoiceId32.toLowerCase() !== s.invoiceId.toLowerCase() || addr.merchantId32.toLowerCase() !== s.merchantId.toLowerCase() || norm(addr.destinationAddress) !== norm(s.destination) || addr.destinationKind !== s.kind || !isAddressEqual(s.token, tr.config.address)) {
    await audit(e.db, { merchantId: addr.merchantId, actor: { type: "SYSTEM" }, action: "sweep.mismatch", targetType: "invoice_address", targetId: addr.id, data: { txHash: s.txHash } });
    return;
  }
  const meta = await chain.adapter.blockMeta(s.blockNumber);
  if (!meta || meta.hash.toLowerCase() !== s.blockHash.toLowerCase()) return;
  await checkObservedFee(e, addr.merchantId, addr.paymentIntentId, net.id, s.amount, s.fee, addr.feeBps, s.txHash);

  await e.db.transaction(async (tx) => {
    const { row, isNew, revived } = await recordObserved(tx, {
      id: newId("tx"), networkId: net.id, txHash: s.txHash, logIndex: s.logIndex, kind: "SWEEP",
      merchantId: addr.merchantId, paymentIntentId: addr.paymentIntentId, invoiceAddressId: addr.id,
      tokenAddress: norm(s.token), isOfficialAsset: true, fromAddress: norm(s.emitter), toAddress: norm(s.destination),
      amount: s.amount, feeAmount: s.fee, blockNumber: s.blockNumber, blockHash: s.blockHash, blockTimestamp: new Date(meta.timestamp * 1000),
      status: "DETECTED", verifiedAt: e.now(),
    });
    if (isNew || revived) {
      await tx.insert(schema.paymentEvents).values({ id: newId("pev"), paymentIntentId: addr.paymentIntentId, type: "settlement.swept", data: { network: net.id, tx_hash: s.txHash, amount_units: s.amount.toString(), fee_units: s.fee.toString(), destination: s.destination, destination_kind: s.kind } });
      // Link to our orchestration record if this was our relayer's transaction.
      const open = await tx
        .select()
        .from(schema.settlements)
        .where(and(eq(schema.settlements.invoiceAddressId, addr.id), inArray(schema.settlements.status, ["QUEUED", "SUBMITTED"])));
      const ours = open.find((o) => o.txHash?.toLowerCase() === s.txHash.toLowerCase()) ?? open[0];
      if (ours) {
        await tx.update(schema.settlements).set({ status: "SUBMITTED", txHash: s.txHash, sweptAmount: s.amount, feeAmount: s.fee, netAmount: s.amount - s.fee }).where(eq(schema.settlements.id, ours.id));
      } else {
        // Someone else (e.g. the merchant) triggered the sweep: record it so accounting stays complete.
        await tx.insert(schema.settlements).values({
          id: newId("stl"), merchantId: addr.merchantId, paymentIntentId: addr.paymentIntentId, invoiceAddressId: addr.id, networkId: net.id,
          kind: "SWEEP", status: "SUBMITTED", vaultAddress: addr.vaultAddress, destinationKind: addr.destinationKind, destinationAddress: addr.destinationAddress, expectedAmount: s.amount, sweptAmount: s.amount, feeAmount: s.fee, netAmount: s.amount - s.fee, txHash: s.txHash,
        });
      }
    }
    await applyConfirmations(e, chain, tx, row, info);
    await recomputeIntent(e, tx, addr.paymentIntentId);
  });
}

// ------------------------------------------------------------------ wallet payments (PaymentRouter.InvoicePaid)

export async function ingestRouterPayment(e: Engine, chain: ChainRuntime, p: ObservedRouterPayment, info: HeadInfo): Promise<void> {
  const net = chain.network;
  const [intent] = await e.db.select().from(schema.paymentIntents).where(eq(schema.paymentIntents.invoiceId32, p.invoiceId.toLowerCase()));
  if (!intent) return;
  // Only the router of THIS payment's token may report a payment for it.
  const tr = tokenRuntime(chain, intent.currency, { open: false });
  if (!isAddressEqual(p.emitter, tr.contracts.paymentRouter)) return;
  // The payment must match the route committed when the intent was created (destination, kind), not the current settings.
  const route = await committedRoute(e.db, intent.id, net.id);
  if (!route || norm(route.destinationAddress) !== norm(p.destination) || route.destinationKind !== p.kind || toBytes32Id(intent.merchantId).toLowerCase() !== p.merchantId.toLowerCase()) {
    await audit(e.db, { merchantId: intent.merchantId, actor: { type: "SYSTEM" }, action: "router_payment.mismatch", targetType: "payment_intent", targetId: intent.id, data: { txHash: p.txHash } });
    return;
  }
  const meta = await chain.adapter.blockMeta(p.blockNumber);
  if (!meta || meta.hash.toLowerCase() !== p.blockHash.toLowerCase()) return;
  await checkObservedFee(e, intent.merchantId, intent.id, net.id, p.amount, p.fee, route.feeBps, p.txHash);

  await e.db.transaction(async (tx) => {
    const { row, isNew, revived } = await recordObserved(tx, {
      id: newId("tx"), networkId: net.id, txHash: p.txHash, logIndex: p.logIndex, kind: "WALLET_PAYMENT",
      merchantId: intent.merchantId, paymentIntentId: intent.id, tokenAddress: norm(tr.config.address), isOfficialAsset: true,
      fromAddress: norm(p.payer), toAddress: norm(p.destination), amount: p.amount, feeAmount: p.fee, blockNumber: p.blockNumber, blockHash: p.blockHash,
      blockTimestamp: new Date(meta.timestamp * 1000), status: "DETECTED", verifiedAt: e.now(),
    });
    if (isNew || revived) {
      const ref = { type: "transaction", id: row.id };
      await ledger(tx, row, "DETECTED", "CREDIT", row.amount, ref);
      await ledger(tx, row, "VERIFIED", "CREDIT", row.amount, ref);
      await tx.insert(schema.paymentEvents).values({ id: newId("pev"), paymentIntentId: intent.id, type: "wallet_payment.detected", data: { network: net.id, tx_hash: p.txHash, payer: row.fromAddress, amount_units: p.amount.toString(), fee_units: p.fee.toString(), destination: p.destination, destination_kind: p.kind } });
      await tx
        .update(schema.paymentAttempts)
        .set({ status: "CONFIRMED", txHash: p.txHash, updatedAt: e.now() })
        .where(and(eq(schema.paymentAttempts.networkId, net.id), eq(schema.paymentAttempts.nonce, p.nonce.toLowerCase()), eq(schema.paymentAttempts.method, "WALLET")));
    }
    await applyConfirmations(e, chain, tx, row, info);
    await recomputeIntent(e, tx, intent.id);
  });
}

// ------------------------------------------------------------------ finality & reorgs

/** Set confirmations/status for a row from the current head; run finalisation side effects once. */
async function applyConfirmations(e: Engine, chain: ChainRuntime, tx: Executor, row: TxRow, info: HeadInfo): Promise<TxRow> {
  if (row.status === "FINAL" || row.status === "REORGED" || row.blockNumber === null) return row;
  const confirmations = chain.adapter.confirmations(row.blockNumber, info);
  const final = chain.adapter.isFinal(row.blockNumber, info);
  // First sighting stays DETECTED; the next confirmation pass moves it to CONFIRMING, then FINAL.
  const status = final ? "FINAL" : row.status;
  const [updated] = await tx
    .update(schema.transactions)
    .set({ confirmations, status, finalizedAt: final ? e.now() : null })
    .where(eq(schema.transactions.id, row.id))
    .returning();
  if (final) await onFinal(e, tx, updated!);
  return updated!;
}

async function onFinal(e: Engine, tx: Executor, row: TxRow) {
  const ref = { type: "transaction", id: row.id };
  if (row.kind === "INCOMING_TRANSFER" && row.isOfficialAsset) {
    await ledger(tx, row, "FINALIZED", "CREDIT", row.amount, ref);
  } else if (row.kind === "WALLET_PAYMENT") {
    const fee = row.feeAmount ?? 0n;
    await ledger(tx, row, "FINALIZED", "CREDIT", row.amount, ref);
    await ledger(tx, row, settledAccount(await destinationKindOf(tx, row)), "CREDIT", row.amount - fee, ref);
    await ledger(tx, row, "PLATFORM_FEE", "CREDIT", fee, ref);
  } else if (row.kind === "SWEEP") {
    const fee = row.feeAmount ?? 0n;
    await ledger(tx, row, settledAccount(await destinationKindOf(tx, row)), "CREDIT", row.amount - fee, ref);
    await ledger(tx, row, "PLATFORM_FEE", "CREDIT", fee, ref);
    const [stl] = await tx
      .select()
      .from(schema.settlements)
      .where(and(eq(schema.settlements.invoiceAddressId, row.invoiceAddressId ?? ""), eq(schema.settlements.txHash, row.txHash)));
    if (stl && stl.status !== "CONFIRMED") {
      await tx.update(schema.settlements).set({ status: "CONFIRMED", sweptAmount: row.amount, feeAmount: row.feeAmount ?? 0n, netAmount: row.amount - (row.feeAmount ?? 0n), confirmedAt: e.now() }).where(eq(schema.settlements.id, stl.id));
      const [m] = await tx.select().from(schema.paymentIntents).where(eq(schema.paymentIntents.id, row.paymentIntentId ?? ""));
      if (m) {
        await emitEvent(e, tx, { merchantId: m.merchantId, environment: m.environment, type: "settlement.completed", paymentIntentId: m.id, dedupeKey: `settlement.completed:${stl.id}`, extra: { settlement: { id: stl.id, tx_hash: row.txHash, amount_units: row.amount.toString(), fee_units: (row.feeAmount ?? 0n).toString(), net_units: (row.amount - (row.feeAmount ?? 0n)).toString(), destination: stl.destinationAddress, destination_kind: stl.destinationKind, network: row.networkId } } });
      }
    }
  }
  if (row.paymentIntentId) {
    await tx.insert(schema.paymentEvents).values({ id: newId("pev"), paymentIntentId: row.paymentIntentId, type: `${row.kind === "SWEEP" ? "settlement" : "transfer"}.finalized`, data: { network: row.networkId, tx_hash: row.txHash, confirmations: row.confirmations } });
  }
}

async function onReorg(e: Engine, tx: Executor, row: TxRow) {
  const credits = await tx
    .select()
    .from(schema.ledgerEntries)
    .where(and(eq(schema.ledgerEntries.refId, row.id), eq(schema.ledgerEntries.direction, "CREDIT")));
  for (const c of credits) {
    await ledger(tx, { merchantId: c.merchantId, paymentIntentId: c.paymentIntentId, networkId: c.networkId }, c.account, "DEBIT", c.amount, { type: "transaction", id: row.id });
  }
  if (row.kind === "SWEEP" && row.invoiceAddressId) {
    await tx
      .update(schema.settlements)
      .set({ status: "FAILED", failureReason: "sweep block was reorganised away" })
      .where(and(eq(schema.settlements.invoiceAddressId, row.invoiceAddressId), eq(schema.settlements.txHash, row.txHash)));
  }
  if (row.paymentIntentId) {
    await tx.insert(schema.paymentEvents).values({ id: newId("pev"), paymentIntentId: row.paymentIntentId, type: "chain.reorg", data: { network: row.networkId, tx_hash: row.txHash } });
    await audit(tx, { merchantId: row.merchantId, actor: { type: "SYSTEM" }, action: "chain.reorg_detected", targetType: "transaction", targetId: row.id, data: { txHash: row.txHash, kind: row.kind } });
  }
}

/**
 * Advance confirmations for every non-final observation on a network and detect reorgs by comparing
 * the stored block hash with the canonical one. Returns the lowest reorged block (cursor must rewind
 * to rescan it) or null.
 */
export async function confirmationPass(e: Engine, chain: ChainRuntime, info: HeadInfo): Promise<bigint | null> {
  const rows = await e.db
    .select()
    .from(schema.transactions)
    .where(and(eq(schema.transactions.networkId, chain.network.id), inArray(schema.transactions.status, ["DETECTED", "CONFIRMING"])))
    .limit(500);
  let lowestReorg: bigint | null = null;
  const metaCache = new Map<string, Awaited<ReturnType<typeof chain.adapter.blockMeta>>>();
  for (const row of rows) {
    if (row.blockNumber === null) continue;
    const key = row.blockNumber.toString();
    if (!metaCache.has(key)) metaCache.set(key, await chain.adapter.blockMeta(row.blockNumber));
    const meta = metaCache.get(key);
    const nodeBehind = !meta && info.head < row.blockNumber;
    if (nodeBehind) continue; // the RPC lags our record; not a reorg
    if (!meta || meta.hash.toLowerCase() !== (row.blockHash ?? "").toLowerCase()) {
      await e.db.transaction(async (tx) => {
        const [u] = await tx.update(schema.transactions).set({ status: "REORGED", reorgedAt: e.now() }).where(and(eq(schema.transactions.id, row.id), inArray(schema.transactions.status, ["DETECTED", "CONFIRMING"]))).returning();
        if (!u) return;
        await onReorg(e, tx, u);
        if (u.paymentIntentId) await recomputeIntent(e, tx, u.paymentIntentId);
      });
      if (lowestReorg === null || row.blockNumber < lowestReorg) lowestReorg = row.blockNumber;
      continue;
    }
    await e.db.transaction(async (tx) => {
      const [fresh] = await tx.select().from(schema.transactions).where(eq(schema.transactions.id, row.id));
      if (!fresh || fresh.status === "FINAL" || fresh.status === "REORGED") return;
      const confirmations = chain.adapter.confirmations(row.blockNumber!, info);
      const final = chain.adapter.isFinal(row.blockNumber!, info);
      const [u] = await tx
        .update(schema.transactions)
        .set({ confirmations, status: final ? "FINAL" : confirmations >= 1 ? "CONFIRMING" : fresh.status, finalizedAt: final ? e.now() : null })
        .where(eq(schema.transactions.id, row.id))
        .returning();
      if (final) await onFinal(e, tx, u!);
      if (u!.paymentIntentId) await recomputeIntent(e, tx, u!.paymentIntentId);
    });
  }
  return lowestReorg;
}

export type { Address, Hex };
export { chainOf };
