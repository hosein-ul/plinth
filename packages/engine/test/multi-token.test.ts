import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, schema } from "@plinth/db";
import { MockFiatTokenAbi } from "@plinth/blockchain";
import { computeFee, newId, parseUsdc } from "@plinth/shared";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { getAddress, type Address } from "viem";
import {
  createEngine,
  createEndpoint,
  createPaymentIntent,
  createPaymentLink,
  createIntentFromLink,
  enableNetwork,
  getPaymentIntent,
  listNetworks,
  MemoryAlertSink,
  overview,
  paymentDetail,
  prepareWalletPayment,
  requestRefund,
  silentLogger,
  submitRefundProof,
  submitWalletPayment,
  type AuthContext,
} from "../src";
import { startHarness, type Harness, payoutProofFor } from "./harness";

let h: Harness;
let m: AuthContext;
const input = (amount: string, currency: "USDC" | "EURC", extra: object = {}) => ({ amount, currency, checkout_methods: ["WALLET", "ADDRESS"] as ("WALLET" | "ADDRESS")[], expires_in_seconds: 3600, ...extra });
const eurc = () => h.chain.tokens.EURC!;
const bal = (symbol: "USDC" | "EURC", a: Address) => h.engine.chains.get(h.net)!.tokens.get(symbol)!.adapter.tokenBalanceOf(a);
const events = () => h.webhookSink.received.map((r) => JSON.parse(r.body));

beforeAll(async () => {
  h = await startHarness({ confirmations: 3, tokens: ["EURC"] });
  m = await h.newMerchant("Two Token Co");
  await enableNetwork(h.engine, m, { network: h.net, owner_address: h.chain.accounts[2]!.address });
  await enableNetwork(h.engine, m, { network: h.net, owner_address: h.chain.accounts[2]!.address, token: "EURC" });
  await h.pump(3);
  await createEndpoint(h.engine, m.merchantId, "test", { url: h.webhookSink.url, events: ["*"] });
}, 120_000);
afterAll(async () => h.stop());

