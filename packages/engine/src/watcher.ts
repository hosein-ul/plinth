import { and, eq, gt, inArray, schema, sql } from "@plinth/db";
import type { Address, Hex } from "viem";
import { chainOf, type Engine } from "./context";
import { confirmationPass, ingestIncomingTransfer, ingestRouterPayment, ingestSweep } from "./ingest";

export interface WatcherResult {
  network: string;
  head: bigint;
  scannedFrom: bigint;
  scannedTo: bigint;
  transfers: number;
  sweeps: number;
  walletPayments: number;
  rewoundTo: bigint | null;
}

const MAX_CHUNKS_PER_TICK = 40;

/**
 * One watcher iteration for one network. Safe to run repeatedly and concurrently with itself
 * (all writes are idempotent and unique-constrained). Re-scans an overlap window every tick so a
 * lagging RPC node or a shallow reorg cannot cause a missed deposit.
 */
export async function watcherTick(e: Engine, networkId: string): Promise<WatcherResult | null> {
  const chain = chainOf(e, networkId);
  if (!chain.operational) return null;
  const net = chain.network;
  const info = await chain.adapter.getHeadInfo();

  const windowStart = new Date(e.now().getTime() - e.cfg.lateWindowDays * 86_400_000);
  const addrRows = await e.db
    .select({ address: schema.invoiceAddresses.address, id: schema.invoiceAddresses.id, createdBlock: schema.invoiceAddresses.createdBlock })
    .from(schema.invoiceAddresses)
    .where(and(eq(schema.invoiceAddresses.networkId, net.id), gt(schema.invoiceAddresses.createdAt, windowStart)));
  const addresses = addrRows.map((a) => a.address as Address);

  // Addresses that already received funds are the only ones that can emit Swept.
  const fundedRows = addrRows.length
    ? await e.db
        .selectDistinct({ address: schema.invoiceAddresses.address })
        .from(schema.invoiceAddresses)
        .innerJoin(schema.transactions, eq(schema.transactions.invoiceAddressId, schema.invoiceAddresses.id))
        .where(and(eq(schema.invoiceAddresses.networkId, net.id), eq(schema.transactions.kind, "INCOMING_TRANSFER")))
    : [];
  const funded = fundedRows.map((r) => r.address as Address);

  const walletIntents = await e.db
    .select({ invoiceId32: schema.paymentIntents.invoiceId32, currency: schema.paymentIntents.currency })
    .from(schema.paymentIntents)
    .where(and(gt(schema.paymentIntents.createdAt, windowStart), sql`${net.id} = any(${schema.paymentIntents.allowedNetworks})`, sql`'WALLET' = any(${schema.paymentIntents.checkoutMethods})`));
  // Wallet payments come through the router of the payment's token: look at each token's router for its own invoices.
  const idsByToken = new Map<string, Hex[]>();
  for (const w of walletIntents) idsByToken.set(w.currency, [...(idsByToken.get(w.currency) ?? []), w.invoiceId32 as Hex]);

  // ---- cursor
  const [cursor] = await e.db.select().from(schema.watcherCursors).where(eq(schema.watcherCursors.networkId, net.id));
  let lastScanned: bigint;
  if (cursor) lastScanned = cursor.lastScannedBlock;
  else {
    const earliest = addrRows.reduce<bigint | null>((m, a) => (m === null || a.createdBlock < m ? a.createdBlock : m), null);
    lastScanned = (earliest !== null ? earliest : info.head) - 1n;
    if (lastScanned < 0n) lastScanned = 0n;
  }
  const overlap = BigInt(Math.min(64, net.finality.confirmations + 6));
  let from = lastScanned + 1n > overlap ? lastScanned + 1n - overlap : 0n;
  if (from < BigInt(chain.deployment.deployBlock)) from = BigInt(chain.deployment.deployBlock);

  const res: WatcherResult = { network: net.id, head: info.head, scannedFrom: from, scannedTo: lastScanned, transfers: 0, sweeps: 0, walletPayments: 0, rewoundTo: null };
  const step = BigInt(net.maxLogRange);
  let chunks = 0;
  let cursorBlock = from;
  while (cursorBlock <= info.head && chunks < MAX_CHUNKS_PER_TICK) {
    const to = cursorBlock + step - 1n > info.head ? info.head : cursorBlock + step - 1n;
    const [transfers, sweeps, walletByToken] = await Promise.all([
      chain.adapter.scanTransfers(cursorBlock, to, addresses),
      chain.adapter.scanSweeps(cursorBlock, to, funded),
      Promise.all([...chain.tokens.values()].map((t) => t.adapter.scanRouterPayments(cursorBlock, to, idsByToken.get(t.symbol) ?? []))),
    ]);
    const wallet = walletByToken.flat();
    for (const t of transfers) await ingestIncomingTransfer(e, chain, t, info);
    for (const s of sweeps) await ingestSweep(e, chain, s, info);
    for (const p of wallet) await ingestRouterPayment(e, chain, p, info);
    res.transfers += transfers.length;
    res.sweeps += sweeps.length;
    res.walletPayments += wallet.length;
    res.scannedTo = to;
    cursorBlock = to + 1n;
    chunks++;
  }

  // ---- finality + reorg detection
  const reorgAt = await confirmationPass(e, chain, info);
  let newCursor = res.scannedTo > lastScanned ? res.scannedTo : lastScanned;
  if (reorgAt !== null && reorgAt - 1n < newCursor) {
    newCursor = reorgAt - 1n;
    res.rewoundTo = newCursor;
    e.log.warn("reorg detected; rewinding watcher cursor", { network: net.id, to: newCursor.toString() });
  }
  const tipMeta = res.scannedTo >= from ? await chain.adapter.blockMeta(newCursor < 0n ? 0n : newCursor) : null;
  await e.db
    .insert(schema.watcherCursors)
    .values({ networkId: net.id, lastScannedBlock: newCursor, lastBlockHash: tipMeta?.hash ?? null })
    .onConflictDoUpdate({ target: schema.watcherCursors.networkId, set: { lastScannedBlock: newCursor, lastBlockHash: tipMeta?.hash ?? null, updatedAt: e.now() } });
  return res;
}

export { inArray };
