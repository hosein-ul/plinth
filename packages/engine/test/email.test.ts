import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, schema } from "@plinth/db";
import {
  ConsoleEmailSender,
  ResendEmailSender,
  UnavailableEmailSender,
  confirmEmailLink,
  createEmailSender,
  emailStatus,
  requestEmailChange,
  requestEmailVerification,
  requireVerifiedEmail,
  signInWithIdentity,
  signup,
  silentLogger,
  verifyReauth,
  type AuthContext,
  type Web3AuthIdentity,
} from "../src";
import { startHarness, type Harness } from "./harness";

let h: Harness;
const actor = { type: "USER" as const, ip: "127.0.0.1" };
const PASSWORD = "a-long-password-for-tests-1";

const ctxFor = (merchantId: string, userId: string): AuthContext => ({ merchantId, environment: "test", actor: { type: "USER", id: userId }, role: "OWNER", via: "session" });
const token = (id: Partial<Web3AuthIdentity> & { subject: string }) => JSON.stringify({ email: null, name: null, emailVerified: false, connection: null, issuedAt: Math.floor((Date.now() + h.clock.offsetMs) / 1000), ...id });
const tokenFrom = (link: string) => new URL(link).searchParams.get("token")!;

beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => h.stop());

async function passwordUser(email: string) {
  const { merchantId, userId } = await signup(h.engine, { business_name: "Mailer", email, password: PASSWORD }, { type: "SYSTEM" });
  return { merchantId, userId, ctx: ctxFor(merchantId, userId) };
}

describe("verifying the address an account was created with", () => {
  it("sends a link, marks the address verified when it is used, and the link works once", async () => {
    const u = await passwordUser("verify1@example.com");
    expect(await emailStatus(h.engine, u.ctx)).toMatchObject({ email: "verify1@example.com", verified: false, auth_method: "password" });
    await expect(requireVerifiedEmail(h.engine, u.ctx)).rejects.toMatchObject({ code: "EMAIL_NOT_VERIFIED" });

    expect(await requestEmailVerification(h.engine, u.ctx)).toMatchObject({ status: "sent" });
    const link = h.mail.linkTo("verify1@example.com")!;
    expect(link).toContain("/verify-email?token=");
    expect(h.mail.last("verify1@example.com")!.subject).toMatch(/Confirm your email/);

    expect(await confirmEmailLink(h.engine, tokenFrom(link))).toMatchObject({ email: "verify1@example.com", purpose: "VERIFY" });
    expect(await emailStatus(h.engine, u.ctx)).toMatchObject({ verified: true });
    await expect(requireVerifiedEmail(h.engine, u.ctx)).resolves.toBeTruthy();
    await expect(confirmEmailLink(h.engine, tokenFrom(link))).rejects.toMatchObject({ code: "LINK_INVALID" });
    expect(await requestEmailVerification(h.engine, u.ctx)).toMatchObject({ status: "already_verified" });
  });

  it("stores only a hash of the token and rejects unknown or expired links", async () => {
    const u = await passwordUser("verify2@example.com");
    await requestEmailVerification(h.engine, u.ctx);
    const link = h.mail.linkTo("verify2@example.com")!;
    const rows = await h.engine.db.select().from(schema.emailVerifications).where(eq(schema.emailVerifications.userId, u.userId));
    expect(rows[0]!.tokenHash).not.toContain(tokenFrom(link));
    await expect(confirmEmailLink(h.engine, "not-a-real-token")).rejects.toMatchObject({ code: "LINK_INVALID" });
    h.clock.offsetMs += 25 * 3600_000;
    await expect(confirmEmailLink(h.engine, tokenFrom(link))).rejects.toMatchObject({ code: "LINK_INVALID" });
    h.clock.offsetMs -= 25 * 3600_000;
  });

  it("limits how many emails one account can trigger per hour", async () => {
    const u = await passwordUser("verify3@example.com");
    for (let i = 0; i < 5; i++) await requestEmailVerification(h.engine, u.ctx);
    await expect(requestEmailVerification(h.engine, u.ctx)).rejects.toMatchObject({ code: "TOO_MANY_EMAILS" });
  });

  it("a provider failure is reported without leaving the account half-changed", async () => {
    const u = await passwordUser("verify4@example.com");
    h.mail.failNext = true;
    await expect(requestEmailVerification(h.engine, u.ctx)).rejects.toMatchObject({ code: "EMAIL_FAILED" });
    expect((await emailStatus(h.engine, u.ctx)).verified).toBe(false);
  });
});

