import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, schema } from "@plinth/db";
import { MockFiatTokenAbi } from "@plinth/blockchain";
import { parseUsdc } from "@plinth/shared";
import { getAddress, type Address } from "viem";
import {
  cancelPendingPayout,
  confirmEmailLink,
  confirmPayoutLink,
  createPayoutChallenge,
  createPaymentIntent,
  createEndpoint,
  enableNetwork,
  listPayoutHistory,
  listPayoutMethods,
  requestEmailVerification,
  requestPayoutWallet,
  signInWithIdentity,
  signup,
  switchToVault,
  type AuthContext,
} from "../src";
import { startHarness, type Harness } from "./harness";

let h: Harness;
const PASSWORD = "a-long-password-for-tests-1";
const actor = { type: "USER" as const, ip: "127.0.0.1" };
const tokenFrom = (link: string) => new URL(link).searchParams.get("token")!;
const input = (amount: string) => ({ amount, currency: "USDC" as const, checkout_methods: ["ADDRESS"] as ("WALLET" | "ADDRESS")[], expires_in_seconds: 3600 });
const wallet = (i: number) => h.chain.accounts[i]!;

interface Merchant { ctx: AuthContext; email: string; userId: string; merchantId: string }
let seq = 0;

/** A merchant with a verified email, a deployed vault, and a webhook endpoint. */
async function merchant(): Promise<Merchant> {
  const email = `payout${++seq}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  const { merchantId, userId } = await signup(h.engine, { business_name: "Payout Co", email, password: PASSWORD }, { type: "SYSTEM" });
  const ctx: AuthContext = { merchantId, environment: "test", actor: { type: "USER", id: userId }, role: "OWNER", via: "session" };
  await requestEmailVerification(h.engine, ctx);
  await confirmEmailLink(h.engine, tokenFrom(h.mail.linkTo(email)!));
  await enableNetwork(h.engine, ctx, { network: h.net, owner_address: wallet(2).address });
  await h.pump(2);
  await createEndpoint(h.engine, merchantId, "test", { url: h.webhookSink.url, events: ["*"] });
  return { ctx, email, userId, merchantId };
}

/** Run the whole wallet flow up to (not including) the email link. */
async function request(m: Merchant, who = wallet(6), overrides: { signWith?: ReturnType<typeof wallet>; message?: string; nonce?: string; reauth?: object } = {}) {
  const ch = await createPayoutChallenge(h.engine, m.ctx, { network: h.net, address: who.address, purpose: "PAYOUT_WALLET" });
  const signature = await (overrides.signWith ?? who).signMessage({ message: overrides.message ?? ch.message });
  return requestPayoutWallet(h.engine, m.ctx, { network: h.net, address: who.address, nonce: overrides.nonce ?? ch.nonce, signature, reauth: (overrides.reauth ?? { password: PASSWORD }) as never });
}

const routeKind = async (m: Merchant) => {
  const pi = await createPaymentIntent(h.engine, m.ctx, input("1.00"));
  const [a] = await h.engine.db.select().from(schema.invoiceAddresses).where(eq(schema.invoiceAddresses.paymentIntentId, pi.id));
  return { kind: a!.destinationKind, destination: a!.destinationAddress };
};

beforeAll(async () => {
  h = await startHarness({ confirmations: 3 });
}, 120_000);
afterAll(async () => h.stop());

describe("registering a payout wallet", () => {
  it("needs a verified email, a signature from the wallet, a fresh sign-in, and the emailed link; then it applies to NEW invoices", async () => {
    const m = await merchant();
    expect(await routeKind(m)).toMatchObject({ kind: "VAULT" });

    const pending = await request(m);
    expect(pending).toMatchObject({ mode: "DIRECT", status: "PENDING_CONFIRMATION", address: getAddress(wallet(6).address) });
    // The link goes to the merchant's own address and nothing changes until it is used.
    const mail = h.mail.last(m.email)!;
    expect(mail.subject).toMatch(/Confirm your Plinth payout change/);
    expect(mail.text).toContain(wallet(6).address);
    expect(await routeKind(m)).toMatchObject({ kind: "VAULT" });

    const done = await confirmPayoutLink(h.engine, tokenFrom(h.mail.linkTo(m.email)!));
    expect(done).toMatchObject({ status: "ACTIVE", mode: "DIRECT" });
    expect(await routeKind(m)).toMatchObject({ kind: "DIRECT", destination: wallet(6).address.toLowerCase() });
    expect(h.mail.last(m.email)!.subject).toMatch(/payout change was confirmed/);

    const list = (await listPayoutMethods(h.engine, m.ctx)).find((x) => x.network === h.net)!;
    expect(list).toMatchObject({ mode: "DIRECT", destination: getAddress(wallet(6).address), status: "ACTIVE", fee: { bps: 20, percent: "0.2%" }, pending: null });

    const actions = (await h.engine.db.select().from(schema.auditEvents).where(eq(schema.auditEvents.merchantId, m.merchantId))).map((a) => a.action);
    expect(actions).toContain("payout.requested");
    expect(actions).toContain("payout.confirmed");
    const hooks = h.webhookSink.received.map((r) => JSON.parse(r.body)).filter((x) => x.data?.payout?.id === pending.id).map((x) => x.type);
    await h.pump(1);
    expect(hooks.length + h.webhookSink.received.map((r) => JSON.parse(r.body).type).filter((t) => t.startsWith("payout.")).length).toBeGreaterThan(0);
  });

  it("a link works once, expires, and a newer request replaces the older one", async () => {
    const m = await merchant();
    await request(m, wallet(6));
    const first = tokenFrom(h.mail.linkTo(m.email)!);
    await request(m, wallet(7)); // replaces the first
    await expect(confirmPayoutLink(h.engine, first)).rejects.toMatchObject({ code: "LINK_INVALID" });
    const second = tokenFrom(h.mail.linkTo(m.email)!);
    await confirmPayoutLink(h.engine, second);
    await expect(confirmPayoutLink(h.engine, second)).rejects.toMatchObject({ code: "LINK_INVALID" });
    expect(await routeKind(m)).toMatchObject({ kind: "DIRECT", destination: wallet(7).address.toLowerCase() });

    const m2 = await merchant();
    await request(m2, wallet(6));
    const late = tokenFrom(h.mail.linkTo(m2.email)!);
    h.clock.offsetMs += 25 * 3600_000;
    await expect(confirmPayoutLink(h.engine, late)).rejects.toMatchObject({ code: "LINK_INVALID" });
    expect((await listPayoutHistory(h.engine, m2.ctx))[0]!.status).toBe("EXPIRED");
    h.clock.offsetMs -= 25 * 3600_000;
    await expect(confirmPayoutLink(h.engine, "not-a-real-token-at-all")).rejects.toMatchObject({ code: "LINK_INVALID" });
  });

  it("rejects bad proofs: wrong signer, edited message, replay, another merchant's challenge, expired challenge", async () => {
    const m = await merchant();
    await expect(request(m, wallet(6), { signWith: wallet(7) })).rejects.toMatchObject({ code: "PROOF_INVALID" });
    await expect(request(m, wallet(6), { message: "Sign me, I promise it is harmless" })).rejects.toMatchObject({ code: "PROOF_INVALID" });
    await expect(request(m, wallet(6), { nonce: "0123456789abcdef0123456789abcdef" })).rejects.toMatchObject({ code: "PROOF_INVALID" });

    // a valid request consumes the challenge; replaying the same signature fails
    const ch = await createPayoutChallenge(h.engine, m.ctx, { network: h.net, address: wallet(6).address, purpose: "PAYOUT_WALLET" });
    const signature = await wallet(6).signMessage({ message: ch.message });
    await requestPayoutWallet(h.engine, m.ctx, { network: h.net, address: wallet(6).address, nonce: ch.nonce, signature, reauth: { password: PASSWORD } });
    await expect(requestPayoutWallet(h.engine, m.ctx, { network: h.net, address: wallet(6).address, nonce: ch.nonce, signature, reauth: { password: PASSWORD } })).rejects.toMatchObject({ code: "PROOF_INVALID" });

    // a challenge issued to another merchant cannot be used here
    const other = await merchant();
    const theirs = await createPayoutChallenge(h.engine, other.ctx, { network: h.net, address: wallet(6).address, purpose: "PAYOUT_WALLET" });
    const theirSig = await wallet(6).signMessage({ message: theirs.message });
    await expect(requestPayoutWallet(h.engine, m.ctx, { network: h.net, address: wallet(6).address, nonce: theirs.nonce, signature: theirSig, reauth: { password: PASSWORD } })).rejects.toMatchObject({ code: "PROOF_INVALID" });

    // an address different from the one the challenge was issued for
    const forA = await createPayoutChallenge(h.engine, m.ctx, { network: h.net, address: wallet(6).address, purpose: "PAYOUT_WALLET" });
    const sigA = await wallet(7).signMessage({ message: forA.message });
    await expect(requestPayoutWallet(h.engine, m.ctx, { network: h.net, address: wallet(7).address, nonce: forA.nonce, signature: sigA, reauth: { password: PASSWORD } })).rejects.toMatchObject({ code: "PROOF_INVALID" });

    // expired
    const old = await createPayoutChallenge(h.engine, m.ctx, { network: h.net, address: wallet(8).address, purpose: "PAYOUT_WALLET" });
    const oldSig = await wallet(8).signMessage({ message: old.message });
    h.clock.offsetMs += 11 * 60_000;
    await expect(requestPayoutWallet(h.engine, m.ctx, { network: h.net, address: wallet(8).address, nonce: old.nonce, signature: oldSig, reauth: { password: PASSWORD } })).rejects.toMatchObject({ code: "PROOF_INVALID" });
    h.clock.offsetMs -= 11 * 60_000;
    // every rejection is on the audit log
    const rejected = (await h.engine.db.select().from(schema.auditEvents).where(eq(schema.auditEvents.merchantId, m.merchantId))).filter((a) => a.action === "payout.proof_rejected");
    expect(rejected.length).toBeGreaterThanOrEqual(5);
  });

  it("the challenge is a standard sign-in message that names the merchant, network, address and expiry", async () => {
    const m = await merchant();
    const ch = await createPayoutChallenge(h.engine, m.ctx, { network: h.net, address: wallet(6).address, purpose: "PAYOUT_WALLET" });
    expect(ch.message).toContain("wants you to sign in with your Ethereum account");
    expect(ch.message).toContain(getAddress(wallet(6).address));
    expect(ch.message).toContain(m.merchantId);
    expect(ch.message).toContain(`Chain ID: ${h.chain.chainId}`);
    expect(ch.message).toContain(`Nonce: ${ch.nonce}`);
    expect(ch.message).toMatch(/Expiration Time: /);
    expect(ch.message).toContain("does not send a transaction");
  });
});

describe("what a stolen dashboard session cannot do", () => {
  it("cannot change the payout wallet without the account's own sign-in, and cannot confirm it", async () => {
    const m = await merchant();
    // The thief has the session but not the password.
    await expect(request(m, wallet(6), { reauth: { password: "a-guess-that-is-wrong-1" } })).rejects.toMatchObject({ code: "REAUTH_FAILED" });
    await expect(request(m, wallet(6), { reauth: {} })).rejects.toMatchObject({ code: "REAUTH_REQUIRED" });
    expect(await routeKind(m)).toMatchObject({ kind: "VAULT" });

    // Even if they somehow passed re-auth, the confirmation link only goes to the merchant's mailbox and the wallet must be a plain account.
    await request(m, wallet(6));
    expect(h.mail.to("attacker@example.com")).toHaveLength(0);
    expect(await routeKind(m)).toMatchObject({ kind: "VAULT" }); // still not applied
  });

  it("an account without a verified email cannot set up a payout wallet at all", async () => {
    const s = await signInWithIdentity(h.engine, { subject: "wallet:0xabc0000000000000000000000000000000000f33", email: null, name: null, emailVerified: false, connection: null, issuedAt: null }, {}, actor);
    const ctx: AuthContext = { merchantId: s.merchant.id, environment: "test", actor: { type: "USER", id: s.user.id }, role: "OWNER", via: "session" };
    await enableNetwork(h.engine, ctx, { network: h.net, owner_address: wallet(2).address });
    const ch = await createPayoutChallenge(h.engine, ctx, { network: h.net, address: wallet(6).address, purpose: "PAYOUT_WALLET" });
    const signature = await wallet(6).signMessage({ message: ch.message });
    await expect(requestPayoutWallet(h.engine, ctx, { network: h.net, address: wallet(6).address, nonce: ch.nonce, signature, reauth: { id_token: JSON.stringify({ subject: "wallet:0xabc0000000000000000000000000000000000f33", issuedAt: Math.floor(Date.now() / 1000) }) } })).rejects.toMatchObject({ code: "EMAIL_REQUIRED" });
  });

  it("a Google account can do it, re-authenticating with a fresh identity token", async () => {
    const s = await signInWithIdentity(h.engine, { subject: "google:payee@example.com", email: "payee@example.com", name: "Payee", emailVerified: true, connection: "google", issuedAt: null }, {}, actor);
    const ctx: AuthContext = { merchantId: s.merchant.id, environment: "test", actor: { type: "USER", id: s.user.id }, role: "OWNER", via: "session" };
    await enableNetwork(h.engine, ctx, { network: h.net, owner_address: wallet(2).address });
    const ch = await createPayoutChallenge(h.engine, ctx, { network: h.net, address: wallet(6).address, purpose: "PAYOUT_WALLET" });
    const signature = await wallet(6).signMessage({ message: ch.message });
    const fresh = JSON.stringify({ subject: "google:payee@example.com", email: "payee@example.com", name: null, emailVerified: true, connection: "google", issuedAt: Math.floor((Date.now() + h.clock.offsetMs) / 1000) });
    await requestPayoutWallet(h.engine, ctx, { network: h.net, address: wallet(6).address, nonce: ch.nonce, signature, reauth: { id_token: fresh } });
    await confirmPayoutLink(h.engine, tokenFrom(h.mail.linkTo("payee@example.com")!));
    expect(await routeKind({ ctx } as Merchant)).toMatchObject({ kind: "DIRECT" });
  });
});

describe("a payout row that was edited in the database", () => {
  it("is not used: no payment address is issued for a wallet that did not sign for it, and an alert is raised", async () => {
    const m = await merchant();
    await request(m);
    await confirmPayoutLink(h.engine, tokenFrom(h.mail.linkTo(m.email)!));
    expect(await routeKind(m)).toMatchObject({ kind: "DIRECT", destination: wallet(6).address.toLowerCase() });

    // Someone with database access (but not the wallet's key) points the confirmed row at their own address.
    const [row] = await h.engine.db.select().from(schema.merchantPayoutConfigs).where(eq(schema.merchantPayoutConfigs.merchantId, m.merchantId));
    await h.engine.db.update(schema.merchantPayoutConfigs).set({ address: wallet(7).address.toLowerCase() }).where(eq(schema.merchantPayoutConfigs.id, row!.id));
    await expect(createPaymentIntent(h.engine, m.ctx, input("1.00"))).rejects.toMatchObject({ code: "NO_NETWORK_AVAILABLE" });
    expect(h.alerts.alerts.some((a) => a.key === `payout-proof-invalid:${row!.id}`)).toBe(true);

    // Put the real address back and the same merchant can be paid again.
    await h.engine.db.update(schema.merchantPayoutConfigs).set({ address: row!.address }).where(eq(schema.merchantPayoutConfigs.id, row!.id));
    expect(await routeKind(m)).toMatchObject({ kind: "DIRECT", destination: wallet(6).address.toLowerCase() });
  });
});

describe("wallet checks", () => {
  it("only plain wallets are accepted: a contract address is refused", async () => {
    const m = await merchant();
    const [v] = await h.engine.db.select().from(schema.merchantVaults).where(eq(schema.merchantVaults.merchantId, m.merchantId));
    const ch = await createPayoutChallenge(h.engine, m.ctx, { network: h.net, address: getAddress(v!.vaultAddress), purpose: "PAYOUT_WALLET" });
    await expect(requestPayoutWallet(h.engine, m.ctx, { network: h.net, address: getAddress(v!.vaultAddress), nonce: ch.nonce, signature: "0x" + "11".repeat(65), reauth: { password: PASSWORD } })).rejects.toMatchObject({ code: "NOT_A_PLAIN_WALLET" });
  });

  it("addresses the platform's own contracts, the treasury and the token can never be payout wallets", async () => {
    const m = await merchant();
    for (const bad of [h.chain.treasury, h.chain.usdc, h.chain.deployment.paymentRouter, h.chain.deployment.invoiceFactory, "0x0000000000000000000000000000000000000000" as Address]) {
      await expect(createPayoutChallenge(h.engine, m.ctx, { network: h.net, address: bad, purpose: "PAYOUT_WALLET" })).rejects.toMatchObject({ code: "INVALID_ADDRESS" });
    }
    await expect(createPayoutChallenge(h.engine, m.ctx, { network: h.net, address: "not an address", purpose: "PAYOUT_WALLET" })).rejects.toMatchObject({ code: "INVALID_ADDRESS" });
  });

  it("an address the USDC issuer has blocked is refused", async () => {
    const m = await merchant();
    const target = wallet(5);
    const call = (fn: "blacklist" | "unBlacklist") => h.chain.walletFor(0).writeContract({ address: h.chain.usdc, abi: MockFiatTokenAbi, functionName: fn, args: [target.address], account: wallet(0), chain: undefined });
    await call("blacklist");
    try {
      await expect(request(m, target)).rejects.toMatchObject({ code: "ADDRESS_BLOCKED" });
    } finally {
      await call("unBlacklist");
    }
  });
});

describe("cooldown", () => {
  it("a confirmed wallet waits out the cooldown before new invoices use it, and can be cancelled meanwhile", async () => {
    const m = await merchant();
    h.engine.cfg.payoutCooldownSeconds = 24 * 3600;
    try {
      await request(m, wallet(6));
      const done = await confirmPayoutLink(h.engine, tokenFrom(h.mail.linkTo(m.email)!));
      expect(done.status).toBe("COOLING_DOWN");
      expect(await routeKind(m)).toMatchObject({ kind: "VAULT" });
      const methods = (await listPayoutMethods(h.engine, m.ctx)).find((x) => x.network === h.net)!;
      expect(methods).toMatchObject({ mode: "VAULT", status: "ACTIVE", pending: { status: "COOLING_DOWN", mode: "DIRECT" }, cooldown_hours: 24 });
      expect(h.mail.last(m.email)!.text).toMatch(/24 hours/);

      h.clock.offsetMs += 25 * 3600_000;
      await h.chain.setTime(Math.floor((Date.now() + h.clock.offsetMs) / 1000));
      expect(await routeKind(m)).toMatchObject({ kind: "DIRECT", destination: wallet(6).address.toLowerCase() });

      // a second wallet, cancelled while cooling down, never takes over
      await request(m, wallet(7));
      const second = await confirmPayoutLink(h.engine, tokenFrom(h.mail.linkTo(m.email)!));
      expect(second.status).toBe("COOLING_DOWN");
      await cancelPendingPayout(h.engine, m.ctx, { id: second.id });
      h.clock.offsetMs += 25 * 3600_000;
      await h.chain.setTime(Math.floor((Date.now() + h.clock.offsetMs) / 1000));
      expect(await routeKind(m)).toMatchObject({ destination: wallet(6).address.toLowerCase() });
      await expect(cancelPendingPayout(h.engine, m.ctx, { id: second.id })).rejects.toMatchObject({ code: "INVALID_STATE" });
    } finally {
      h.engine.cfg.payoutCooldownSeconds = 0;
    }
  });
});

describe("switching back to the vault", () => {
  it("applies at once, needs a fresh sign-in, is announced, and beats a wallet still in its cooldown", async () => {
    const m = await merchant();
    await expect(switchToVault(h.engine, m.ctx, { network: h.net, reauth: { password: PASSWORD } })).rejects.toMatchObject({ code: "ALREADY_ACTIVE" });
    await request(m, wallet(6));
    await confirmPayoutLink(h.engine, tokenFrom(h.mail.linkTo(m.email)!));
    expect(await routeKind(m)).toMatchObject({ kind: "DIRECT" });

    await expect(switchToVault(h.engine, m.ctx, { network: h.net })).rejects.toMatchObject({ code: "REAUTH_REQUIRED" });
    await expect(switchToVault(h.engine, m.ctx, { network: h.net, reauth: { password: "wrong-wrong-wrong-1" } })).rejects.toMatchObject({ code: "REAUTH_FAILED" });
    const back = await switchToVault(h.engine, m.ctx, { network: h.net, reauth: { password: PASSWORD } });
    expect(back).toMatchObject({ mode: "VAULT", status: "ACTIVE" });
    expect(await routeKind(m)).toMatchObject({ kind: "VAULT" });
    expect(h.mail.last(m.email)!.subject).toMatch(/switched back to your vault/);
    expect((await h.engine.db.select().from(schema.auditEvents).where(eq(schema.auditEvents.merchantId, m.merchantId))).map((a) => a.action)).toContain("payout.switched_to_vault");

    // confirm a wallet with a cooldown, then switch back during it: the vault wins, even after the cooldown ends
    h.engine.cfg.payoutCooldownSeconds = 3600;
    try {
      await request(m, wallet(7));
      await confirmPayoutLink(h.engine, tokenFrom(h.mail.linkTo(m.email)!));
      await switchToVault(h.engine, m.ctx, { network: h.net, reauth: { password: PASSWORD } });
      h.clock.offsetMs += 2 * 3600_000;
      await h.chain.setTime(Math.floor((Date.now() + h.clock.offsetMs) / 1000));
      expect(await routeKind(m)).toMatchObject({ kind: "VAULT" });
    } finally {
      h.engine.cfg.payoutCooldownSeconds = 0;
    }
  });

  it("money already routed stays where it was issued when the mode changes", async () => {
    const m = await merchant();
    const old = await createPaymentIntent(h.engine, m.ctx, input("20.00"));
    await request(m, wallet(6));
    await confirmPayoutLink(h.engine, tokenFrom(h.mail.linkTo(m.email)!));
    const [vault] = await h.engine.db.select().from(schema.merchantVaults).where(eq(schema.merchantVaults.merchantId, m.merchantId));
    const before = await h.engine.chains.get(h.net)!.adapter.usdcBalanceOf(getAddress(vault!.vaultAddress));
    await h.payUsdc(old.networks[0]!.deposit_address as Address, parseUsdc("20"));
    await h.pump(10);
    expect(await h.engine.chains.get(h.net)!.adapter.usdcBalanceOf(getAddress(vault!.vaultAddress))).toBe(before + parseUsdc("20") - 40_000n);
    expect(await h.engine.chains.get(h.net)!.adapter.usdcBalanceOf(wallet(6).address)).toBe(0n);
  });
});

describe("the vault owner proves control of the address", () => {
  it("when proof is required, creating a vault needs a valid, unused signature from the owner address", async () => {
    h.engine.cfg.requireVaultOwnerProof = true;
    try {
      const email = `owner-proof-${Math.random().toString(36).slice(2, 6)}@example.com`;
      const { merchantId, userId } = await signup(h.engine, { business_name: "Owner Proof", email, password: PASSWORD }, { type: "SYSTEM" });
      const ctx: AuthContext = { merchantId, environment: "test", actor: { type: "USER", id: userId }, role: "OWNER", via: "session" };
      const owner = wallet(4);
      await expect(enableNetwork(h.engine, ctx, { network: h.net, owner_address: owner.address })).rejects.toMatchObject({ code: "OWNER_PROOF_REQUIRED" });

      const ch = await createPayoutChallenge(h.engine, ctx, { network: h.net, address: owner.address, purpose: "VAULT_OWNER" });
      const wrongSig = await wallet(5).signMessage({ message: ch.message });
      await expect(enableNetwork(h.engine, ctx, { network: h.net, owner_address: owner.address, proof: { nonce: ch.nonce, signature: wrongSig } })).rejects.toMatchObject({ code: "PROOF_INVALID" });
      // a payout-wallet challenge cannot be reused as a vault-owner proof
      const wrongPurpose = await createPayoutChallenge(h.engine, ctx, { network: h.net, address: owner.address, purpose: "PAYOUT_WALLET" });
      const sigP = await owner.signMessage({ message: wrongPurpose.message });
      await expect(enableNetwork(h.engine, ctx, { network: h.net, owner_address: owner.address, proof: { nonce: wrongPurpose.nonce, signature: sigP } })).rejects.toMatchObject({ code: "PROOF_INVALID" });

      const sig = await owner.signMessage({ message: ch.message });
      const v = await enableNetwork(h.engine, ctx, { network: h.net, owner_address: owner.address, proof: { nonce: ch.nonce, signature: sig } });
      expect(v.owner_address).toBe(getAddress(owner.address));

      // the signature cannot be replayed to create another merchant's vault
      const other = await signup(h.engine, { business_name: "Other", email: `other-${Math.random().toString(36).slice(2, 6)}@example.com`, password: PASSWORD }, { type: "SYSTEM" });
      const otherCtx: AuthContext = { merchantId: other.merchantId, environment: "test", actor: { type: "USER", id: other.userId }, role: "OWNER", via: "session" };
      await expect(enableNetwork(h.engine, otherCtx, { network: h.net, owner_address: owner.address, proof: { nonce: ch.nonce, signature: sig } })).rejects.toMatchObject({ code: "PROOF_INVALID" });
    } finally {
      h.engine.cfg.requireVaultOwnerProof = false;
    }
  });
});