describe("a network that takes two tokens", () => {
  it("lists both, each with its own contracts and vault", async () => {
    const dev = (await listNetworks(h.engine, m)).find((n) => n.id === h.net)!;
    expect(dev.tokens.map((t) => t.symbol).sort()).toEqual(["EURC", "USDC"]);
    const [u, e] = [dev.tokens.find((t) => t.symbol === "USDC")!, dev.tokens.find((t) => t.symbol === "EURC")!];
    expect(u.operational && e.operational).toBe(true);
    expect(e.address).toBe(getAddress(eurc()));
    expect(e.contracts!.invoice_factory).not.toBe(u.contracts!.invoice_factory);
    expect(e.vault).toMatchObject({ token: "EURC", status: "ACTIVE" });
    expect(u.vault).toMatchObject({ token: "USDC", status: "ACTIVE" });
    expect(e.vault!.vault_address).not.toBe(u.vault!.vault_address);
  });

  it("a EURC payment gets its own address, is paid in EURC, and settles with the fee in EURC units", async () => {
    const usdcIntent = await createPaymentIntent(h.engine, m, input("10.00", "USDC"));
    const pi = await createPaymentIntent(h.engine, m, input("120.00", "EURC"));
    expect(pi.currency).toBe("EURC");
    expect(pi.networks[0]!.token).toMatchObject({ symbol: "EURC", address: getAddress(eurc()) });
    expect(pi.networks[0]!.deposit_address).not.toBe(usdcIntent.networks[0]!.deposit_address);
    const [addr] = await h.engine.db.select().from(schema.invoiceAddresses).where(eq(schema.invoiceAddresses.paymentIntentId, pi.id));
    expect(addr).toMatchObject({ tokenSymbol: "EURC" });

    const [vault] = await h.engine.db.select().from(schema.merchantVaults).where(and(eq(schema.merchantVaults.merchantId, m.merchantId), eq(schema.merchantVaults.tokenSymbol, "EURC")));
    const t0 = await bal("EURC", h.chain.treasury);
    await h.payToken("EURC", pi.networks[0]!.deposit_address as Address, parseUsdc("120"));
    await h.pump(10);
    const d = await paymentDetail(h.engine, m, pi.id);
    expect(d.status).toBe("SETTLED");
    const fee = computeFee(parseUsdc("120"), 20);
    expect(d.fee_amount_units).toBe(fee.toString());
    expect(await bal("EURC", getAddress(vault!.vaultAddress))).toBe(parseUsdc("120") - fee);
    expect(await bal("EURC", h.chain.treasury)).toBe(t0 + fee);
    expect(await bal("USDC", h.chain.treasury)).toBe(0n); // no USDC moved for a EURC payment
    // the ledger names the asset
    const ledger = await h.engine.db.select().from(schema.ledgerEntries).where(eq(schema.ledgerEntries.paymentIntentId, pi.id));
    expect(ledger.length).toBeGreaterThan(0);
    expect(new Set(ledger.map((l) => l.asset))).toEqual(new Set(["EURC"]));
    // and the webhook carries the currency
    expect(events().some((x) => x.type === "payment.completed" && x.data.object.id === pi.id && x.data.object.currency === "EURC")).toBe(true);
  });

  it("the other token sent to an address is recorded as an unsupported asset and never counted", async () => {
    const usdcIntent = await createPaymentIntent(h.engine, m, input("15.00", "USDC"));
    const eurcIntent = await createPaymentIntent(h.engine, m, input("15.00", "EURC"));
    // EURC to a USDC address, and USDC to a EURC address
    await h.payToken("EURC", usdcIntent.networks[0]!.deposit_address as Address, parseUsdc("15"));
    await h.payToken("USDC", eurcIntent.networks[0]!.deposit_address as Address, parseUsdc("15"));
    await h.pump(8);
    for (const pi of [usdcIntent, eurcIntent]) {
      const d = await getPaymentIntent(h.engine, m, pi.id);
      expect(d.status).toBe("INVALID_ASSET");
      expect(d.amount_received_units).toBe("0");
    }
    expect(h.alerts.alerts.some((a) => a.title.includes("Unsupported token"))).toBe(true);
  });

  it("wallet checkout in EURC signs the EURC domain and pays through the EURC router", async () => {
    const pi = await createPaymentIntent(h.engine, m, input("42.50", "EURC"));
    const customer = privateKeyToAccount(generatePrivateKey());
    await h.chain.mintToken("EURC", customer.address, parseUsdc("100"));
    const prep = await prepareWalletPayment(h.engine, pi.id, { network: h.net, payer: customer.address });
    expect(prep.currency).toBe("EURC");
    const td = prep.typed_data;
    expect(td.domain).toMatchObject({ name: "EURC", version: "2", verifyingContract: getAddress(eurc()) });
    const signature = await customer.signTypedData({
      domain: { name: td.domain.name, version: td.domain.version, chainId: td.domain.chainId, verifyingContract: td.domain.verifyingContract },
      types: { ReceiveWithAuthorization: td.types.ReceiveWithAuthorization }, primaryType: "ReceiveWithAuthorization",
      message: { from: td.message.from, to: td.message.to, value: BigInt(td.message.value), validAfter: BigInt(td.message.validAfter), validBefore: BigInt(td.message.validBefore), nonce: td.message.nonce },
    });
    const router = h.engine.chains.get(h.net)!.tokens.get("EURC")!.contracts.paymentRouter;
    expect(getAddress(td.message.to)).toBe(getAddress(router));
    await submitWalletPayment(h.engine, pi.id, { attempt_id: prep.attempt_id, signature });
    await h.pump(10);
    const d = await paymentDetail(h.engine, m, pi.id);
    expect(d.status).toBe("SETTLED");
    expect(d.fee_amount_units).toBe(computeFee(parseUsdc("42.5"), 20).toString());
    expect((await bal("EURC", customer.address))).toBe(parseUsdc("100") - parseUsdc("42.5"));
  });
});

