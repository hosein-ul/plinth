import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, schema } from "@plinth/db";
import { buildReceiveAuthorization, MerchantVaultAbi } from "@plinth/blockchain";
import { parseUsdc, toBytes32Id } from "@plinth/shared";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { encodeFunctionData, getAddress, parseAbiItem } from "viem";
import {
  replanSettlements, createApiKey, createInvoice, createPaymentIntent, createEndpoint, enableNetwork, getPaymentIntent, listDeliveries, paymentDetail, listSettlements,
  overview, prepareWalletPayment, publicCheckout, relayerTick, setPaused, submitWalletPayment, verifyWebhookSignature, watcherTick,
  expireDueIntents, requestRefund, submitRefundProof, processWebhookJobs, EngineError, type AuthContext,
} from "../src";
import { startHarness, type Harness } from "./harness";

let h: Harness;
let m: AuthContext;
let secret: string;
const input = (amount: string, extra: object = {}) => ({ amount, currency: "USDC" as const, checkout_methods: ["WALLET", "ADDRESS"] as ("WALLET" | "ADDRESS")[], expires_in_seconds: 3600, ...extra });
const status = async (id: string) => (await getPaymentIntent(h.engine, m, id)).status;
const events = () => h.webhookSink.received.map((r) => JSON.parse(r.body).type as string);

beforeAll(async () => {
  h = await startHarness({ confirmations: 3 });
  m = await h.newMerchant("Acme Coffee");
  // Merchant enables the network with THEIR OWN owner address; the gateway relayer deploys the vault.
  const v = await enableNetwork(h.engine, m, { network: h.net, owner_address: h.chain.accounts[2]!.address });
  expect(v.status).toBe("PENDING");
  await h.pump(2);
  secret = (await createEndpoint(h.engine, m.merchantId, "test", { url: h.webhookSink.url, events: ["*"] })).secret;
});
afterAll(async () => h.stop());

describe("merchant onboarding", () => {
  it("deploys an owner-controlled vault through the relayer", async () => {
    const [v] = await h.engine.db.select().from(schema.merchantVaults).where(eq(schema.merchantVaults.merchantId, m.merchantId));
    expect(v!.status).toBe("ACTIVE");
    const state = await h.engine.chains.get(h.net)!.adapter.readVault(getAddress(v!.vaultAddress));
    expect(state.owner).toBe(h.chain.accounts[2]!.address);
    expect(state.mode).toBe("BALANCE_IN_VAULT");
    expect(state.owner).not.toBe(h.chain.accounts[1]!.address); // relayer is NOT the owner
  });
});

