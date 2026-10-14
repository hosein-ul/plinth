import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, schema } from "@plinth/db";
import { computeFee, DEFAULT_FEE_BPS, newId, parseUsdc } from "@plinth/shared";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { getAddress, type Address } from "viem";
import { MockFiatTokenAbi } from "@plinth/blockchain";
import {
  createEndpoint,
  createEngine,
  createPaymentIntent,
  enableNetwork,
  getPaymentIntent,
  listNetworks,
  listSettlements,
  paymentDetail,
  prepareWalletPayment,
  silentLogger,
  submitWalletPayment,
  MemoryAlertSink,
  type AuthContext,
} from "../src";
import { startHarness, type Harness } from "./harness";

let h: Harness;
let m: AuthContext;
const input = (amount: string, extra: object = {}) => ({ amount, currency: "USDC" as const, checkout_methods: ["WALLET", "ADDRESS"] as ("WALLET" | "ADDRESS")[], expires_in_seconds: 3600, ...extra });
const wallet = () => h.chain.accounts[6]!.address;
const balance = (a: Address) => h.engine.chains.get(h.net)!.adapter.usdcBalanceOf(a);
const treasury = () => h.chain.treasury;

/** Pretend the merchant completed the payout-wallet flow (built in a later commit): a CONFIRMED config. */
async function setPayout(merchant: AuthContext, mode: "VAULT" | "DIRECT", address: Address | null, activeInMs = -1000) {
  const id = newId("pco");
  await h.engine.db.insert(schema.merchantPayoutConfigs).values({
    id, merchantId: merchant.merchantId, networkId: h.net, mode, address: address ? address.toLowerCase() : null, status: "CONFIRMED",
    confirmedAt: new Date(), activeFrom: new Date(Date.now() + h.clock.offsetMs + activeInMs),
    createdAt: new Date(Date.now() + h.clock.offsetMs + (setPayout.n = (setPayout.n ?? 0) + 1)),
  });
  return id;
}
setPayout.n = 0 as number;

beforeAll(async () => {
  h = await startHarness({ confirmations: 3 });
  m = await h.newMerchant("Fee Merchant");
  await enableNetwork(h.engine, m, { network: h.net, owner_address: h.chain.accounts[2]!.address });
  await h.pump(2);
  await createEndpoint(h.engine, m.merchantId, "test", { url: h.webhookSink.url, events: ["*"] });
}, 120_000);
afterAll(async () => h.stop());

describe("fee in the default (vault) mode", () => {
  it("shows the fee and the treasury on the networks list and splits the sweep", async () => {
    const nets = await listNetworks(h.engine, m);
    const dev = nets.find((n) => n.id === h.net)!;
    expect(dev.fee).toMatchObject({ bps: DEFAULT_FEE_BPS, percent: "0.2%", max_bps: 100, treasury: getAddress(treasury()) });

    const pi = await createPaymentIntent(h.engine, m, input("250.00"));
    const [route] = await h.engine.db.select().from(schema.paymentIntentRoutes).where(eq(schema.paymentIntentRoutes.paymentIntentId, pi.id));
    expect(route).toMatchObject({ destinationKind: "VAULT", feeBps: DEFAULT_FEE_BPS, networkId: h.net });
    const treasuryBefore = await balance(treasury());
    await h.payUsdc(pi.networks[0]!.deposit_address as Address, parseUsdc("250"));
    await h.pump(10);
    const d = await paymentDetail(h.engine, m, pi.id);
    expect(d.status).toBe("SETTLED");
    expect(d.fee_amount_units).toBe(computeFee(parseUsdc("250"), 20).toString());
    expect(d.net_amount_units).toBe((parseUsdc("250") - computeFee(parseUsdc("250"), 20)).toString());
    expect(await balance(treasury())).toBe(treasuryBefore + computeFee(parseUsdc("250"), 20));
    expect(d.settlements[0]).toMatchObject({ destination_kind: "VAULT", fee_units: "500000" });
    const s = (await listSettlements(h.engine, m)).find((x) => x.payment_intent_id === pi.id)!;
    expect(s).toMatchObject({ destination_kind: "VAULT", fee: "0.50", net: "249.50" });
    expect(d.payout_routes[0]).toMatchObject({ mode: "VAULT", fee_bps: 20 });
  });

  it("webhooks carry the fee and net amounts", async () => {
    const hooks = h.webhookSink.received.map((r) => JSON.parse(r.body));
    const completed = hooks.filter((x) => x.type === "settlement.completed").at(-1);
    expect(completed.data.settlement).toMatchObject({ fee_units: "500000", net_units: "249500000", destination_kind: "VAULT" });
    // The payment object is final by the time the payment itself completes.
    const done = hooks.filter((x) => x.type === "payment.completed" && x.data.object.fee_amount_units === "500000").at(-1);
    expect(done.data.object).toMatchObject({ fee_amount_units: "500000", net_amount_units: "249500000" });
  });
});