describe("changing the address needs a fresh sign-in", () => {
  it("password account: wrong or missing password is refused; the right one sends a link to the NEW address only", async () => {
    const u = await passwordUser("old1@example.com");
    await requestEmailVerification(h.engine, u.ctx);
    await confirmEmailLink(h.engine, tokenFrom(h.mail.linkTo("old1@example.com")!));

    await expect(requestEmailChange(h.engine, u.ctx, { email: "new1@example.com" })).rejects.toMatchObject({ code: "REAUTH_REQUIRED" });
    await expect(requestEmailChange(h.engine, u.ctx, { email: "new1@example.com", reauth: { password: "wrong-wrong-wrong" } })).rejects.toMatchObject({ code: "REAUTH_FAILED" });
    expect(h.mail.to("new1@example.com")).toHaveLength(0);

    await requestEmailChange(h.engine, u.ctx, { email: "new1@example.com", reauth: { password: PASSWORD } });
    expect((await emailStatus(h.engine, u.ctx)).email).toBe("old1@example.com"); // unchanged until the link is used
    const before = h.mail.to("old1@example.com").length;
    await confirmEmailLink(h.engine, tokenFrom(h.mail.linkTo("new1@example.com")!));
    expect(await emailStatus(h.engine, u.ctx)).toMatchObject({ email: "new1@example.com", verified: true });
    // the previous verified address is told about it
    expect(h.mail.to("old1@example.com").length).toBe(before + 1);
    expect(h.mail.last("old1@example.com")!.subject).toMatch(/changed/);
  });

  it("refuses an address that belongs to another account, and the reserved stand-in domain", async () => {
    const a = await passwordUser("taken-a@example.com");
    await passwordUser("taken-b@example.com");
    await expect(requestEmailChange(h.engine, a.ctx, { email: "taken-b@example.com", reauth: { password: PASSWORD } })).rejects.toMatchObject({ code: "EMAIL_TAKEN" });
    await expect(requestEmailChange(h.engine, a.ctx, { email: "x@sso.plinth.invalid", reauth: { password: PASSWORD } })).rejects.toMatchObject({ code: "INVALID_EMAIL" });
    await expect(requestEmailChange(h.engine, a.ctx, { email: "not-an-email", reauth: { password: PASSWORD } })).rejects.toMatchObject({ code: "INVALID_EMAIL" });
  });
});

describe("wallet and social sign-ins", () => {
  it("a Google sign-in arrives with a verified email", async () => {
    const s = await signInWithIdentity(h.engine, { subject: "google:gina@example.com", email: "gina@example.com", name: "Gina", emailVerified: true, connection: "google", issuedAt: null }, {}, actor);
    const ctx = ctxFor(s.merchant.id, s.user.id);
    expect(await emailStatus(h.engine, ctx)).toMatchObject({ email: "gina@example.com", verified: true, auth_method: "identity" });
    await expect(requireVerifiedEmail(h.engine, ctx)).resolves.toBeTruthy();
  });

  it("a wallet-only user has no usable email until they add and verify one", async () => {
    const wallet = "wallet:0xabc0000000000000000000000000000000000f01";
    const s = await signInWithIdentity(h.engine, { subject: wallet, email: null, name: null, emailVerified: false, connection: null, issuedAt: null }, {}, actor);
    const ctx = ctxFor(s.merchant.id, s.user.id);
    expect(await emailStatus(h.engine, ctx)).toMatchObject({ email: null, verified: false, auth_method: "identity" });
    await expect(requireVerifiedEmail(h.engine, ctx)).rejects.toMatchObject({ code: "EMAIL_REQUIRED" });
    await expect(requestEmailVerification(h.engine, ctx)).rejects.toMatchObject({ code: "EMAIL_REQUIRED" });

    // No fresh sign-in, an old one, or somebody else's: all refused.
    await expect(requestEmailChange(h.engine, ctx, { email: "wally@example.com" })).rejects.toMatchObject({ code: "REAUTH_REQUIRED" });
    const stale = token({ subject: wallet, issuedAt: Math.floor((Date.now() + h.clock.offsetMs) / 1000) - 600 });
    await expect(requestEmailChange(h.engine, ctx, { email: "wally@example.com", reauth: { id_token: stale } })).rejects.toMatchObject({ code: "REAUTH_REQUIRED" });
    const other = token({ subject: "wallet:0xdef0000000000000000000000000000000000f02" });
    await expect(requestEmailChange(h.engine, ctx, { email: "wally@example.com", reauth: { id_token: other } })).rejects.toMatchObject({ code: "REAUTH_FAILED" });
    expect(h.mail.to("wally@example.com")).toHaveLength(0);

    await requestEmailChange(h.engine, ctx, { email: "wally@example.com", reauth: { id_token: token({ subject: wallet }) } });
    await confirmEmailLink(h.engine, tokenFrom(h.mail.linkTo("wally@example.com")!));
    expect(await emailStatus(h.engine, ctx)).toMatchObject({ email: "wally@example.com", verified: true });
    await expect(requireVerifiedEmail(h.engine, ctx)).resolves.toBeTruthy();
    await expect(verifyReauth(h.engine, ctx, { id_token: token({ subject: wallet }) })).resolves.toBeTruthy();
  });

  it("an API key cannot use any of this: it has no user", async () => {
    const u = await passwordUser("apikey@example.com");
    const apiCtx: AuthContext = { ...u.ctx, actor: { type: "API_KEY", id: "key_1" }, via: "api_key" };
    await expect(emailStatus(h.engine, apiCtx)).rejects.toMatchObject({ code: "SESSION_REQUIRED" });
    await expect(requestEmailChange(h.engine, apiCtx, { email: "k@example.com", reauth: { password: PASSWORD } })).rejects.toMatchObject({ code: "SESSION_REQUIRED" });
  });
});