describe("manual address checkout: partial → full payment", () => {
  let id: string;
  let address: `0x${string}`;
  it("creates an intent with a verified counterfactual address and no deployed contract", async () => {
    const pi = await createPaymentIntent(h.engine, m, input("100.00", { order_reference: "ORDER-1" }));
    id = pi.id;
    address = pi.networks[0]!.deposit_address as `0x${string}`;
    expect(pi.status).toBe("AWAITING_PAYMENT");
    expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(await h.engine.chains.get(h.net)!.adapter.hasCode(address)).toBe(false);
    expect(pi.checkout_url).toBe(`http://localhost:3000/pay/${id}`);
  });

  it("a partial transfer is detected, finalised, swept — but the invoice is NOT marked paid", async () => {
    await h.payUsdc(address, parseUsdc("40"));
    await h.pump(1, { mine: 0 });
    expect(["DETECTED", "CONFIRMING"]).toContain(await status(id));
    await h.pump(8);
    const d = await paymentDetail(h.engine, m, id);
    expect(d.status).toBe("CONFIRMING"); // partial, not expired: waiting for the rest
    expect(d.amount_received_units).toBe("40000000");
    expect(d.excess_amount).toBe("0.00");
    // The 40 USDC was swept into the merchant vault with no gas ever sent to the invoice address.
    const vault = getAddress((await h.engine.db.select().from(schema.merchantVaults).where(eq(schema.merchantVaults.merchantId, m.merchantId)))[0]!.vaultAddress);
    expect(await h.engine.chains.get(h.net)!.adapter.usdcBalanceOf(vault)).toBe(parseUsdc("40"));
    expect(await h.chain.publicClient.getBalance({ address })).toBe(0n);
    expect(d.settlements[0]!.status).toBe("CONFIRMED");
    expect(events()).not.toContain("payment.confirmed");
  });

  it("the second transfer completes the invoice; funds are settled; webhooks are signed and ordered", async () => {
    await h.payUsdc(address, parseUsdc("60"));
    await h.pump(10);
    const d = await paymentDetail(h.engine, m, id);
    expect(d.status).toBe("SETTLED");
    expect(d.amount_received_units).toBe("100000000");
    expect(d.amount_settled_units).toBe("100000000");
    const vault = getAddress((await h.engine.db.select().from(schema.merchantVaults).where(eq(schema.merchantVaults.merchantId, m.merchantId)))[0]!.vaultAddress);
    expect(await h.engine.chains.get(h.net)!.adapter.usdcBalanceOf(vault)).toBe(parseUsdc("100"));

    const types = events();
    for (const t of ["payment.detected", "payment.confirmed", "settlement.submitted", "settlement.completed", "payment.completed"]) expect(types).toContain(t);
    expect(types.indexOf("payment.detected")).toBeLessThan(types.indexOf("payment.confirmed"));
    expect(types.indexOf("payment.confirmed")).toBeLessThan(types.indexOf("payment.completed"));
    // each logical event delivered exactly once
    for (const t of new Set(types)) if (t !== "settlement.submitted" && t !== "settlement.completed") expect(types.filter((x) => x === t).length).toBe(1);

    for (const r of h.webhookSink.received) {
      expect(verifyWebhookSignature(secret, r.body, r.headers["plinth-signature"]!)).toBe(true);
      expect(r.headers["plinth-event-id"]).toBe(JSON.parse(r.body).id);
    }
    expect(verifyWebhookSignature("whsec_wrong", h.webhookSink.received[0]!.body, h.webhookSink.received[0]!.headers["plinth-signature"]!)).toBe(false);
  });

  it("ledger distinguishes detected / verified / finalized / settled and balances to the invoice", async () => {
    const rows = await h.engine.db.select().from(schema.ledgerEntries).where(eq(schema.ledgerEntries.paymentIntentId, id));
    const total = (acct: string) => rows.filter((r) => r.account === acct).reduce((a, r) => a + (r.direction === "CREDIT" ? r.amount : -r.amount), 0n);
    expect(total("DETECTED")).toBe(parseUsdc("100"));
    expect(total("VERIFIED")).toBe(parseUsdc("100"));
    expect(total("FINALIZED")).toBe(parseUsdc("100"));
    expect(total("SETTLED_TO_VAULT")).toBe(parseUsdc("100"));
  });

  it("re-running the watcher and workers is idempotent: no duplicate transfers, settlements, ledger rows or webhooks", async () => {
    const before = {
      tx: (await h.engine.db.select().from(schema.transactions).where(eq(schema.transactions.paymentIntentId, id))).length,
      stl: (await h.engine.db.select().from(schema.settlements).where(eq(schema.settlements.paymentIntentId, id))).length,
      led: (await h.engine.db.select().from(schema.ledgerEntries).where(eq(schema.ledgerEntries.paymentIntentId, id))).length,
      hooks: h.webhookSink.received.length,
    };
    // force a deep rescan from the deployment block
    await h.engine.db.update(schema.watcherCursors).set({ lastScannedBlock: BigInt(h.chain.deployment.deployBlock) });
    await h.pump(3);
    const after = {
      tx: (await h.engine.db.select().from(schema.transactions).where(eq(schema.transactions.paymentIntentId, id))).length,
      stl: (await h.engine.db.select().from(schema.settlements).where(eq(schema.settlements.paymentIntentId, id))).length,
      led: (await h.engine.db.select().from(schema.ledgerEntries).where(eq(schema.ledgerEntries.paymentIntentId, id))).length,
      hooks: h.webhookSink.received.length,
    };
    expect(after).toEqual(before);
    expect(await status(id)).toBe("SETTLED");
  });
});

