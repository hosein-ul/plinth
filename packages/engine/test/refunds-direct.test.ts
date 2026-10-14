import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, schema } from "@plinth/db";
import { MockFiatTokenAbi } from "@plinth/blockchain";
import { newId, parseUsdc } from "@plinth/shared";
import { getAddress, type Address, type Hex } from "viem";
import { createPaymentIntent, enableNetwork, getPaymentIntent, listRefunds, requestRefund, submitRefundProof, type AuthContext } from "../src";
import { startHarness, type Harness, payoutProofFor } from "./harness";

let h: Harness;
let m: AuthContext;
const input = (amount: string) => ({ amount, currency: "USDC" as const, checkout_methods: ["ADDRESS"] as ("WALLET" | "ADDRESS")[], expires_in_seconds: 3600 });
const payee = () => h.chain.accounts[6]!; // the merchant's own payout wallet (a real EOA with a key)
const customer = () => h.chain.accounts[5]!.address;
const status = async (id: string) => (await getPaymentIntent(h.engine, m, id)).status;

async function transfer(from: number, to: Address, units: bigint): Promise<Hex> {
  const hash = await h.chain.walletFor(from).writeContract({ address: h.chain.usdc, abi: MockFiatTokenAbi, functionName: "transfer", args: [to, units], account: h.chain.accounts[from]!, chain: undefined });
  await h.chain.publicClient.waitForTransactionReceipt({ hash });
  await h.chain.mine(4);
  return hash;
}

async function setDirect(wallet: Address | null) {
  await h.engine.db.insert(schema.merchantPayoutConfigs).values({
    id: newId("pco"), merchantId: m.merchantId, networkId: h.net, mode: wallet ? "DIRECT" : "VAULT", address: wallet ? wallet.toLowerCase() : null, status: "CONFIRMED",
    ...(wallet ? await payoutProofFor(h, m.merchantId, wallet) : {}),
    confirmedAt: new Date(Date.now() + h.clock.offsetMs + Math.floor(Math.random() * 1000) + 1), activeFrom: new Date(Date.now() + h.clock.offsetMs - 1000),
  });
}

beforeAll(async () => {
  h = await startHarness({ confirmations: 3 });
  m = await h.newMerchant("Refund Direct Co");
  await enableNetwork(h.engine, m, { network: h.net, owner_address: h.chain.accounts[2]!.address });
  await h.pump(2);
  await setDirect(payee().address);
}, 120_000);
afterAll(async () => h.stop());

describe("refunds when the merchant is paid straight to their wallet", () => {
  it("the refund is sent from the payout wallet, capped at what the merchant received (the fee is not refunded), and verified on-chain", async () => {
    const pi = await createPaymentIntent(h.engine, m, input("50.00"));
    const w0 = await h.engine.chains.get(h.net)!.adapter.usdcBalanceOf(payee().address);
    await h.payUsdc(pi.networks[0]!.deposit_address as Address, parseUsdc("50"));
    await h.pump(10);
    expect(await status(pi.id)).toBe("SETTLED");
    const d = await getPaymentIntent(h.engine, m, pi.id);
    expect(d.net_amount_units).toBe("49900000"); // 50.00 minus 0.10 fee
    expect(await h.engine.chains.get(h.net)!.adapter.usdcBalanceOf(payee().address)).toBe(w0 + parseUsdc("49.9"));

    await expect(requestRefund(h.engine, m, { payment_intent_id: pi.id, amount: "50.00", recipient: customer() })).rejects.toMatchObject({ code: "REFUND_EXCEEDS_PAYMENT", message: expect.stringContaining("49.90") });
    const r = await requestRefund(h.engine, m, { payment_intent_id: pi.id, amount: "49.90", recipient: customer() });
    expect(r.pay_from).toEqual({ kind: "DIRECT", address: getAddress(payee().address) });
    expect(await status(pi.id)).toBe("REFUND_REQUESTED");

    // A transfer from some other account (even with the right amount and recipient) is not the merchant's refund.
    await h.chain.mintUsdc(h.chain.accounts[3]!.address, parseUsdc("49.9"));
    const wrongHash = await transfer(3, customer(), parseUsdc("49.9"));
    await expect(submitRefundProof(h.engine, m, r.id, wrongHash)).rejects.toMatchObject({ code: "PROOF_INVALID", message: expect.stringContaining("payout wallet") });

    // The merchant sends it from their own wallet; the gateway never touches the money.
    const hash = await transfer(6, customer(), parseUsdc("49.9"));
    const done = await submitRefundProof(h.engine, m, r.id, hash);
    expect(done.status).toBe("COMPLETED");
    expect(await status(pi.id)).toBe("REFUNDED"); // everything the merchant received went back; the fee stays with the platform
    const ledger = await h.engine.db.select().from(schema.ledgerEntries).where(eq(schema.ledgerEntries.paymentIntentId, pi.id));
    expect(ledger.filter((l) => l.account === "REFUNDED").reduce((a, l) => a + l.amount, 0n)).toBe(parseUsdc("49.9"));
    expect((await listRefunds(h.engine, m))[0]!.pay_from).toMatchObject({ kind: "DIRECT" });
  });

  it("a refund can be made in parts, and the payment is PARTIALLY_REFUNDED until the net is returned", async () => {
    const pi = await createPaymentIntent(h.engine, m, input("20.00"));
    await h.payUsdc(pi.networks[0]!.deposit_address as Address, parseUsdc("20"));
    await h.pump(10);
    const first = await requestRefund(h.engine, m, { payment_intent_id: pi.id, amount: "10.00", recipient: customer() });
    await submitRefundProof(h.engine, m, first.id, await transfer(6, customer(), parseUsdc("10")));
    expect(await status(pi.id)).toBe("PARTIALLY_REFUNDED");
    // 19.96 received; 9.96 is left
    await expect(requestRefund(h.engine, m, { payment_intent_id: pi.id, amount: "9.97", recipient: customer() })).rejects.toMatchObject({ code: "REFUND_EXCEEDS_PAYMENT" });
    const rest = await requestRefund(h.engine, m, { payment_intent_id: pi.id, amount: "9.96", recipient: customer() });
    await submitRefundProof(h.engine, m, rest.id, await transfer(6, customer(), parseUsdc("9.96")));
    expect(await status(pi.id)).toBe("REFUNDED");
  });

  it("changing the payout setting afterwards does not change where an old payment must be refunded from", async () => {
    const pi = await createPaymentIntent(h.engine, m, input("10.00"));
    await h.payUsdc(pi.networks[0]!.deposit_address as Address, parseUsdc("10"));
    await h.pump(10);
    await setDirect(null); // back to the vault for new invoices
    const r = await requestRefund(h.engine, m, { payment_intent_id: pi.id, amount: "5.00", recipient: customer() });
    expect(r.pay_from).toMatchObject({ kind: "DIRECT", address: getAddress(payee().address) });
    await submitRefundProof(h.engine, m, r.id, await transfer(6, customer(), parseUsdc("5")));
    expect((await getPaymentIntent(h.engine, m, pi.id)).amount_refunded).toBe("5.00");
    await setDirect(payee().address);
  });

  it("nothing can be refunded until the money has been delivered", async () => {
    const pi = await createPaymentIntent(h.engine, m, input("7.00"));
    await expect(requestRefund(h.engine, m, { payment_intent_id: pi.id, amount: "1.00", recipient: customer() })).rejects.toMatchObject({ code: "NOTHING_TO_REFUND" });
  });
});
