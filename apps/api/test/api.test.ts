import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { parseUsdc } from "@plinth/shared";
import { verifyWebhookSignature } from "@plinth/engine";
import { startHarness, type Harness } from "../../../packages/engine/test/harness";
import { buildOpenApi, buildServer, type RouteDef } from "../src";

let h: Harness;
let app: FastifyInstance;
let routes: RouteDef[];

interface Res { status: number; body: any; headers: Record<string, any> }
async function call(method: string, url: string, opts: { token?: string; body?: unknown; headers?: Record<string, string>; env?: "test" | "live" } = {}): Promise<Res> {
  const r = await app.inject({
    method: method as never, url, payload: opts.body as never,
    headers: { ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}), ...(opts.env ? { "x-plinth-environment": opts.env } : {}), ...opts.headers },
  });
  return { status: r.statusCode, body: r.body ? JSON.parse(r.body) : null, headers: r.headers };
}

let session: string;
let apiKey: string;
let otherSession: string;
const owner = () => h.chain.accounts[2]!.address;

beforeAll(async () => {
  h = await startHarness({ confirmations: 2 });
  const built = await buildServer(h.engine, { adminToken: "op-secret-token", rateLimitDisabled: false });
  app = built.app;
  routes = built.routes;
  await app.ready();

  const su = await call("POST", "/v1/auth/signup", { body: { business_name: "Acme API", email: "owner@acme.test", password: "a-very-long-passphrase-123" } });
  expect(su.status).toBe(201);
  session = su.body.token;
  const su2 = await call("POST", "/v1/auth/signup", { body: { business_name: "Other Inc", email: "owner@other.test", password: "another-long-passphrase-456" } });
  otherSession = su2.body.token;

  const vault = await call("POST", "/v1/vaults", { token: session, body: { network: h.net, owner_address: owner() } });
  expect(vault.status).toBe(201);
  await h.pump(2);
  const key = await call("POST", "/v1/api-keys", { token: session, body: { name: "server", environment: "test" } });
  expect(key.status).toBe(201);
  apiKey = key.body.key;
  const wh = await call("POST", "/v1/webhook-endpoints", { token: session, body: { url: h.webhookSink.url, events: ["*"] } });
  expect(wh.body.secret).toMatch(/^whsec_/);
  (globalThis as any).__whsec = wh.body.secret;
}, 120_000);
afterAll(async () => {
  await app.close();
  await h.stop();
});

describe("authentication & authorisation", () => {
  it("rejects missing, malformed and unknown credentials with a structured error", async () => {
    const a = await call("GET", "/v1/payments");
    expect(a.status).toBe(401);
    expect(a.body.error).toMatchObject({ type: "invalid_request_error", code: "UNAUTHENTICATED" });
    expect(a.body.error.request_id).toMatch(/^req_/);
    expect((await call("GET", "/v1/payments", { token: "sk_test_nope" })).status).toBe(401);
    expect((await call("GET", "/v1/payments", { token: "garbage" })).status).toBe(401);
  });

  it("API keys carry developer rights only: they cannot touch wallets, keys or team", async () => {
    const vault = await call("POST", "/v1/vaults", { token: apiKey, body: { network: h.net, owner_address: h.chain.accounts[9]!.address } });
    expect(vault.status).toBe(403);
    expect((await call("POST", "/v1/api-keys", { token: apiKey, body: { name: "x", environment: "test" } })).status).toBe(403);
    expect((await call("GET", "/v1/team", { token: apiKey })).status).toBe(403);
  });

  it("revoked keys stop working; rotation issues a new key", async () => {
    const k = await call("POST", "/v1/api-keys", { token: session, body: { name: "temp", environment: "test" } });
    expect((await call("GET", "/v1/payments", { token: k.body.key })).status).toBe(200);
    const rot = await call("POST", `/v1/api-keys/${k.body.id}/rotate`, { token: session });
    expect(rot.status).toBe(200);
    expect(rot.body.key).not.toBe(k.body.key);
    expect((await call("GET", "/v1/payments", { token: k.body.key })).status).toBe(401);
    expect((await call("GET", "/v1/payments", { token: rot.body.key })).status).toBe(200);
    const list = await call("GET", "/v1/api-keys", { token: session });
    expect(JSON.stringify(list.body)).not.toContain(rot.body.key);
  });

  it("operator endpoints need the operator token", async () => {
    expect((await call("GET", "/admin/relayer")).status).toBe(401);
    expect((await call("GET", "/admin/relayer", { token: apiKey })).status).toBe(401);
    const ok = await call("GET", "/admin/relayer", { headers: { "x-admin-token": "op-secret-token" } });
    expect(ok.status).toBe(200);
    expect(ok.body.data[0].signer).toBeTruthy();
  });

  it("login errors do not reveal whether an email exists", async () => {
    const a = await call("POST", "/v1/auth/login", { body: { email: "owner@acme.test", password: "wrong-password-1234" } });
    const b = await call("POST", "/v1/auth/login", { body: { email: "nobody@acme.test", password: "wrong-password-1234" } });
    expect(a.status).toBe(401);
    expect(a.body.error.message).toBe(b.body.error.message);
  });
});