describe("edge cases", () => {
  it("overpayment is flagged OVERPAID with the excess, and still settles", async () => {
    const pi = await createPaymentIntent(h.engine, m, input("50.00"));
    await h.payUsdc(pi.networks[0]!.deposit_address as `0x${string}`, parseUsdc("65"));
    await h.pump(10);
    const d = await getPaymentIntent(h.engine, m, pi.id);
    expect(d.status).toBe("SETTLED");
    expect(d.excess_amount).toBe("15.00");
    expect(events()).toContain("payment.overpaid");
  });

  it("an unsupported token is recorded as INVALID_ASSET and never counted as payment", async () => {
    const pi = await createPaymentIntent(h.engine, m, input("25.00"));
    const addr = pi.networks[0]!.deposit_address as `0x${string}`;
    const { loadArtifact, MockFiatTokenAbi } = await import("@plinth/blockchain");
    const art = loadArtifact("MockFiatToken");
    const dep = await h.chain.walletFor(0).deployContract({ abi: MockFiatTokenAbi, bytecode: art.bytecode, account: h.chain.accounts[0]!, chain: undefined });
    const fake = (await h.chain.publicClient.waitForTransactionReceipt({ hash: dep })).contractAddress!;
    const mint = await h.chain.walletFor(0).writeContract({ address: fake, abi: MockFiatTokenAbi, functionName: "mint", args: [addr, parseUsdc("25")], account: h.chain.accounts[0]!, chain: undefined });
    await h.chain.publicClient.waitForTransactionReceipt({ hash: mint });
    await h.pump(8);
    const d = await getPaymentIntent(h.engine, m, pi.id);
    expect(d.status).toBe("INVALID_ASSET");
    expect(d.amount_received_units).toBe("0");
    expect(h.alerts.alerts.some((a) => a.title.includes("Unsupported token"))).toBe(true);
    expect(events()).toContain("payment.invalid_asset");
  });

  it("expiry: nothing paid → EXPIRED; partial → UNDERPAID; late funds → LATE_PAYMENT", async () => {
    const pi1 = await createPaymentIntent(h.engine, m, input("10.00", { expires_in_seconds: 60 }));
    const pi2 = await createPaymentIntent(h.engine, m, input("10.00", { expires_in_seconds: 60 }));
    const pi3 = await createPaymentIntent(h.engine, m, input("10.00", { expires_in_seconds: 60 }));
    await h.payUsdc(pi2.networks[0]!.deposit_address as `0x${string}`, parseUsdc("4"));
    await h.pump(6);
    // jump past expiry on both the app clock and the chain clock
    h.clock.offsetMs += 120_000;
    await h.chain.setTime(Math.floor((Date.now() + h.clock.offsetMs) / 1000));
    await h.payUsdc(pi3.networks[0]!.deposit_address as `0x${string}`, parseUsdc("10"));
    await expireDueIntents(h.engine);
    await h.pump(8);
    expect(await status(pi1.id)).toBe("EXPIRED");
    expect(await status(pi2.id)).toBe("UNDERPAID");
    expect(await status(pi3.id)).toBe("LATE_PAYMENT");
    const t = events();
    expect(t).toContain("payment.expired");
    expect(t).toContain("payment.underpaid");
    expect(t).toContain("payment.late");
    // Late funds are still the merchant's: swept to the vault, but never counted as an on-time payment.
    expect((await getPaymentIntent(h.engine, m, pi3.id)).amount_settled_units).toBe("10000000");
  });

  it("merchants cannot read each other's payments", async () => {
    const other = await h.newMerchant("Other Co");
    const pi = await createPaymentIntent(h.engine, m, input("5.00"));
    await expect(getPaymentIntent(h.engine, other, pi.id)).rejects.toMatchObject({ status: 404 });
    await expect(requestRefund(h.engine, other, { payment_intent_id: pi.id, amount: "1.00", recipient: h.chain.accounts[5]!.address })).rejects.toMatchObject({ status: 404 });
  });

  it("test-mode keys cannot create live payments on testnets", async () => {
    const liveCtx = { ...m, environment: "live" as const };
    await expect(createPaymentIntent(h.engine, liveCtx, input("5.00"))).rejects.toMatchObject({ code: "NO_NETWORK_AVAILABLE" });
  });
});

