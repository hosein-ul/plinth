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
    expect(await verifyWeb3AuthToken(t, CLIENT, keys)).toEqual({ subject: "google:alice@example.com", email: "alice@example.com", name: "Alice" });
  });

  it("maps an external wallet login to a wallet subject", async () => {
    const t = await sign({ wallets: [{ address: "0xAbC0000000000000000000000000000000000001", type: "ethereum" }] }, { iss: "https://authjs.web3auth.io" });
    expect((await verifyWeb3AuthToken(t, CLIENT, keys)).subject).toBe("wallet:0xabc0000000000000000000000000000000000001");
  });

  it("accepts a session token from the SDK v11 citadel service (issuer web3auth.io)", async () => {
    const t = await sign({ sub: "usr_citadel_1", wallets: [{ address: "0xAbC0000000000000000000000000000000000002" }] }, { iss: "web3auth.io" });
    expect((await verifyWeb3AuthToken(t, CLIENT, keys)).subject).toBe("wallet:0xabc0000000000000000000000000000000000002");
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

describe("signing in with an external identity", () => {
  it("creates the merchant on first use and reuses it afterwards", async () => {
    const id = { subject: "google:bob@example.com", email: "bob@example.com", name: "Bob" };
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
    await expect(signInWithIdentity(h.engine, { subject: "google:carol@example.com", email: "carol@example.com", name: null }, {}, actor)).rejects.toMatchObject({ code: "EMAIL_TAKEN" });
  });

  it("gives a wallet-only user a working session without an email", async () => {
    const s = await signInWithIdentity(h.engine, { subject: "wallet:0xabc0000000000000000000000000000000000001", email: null, name: null }, {}, actor);
    expect(s.token.startsWith("sess_")).toBe(true);
    expect(s.user.email.endsWith("@sso.plinth.invalid")).toBe(true);
  });
});