describe("email providers", () => {
  it("Resend: posts to /emails with a bearer key, an idempotency key and the message; maps failures without leaking the body", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const ok = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ id: "re_123" }), { status: 200 });
    }) as unknown as typeof fetch;
    const sender = new ResendEmailSender("re_key", "Plinth <hello@example.com>", silentLogger, ok);
    const r = await sender.send({ to: "a@example.com", subject: "S", text: "T", html: "<p>T</p>", idempotencyKey: "k-1", tags: { type: "verify_email" } });
    expect(r.id).toBe("re_123");
    expect(calls[0]!.url).toBe("https://api.resend.com/emails");
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer re_key");
    expect(headers["idempotency-key"]).toBe("k-1");
    expect(JSON.parse(String(calls[0]!.init.body))).toMatchObject({ from: "Plinth <hello@example.com>", to: ["a@example.com"], subject: "S", text: "T", html: "<p>T</p>", tags: [{ name: "type", value: "verify_email" }] });

    const logged: string[] = [];
    const log = { info() {}, warn() {}, error: (m: string, c?: Record<string, unknown>) => logged.push(m + JSON.stringify(c ?? {})) };
    const bad = (async () => new Response(JSON.stringify({ name: "validation_error", message: "The from address is not verified" }), { status: 422 })) as unknown as typeof fetch;
    await expect(new ResendEmailSender("re_key", "x@y.z", log, bad).send({ to: "a@example.com", subject: "S", text: "secret-link-https://x/?token=abc" })).rejects.toMatchObject({ code: "EMAIL_FAILED", status: 502 });
    expect(logged.join(" ")).not.toContain("token=abc");
    const down = (async () => { throw new Error("network down"); }) as unknown as typeof fetch;
    await expect(new ResendEmailSender("re_key", "x@y.z", log, down).send({ to: "a@example.com", subject: "S", text: "T" })).rejects.toMatchObject({ code: "EMAIL_FAILED" });
  });

  it("chooses a provider from the environment: Resend when configured, console in development, unavailable in production", () => {
    expect(createEmailSender({ RESEND_API_KEY: "k", EMAIL_FROM: "a@b.c" }, silentLogger)).toBeInstanceOf(ResendEmailSender);
    expect(createEmailSender({}, silentLogger)).toBeInstanceOf(ConsoleEmailSender);
    const prod = createEmailSender({ NODE_ENV: "production" }, silentLogger);
    expect(prod).toBeInstanceOf(UnavailableEmailSender);
    expect(prod.available).toBe(false);
  });

  it("without a provider, features that need email say so", async () => {
    const u = await passwordUser("noprovider@example.com");
    const original = h.engine.email;
    h.engine.email = new UnavailableEmailSender();
    try {
      await expect(requestEmailVerification(h.engine, u.ctx)).rejects.toMatchObject({ code: "EMAIL_UNAVAILABLE" });
      expect((await emailStatus(h.engine, u.ctx)).email_available).toBe(false);
    } finally {
      h.engine.email = original;
    }
  });
});