describe("verified email over HTTP", () => {
  it("status, verification link, re-authenticated change, and single-use confirmation", async () => {
    const st = await call("GET", "/v1/auth/email", { token: session });
    expect(st.status).toBe(200);
    expect(st.body).toMatchObject({ email: "owner@acme.test", verified: false, auth_method: "password", email_available: true });
    expect((await call("GET", "/v1/auth/email", { token: apiKey })).status).toBe(403); // sessions only

    expect((await call("POST", "/v1/auth/email/verify", { token: session })).body.status).toBe("sent");
    const link = h.mail.linkTo("owner@acme.test")!;
    const token = new URL(link).searchParams.get("token")!;
    const ok = await call("POST", "/public/auth/email/confirm", { body: { token } });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ email: "owner@acme.test", purpose: "VERIFY" });
    expect((await call("POST", "/public/auth/email/confirm", { body: { token } })).status).toBe(410);
    expect((await call("GET", "/v1/me", { token: session })).body.user).toMatchObject({ has_real_email: true, email_verified: true });

    // changing the address needs the password
    const noAuth = await call("POST", "/v1/auth/email/change", { token: session, body: { email: "ceo@acme.test" } });
    expect(noAuth.status).toBe(400); // reauth is required by the schema
    const wrong = await call("POST", "/v1/auth/email/change", { token: session, body: { email: "ceo@acme.test", reauth: { password: "not-the-password-123" } } });
    expect(wrong.status).toBe(403);
    expect(wrong.body.error.code).toBe("REAUTH_FAILED");
    expect((await call("POST", "/v1/auth/email/change", { token: session, body: { email: "ceo@acme.test", reauth: { password: "a-very-long-passphrase-123" } } })).body.status).toBe("sent");
    expect(h.mail.to("ceo@acme.test")).toHaveLength(1);
    // put it back so later tests that log in with owner@acme.test keep working
    const back = new URL(h.mail.linkTo("ceo@acme.test")!).searchParams.get("token")!;
    expect((await call("POST", "/public/auth/email/confirm", { body: { token: back } })).body.purpose).toBe("CHANGE");
    const me = await call("GET", "/v1/me", { token: session });
    expect(me.body.user.email).toBe("ceo@acme.test");
    expect((await call("POST", "/v1/auth/email/change", { token: session, body: { email: "owner@acme.test", reauth: { password: "a-very-long-passphrase-123" } } })).status).toBe(200);
    await call("POST", "/public/auth/email/confirm", { body: { token: new URL(h.mail.linkTo("owner@acme.test")!).searchParams.get("token")! } });
    expect((await call("GET", "/v1/me", { token: session })).body.user.email).toBe("owner@acme.test");
  });
});

