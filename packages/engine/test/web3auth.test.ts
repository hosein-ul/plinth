import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as jose from "jose";
import { eq, schema } from "@plinth/db";
import { signInWithIdentity, signup, verifyWeb3AuthToken } from "../src";
import { startHarness, type Harness } from "./harness";

const CLIENT = "BTestClientId";
let h: Harness;
let priv: jose.CryptoKey;
let keys: Parameters<typeof verifyWeb3AuthToken>[2];

beforeAll(async () => {
  h = await startHarness();
  const pair = await jose.generateKeyPair("ES256");
  priv = pair.privateKey;
  keys = jose.createLocalJWKSet({ keys: [{ ...(await jose.exportJWK(pair.publicKey)), alg: "ES256", kid: "k1" }] });
});
afterAll(async () => h.stop());

const sign = (claims: jose.JWTPayload, o: { iss?: string; aud?: string; exp?: string } = {}) =>
  new jose.SignJWT(claims).setProtectedHeader({ alg: "ES256", kid: "k1" }).setIssuedAt().setIssuer(o.iss ?? "https://api-auth.web3auth.io").setAudience(o.aud ?? CLIENT).setExpirationTime(o.exp ?? "5m").sign(priv);
const actor = { type: "USER" as const, ip: "127.0.0.1" };

describe("Web3Auth identity tokens", () => {
  it("accepts a token signed for our client id and reduces it to a stable subject", async () => {
    const t = await sign({ authConnection: "google", userId: "Alice@Example.com", email: "Alice@Example.com", name: "Alice" });
    expect(await verifyWeb3AuthToken(t, CLIENT, keys)).toMatchObject({ subject: "google:alice@example.com", email: "alice@example.com", name: "Alice", emailVerified: true, connection: "google" });
  });

  it("maps an external wallet login to a wallet subject", async () => {
    const t = await sign({ wallets: [{ address: "0xAbC0000000000000000000000000000000000001", type: "ethereum" }] }, { iss: "https://authjs.web3auth.io" });
    expect((await verifyWeb3AuthToken(t, CLIENT, keys)).subject).toBe("wallet:0xabc0000000000000000000000000000000000001");
  });

  it("accepts a session token from the SDK v11 citadel service (issuer web3auth.io)", async () => {
    const t = await sign({ sub: "usr_citadel_1", wallets: [{ address: "0xAbC0000000000000000000000000000000000002" }] }, { iss: "web3auth.io" });
    expect((await verifyWeb3AuthToken(t, CLIENT, keys)).subject).toBe("wallet:0xabc0000000000000000000000000000000000002");
  });

  it("only treats an email as verified when the login method vouches for it", async () => {
    const google = await verifyWeb3AuthToken(await sign({ authConnection: "google", userId: "g1", email: "g@example.com" }), CLIENT, keys);
    expect(google.emailVerified).toBe(true);
    const otp = await verifyWeb3AuthToken(await sign({ authConnection: "email_passwordless", userId: "e1", email: "e@example.com" }), CLIENT, keys);
    expect(otp.emailVerified).toBe(true);
    const social = await verifyWeb3AuthToken(await sign({ authConnection: "twitter", userId: "t1", email: "t@example.com" }), CLIENT, keys);
    expect(social.emailVerified).toBe(false);
    const explicit = await verifyWeb3AuthToken(await sign({ authConnection: "twitter", userId: "t2", email: "t2@example.com", email_verified: true }), CLIENT, keys);
    expect(explicit.emailVerified).toBe(true);
    const wallet = await verifyWeb3AuthToken(await sign({ wallets: [{ address: "0xAbC0000000000000000000000000000000000009" }] }, { iss: "https://authjs.web3auth.io" }), CLIENT, keys);
    expect(wallet).toMatchObject({ emailVerified: false, email: null });
    expect(typeof google.issuedAt).toBe("number");
  });

  it("rejects a wrong audience, a wrong issuer, an expired token, an unsigned token and one signed by another key", async () => {
    await expect(verifyWeb3AuthToken(await sign({ userId: "x" }, { aud: "someone-else" }), CLIENT, keys)).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    await expect(verifyWeb3AuthToken(await sign({ userId: "x" }, { iss: "https://evil.example" }), CLIENT, keys)).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    await expect(verifyWeb3AuthToken(await sign({ userId: "x" }, { exp: "-1m" }), CLIENT, keys)).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    const unsigned = new jose.UnsecuredJWT({ userId: "x" }).setIssuer("https://api-auth.web3auth.io").setAudience(CLIENT).setExpirationTime("5m").encode();
    await expect(verifyWeb3AuthToken(unsigned, CLIENT, keys)).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    const other = await jose.generateKeyPair("ES256");
    const forged = await new jose.SignJWT({ userId: "x" }).setProtectedHeader({ alg: "ES256", kid: "k1" }).setIssuer("https://api-auth.web3auth.io").setAudience(CLIENT).setExpirationTime("5m").sign(other.privateKey);
    await expect(verifyWeb3AuthToken(forged, CLIENT, keys)).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });
});

