import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { claimJobs, completeJob, connect, enqueue, failJob, schema, type DbHandle } from "../src";

let h: DbHandle;
beforeAll(async () => {
  // TEST_DATABASE_URL points at a disposable Postgres (e.g. a dedicated Neon branch); otherwise embedded PGlite.
  h = connect(process.env.TEST_DATABASE_URL ?? "pglite://memory");
  await h.migrate();
});
afterAll(async () => h.close());

const now = () => new Date();

async function seed() {
  await h.db.insert(schema.merchants).values({ id: "mer_1", name: "Acme" }).onConflictDoNothing();
  await h.db
    .insert(schema.networks)
    .values({ id: "net", chainId: 1, name: "N", environment: "testnet" })
    .onConflictDoNothing();
  await h.db
    .insert(schema.paymentIntents)
    .values({
      id: "pi_1", invoiceId32: "0xaa", merchantId: "mer_1", environment: "test", amount: 100_000_000n,
      allowedNetworks: ["net"], checkoutMethods: ["ADDRESS"], expiresAt: new Date(Date.now() + 3600_000),
    })
    .onConflictDoNothing();
}

describe("schema constraints", () => {
  it("migrates cleanly and stores exact bigint amounts", async () => {
    await seed();
    const [row] = await h.db.select().from(schema.paymentIntents).where(eq(schema.paymentIntents.id, "pi_1"));
    expect(row?.amount).toBe(100_000_000n);
    expect(row?.amountFinal).toBe(0n);
  });

  it("a transfer log can be recorded only once per (network, tx, log index)", async () => {
    await seed();
    const t = { id: "tx_a", networkId: "net", txHash: "0xabc", logIndex: 3, kind: "INCOMING_TRANSFER", amount: 5n };
    await h.db.insert(schema.transactions).values(t);
    await expect(h.db.insert(schema.transactions).values({ ...t, id: "tx_b" })).rejects.toThrow();
    // Same tx hash, different log index is a distinct transfer.
    await h.db.insert(schema.transactions).values({ ...t, id: "tx_c", logIndex: 4 });
  });

  it("allows only one in-flight sweep per invoice address", async () => {
    await seed();
    await h.db.insert(schema.invoiceAddresses).values({
      id: "inv_1", paymentIntentId: "pi_1", merchantId: "mer_1", networkId: "net", address: "0x1",
      vaultAddress: "0x2", merchantId32: "0x00", invoiceId32: "0x01", factoryAddress: "0x3",
      implementationAddress: "0x4", contractVersion: 1, createdBlock: 1n,
    });
    const s = { merchantId: "mer_1", paymentIntentId: "pi_1", invoiceAddressId: "inv_1", networkId: "net", vaultAddress: "0x2", expectedAmount: 1n };
    await h.db.insert(schema.settlements).values({ ...s, id: "stl_1", status: "SUBMITTED" });
    await expect(h.db.insert(schema.settlements).values({ ...s, id: "stl_2", status: "QUEUED" })).rejects.toThrow();
    await h.db.update(schema.settlements).set({ status: "CONFIRMED" }).where(eq(schema.settlements.id, "stl_1"));
    await h.db.insert(schema.settlements).values({ ...s, id: "stl_3", status: "QUEUED" }); // next sweep OK after confirm
  });

  it("ledger entries are idempotent by key", async () => {
    await seed();
    const e = { merchantId: "mer_1", networkId: "net", account: "DETECTED", direction: "CREDIT", amount: 1n, refType: "tx", refId: "x", idempotencyKey: "k1" };
    await h.db.insert(schema.ledgerEntries).values({ ...e, id: "led_1" });
    await expect(h.db.insert(schema.ledgerEntries).values({ ...e, id: "led_2" })).rejects.toThrow();
  });
});

describe("durable job queue", () => {
  it("dedupes, claims once, retries with backoff, and completes", async () => {
    await enqueue(h.db, "q", { n: 1 }, { dedupeKey: "same" });
    await enqueue(h.db, "q", { n: 2 }, { dedupeKey: "same" }); // ignored
    await enqueue(h.db, "q", { n: 3 });
    const a = await claimJobs(h.db, "q", 10);
    expect(a).toHaveLength(2);
    expect(await claimJobs(h.db, "q", 10)).toHaveLength(0); // locked, not double-claimed

    const first = a.find((j) => j.payload.n === 1)!;
    await failJob(h.db, first, "boom");
    const [failed] = await h.db.select().from(schema.jobs).where(eq(schema.jobs.id, first.id));
    expect(failed?.status).toBe("PENDING");
    expect(failed!.runAt.getTime()).toBeGreaterThan(now().getTime());
    await completeJob(h.db, a.find((j) => j.payload.n === 3)!.id);
  });

  it("re-claims jobs whose worker died (expired lock)", async () => {
    await enqueue(h.db, "q2", { n: 1 });
    const [j] = await claimJobs(h.db, "q2", 1, 1); // 1ms lock
    expect(j).toBeTruthy();
    await new Promise((r) => setTimeout(r, 20));
    const again = await claimJobs(h.db, "q2", 1);
    expect(again[0]?.id).toBe(j!.id);
    expect(again[0]?.attempts).toBe(2);
  });
});