describe("DIRECT mode", () => {
  it("pays the registered wallet and the treasury in one transaction; no vault is involved", async () => {
    await setPayout(m, "DIRECT", wallet());
    const pi = await createPaymentIntent(h.engine, m, input("100.00"));
    const [addr] = await h.engine.db.select().from(schema.invoiceAddresses).where(eq(schema.invoiceAddresses.paymentIntentId, pi.id));
    expect(addr).toMatchObject({ destinationKind: "DIRECT", destinationAddress: wallet().toLowerCase(), vaultAddress: null, feeBps: 20 });

    const vault = (await h.engine.db.select().from(schema.merchantVaults).where(eq(schema.merchantVaults.merchantId, m.merchantId)))[0]!.vaultAddress as Address;
    const [w0, v0, t0] = [await balance(wallet()), await balance(vault), await balance(treasury())];
    await h.payUsdc(pi.networks[0]!.deposit_address as Address, parseUsdc("100"));
    await h.pump(10);

    const d = await paymentDetail(h.engine, m, pi.id);
    expect(d.status).toBe("SETTLED");
    expect(await balance(wallet())).toBe(w0 + parseUsdc("100") - 200_000n);
    expect(await balance(treasury())).toBe(t0 + 200_000n);
    expect(await balance(vault)).toBe(v0);
    expect(d.settlements[0]).toMatchObject({ destination_kind: "DIRECT", vault: null, destination: getAddress(wallet()) });
    const ledger = await h.engine.db.select().from(schema.ledgerEntries).where(eq(schema.ledgerEntries.paymentIntentId, pi.id));
    const total = (acct: string) => ledger.filter((r) => r.account === acct).reduce((a, r) => a + (r.direction === "CREDIT" ? r.amount : -r.amount), 0n);
    expect(total("SETTLED_TO_WALLET")).toBe(parseUsdc("100") - 200_000n);
    expect(total("SETTLED_TO_VAULT")).toBe(0n);
    expect(total("PLATFORM_FEE")).toBe(200_000n);
  });

  it("wallet checkout pays the same committed destination and fee", async () => {
    const pi = await createPaymentIntent(h.engine, m, input("42.50"));
    const customer = privateKeyToAccount(generatePrivateKey());
    await h.chain.mintUsdc(customer.address, parseUsdc("100"));
    const prep = await prepareWalletPayment(h.engine, pi.id, { network: h.net, payer: customer.address });
    expect(prep.platform_fee).toMatchObject({ bps: 20, amount_units: computeFee(parseUsdc("42.5"), 20).toString() });
    const td = prep.typed_data;
    const signature = await customer.signTypedData({
      domain: { name: td.domain.name, version: td.domain.version, chainId: td.domain.chainId, verifyingContract: td.domain.verifyingContract },
      types: { ReceiveWithAuthorization: td.types.ReceiveWithAuthorization }, primaryType: "ReceiveWithAuthorization",
      message: { from: td.message.from, to: td.message.to, value: BigInt(td.message.value), validAfter: BigInt(td.message.validAfter), validBefore: BigInt(td.message.validBefore), nonce: td.message.nonce },
    });
    const [w0, t0] = [await balance(wallet()), await balance(treasury())];
    await submitWalletPayment(h.engine, pi.id, { attempt_id: prep.attempt_id, signature });
    await h.pump(10);
    const d = await paymentDetail(h.engine, m, pi.id);
    expect(d.status).toBe("SETTLED");
    const fee = computeFee(parseUsdc("42.5"), 20);
    expect(await balance(wallet())).toBe(w0 + parseUsdc("42.5") - fee);
    expect(await balance(treasury())).toBe(t0 + fee);
    expect(d.fee_amount_units).toBe(fee.toString());
    const [att] = await h.engine.db.select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.id, prep.attempt_id));
    expect(att!.authorization).toMatchObject({ destination: wallet(), kind: "1", feeBps: "20" });
  });

  it("changing the mode or wallet only affects NEW invoices; issued addresses keep their destination", async () => {
    // Back to vault mode, then issue an invoice, then switch to a DIFFERENT wallet, then pay the older invoice.
    await setPayout(m, "VAULT", null);
    const old = await createPaymentIntent(h.engine, m, input("30.00"));
    const [oldAddr] = await h.engine.db.select().from(schema.invoiceAddresses).where(eq(schema.invoiceAddresses.paymentIntentId, old.id));
    expect(oldAddr!.destinationKind).toBe("VAULT");
    const other = h.chain.accounts[7]!.address;
    await setPayout(m, "DIRECT", other);

    const fresh = await createPaymentIntent(h.engine, m, input("30.00"));
    const [freshAddr] = await h.engine.db.select().from(schema.invoiceAddresses).where(eq(schema.invoiceAddresses.paymentIntentId, fresh.id));
    expect(freshAddr).toMatchObject({ destinationKind: "DIRECT", destinationAddress: other.toLowerCase() });

    const vault = (await h.engine.db.select().from(schema.merchantVaults).where(eq(schema.merchantVaults.merchantId, m.merchantId)))[0]!.vaultAddress as Address;
    const [v0, o0] = [await balance(vault), await balance(other)];
    await h.payUsdc(old.networks[0]!.deposit_address as Address, parseUsdc("30"));
    await h.pump(10);
    expect(await balance(vault)).toBe(v0 + parseUsdc("30") - computeFee(parseUsdc("30"), 20)); // the old invoice still pays the vault
    expect(await balance(other)).toBe(o0);
    expect((await getPaymentIntent(h.engine, m, old.id)).status).toBe("SETTLED");
    // and the wallet checkout of the old invoice still pays its committed vault, not today's wallet
    const customer = privateKeyToAccount(generatePrivateKey());
    const older = await createPaymentIntent(h.engine, m, input("10.00"));
    await setPayout(m, "VAULT", null);
    await h.chain.mintUsdc(customer.address, parseUsdc("20"));
    const prep = await prepareWalletPayment(h.engine, older.id, { network: h.net, payer: customer.address });
    const [att] = await h.engine.db.select().from(schema.paymentAttempts).where(eq(schema.paymentAttempts.id, prep.attempt_id));
    expect(att!.authorization).toMatchObject({ destination: other, kind: "1" });
  });

  it("a payout wallet still in its cooldown is not used for new invoices", async () => {
    const soon = h.chain.accounts[8]!.address;
    await setPayout(m, "DIRECT", soon, 60 * 60_000); // active in one hour
    const pi = await createPaymentIntent(h.engine, m, input("5.00"));
    const [addr] = await h.engine.db.select().from(schema.invoiceAddresses).where(eq(schema.invoiceAddresses.paymentIntentId, pi.id));
    expect(addr!.destinationAddress).not.toBe(soon.toLowerCase());
    h.clock.offsetMs += 2 * 60 * 60_000;
    await h.chain.setTime(Math.floor((Date.now() + h.clock.offsetMs) / 1000));
    const later = await createPaymentIntent(h.engine, m, input("5.00"));
    const [addr2] = await h.engine.db.select().from(schema.invoiceAddresses).where(eq(schema.invoiceAddresses.paymentIntentId, later.id));
    expect(addr2).toMatchObject({ destinationKind: "DIRECT", destinationAddress: soon.toLowerCase() });
  });
});