describe("payout methods over HTTP", () => {
  const PASSWORD = "a-very-long-passphrase-123";
  const payee = () => h.chain.accounts[6]!;

  it("wallet proof, fresh sign-in, emailed link, then new payments go straight to the wallet; and back to the vault", async () => {
    const before = await call("GET", "/v1/payout-methods", { token: session });
    expect(before.status).toBe(200);
    const row = before.body.data.find((n: any) => n.network === h.net);
    expect(row).toMatchObject({ mode: "VAULT", status: "ACTIVE", fee: { bps: 20, percent: "0.2%" }, pending: null });
    expect((await call("GET", "/v1/payout-methods", { token: apiKey })).status).toBe(200); // read-only for API keys

    // session-only, and wallet rights
    expect((await call("POST", "/v1/payout-methods/challenge", { token: apiKey, body: { network: h.net, address: payee().address, purpose: "PAYOUT_WALLET" } })).status).toBe(403);
    const ch = await call("POST", "/v1/payout-methods/challenge", { token: session, body: { network: h.net, address: payee().address, purpose: "PAYOUT_WALLET" } });
    expect(ch.status).toBe(200);
    expect(ch.body.message).toContain("wants you to sign in with your Ethereum account");

    const signature = await payee().signMessage({ message: ch.body.message });
    const noReauth = await call("POST", "/v1/payout-methods/wallet", { token: session, body: { network: h.net, address: payee().address, nonce: ch.body.nonce, signature } });
    expect(noReauth.status).toBe(400);
    const wrong = await call("POST", "/v1/payout-methods/wallet", { token: session, body: { network: h.net, address: payee().address, nonce: ch.body.nonce, signature, reauth: { password: "not-the-password-123" } } });
    expect(wrong.body.error.code).toBe("REAUTH_FAILED");
    const asked = await call("POST", "/v1/payout-methods/wallet", { token: session, body: { network: h.net, address: payee().address, nonce: ch.body.nonce, signature, reauth: { password: PASSWORD } } });
    expect(asked.status).toBe(201);
    expect(asked.body).toMatchObject({ mode: "DIRECT", status: "PENDING_CONFIRMATION" });

    // still the vault until the link is used
    const pi0 = await call("POST", "/v1/payment-intents", { token: apiKey, body: { amount: "2.00" } });
    expect((await call("GET", `/v1/payments/${pi0.body.id}`, { token: session })).body.payout_routes[0].mode).toBe("VAULT");

    const token = new URL(h.mail.linkTo("owner@acme.test")!).searchParams.get("token")!;
    expect((await call("POST", "/public/payout/confirm", { body: { token } })).body).toMatchObject({ status: "ACTIVE", mode: "DIRECT" });
    expect((await call("POST", "/public/payout/confirm", { body: { token } })).status).toBe(410);

    const pi1 = await call("POST", "/v1/payment-intents", { token: apiKey, body: { amount: "2.00" } });
    const detail = await call("GET", `/v1/payments/${pi1.body.id}`, { token: session });
    expect(detail.body.payout_routes[0]).toMatchObject({ mode: "DIRECT", destination: payee().address, fee_bps: 20 });
    expect((await call("GET", "/v1/payout-methods/history", { token: session })).body.data[0]).toMatchObject({ mode: "DIRECT", status: "ACTIVE" });

    // back to the vault
    const wrongBack = await call("POST", "/v1/payout-methods/vault", { token: session, body: { network: h.net, reauth: { password: "not-the-password-123" } } });
    expect(wrongBack.status).toBe(403);
    expect((await call("POST", "/v1/payout-methods/vault", { token: session, body: { network: h.net, reauth: { password: PASSWORD } } })).body).toMatchObject({ mode: "VAULT", status: "ACTIVE" });
    const pi2 = await call("POST", "/v1/payment-intents", { token: apiKey, body: { amount: "2.00" } });
    expect((await call("GET", `/v1/payments/${pi2.body.id}`, { token: session })).body.payout_routes[0].mode).toBe("VAULT");
  });

  it("the operator can give a merchant its own fee within the cap; merchants cannot", async () => {
    const me = await call("GET", "/v1/me", { token: session });
    const mid = me.body.merchant.id;
    expect((await call("POST", `/admin/merchants/${mid}/fee`, { token: session, body: { fee_bps: 10 } })).status).toBe(401);
    const adm = { "x-admin-token": "op-secret-token" };
    expect((await call("POST", `/admin/merchants/${mid}/fee`, { headers: adm, body: { fee_bps: 101 } })).status).toBe(400);
    expect((await call("POST", `/admin/merchants/${mid}/fee`, { headers: adm, body: { fee_bps: 10 } })).body).toMatchObject({ fee_bps: 10, effective_bps: 10 });
    const nets = await call("GET", "/v1/networks", { token: session });
    expect(nets.body.data.find((n: any) => n.id === h.net).fee).toMatchObject({ bps: 10, percent: "0.1%" });
    expect((await call("POST", `/admin/merchants/${mid}/fee`, { headers: adm, body: { fee_bps: null } })).body).toMatchObject({ fee_bps: null, effective_bps: 20 });
  });
});

