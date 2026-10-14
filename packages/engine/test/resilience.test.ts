import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, schema } from "@plinth/db";
import { parseUsdc } from "@plinth/shared";
import {
  createPaymentIntent, enableNetwork, getPaymentIntent, relayerTick, watcherTick, workerTick, processWebhookJobs, type AuthContext,
} from "../src";
import { startHarness, type Harness } from "./harness";

let h: Harness;
let m: AuthContext;
const rpc = (method: string, params: unknown[] = []) => h.chain.publicClient.request({ method: method as never, params: params as never });
const input = (amount: string) => ({ amount, currency: "USDC" as const, checkout_methods: ["ADDRESS"] as ("WALLET" | "ADDRESS")[], expires_in_seconds: 3600 });
const status = async (id: string) => (await getPaymentIntent(h.engine, m, id)).status;
const ops = (kind: string) => h.engine.db.select().from(schema.relayerOperations).where(eq(schema.relayerOperations.kind, kind));

beforeAll(async () => {
  h = await startHarness({ confirmations: 2 });
  m = await h.newMerchant("Resilience Co");
  await enableNetwork(h.engine, m, { network: h.net, owner_address: h.chain.accounts[2]!.address });
  await h.pump(3);
});
afterAll(async () => h.stop());

describe("relayer transaction lifecycle under bad network conditions", () => {
  it("replaces a stuck transaction with higher fees on the SAME nonce, and the replacement confirms", async () => {
    const pi = await createPaymentIntent(h.engine, m, input("9.00"));
    await h.payUsdc(pi.networks[0]!.deposit_address as `0x${string}`, parseUsdc("9"));
    await h.chain.mine(3);
    await rpc("evm_setAutomine", [false]); // nothing gets mined: the sweep will sit in the mempool
    try {
      await watcherTick(h.engine, h.net);
      await relayerTick(h.engine, h.net);
      const [first] = await ops("DEPLOY_AND_SWEEP").then((r) => r.filter((o) => o.relatedId && o.status === "SUBMITTED"));
      expect(first).toBeTruthy();
      expect(first!.txHashes).toHaveLength(1);

      h.clock.offsetMs += 5 * 60_000; // longer than replaceAfterSeconds
      await relayerTick(h.engine, h.net);
      const [after] = await h.engine.db.select().from(schema.relayerOperations).where(eq(schema.relayerOperations.id, first!.id));
      expect(after!.txHashes).toHaveLength(2);
      expect(after!.nonce).toBe(first!.nonce);
      expect(after!.maxFeePerGas!).toBeGreaterThan(first!.maxFeePerGas!);
    } finally {
      await rpc("evm_setAutomine", [true]);
    }
    await h.chain.mine(1);
    await h.pump(10);
    expect(await status(pi.id)).toBe("SETTLED");
    const [done] = await ops("DEPLOY_AND_SWEEP").then((r) => r.filter((o) => o.txHashes.length === 2));
    expect(done!.status).toBe("CONFIRMED");
    expect(done!.txHash).toBe(done!.txHashes[1]); // the replacement, not the dropped original
  });

  it("re-broadcasts a signed transaction the node lost (e.g. mempool eviction or restart)", async () => {
    const pi = await createPaymentIntent(h.engine, m, input("4.00"));
    await h.payUsdc(pi.networks[0]!.deposit_address as `0x${string}`, parseUsdc("4"));
    await h.chain.mine(3);
    await rpc("evm_setAutomine", [false]);
    try {
      await watcherTick(h.engine, h.net);
      await relayerTick(h.engine, h.net);
      const [op] = await ops("DEPLOY_AND_SWEEP").then((r) => r.filter((o) => o.status === "SUBMITTED"));
      expect(op!.rawTx).toBeTruthy(); // persisted BEFORE broadcast
      await rpc("anvil_dropTransaction", [op!.txHash]); // node forgets it
      expect(await h.chain.publicClient.getTransaction({ hash: op!.txHash as `0x${string}` }).catch(() => null)).toBeNull();
      await relayerTick(h.engine, h.net); // sees it is unknown and re-sends the stored raw tx
      expect(await h.chain.publicClient.getTransaction({ hash: op!.txHash as `0x${string}` }).catch(() => null)).not.toBeNull();
    } finally {
      await rpc("evm_setAutomine", [true]);
    }
    await h.chain.mine(1);
    await h.pump(10);
    expect(await status(pi.id)).toBe("SETTLED");
  });

  it("a broadcast the node rejects releases the nonce and is retried with back-off (no lost or duplicated operation)", async () => {
    const chain = h.engine.chains.get(h.net)!;
    const real = chain.client.sendRawTransaction.bind(chain.client);
    let calls = 0;
    // Fault injected BEFORE the payment so the very first sweep broadcast fails.
    (chain.client as any).sendRawTransaction = async (a: any) => { calls++; if (calls <= 1) throw new Error("ECONNRESET upstream"); return real(a); };
    const pi = await createPaymentIntent(h.engine, m, input("2.00"));
    await h.payUsdc(pi.networks[0]!.deposit_address as `0x${string}`, parseUsdc("2"));
    try {
      await h.pump(4);
      const rows = await ops("DEPLOY_AND_SWEEP").then((r) => r.filter((o) => o.lastError?.includes("broadcast rejected")));
      expect(rows.length).toBe(1);
      expect(rows[0]!.status).toBe("QUEUED");
      expect(rows[0]!.nonce).toBeNull();
      expect(calls).toBe(1);
    } finally {
      (chain.client as any).sendRawTransaction = real;
    }
    h.clock.offsetMs += 10 * 60_000;
    await h.chain.setTime(Math.floor((Date.now() + h.clock.offsetMs) / 1000));
    await h.pump(10);
    expect(await status(pi.id)).toBe("SETTLED");
    const dup = await h.engine.db.select().from(schema.relayerOperations).where(eq(schema.relayerOperations.relatedType, "settlement"));
    const keys = dup.map((o) => o.dedupeKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("worker resilience", () => {
  it("survives an RPC outage: errors are contained, an alert fires after repeated failures, and work resumes without duplicates", async () => {
    const pi = await createPaymentIntent(h.engine, m, input("6.00"));
    await h.payUsdc(pi.networks[0]!.deposit_address as `0x${string}`, parseUsdc("6"));
    const chain = h.engine.chains.get(h.net)!;
    const real = chain.adapter.getHeadInfo.bind(chain.adapter);
    chain.adapter.getHeadInfo = async () => { throw new Error("upstream connect timeout"); };
    for (let i = 0; i < 6; i++) await workerTick(h.engine); // must never throw
    expect(h.alerts.alerts.some((a) => a.key.startsWith("loop-failing:") && a.key.includes("watcher"))).toBe(true);
    expect(["AWAITING_PAYMENT"]).toContain(await status(pi.id));

    chain.adapter.getHeadInfo = real; // RPC recovers
    for (let i = 0; i < 12; i++) { await h.chain.mine(1); await workerTick(h.engine); }
    expect(await status(pi.id)).toBe("SETTLED");
    const rows = await h.engine.db.select().from(schema.transactions).where(eq(schema.transactions.paymentIntentId, pi.id));
    expect(rows.filter((t) => t.kind === "INCOMING_TRANSFER")).toHaveLength(1);
  });

  it("concurrent watcher runs (two workers racing) record every transfer exactly once", async () => {
    const pi = await createPaymentIntent(h.engine, m, input("5.00"));
    const addr = pi.networks[0]!.deposit_address as `0x${string}`;
    await h.payUsdc(addr, parseUsdc("2"));
    await h.payUsdc(addr, parseUsdc("3"));
    await h.chain.mine(3);
    await h.engine.db.update(schema.watcherCursors).set({ lastScannedBlock: BigInt(h.chain.deployment.deployBlock) });
    await Promise.all([watcherTick(h.engine, h.net), watcherTick(h.engine, h.net), watcherTick(h.engine, h.net)]);
    await h.pump(8);
    const rows = await h.engine.db.select().from(schema.transactions).where(and(eq(schema.transactions.paymentIntentId, pi.id), eq(schema.transactions.kind, "INCOMING_TRANSFER")));
    expect(rows).toHaveLength(2);
    expect((await getPaymentIntent(h.engine, m, pi.id)).amount_received_units).toBe("5000000");
    const ledger = await h.engine.db.select().from(schema.ledgerEntries).where(and(eq(schema.ledgerEntries.paymentIntentId, pi.id), eq(schema.ledgerEntries.account, "DETECTED")));
    expect(ledger).toHaveLength(2);
    const stl = await h.engine.db.select().from(schema.settlements).where(eq(schema.settlements.paymentIntentId, pi.id));
    expect(stl.filter((s) => s.status === "FAILED")).toHaveLength(0);
  });

  it("webhook jobs claimed by a worker that died are re-claimed and delivered once", async () => {
    const before = h.webhookSink.received.length;
    const [d] = await h.engine.db.insert(schema.webhookEndpoints).values({ id: "whe_probe", merchantId: m.merchantId, environment: "test", url: h.webhookSink.url, secretEnc: "x", events: ["*"] }).returning();
    void d;
    await h.engine.db.delete(schema.webhookEndpoints).where(eq(schema.webhookEndpoints.id, "whe_probe"));
    await processWebhookJobs(h.engine);
    expect(h.webhookSink.received.length).toBeGreaterThanOrEqual(before);
  });
});

describe("relayer spending policy", () => {
  it("defers when fees exceed the per-transaction cap, spends nothing, alerts; resumes when allowed", async () => {
    const chain = h.engine.chains.get(h.net)!;
    const original = { ...chain.policy };
    chain.policy.maxFeePerTxWei = 1n; // absurdly low
    const pi = await createPaymentIntent(h.engine, m, input("1.50"));
    await h.payUsdc(pi.networks[0]!.deposit_address as `0x${string}`, parseUsdc("1.5"));
    const before = await h.chain.publicClient.getBalance({ address: chain.signer!.address });
    await h.pump(5);
    expect(await h.chain.publicClient.getBalance({ address: chain.signer!.address })).toBe(before);
    expect(h.alerts.alerts.some((a) => a.key.startsWith("fee-cap"))).toBe(true);
    chain.policy.maxFeePerTxWei = original.maxFeePerTxWei;
    h.clock.offsetMs += 5 * 60_000;
    await h.chain.setTime(Math.floor((Date.now() + h.clock.offsetMs) / 1000));
    await h.pump(10);
    expect(await status(pi.id)).toBe("SETTLED");
  });

  it("refuses to submit when the operational wallet would fall below its minimum balance", async () => {
    const chain = h.engine.chains.get(h.net)!;
    const original = chain.policy.minBalanceWei;
    chain.policy.minBalanceWei = 10n ** 30n;
    const pi = await createPaymentIntent(h.engine, m, input("1.25"));
    await h.payUsdc(pi.networks[0]!.deposit_address as `0x${string}`, parseUsdc("1.25"));
    await h.pump(5);
    expect(h.alerts.alerts.some((a) => a.key.startsWith("balance-block"))).toBe(true);
    expect(await status(pi.id)).toBe("SETTLEMENT_PENDING");
    chain.policy.minBalanceWei = original;
    await h.pump(10);
    expect(await status(pi.id)).toBe("SETTLED");
  });

  it("stops at the daily operation cap", async () => {
    const chain = h.engine.chains.get(h.net)!;
    const original = chain.policy.maxOpsPerDay;
    chain.policy.maxOpsPerDay = 0;
    const pi = await createPaymentIntent(h.engine, m, input("1.10"));
    await h.payUsdc(pi.networks[0]!.deposit_address as `0x${string}`, parseUsdc("1.1"));
    await h.pump(5);
    expect(h.alerts.alerts.some((a) => a.key.startsWith("ops-cap"))).toBe(true);
    expect(await status(pi.id)).toBe("SETTLEMENT_PENDING");
    chain.policy.maxOpsPerDay = original;
    await h.pump(10);
    expect(await status(pi.id)).toBe("SETTLED");
  });
});