describe("failure handling", () => {
  it("a settlement that reverts is SETTLEMENT_FAILED, alerts, spends no gas, and recovers after the cause is fixed", async () => {
    const pi = await createPaymentIntent(h.engine, m, input("20.00"));
    const [addr] = await h.engine.db.select().from(schema.invoiceAddresses).where(eq(schema.invoiceAddresses.paymentIntentId, pi.id));
    const goodVault = addr!.vaultAddress;
    // Corrupt the vault the settlement would target (a registered-vault check fails on-chain).
    await h.engine.db.update(schema.invoiceAddresses).set({ vaultAddress: h.chain.accounts[5]!.address.toLowerCase() }).where(eq(schema.invoiceAddresses.id, addr!.id));
    const gasBefore = await h.chain.publicClient.getBalance({ address: h.chain.accounts[1]!.address });
    await h.payUsdc(pi.networks[0]!.deposit_address as `0x${string}`, parseUsdc("20"));
    await h.pump(8);
    expect(await status(pi.id)).toBe("SETTLEMENT_FAILED");
    expect(await h.chain.publicClient.getBalance({ address: h.chain.accounts[1]!.address })).toBe(gasBefore); // simulation failed → no gas burned
    expect(events()).toContain("settlement.failed");
    expect(h.alerts.alerts.some((a) => a.key.startsWith("op-failed"))).toBe(true);

    // Fix the cause; after the retry back-off the planner creates attempt #2 and it succeeds.
    await h.engine.db.update(schema.invoiceAddresses).set({ vaultAddress: goodVault }).where(eq(schema.invoiceAddresses.id, addr!.id));
    h.clock.offsetMs += 10 * 60_000;
    await h.chain.setTime(Math.floor((Date.now() + h.clock.offsetMs) / 1000));
    await replanSettlements(h.engine);
    await h.pump(10);
    const d = await paymentDetail(h.engine, m, pi.id);
    expect(d.status).toBe("SETTLED");
    expect(d.settlements.map((s) => s.status)).toEqual(["FAILED", "CONFIRMED"]);
    expect(d.settlements[1]!.attempt).toBe(2);
  });

  it("the kill switch stops NEW relayer actions; resuming processes the backlog", async () => {
    await setPaused(h.engine, h.net, true, "incident drill", { id: "usr_test" });
    const pi = await createPaymentIntent(h.engine, m, input("7.00"));
    await h.payUsdc(pi.networks[0]!.deposit_address as `0x${string}`, parseUsdc("7"));
    await h.pump(8);
    // Final funds, settlement queued but not executed because new relayer actions are disabled.
    expect(await status(pi.id)).toBe("SETTLEMENT_PENDING");
    expect((await getPaymentIntent(h.engine, m, pi.id)).amount_settled_units).toBe("0");
    const ops = await h.engine.db.select().from(schema.relayerOperations).where(and(eq(schema.relayerOperations.kind, "DEPLOY_AND_SWEEP"), eq(schema.relayerOperations.status, "QUEUED")));
    expect(ops.length).toBeGreaterThan(0);
    await setPaused(h.engine, h.net, false, undefined, { id: "usr_test" });
    await h.pump(10);
    expect(await status(pi.id)).toBe("SETTLED");
  });

  it("webhook delivery retries with backoff and records every attempt; manual retry works", async () => {
    const before = h.webhookSink.received.length;
    h.webhookSink.status = 500;
    const pi = await createPaymentIntent(h.engine, m, input("3.00"));
    await h.payUsdc(pi.networks[0]!.deposit_address as `0x${string}`, parseUsdc("3"));
    await h.pump(4);
    h.webhookSink.status = 200;
    const failedDeliveries = (await listDeliveries(h.engine.db, m.merchantId)).filter((d) => d.status === "RETRYING");
    expect(failedDeliveries.length).toBeGreaterThan(0);
    const attempts = await h.engine.db.select().from(schema.webhookAttempts);
    expect(attempts.some((a) => a.statusCode === 500)).toBe(true);
    expect(h.webhookSink.received.length).toBeGreaterThan(before);
    // jump the clock past the retry delay → delivered
    h.clock.offsetMs += 3600_000;
    await h.engine.db.update(schema.jobs).set({ runAt: new Date(0) }).where(eq(schema.jobs.queue, "webhook.deliver"));
    await processWebhookJobs(h.engine);
    expect((await listDeliveries(h.engine.db, m.merchantId)).filter((d) => d.status === "RETRYING").length).toBeLessThan(failedDeliveries.length);
  });
});