describe("payment intents over HTTP", () => {
  let piId: string;
  it("validates input with field-level errors", async () => {
    const r = await call("POST", "/v1/payment-intents", { token: apiKey, body: { amount: "-5" } });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("VALIDATION_FAILED");
    expect(r.body.error.details[0].path).toBe("amount");
    expect((await call("POST", "/v1/payment-intents", { token: apiKey, body: { amount: "1.1234567" } })).status).toBe(400);
  });

  it("is idempotent: same key + same body replays; same key + different body is rejected", async () => {
    const body = { amount: "19.99", order_reference: "ORD-77" };
    const a = await call("POST", "/v1/payment-intents", { token: apiKey, body, headers: { "idempotency-key": "order-77-attempt" } });
    const b = await call("POST", "/v1/payment-intents", { token: apiKey, body, headers: { "idempotency-key": "order-77-attempt" } });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.body.id).toBe(a.body.id);
    expect(b.headers["idempotent-replayed"]).toBe("true");
    const c = await call("POST", "/v1/payment-intents", { token: apiKey, body: { amount: "20.00" }, headers: { "idempotency-key": "order-77-attempt" } });
    expect(c.status).toBe(422);
    expect(c.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    const all = await call("GET", "/v1/payments?q=ORD-77", { token: apiKey });
    expect(all.body.data).toHaveLength(1);
    piId = a.body.id;
    expect(a.body.checkout_url).toContain(`/pay/${piId}`);
    expect(a.body.networks[0].deposit_address).toMatch(/^0x/);
    expect(a.body.amount_units).toBe("19990000");
  });

  it("different merchants cannot read, list or refund each other's payments", async () => {
    expect((await call("GET", `/v1/payment-intents/${piId}`, { token: otherSession })).status).toBe(404);
    expect((await call("GET", `/v1/payments/${piId}`, { token: otherSession })).status).toBe(404);
    const list = await call("GET", "/v1/payments", { token: otherSession });
    expect(list.body.data).toHaveLength(0);
    expect((await call("POST", "/v1/refund-requests", { token: otherSession, body: { payment_intent_id: piId, amount: "1.00", recipient: owner() } })).status).toBe(404);
  });

  it("API keys cannot read another environment: test keys never see live data", async () => {
    const live = await call("GET", "/v1/payments", { token: session, env: "live" });
    expect(live.body.data).toHaveLength(0);
    const create = await call("POST", "/v1/payment-intents", { token: session, env: "live", body: { amount: "5.00" } });
    expect(create.status).toBe(422);
    expect(create.body.error.code).toBe("NO_NETWORK_AVAILABLE");
  });
});