describe("who can be paid in which token", () => {
  it("a merchant with only a USDC vault cannot take EURC, but a direct payout wallet takes every token", async () => {
    const mm = await h.newMerchant("USDC Only Co");
    await enableNetwork(h.engine, mm, { network: h.net, owner_address: h.chain.accounts[2]!.address });
    await h.pump(2);
    await expect(createPaymentIntent(h.engine, mm, input("5.00", "EURC"))).rejects.toMatchObject({ code: "NO_NETWORK_AVAILABLE", message: expect.stringContaining("EURC") });
    await expect(createPaymentIntent(h.engine, mm, input("5.00", "USDC"))).resolves.toBeTruthy();

    const wallet = h.chain.accounts[6]!.address;
    await h.engine.db.insert(schema.merchantPayoutConfigs).values({ id: newId("pco"), merchantId: mm.merchantId, networkId: h.net, mode: "DIRECT", address: wallet.toLowerCase(), status: "CONFIRMED", ...(await payoutProofFor(h, mm.merchantId, wallet)), confirmedAt: new Date(), activeFrom: new Date(Date.now() - 1000) });
    const pi = await createPaymentIntent(h.engine, mm, input("30.00", "EURC"));
    const w0 = await bal("EURC", wallet);
    await h.payToken("EURC", pi.networks[0]!.deposit_address as Address, parseUsdc("30"));
    await h.pump(10);
    expect((await getPaymentIntent(h.engine, mm, pi.id)).status).toBe("SETTLED");
    expect(await bal("EURC", wallet)).toBe(w0 + parseUsdc("30") - computeFee(parseUsdc("30"), 20));
  });

  it("an unknown currency is refused", async () => {
    await expect(createPaymentIntent(h.engine, m, input("5.00", "GBP" as never))).rejects.toMatchObject({ code: "UNSUPPORTED_TOKEN" });
  });
});

describe("reporting and refunds per token", () => {
  it("overview figures are per token, never mixed", async () => {
    const u = await overview(h.engine, m, 30, "USDC");
    const e = await overview(h.engine, m, 30, "EURC");
    expect(u.currency).toBe("USDC");
    expect(e.currency).toBe("EURC");
    expect(BigInt(e.settled.units)).toBeGreaterThan(0n);
    expect(BigInt(e.platform_fees.units)).toBeGreaterThan(0n);
    expect(BigInt(u.settled.units)).toBe(0n); // this merchant has only been paid in EURC so far
  });

  it("a EURC refund is sent in EURC from the EURC vault and checked against the EURC contract", async () => {
    const pi = await createPaymentIntent(h.engine, m, input("20.00", "EURC"));
    await h.payToken("EURC", pi.networks[0]!.deposit_address as Address, parseUsdc("20"));
    await h.pump(10);
    const recipient = h.chain.accounts[5]!.address;
    const r = await requestRefund(h.engine, m, { payment_intent_id: pi.id, amount: "19.96", recipient });
    expect(r.pay_from).toMatchObject({ kind: "VAULT" });
    const [vault] = await h.engine.db.select().from(schema.merchantVaults).where(and(eq(schema.merchantVaults.merchantId, m.merchantId), eq(schema.merchantVaults.tokenSymbol, "EURC")));
    expect(r.pay_from!.address).toBe(getAddress(vault!.vaultAddress));
    const { MerchantVaultAbi } = await import("@plinth/blockchain");
    const { encodeFunctionData } = await import("viem");
    // withdrawing the same amount of USDC from the USDC vault is not a EURC refund
    const [uv] = await h.engine.db.select().from(schema.merchantVaults).where(and(eq(schema.merchantVaults.merchantId, m.merchantId), eq(schema.merchantVaults.tokenSymbol, "USDC")));
    await h.chain.mintUsdc(getAddress(uv!.vaultAddress), parseUsdc("19.96"));
    const wrong = await h.chain.walletFor(2).sendTransaction({ to: getAddress(uv!.vaultAddress), data: encodeFunctionData({ abi: MerchantVaultAbi, functionName: "withdraw", args: [recipient, parseUsdc("19.96")] }), account: h.chain.accounts[2]!, chain: undefined });
    await h.chain.publicClient.waitForTransactionReceipt({ hash: wrong });
    await h.chain.mine(4);
    await expect(submitRefundProof(h.engine, m, r.id, wrong)).rejects.toMatchObject({ code: "PROOF_INVALID", message: expect.stringContaining("EURC") });
    const right = await h.chain.walletFor(2).sendTransaction({ to: getAddress(vault!.vaultAddress), data: encodeFunctionData({ abi: MerchantVaultAbi, functionName: "withdraw", args: [recipient, parseUsdc("19.96")] }), account: h.chain.accounts[2]!, chain: undefined });
    await h.chain.publicClient.waitForTransactionReceipt({ hash: right });
    await h.chain.mine(4);
    expect((await submitRefundProof(h.engine, m, r.id, right)).status).toBe("COMPLETED");
    expect((await getPaymentIntent(h.engine, m, pi.id)).status).toBe("REFUNDED");
  });

  it("a payment link can be priced in EURC", async () => {
    const link = await createPaymentLink(h.engine, m, { name: "Euro coffee", amount: "4.50", currency: "EURC", checkout_methods: ["ADDRESS"], intent_expires_in_seconds: 1200 });
    expect(link.currency).toBe("EURC");
    const slug = link.url.split("/l/")[1]!;
    const intent = await createIntentFromLink(h.engine, slug);
    expect(intent).toMatchObject({ currency: "EURC", amount: "4.50" });
  });
});