describe("reorg handling", () => {
  it("a transfer that disappears in a reorg is reversed (no phantom payment) and re-credited when it reappears", async () => {
    const pi = await createPaymentIntent(h.engine, m, input("15.00"));
    const addr = pi.networks[0]!.deposit_address as `0x${string}`;
    const rpc = (method: string, params: unknown[] = []) => h.chain.publicClient.request({ method: method as never, params: params as never });
    const snap = await rpc("evm_snapshot");
    await h.payUsdc(addr, parseUsdc("15"));
    await watcherTick(h.engine, h.net);
    expect(["DETECTED", "CONFIRMING"]).toContain(await status(pi.id));
    await rpc("evm_revert", [snap]); // chain reorganises the payment away
    await h.chain.mine(2);
    await h.pump(2, { mine: 0 });
    expect(await status(pi.id)).toBe("AWAITING_PAYMENT");
    const rows = await h.engine.db.select().from(schema.ledgerEntries).where(eq(schema.ledgerEntries.paymentIntentId, pi.id));
    expect(rows.reduce((a, r) => a + (r.account === "DETECTED" ? (r.direction === "CREDIT" ? r.amount : -r.amount) : 0n), 0n)).toBe(0n);
    const reorged = await h.engine.db.select().from(schema.transactions).where(and(eq(schema.transactions.paymentIntentId, pi.id), eq(schema.transactions.status, "REORGED")));
    expect(reorged.length).toBe(1);
  });
});