describe("hosted checkout (public, capability URL) — pay with address, end to end over HTTP", () => {
  it("shows the unique address, detects the payment, settles, and delivers a signed webhook", async () => {
    const pi = await call("POST", "/v1/payment-intents", { token: apiKey, body: { amount: "75.00", order_reference: "E2E-ADDR" } });
    const co = await call("GET", `/public/checkout/${pi.body.id}`);
    expect(co.status).toBe(200);
    expect(co.body.merchant_name).toBe("Acme API");
    expect(co.body.networks[0].usdc_address).toBe(h.chain.usdc);
    expect(co.body).not.toHaveProperty("metadata.secret");

    await h.payUsdc(co.body.networks[0].deposit_address, parseUsdc("75"));
    await h.pump(8);
    const after = await call("GET", `/v1/payments/${pi.body.id}`, { token: apiKey });
    expect(after.body.status).toBe("SETTLED");
    expect(after.body.timeline.map((t: any) => t.type)).toEqual(expect.arrayContaining(["created", "transfer.detected", "transfer.finalized", "settlement.submitted", "settlement.finalized"]));
    expect(after.body.transactions[0].explorer_url).toContain("/tx/0x");
    expect(after.body.settlements[0].status).toBe("CONFIRMED");

    const hook = h.webhookSink.received.find((r) => JSON.parse(r.body).type === "payment.completed" && JSON.parse(r.body).data.object.id === pi.body.id)!;
    expect(hook).toBeTruthy();
    expect(verifyWebhookSignature((globalThis as any).__whsec, hook.body, hook.headers["plinth-signature"]!)).toBe(true);
  });
});

describe("hosted checkout — pay with connected wallet over HTTP", () => {
  it("prepare → wallet signs → submit → relayed, settled; replays and forged signatures are rejected", async () => {
    const pi = await call("POST", "/v1/payment-intents", { token: apiKey, body: { amount: "12.34" } });
    const customer = privateKeyToAccount(generatePrivateKey());
    await h.chain.mintUsdc(customer.address, parseUsdc("50"));

    const prep = await call("POST", `/public/checkout/${pi.body.id}/wallet/prepare`, { body: { network: h.net, payer: customer.address } });
    expect(prep.status).toBe(200);
    expect(prep.body.fee.customer_network_fee).toBe("0");
    const td = prep.body.typed_data;
    expect(td.message.to.toLowerCase()).toBe(h.chain.deployment.paymentRouter.toLowerCase()); // payee is the router, never the merchant or relayer
    const sig = await customer.signTypedData({
      domain: td.domain, types: { ReceiveWithAuthorization: td.types.ReceiveWithAuthorization }, primaryType: "ReceiveWithAuthorization",
      message: { ...td.message, value: BigInt(td.message.value), validAfter: BigInt(td.message.validAfter), validBefore: BigInt(td.message.validBefore) },
    });

    const forged = await call("POST", `/public/checkout/${pi.body.id}/wallet/submit`, { body: { attempt_id: prep.body.attempt_id, signature: `0x${"11".repeat(65)}` } });
    expect(forged.status).toBe(400);
    const sub = await call("POST", `/public/checkout/${pi.body.id}/wallet/submit`, { body: { attempt_id: prep.body.attempt_id, signature: sig } });
    expect(sub.status).toBe(200);
    expect((await call("POST", `/public/checkout/${pi.body.id}/wallet/submit`, { body: { attempt_id: prep.body.attempt_id, signature: sig } })).status).toBe(409);

    await h.pump(8);
    const att = await call("GET", `/public/checkout/${pi.body.id}/wallet/attempts/${prep.body.attempt_id}`);
    expect(att.body.status).toBe("CONFIRMED");
    expect((await call("GET", `/v1/payments/${pi.body.id}`, { token: apiKey })).body.status).toBe("SETTLED");
    // signature never appears in any API response for this payment
    const detail = JSON.stringify((await call("GET", `/v1/payments/${pi.body.id}`, { token: apiKey })).body);
    expect(detail).not.toContain(sig.slice(2, 40));
  });
});