describe("one token closing does not close the other", () => {
  it("a EURC deployment that does not match its record closes EURC only", async () => {
    const chain = h.chain;
    const bad = { ...chain.deployment, tokens: { EURC: { ...chain.deployment.tokens!.EURC!, invoiceImplementation: chain.deployment.invoiceImplementation } } };
    const e2 = await createEngine({
      db: h.engine.db, logger: silentLogger, alerts: new MemoryAlertSink(), env: { APP_SECRET_KEY: "33".repeat(32) },
      signers: { getSigner: () => chain.accounts[1] },
      extraNetworks: [{ network: chain.network, deployment: bad, client: chain.publicClient }],
    });
    const c = e2.chains.get(h.net)!;
    expect(c.operational).toBe(true);
    expect(c.tokens.get("USDC")!.operational).toBe(true);
    expect(c.tokens.get("EURC")!.operational).toBe(false);
    expect(c.tokens.get("EURC")!.reasons.join(" ")).toMatch(/deployment check/);
    await expect(createPaymentIntent(e2, m, input("5.00", "EURC"))).rejects.toMatchObject({ code: "NO_NETWORK_AVAILABLE" });
    await expect(createPaymentIntent(e2, m, input("5.00", "USDC"))).resolves.toBeTruthy();
  });

  it("a token whose contracts are not verified yet is closed", async () => {
    const chain = h.chain;
    const unverified = { ...chain.deployment, tokens: { EURC: { ...chain.deployment.tokens!.EURC!, bytecodeVerified: false } } };
    const e2 = await createEngine({
      db: h.engine.db, logger: silentLogger, alerts: new MemoryAlertSink(), env: { APP_SECRET_KEY: "33".repeat(32) },
      signers: { getSigner: () => chain.accounts[1] },
      extraNetworks: [{ network: chain.network, deployment: unverified, client: chain.publicClient }],
    });
    expect(e2.chains.get(h.net)!.tokens.get("EURC")!.operational).toBe(false);
    expect(e2.chains.get(h.net)!.tokens.get("USDC")!.operational).toBe(true);
  });
});

// Keep the token ABI import used by the type checker even if a test above is edited out.
void MockFiatTokenAbi;