describe("gasless wallet checkout (EIP-3009 via router)", () => {
  it("customer with zero native balance signs, relayer submits, vault is credited, invoice settles", async () => {
    const pi = await createPaymentIntent(h.engine, m, input("42.50"));
    const customer = privateKeyToAccount(generatePrivateKey());
    expect(await h.chain.publicClient.getBalance({ address: customer.address })).toBe(0n);
    await h.chain.mintUsdc(customer.address, parseUsdc("100"));

    const co = await publicCheckout(h.engine, pi.id);
    expect(co.networks[0]!.wallet_checkout_supported).toBe(true);

    const prep = await prepareWalletPayment(h.engine, pi.id, { network: h.net, payer: customer.address });
    expect(prep.amount_units).toBe("42500000");
    expect(prep.fee.customer_network_fee).toBe("0");
    const td = prep.typed_data;
    const signature = await customer.signTypedData({
      domain: { name: td.domain.name, version: td.domain.version, chainId: td.domain.chainId, verifyingContract: td.domain.verifyingContract },
      types: { ReceiveWithAuthorization: td.types.ReceiveWithAuthorization }, primaryType: "ReceiveWithAuthorization",
      message: { from: td.message.from, to: td.message.to, value: BigInt(td.message.value), validAfter: BigInt(td.message.validAfter), validBefore: BigInt(td.message.validBefore), nonce: td.message.nonce },
    });

    // A signature by a different wallet is rejected before any gas is spent.
    const stranger = privateKeyToAccount(generatePrivateKey());
    const bad = await stranger.signTypedData({
      domain: { name: td.domain.name, version: td.domain.version, chainId: td.domain.chainId, verifyingContract: td.domain.verifyingContract },
      types: { ReceiveWithAuthorization: td.types.ReceiveWithAuthorization }, primaryType: "ReceiveWithAuthorization",
      message: { from: td.message.from, to: td.message.to, value: BigInt(td.message.value), validAfter: BigInt(td.message.validAfter), validBefore: BigInt(td.message.validBefore), nonce: td.message.nonce },
    });
    await expect(submitWalletPayment(h.engine, pi.id, { attempt_id: prep.attempt_id, signature: bad })).rejects.toMatchObject({ code: "INVALID_SIGNATURE" });

    await submitWalletPayment(h.engine, pi.id, { attempt_id: prep.attempt_id, signature });
    await expect(submitWalletPayment(h.engine, pi.id, { attempt_id: prep.attempt_id, signature })).rejects.toMatchObject({ code: "ATTEMPT_USED" });
    await h.pump(10);

    const d = await paymentDetail(h.engine, m, pi.id);
    expect(d.status).toBe("SETTLED");
    expect(d.transactions.find((t) => t.kind === "WALLET_PAYMENT")?.from?.toLowerCase()).toBe(customer.address.toLowerCase());
    expect(d.attempts[0]!.status).toBe("CONFIRMED");
    expect(await h.chain.publicClient.getBalance({ address: customer.address })).toBe(0n);
    // The calldata (which carries the signature) is wiped once the operation is terminal.
    const [op] = await h.engine.db.select().from(schema.relayerOperations).where(eq(schema.relayerOperations.kind, "WALLET_PAYMENT"));
    expect(op!.calldata).toBe("0x");
    expect(op!.feeNativeWei).toBeGreaterThan(0n); // the gateway paid, and recorded, the cost
  });

  it("falls back cleanly when the network has no relayer", async () => {
    const pi = await createPaymentIntent(h.engine, m, input("5.00"));
    const chain = h.engine.chains.get(h.net)!;
    const signer = chain.signer;
    chain.signer = undefined;
    try {
      const co = await publicCheckout(h.engine, pi.id);
      expect(co.networks[0]!.wallet_checkout_supported).toBe(false);
      expect(co.networks[0]!.wallet_unavailable_reason).toMatch(/not available/);
      await expect(prepareWalletPayment(h.engine, pi.id, { network: h.net, payer: h.chain.accounts[3]!.address })).rejects.toMatchObject({ code: "WALLET_UNAVAILABLE" });
    } finally {
      chain.signer = signer;
    }
  });

  it("rejects wallets without enough USDC", async () => {
    const pi = await createPaymentIntent(h.engine, m, input("5.00"));
    const poor = privateKeyToAccount(generatePrivateKey());
    await expect(prepareWalletPayment(h.engine, pi.id, { network: h.net, payer: poor.address })).rejects.toMatchObject({ code: "INSUFFICIENT_BALANCE" });
  });
});