describe("payment lifetime", () => {
  const lifetime = (pi: { expires_at: string }) => Math.round((Date.parse(pi.expires_at) - (Date.now() + h.clock.offsetMs)) / 1000);
  const near = (secs: number, want: number) => expect(Math.abs(secs - want)).toBeLessThan(60);

  it("a new payment is open for 20 minutes when nothing is specified", async () => {
    const r = await call("POST", "/v1/payment-intents", { token: apiKey, body: { amount: "3.00" } });
    expect(r.status).toBe(201);
    near(lifetime(r.body), 1200);
  });

  it("a request can override the lifetime, within 5 minutes to 30 days", async () => {
    const ok = await call("POST", "/v1/payment-intents", { token: apiKey, body: { amount: "3.00", expires_in_seconds: 7200 } });
    near(lifetime(ok.body), 7200);
    expect((await call("POST", "/v1/payment-intents", { token: apiKey, body: { amount: "3.00", expires_in_seconds: 299 } })).status).toBe(400);
    expect((await call("POST", "/v1/payment-intents", { token: apiKey, body: { amount: "3.00", expires_in_seconds: 2592001 } })).status).toBe(400);
    const max = await call("POST", "/v1/payment-intents", { token: apiKey, body: { amount: "3.00", expires_in_seconds: 2592000 } });
    expect(max.status).toBe(201);
  });

  it("the merchant default applies when a request says nothing, and existing values are not rewritten", async () => {
    const me = await call("GET", "/v1/me", { token: session });
    expect(me.body.merchant.default_expiry_seconds).toBe(1200);
    expect((await call("PATCH", "/v1/settlement-policy", { token: session, body: { default_expiry_seconds: 900 } })).status).toBe(200);
    const r = await call("POST", "/v1/payment-intents", { token: apiKey, body: { amount: "3.00" } });
    near(lifetime(r.body), 900);
    const override = await call("POST", "/v1/payment-intents", { token: apiKey, body: { amount: "3.00", expires_in_seconds: 600 } });
    near(lifetime(override.body), 600);
    await call("PATCH", "/v1/settlement-policy", { token: session, body: { default_expiry_seconds: 1200 } });
  });

  it("a payment link defaults to 20 minutes per visit and is capped at 7 days", async () => {
    const link = await call("POST", "/v1/payment-links", { token: apiKey, body: { name: "Lifetime", amount: "2.00" } });
    const slug = link.body.url.split("/l/")[1];
    const visit = await call("POST", `/public/links/${slug}/checkout`);
    near(lifetime(visit.body), 1200);
    expect((await call("POST", "/v1/payment-links", { token: apiKey, body: { name: "Too long", amount: "2.00", intent_expires_in_seconds: 604801 } })).status).toBe(400);
    expect((await call("POST", "/v1/payment-links", { token: apiKey, body: { name: "Max", amount: "2.00", intent_expires_in_seconds: 604800 } })).status).toBe(201);
  });
});

