import * as jose from "jose";
import { eq, schema } from "@plinth/db";
import { newId, randomToken } from "@plinth/shared";
import { audit, type Actor } from "./audit";
import { startSession } from "./auth";
import { EngineError, type Engine } from "./context";
import { hashPassword } from "./crypto";

/**
 * Web3Auth identity tokens. The browser signs a user in with Web3Auth and sends us the identity token; we never trust the
 * browser's claims, only a token whose signature verifies against Web3Auth's published keys for OUR client id.
 *
 * Social and email logins are signed by api-auth.web3auth.io; external wallets (MetaMask and similar) by authjs.web3auth.io.
 * Source: Embedded Wallets "identity token" documentation.
 */
const SOURCES = [
  { jwks: "https://api-auth.web3auth.io/jwks", issuer: "https://api-auth.web3auth.io" },
  { jwks: "https://authjs.web3auth.io/jwks", issuer: "https://authjs.web3auth.io" },
] as const;

export interface Web3AuthIdentity {
  subject: string;
  email: string | null;
  name: string | null;
}

type KeySet = Parameters<typeof jose.jwtVerify>[1];
const remote = new Map<string, KeySet>();
const keySetFor = (url: string): KeySet => {
  let k = remote.get(url);
  if (!k) { k = jose.createRemoteJWKSet(new URL(url)); remote.set(url, k); }
  return k;
};

/** Verify a Web3Auth identity token and reduce it to a stable subject. `keys` is injectable for tests. */
export async function verifyWeb3AuthToken(idToken: string, clientId: string, keys?: KeySet): Promise<Web3AuthIdentity> {
  let payload: jose.JWTPayload | undefined;
  let lastError: unknown;
  for (const s of SOURCES) {
    try {
      ({ payload } = await jose.jwtVerify(idToken, keys ?? keySetFor(s.jwks), { algorithms: ["ES256"], issuer: s.issuer, audience: clientId }));
      break;
    } catch (err) { lastError = err; }
  }
  if (!payload) {
    // Say what the token claims about itself (never the token) so a rejected sign-in can be diagnosed from the error alone.
    let peek = "unreadable";
    try {
      const h = jose.decodeProtectedHeader(idToken);
      const c = jose.decodeJwt(idToken);
      peek = JSON.stringify({ alg: h.alg, kid: String(h.kid ?? "").slice(0, 12) || null, iss: c.iss, aud_matches: c.aud === clientId || (Array.isArray(c.aud) && c.aud.includes(clientId)), expired: typeof c.exp === "number" ? c.exp * 1000 < Date.now() : null });
    } catch { /* keep "unreadable" */ }
    console.warn(JSON.stringify({ level: "warn", msg: "web3auth token rejected", reason: lastError instanceof Error ? lastError.message : "invalid", token: peek }));
    throw new EngineError("INVALID_TOKEN", `Web3Auth token rejected: ${lastError instanceof Error ? lastError.message : "invalid"} ${peek}`, 401);
  }

  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const wallets = Array.isArray(payload.wallets) ? (payload.wallets as { address?: unknown; public_key?: unknown }[]) : [];
  const walletAddress = str(wallets.find((w) => str(w.address))?.address);
  const connection = str(payload.authConnection);
  const userId = str(payload.userId) ?? str(payload.sub);
  let subject: string | null = null;
  if (walletAddress && !connection) subject = `wallet:${walletAddress.toLowerCase()}`;
  else if (userId) subject = `${connection ?? "w3a"}:${userId.toLowerCase()}`;
  else if (walletAddress) subject = `wallet:${walletAddress.toLowerCase()}`;
  if (!subject) throw new EngineError("INVALID_TOKEN", "Web3Auth token carries no stable user id", 401);
  return { subject, email: str(payload.email)?.toLowerCase() ?? null, name: str(payload.name) };
}

/**
 * Sign in with a verified external identity, creating the merchant on first use.
 * An existing password account with the same email is never linked automatically: an identity provider's email is not a
 * proof of ownership we control, so the user must sign in with their password first.
 */
export async function signInWithIdentity(e: Engine, id: Web3AuthIdentity, input: { business_name?: string }, actor: Actor) {
  const provider = "web3auth";
  const [known] = await e.db.select().from(schema.externalIdentities).where(eq(schema.externalIdentities.subject, id.subject));
  let userId = known?.provider === provider ? known.userId : undefined;

  if (!userId) {
    const email = id.email ?? `${id.subject.replace(/[^a-z0-9]/g, "").slice(0, 40)}@sso.plinth.invalid`;
    const [taken] = await e.db.select({ id: schema.merchantUsers.id }).from(schema.merchantUsers).where(eq(schema.merchantUsers.email, email));
    if (taken) throw new EngineError("EMAIL_TAKEN", "An account with this email already exists. Sign in with your password instead.", 409);
    const merchantId = newId("mer");
    userId = newId("usr");
    const name = input.business_name?.trim() || id.name || (id.email ? id.email.split("@")[0]! : "My business");
    const created = userId;
    await e.db.transaction(async (tx) => {
      await tx.insert(schema.merchants).values({ id: merchantId, name });
      await tx.insert(schema.merchantUsers).values({ id: created, merchantId, email, passwordHash: await hashPassword(randomToken("nopw", 24)), role: "OWNER" });
      await tx.insert(schema.externalIdentities).values({ id: newId("ext"), userId: created, provider, subject: id.subject, email: id.email });
      await audit(tx, { merchantId, actor, action: "merchant.created", targetType: "merchant", targetId: merchantId, data: { via: provider } });
    });
  }
  return startSession(e, userId, actor);
}