describe("refunds and vault authority", () => {
  it("a refund completes only after the merchant's own vault transfer is verified on-chain", async () => {
    const pi = await createPaymentIntent(h.engine, m, input("30.00"));
    await h.payUsdc(pi.networks[0]!.deposit_address as `0x${string}`, parseUsdc("30"));
    await h.pump(10);
    expect(await status(pi.id)).toBe("SETTLED");

    const customerWallet = h.chain.accounts[6]!.address;
    const r = await requestRefund(h.engine, m, { payment_intent_id: pi.id, amount: "30.00", recipient: customerWallet });
    expect(r.status).toBe("REQUESTED");
    expect(await status(pi.id)).toBe("REFUND_REQUESTED");
    await expect(submitRefundProof(h.engine, m, r.id, ("0x" + "ab".repeat(32)) as `0x${string}`)).rejects.toMatchObject({ code: "PROOF_INVALID" });
    await expect(requestRefund(h.engine, m, { payment_intent_id: pi.id, amount: "1.00", recipient: customerWallet })).rejects.toMatchObject({ code: "REFUND_EXCEEDS_PAYMENT" });

    // Merchant owner sends the refund from THEIR vault; the gateway cannot.
    const [v] = await h.engine.db.select().from(schema.merchantVaults).where(eq(schema.merchantVaults.merchantId, m.merchantId));
    const hash = await h.chain.walletFor(2).sendTransaction({ to: getAddress(v!.vaultAddress), data: encodeFunctionData({ abi: MerchantVaultAbi, functionName: "withdraw", args: [customerWallet, parseUsdc("30")] }), account: h.chain.accounts[2]!, chain: undefined });
    await h.chain.publicClient.waitForTransactionReceipt({ hash });
    await h.chain.mine(4);
    const done = await submitRefundProof(h.engine, m, r.id, hash);
    expect(done.status).toBe("COMPLETED");
    expect(await status(pi.id)).toBe("REFUNDED");
    await h.pump(2);
    expect(events()).toContain("refund.completed");
  });

  it("the relayer address has no authority over the vault (cannot withdraw or change policy)", async () => {
    const [v] = await h.engine.db.select().from(schema.merchantVaults).where(eq(schema.merchantVaults.merchantId, m.merchantId));
    for (const data of [
      encodeFunctionData({ abi: MerchantVaultAbi, functionName: "withdraw", args: [h.chain.accounts[1]!.address, 1n] }),
      encodeFunctionData({ abi: MerchantVaultAbi, functionName: "scheduleSettlement", args: [{ mode: 1, destination: h.chain.accounts[1]!.address, threshold: 0n, interval: 0n }] }),
      encodeFunctionData({ abi: MerchantVaultAbi, functionName: "transferOwnership", args: [h.chain.accounts[1]!.address] }),
    ]) {
      await expect(h.chain.publicClient.call({ account: h.chain.accounts[1]!.address, to: getAddress(v!.vaultAddress), data })).rejects.toThrow();
    }
  });
});

describe("invoices and reporting", () => {
  it("creates numbered invoices with exact line-item totals and reports honest metrics", async () => {
    const inv = await createInvoice(h.engine, m, { customer_name: "Globex", customer_email: "ap@globex.test", due_in_days: 14, checkout_methods: ["ADDRESS"], line_items: [{ description: "Consulting", quantity: 3, unit_amount: "100.10" }, { description: "Hosting", quantity: 1, unit_amount: "9.99" }] });
    expect(inv.number).toMatch(/^INV-\d{4}$/);
    expect(inv.total).toBe("310.29");
    const o = await overview(h.engine, m);
    expect(BigInt(o.settled_to_vault.units)).toBeGreaterThan(0n);
    expect(BigInt(o.received_final.units)).toBeGreaterThanOrEqual(BigInt(o.settled_to_vault.units) - parseUsdc("0")); // detected ≥ settled labelling holds
    expect(o.counts.total).toBeGreaterThan(5);
    expect(o.success_rate).not.toBeNull();
    const stl = await listSettlements(h.engine, m);
    expect(stl.length).toBeGreaterThan(0);
  });

  it("API keys are stored hashed and returned once", async () => {
    const k = await createApiKey(h.engine, m, { name: "backend", environment: "test" });
    expect(k.key.startsWith("sk_test_")).toBe(true);
    const [row] = await h.engine.db.select().from(schema.apiKeys).where(eq(schema.apiKeys.id, k.id));
    expect(row!.keyHash).not.toContain(k.key);
    expect(JSON.stringify(row)).not.toContain(k.key.slice(10));
  });
});

// keep unused imports referenced for type-only tooling
void [toBytes32Id, buildReceiveAuthorization, parseAbiItem, relayerTick, EngineError];