describe("payment links and invoices over HTTP", () => {
  it("a link spawns a fresh payment per visit", async () => {
    const link = await call("POST", "/v1/payment-links", { token: apiKey, body: { name: "Coffee beans 1kg", amount: "24.00" } });
    expect(link.status).toBe(201);
    const slug = link.body.url.split("/l/")[1];
    const info = await call("GET", `/public/links/${slug}`);
    expect(info.body.amount).toBe("24.00");
    const a = await call("POST", `/public/links/${slug}/checkout`);
    const b = await call("POST", `/public/links/${slug}/checkout`);
    expect(a.status).toBe(201);
    expect(a.body.id).not.toBe(b.body.id);
    expect(a.body.networks[0].deposit_address).not.toBe(b.body.networks[0].deposit_address);
    await call("PATCH", `/v1/payment-links/${link.body.id}`, { token: apiKey, body: { active: false } });
    expect((await call("POST", `/public/links/${slug}/checkout`)).status).toBe(404);
  });

  it("opening a link works when the browser sends a JSON content-type with an empty body", async () => {
    const link = await call("POST", "/v1/payment-links", { token: apiKey, body: { name: "Empty body", amount: "1.50" } });
    const slug = link.body.url.split("/l/")[1];
    const r = await app.inject({ method: "POST", url: `/public/links/${slug}/checkout`, headers: { "content-type": "application/json" } });
    expect(r.statusCode).toBe(201);
    expect(r.json().amount).toBe("1.50");
    const bad = await app.inject({ method: "POST", url: `/v1/payment-intents`, headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` }, payload: "{not json" });
    expect(bad.statusCode).toBe(400);
  });

  it("creates an invoice with exact totals", async () => {
    const inv = await call("POST", "/v1/invoices", { token: apiKey, body: { customer_name: "Initech", customer_email: "ap@initech.test", line_items: [{ description: "Audit", quantity: 2, unit_amount: "1500.50" }], checkout_methods: ["ADDRESS"] } });
    expect(inv.status).toBe(201);
    expect(inv.body.total).toBe("3001.00");
    expect((await call("GET", `/v1/invoices/${inv.body.id}`, { token: apiKey })).body.payment.status).toBe("AWAITING_PAYMENT");
  });
});

describe("vault & settlement policy API", () => {
  it("exposes live on-chain authority and builds (never sends) policy transactions", async () => {
    const v = await call("GET", `/v1/vaults/${h.net}`, { token: apiKey });
    expect(v.body.onchain.owner).toBe(owner());
    expect(v.body.onchain.gateway_has_admin_role).toBe(false);
    expect(v.body.onchain.mode).toBe("BALANCE_IN_VAULT");
    const tx = await call("POST", `/v1/vaults/${h.net}/settlement-tx`, { token: session, body: { mode: "INSTANT_FORWARD", destination: h.chain.accounts[8]!.address } });
    expect(tx.status).toBe(200);
    expect(tx.body.to.toLowerCase()).toBe(v.body.vault_address.toLowerCase());
    expect(tx.body.data).toMatch(/^0x/);
    expect((await call("POST", `/v1/vaults/${h.net}/settlement-tx`, { token: apiKey, body: { mode: "INSTANT_FORWARD", destination: h.chain.accounts[8]!.address } })).status).toBe(403);
  });
});

describe("payment tokens over HTTP", () => {
  it("a network can hold a USDC and a EURC vault; payments, links and invoices name their token", async () => {
    const th = await startHarness({ confirmations: 2, tokens: ["EURC"] });
    const tapp = (await buildServer(th.engine, { adminToken: "op-secret-token", rateLimitDisabled: true })).app;
    await tapp.ready();
    const tcall = async (method: string, url: string, opts: { token?: string; body?: unknown } = {}): Promise<Res> => {
      const r = await tapp.inject({ method: method as never, url, payload: opts.body as never, headers: opts.token ? { authorization: `Bearer ${opts.token}` } : {} });
      return { status: r.statusCode, body: r.body ? JSON.parse(r.body) : null, headers: r.headers };
    };
    try {
      const su = await tcall("POST", "/v1/auth/signup", { body: { business_name: "Two Token API", email: "two@token.test", password: "a-very-long-passphrase-123" } });
      const tok = su.body.token as string;
      const own = th.chain.accounts[2]!.address;
      expect((await tcall("POST", "/v1/vaults", { token: tok, body: { network: th.net, owner_address: own } })).status).toBe(201);
      const eurcVault = await tcall("POST", "/v1/vaults", { token: tok, body: { network: th.net, owner_address: own, token: "EURC" } });
      expect(eurcVault.status).toBe(201);
      expect(eurcVault.body.token).toBe("EURC");
      await th.pump(2);

      const usdcState = await tcall("GET", `/v1/vaults/${th.net}`, { token: tok });
      const eurcState = await tcall("GET", `/v1/vaults/${th.net}?token=EURC`, { token: tok });
      expect(usdcState.body.token).toBe("USDC");
      expect(eurcState.body.token).toBe("EURC");
      expect(eurcState.body.vault_address).not.toBe(usdcState.body.vault_address);
      expect((await tcall("POST", `/v1/vaults/${th.net}/settlement-tx?token=EURC`, { token: tok, body: { mode: "INSTANT_FORWARD", destination: th.chain.accounts[8]!.address } })).body.to.toLowerCase()).toBe(eurcState.body.vault_address.toLowerCase());
      expect((await tcall("GET", `/v1/vaults/${th.net}?token=DAI`, { token: tok })).status).toBe(400);

      const key = (await tcall("POST", "/v1/api-keys", { token: tok, body: { name: "k", environment: "test" } })).body.key as string;
      const pay = await tcall("POST", "/v1/payment-intents", { token: key, body: { amount: "12.50", currency: "EURC", checkout_methods: ["ADDRESS"] } });
      expect(pay.status).toBe(201);
      expect(pay.body.currency).toBe("EURC");
      const link = await tcall("POST", "/v1/payment-links", { token: key, body: { name: "Euro tip", amount: "5.00", currency: "EURC" } });
      expect(link.status).toBe(201);
      expect(link.body.currency).toBe("EURC");
      const inv = await tcall("POST", "/v1/invoices", { token: key, body: { customer_name: "Ada", customer_email: "ada@example.test", currency: "EURC", line_items: [{ description: "Work", quantity: 2, unit_amount: "10.00" }] } });
      expect(inv.status).toBe(201);
      expect(inv.body.currency).toBe("EURC");
      expect(inv.body.total).toBe("20.00");

      const ovE = await tcall("GET", "/v1/overview?currency=EURC", { token: key });
      const ovU = await tcall("GET", "/v1/overview", { token: key });
      expect(ovE.body.currency).toBe("EURC");
      expect(ovU.body.currency).toBe("USDC");
      const nets = await tcall("GET", "/v1/networks", { token: key });
      const dev = nets.body.data.find((n: any) => n.id === th.net);
      expect(dev.tokens.map((t: any) => t.symbol).sort()).toEqual(["EURC", "USDC"]);
    } finally {
      await tapp.close();
      await th.stop();
    }
  }, 120_000);
});

describe("rate limiting", () => {
  it("throttles credential guessing on login", async () => {
    let limited = 0;
    for (let i = 0; i < 14; i++) {
      const r = await call("POST", "/v1/auth/login", { body: { email: "owner@acme.test", password: "wrong-wrong-wrong" } });
      if (r.status === 429) { limited++; expect(r.body.error.code).toBe("RATE_LIMITED"); }
    }
    expect(limited).toBeGreaterThan(0);
  });
});

describe("API surface", () => {
  it("every registered route is documented in OpenAPI and vice versa", () => {
    const doc = buildOpenApi(routes) as any;
    const documented = Object.entries(doc.paths).flatMap(([p, ops]: any) => Object.keys(ops).map((m) => `${m.toUpperCase()} ${p}`));
    const registered = routes.map((r) => `${r.method} ${r.path.replace(/:([A-Za-z]+)/g, "{$1}")}`);
    expect(documented.sort()).toEqual(registered.sort());
    expect(doc.openapi).toBe("3.1.0");
    const create = doc.paths["/v1/payment-intents"].post;
    expect(create.parameters.some((p: any) => p.name === "Idempotency-Key")).toBe(true);
    expect(create.requestBody.content["application/json"].schema.properties.amount).toBeTruthy();
  });

  it("does not leak internals on unexpected errors", async () => {
    const r = await call("GET", "/v1/vaults/not-a-network", { token: apiKey });
    expect(JSON.stringify(r.body)).not.toMatch(/at .*\.ts|node_modules|SELECT /i);
  });
});