describe("merchant fee override", () => {
  it("uses the merchant's own fee, committed into the address", async () => {
    const mm = await h.newMerchant("Discount Merchant");
    await enableNetwork(h.engine, mm, { network: h.net, owner_address: h.chain.accounts[4]!.address });
    await h.pump(2);
    await h.engine.db.update(schema.merchants).set({ feeBps: 50 }).where(eq(schema.merchants.id, mm.merchantId));
    const pi = await createPaymentIntent(h.engine, mm, input("200.00"));
    const [addr] = await h.engine.db.select().from(schema.invoiceAddresses).where(eq(schema.invoiceAddresses.paymentIntentId, pi.id));
    expect(addr!.feeBps).toBe(50);
    const t0 = await balance(treasury());
    await h.payUsdc(pi.networks[0]!.deposit_address as Address, parseUsdc("200"));
    await h.pump(10);
    expect(await balance(treasury())).toBe(t0 + parseUsdc("1")); // 0.50% of 200
    expect((await getPaymentIntent(h.engine, mm, pi.id)).fee_amount_units).toBe("1000000");
  });

  it("an override above the on-chain cap is refused instead of producing an address the factory would reject", async () => {
    const mm = await h.newMerchant("Greedy Merchant");
    await enableNetwork(h.engine, mm, { network: h.net, owner_address: h.chain.accounts[4]!.address });
    await h.pump(2);
    await h.engine.db.update(schema.merchants).set({ feeBps: 101 }).where(eq(schema.merchants.id, mm.merchantId));
    await expect(createPaymentIntent(h.engine, mm, input("10.00"))).rejects.toThrow(/basis points/);
  });
});