describe("token shapes", () => {
  it("reads the wallet_address and sub claims of newer tokens and offers every id the token can be reduced to", async () => {
    const t = await sign({ sub: "usr_abc", wallet_address: "0xAbC0000000000000000000000000000000000003" });
    const id = await verifyWeb3AuthToken(t, CLIENT, keys);
    expect(id.subject).toBe("wallet:0xabc0000000000000000000000000000000000003");
    expect(id.aliases).toEqual(["wallet:0xabc0000000000000000000000000000000000003", "w3a:usr_abc"]);
    expect(id.email).toBeNull();
    expect(id.emailVerified).toBe(false);
  });

  it("a Google login that arrives as authConnection web3auth is recognised through groupedAuthConnectionId", async () => {
    const google = await verifyWeb3AuthToken(await sign({ authConnection: "web3auth", groupedAuthConnectionId: "web3auth-google-sapphire-mainnet", userId: "gus@example.com", email: "gus@example.com" }), CLIENT, keys);
    expect(google).toMatchObject({ subject: "web3auth:gus@example.com", emailVerified: true });
    const twitter = await verifyWeb3AuthToken(await sign({ authConnection: "web3auth", groupedAuthConnectionId: "web3auth-twitter-sapphire-mainnet", userId: "tw1", email: "tw@example.com" }), CLIENT, keys);
    expect(twitter.emailVerified).toBe(false);
    // no email in the token (the dashboard setting that adds it is off): still a working identity, just not a verified email
    const bare = await verifyWeb3AuthToken(await sign({ authConnection: "web3auth", groupedAuthConnectionId: "web3auth-google-sapphire-mainnet", userId: "u1" }), CLIENT, keys);
    expect(bare).toMatchObject({ email: null, emailVerified: false });
  });
});

describe("one person, one account, whatever shape the token has", () => {
  it("finds the same account when the token shape changes, and never merges two accounts", async () => {
    const wallet = "wallet:0xabc0000000000000000000000000000000000a01";
    const first = await signInWithIdentity(h.engine, { subject: wallet, aliases: [wallet], email: null, name: null, emailVerified: false, connection: null, issuedAt: null }, {}, actor);
    // Later the same person arrives with a token that carries the wallet AND a sub: same account, and the sub is remembered.
    const later = await signInWithIdentity(h.engine, { subject: wallet, aliases: [wallet, "w3a:usr_a01"], email: null, name: null, emailVerified: false, connection: null, issuedAt: null }, {}, actor);
    expect(later.user.id).toBe(first.user.id);
    // Now a token with only the sub (the wallet claim is gone): still the same account.
    const subOnly = await signInWithIdentity(h.engine, { subject: "w3a:usr_a01", aliases: ["w3a:usr_a01"], email: null, name: null, emailVerified: false, connection: null, issuedAt: null }, {}, actor);
    expect(subOnly.user.id).toBe(first.user.id);

    // Two existing accounts: a token that links them together is refused, never merged.
    const b = await signInWithIdentity(h.engine, { subject: "wallet:0xabc0000000000000000000000000000000000a02", aliases: ["wallet:0xabc0000000000000000000000000000000000a02", "w3a:usr_b02"], email: null, name: null, emailVerified: false, connection: null, issuedAt: null }, {}, actor);
    expect(b.user.id).not.toBe(first.user.id);
    await expect(signInWithIdentity(h.engine, { subject: wallet, aliases: [wallet, "w3a:usr_b02"], email: null, name: null, emailVerified: false, connection: null, issuedAt: null }, {}, actor)).rejects.toMatchObject({ code: "IDENTITY_CONFLICT" });
    const rows = await h.handle.db.select().from(schema.externalIdentities).where(eq(schema.externalIdentities.subject, "w3a:usr_b02"));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(b.user.id);
  });
});

describe("signing in with an external identity", () => {
  it("creates the merchant on first use and reuses it afterwards", async () => {
    const id = { subject: "google:bob@example.com", email: "bob@example.com", name: "Bob", emailVerified: true, connection: "google", issuedAt: null };
    const first = await signInWithIdentity(h.engine, id, { business_name: "Bob's Bakery" }, actor);
    expect(first.merchant.name).toBe("Bob's Bakery");
    expect(first.user.role).toBe("OWNER");
    const again = await signInWithIdentity(h.engine, id, {}, actor);
    expect(again.user.id).toBe(first.user.id);
    expect(again.token).not.toBe(first.token);
    const rows = await h.handle.db.select().from(schema.externalIdentities).where(eq(schema.externalIdentities.subject, id.subject));
    expect(rows).toHaveLength(1);
  });

  it("never auto-links an existing password account that shares the email", async () => {
    await signup(h.engine, { business_name: "Carol Co", email: "carol@example.com", password: "a-long-password-1" }, { type: "SYSTEM" });
    await expect(signInWithIdentity(h.engine, { subject: "google:carol@example.com", email: "carol@example.com", name: null, emailVerified: true, connection: "google", issuedAt: null }, {}, actor)).rejects.toMatchObject({ code: "EMAIL_TAKEN" });
  });

  it("gives a wallet-only user a working session without an email", async () => {
    const s = await signInWithIdentity(h.engine, { subject: "wallet:0xabc0000000000000000000000000000000000001", email: null, name: null, emailVerified: false, connection: null, issuedAt: null }, {}, actor);
    expect(s.token.startsWith("sess_")).toBe(true);
    expect(s.user.email.endsWith("@sso.plinth.invalid")).toBe(true);
  });
});