describe("fee leg fails open", () => {
  it("a blocked treasury does not trap the merchant's money: full amount delivered, fee recorded as zero, alert raised", async () => {
    const mm = await h.newMerchant("Skip Merchant");
    await enableNetwork(h.engine, mm, { network: h.net, owner_address: h.chain.accounts[4]!.address });
    await h.pump(2);
    const pi = await createPaymentIntent(h.engine, mm, input("80.00"));
    const vault = (await h.engine.db.select().from(schema.merchantVaults).where(eq(schema.merchantVaults.merchantId, mm.merchantId)))[0]!.vaultAddress as Address;
    const wh = h.chain.walletFor(0);
    await wh.writeContract({ address: h.chain.usdc, abi: MockFiatTokenAbi, functionName: "blacklist", args: [treasury()], account: h.chain.accounts[0]!, chain: undefined });
    const t0 = await balance(treasury());
    await h.payUsdc(pi.networks[0]!.deposit_address as Address, parseUsdc("80"));
    await h.pump(10);
    await wh.writeContract({ address: h.chain.usdc, abi: MockFiatTokenAbi, functionName: "unBlacklist", args: [treasury()], account: h.chain.accounts[0]!, chain: undefined });
    const d = await paymentDetail(h.engine, mm, pi.id);
    expect(d.status).toBe("SETTLED");
    expect(d.fee_amount_units).toBe("0");
    expect(d.net_amount_units).toBe(parseUsdc("80").toString());
    expect(await balance(vault)).toBe(parseUsdc("80"));
    expect(await balance(treasury())).toBe(t0);
    expect(h.alerts.alerts.some((a) => a.key.startsWith("fee-skipped"))).toBe(true);
  });
});

describe("deployment check", () => {
  const make = async (patch: Partial<typeof h.chain.deployment>, config: Record<string, unknown> = {}) => {
    const alerts = new MemoryAlertSink();
    const e = await createEngine({
      db: h.engine.db, logger: silentLogger, alerts, env: { APP_SECRET_KEY: "22".repeat(32) },
      signers: { getSigner: () => h.chain.accounts[1] },
      extraNetworks: [{ network: h.chain.network, deployment: { ...h.chain.deployment, ...patch }, client: h.chain.publicClient }],
      config,
    });
    return { e, alerts, chain: e.chains.get(h.net)! };
  };

  it("a deployment that matches its record stays open", async () => {
    const { chain } = await make({});
    expect(chain.operational).toBe(true);
    expect(chain.deploymentCheck?.ok).toBe(true);
  });

  it("closes the network when the recorded treasury is not the one on the contracts", async () => {
    const { chain } = await make({ treasury: h.chain.accounts[5]!.address });
    expect(chain.operational).toBe(false);
    expect(chain.gateReasons.join(" ")).toMatch(/treasury on the contracts differs/);
  });

  it("closes the network when the recorded fee cap differs from the contracts", async () => {
    const { chain } = await make({ maxFeeBps: 500 });
    expect(chain.operational).toBe(false);
    expect(chain.gateReasons.join(" ")).toMatch(/fee cap/);
  });

  it("closes the network when the platform fee is above the cap deployed there", async () => {
    const { chain } = await make({}, { platformFeeBps: 150 });
    expect(chain.operational).toBe(false);
    expect(chain.gateReasons.join(" ")).toMatch(/platform fee is above the fee cap/);
  });
});
