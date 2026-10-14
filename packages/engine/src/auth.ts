import { randomBytes } from "node:crypto";
import { and, count, eq, isNull, schema } from "@plinth/db";
import { newId, randomToken } from "@plinth/shared";
import { audit, type Actor } from "./audit";
import { EngineError, type Engine } from "./context";
import { hashPassword, sha256Hex, verifyPassword } from "./crypto";

export type Role = "OWNER" | "ADMIN" | "DEVELOPER" | "VIEWER";
export type Environment = "test" | "live";

export interface AuthContext {
  merchantId: string;
  environment: Environment;
  actor: Actor;
  /** API keys act with DEVELOPER rights; dashboard sessions carry the member's role. */
  role: Role;
  via: "api_key" | "session";
}

/** What each role may do. Money-moving configuration (wallets, team) needs OWNER/ADMIN. */
const PERMISSIONS = {
  read: ["OWNER", "ADMIN", "DEVELOPER", "VIEWER"],
  payments: ["OWNER", "ADMIN", "DEVELOPER"],
  developers: ["OWNER", "ADMIN", "DEVELOPER"],
  wallets: ["OWNER", "ADMIN"],
  team: ["OWNER", "ADMIN"],
  settings: ["OWNER", "ADMIN"],
} as const satisfies Record<string, readonly Role[]>;

export function requirePermission(ctx: AuthContext, p: keyof typeof PERMISSIONS): void {
  if (!(PERMISSIONS[p] as readonly Role[]).includes(ctx.role)) throw new EngineError("FORBIDDEN", `Your role (${ctx.role}) cannot perform this action`, 403);
}

// ------------------------------------------------------------------ accounts & sessions

export async function signup(e: Engine, input: { business_name: string; email: string; password: string }, actor: Actor) {
  const email = input.email.trim().toLowerCase();
  const [existing] = await e.db.select({ id: schema.merchantUsers.id }).from(schema.merchantUsers).where(eq(schema.merchantUsers.email, email));
  if (existing) throw new EngineError("EMAIL_TAKEN", "An account with this email already exists", 409);
  const merchantId = newId("mer");
  const userId = newId("usr");
  const passwordHash = await hashPassword(input.password);
  await e.db.transaction(async (tx) => {
    await tx.insert(schema.merchants).values({ id: merchantId, name: input.business_name.trim() });
    await tx.insert(schema.merchantUsers).values({ id: userId, merchantId, email, passwordHash, role: "OWNER" });
    await audit(tx, { merchantId, actor, action: "merchant.created", targetType: "merchant", targetId: merchantId });
  });
  return { merchantId, userId };
}

export async function login(e: Engine, email: string, password: string, actor: Actor) {
  const [u] = await e.db.select().from(schema.merchantUsers).where(eq(schema.merchantUsers.email, email.trim().toLowerCase()));
  // Always run a hash to keep timing flat for unknown emails.
  const ok = u ? await verifyPassword(password, u.passwordHash) : (await hashPassword(password), false);
  if (!u || !ok) throw new EngineError("INVALID_CREDENTIALS", "Invalid email or password", 401);
  return startSession(e, u.id, actor);
}

/** Open a dashboard session for an already-authenticated user (password or an external identity). */
export async function startSession(e: Engine, userId: string, actor: Actor) {
  const [u] = await e.db.select().from(schema.merchantUsers).where(eq(schema.merchantUsers.id, userId));
  if (!u) throw new EngineError("INVALID_CREDENTIALS", "Unknown user", 401);
  const [m] = await e.db.select().from(schema.merchants).where(eq(schema.merchants.id, u.merchantId));
  if (m?.status !== "ACTIVE") throw new EngineError("ACCOUNT_SUSPENDED", "This account is suspended", 403);
  const token = randomToken("sess", 32);
  await e.db.transaction(async (tx) => {
    await tx.insert(schema.sessions).values({ id: sha256Hex(token), userId: u.id, merchantId: u.merchantId, expiresAt: new Date(e.now().getTime() + e.cfg.sessionTtlSeconds * 1000) });
    await tx.update(schema.merchantUsers).set({ lastLoginAt: e.now() }).where(eq(schema.merchantUsers.id, u.id));
    await audit(tx, { merchantId: u.merchantId, actor: { ...actor, type: "USER", id: u.id }, action: "user.login" });
  });
  return { token, user: { id: u.id, email: u.email, role: u.role as Role }, merchant: { id: m.id, name: m.name } };
}

export async function logout(e: Engine, token: string) {
  await e.db.delete(schema.sessions).where(eq(schema.sessions.id, sha256Hex(token)));
}

/** Resolve a bearer credential (session token or API key) into a merchant context. */
export async function authenticate(e: Engine, bearer: string, requestedEnv?: Environment, ip?: string): Promise<AuthContext> {
  if (bearer.startsWith("sk_test_") || bearer.startsWith("sk_live_")) {
    const [k] = await e.db.select().from(schema.apiKeys).where(and(eq(schema.apiKeys.keyHash, sha256Hex(bearer)), isNull(schema.apiKeys.revokedAt)));
    if (!k) throw new EngineError("INVALID_API_KEY", "Invalid or revoked API key", 401);
    const [m] = await e.db.select().from(schema.merchants).where(eq(schema.merchants.id, k.merchantId));
    if (m?.status !== "ACTIVE") throw new EngineError("ACCOUNT_SUSPENDED", "This account is suspended", 403);
    if (!k.lastUsedAt || e.now().getTime() - k.lastUsedAt.getTime() > 60_000) {
      await e.db.update(schema.apiKeys).set({ lastUsedAt: e.now() }).where(eq(schema.apiKeys.id, k.id));
    }
    return { merchantId: k.merchantId, environment: k.environment as Environment, actor: { type: "API_KEY", id: k.id, ip }, role: "DEVELOPER", via: "api_key" };
  }
  if (bearer.startsWith("sess_")) {
    const [s] = await e.db.select().from(schema.sessions).where(eq(schema.sessions.id, sha256Hex(bearer)));
    if (!s || s.expiresAt < e.now()) throw new EngineError("INVALID_SESSION", "Session expired; please sign in again", 401);
    const [u] = await e.db.select().from(schema.merchantUsers).where(eq(schema.merchantUsers.id, s.userId));
    if (!u) throw new EngineError("INVALID_SESSION", "Session is no longer valid", 401);
    return { merchantId: s.merchantId, environment: requestedEnv ?? "test", actor: { type: "USER", id: u.id, ip }, role: u.role as Role, via: "session" };
  }
  throw new EngineError("INVALID_CREDENTIALS", "Missing or malformed credentials", 401);
}

// ------------------------------------------------------------------ API keys

export async function createApiKey(e: Engine, ctx: AuthContext, input: { name: string; environment: Environment }, rotatedFromId?: string) {
  requirePermission(ctx, "developers");
  const secret = randomBytes(32).toString("base64url");
  const key = `sk_${input.environment}_${secret}`;
  const id = newId("key");
  await e.db.transaction(async (tx) => {
    await tx.insert(schema.apiKeys).values({ id, merchantId: ctx.merchantId, environment: input.environment, name: input.name, prefix: key.slice(0, 14), keyHash: sha256Hex(key), rotatedFromId: rotatedFromId ?? null });
    await audit(tx, { merchantId: ctx.merchantId, actor: ctx.actor, action: rotatedFromId ? "api_key.rotated" : "api_key.created", targetType: "api_key", targetId: id, data: { environment: input.environment, name: input.name } });
  });
  // Only the hash is stored: the full key is returned exactly once.
  return { id, name: input.name, environment: input.environment, prefix: key.slice(0, 14), key };
}

export async function rotateApiKey(e: Engine, ctx: AuthContext, keyId: string, revokeOldAfterMinutes = 0) {
  requirePermission(ctx, "developers");
  const [old] = await e.db.select().from(schema.apiKeys).where(and(eq(schema.apiKeys.id, keyId), eq(schema.apiKeys.merchantId, ctx.merchantId), isNull(schema.apiKeys.revokedAt)));
  if (!old) throw new EngineError("NOT_FOUND", "API key not found", 404);
  const fresh = await createApiKey(e, ctx, { name: old.name, environment: old.environment as Environment }, old.id);
  // Grace period lets deployments roll over; 0 revokes immediately.
  if (revokeOldAfterMinutes <= 0) await revokeApiKey(e, ctx, keyId);
  return { ...fresh, previousKeyId: keyId, previousKeyRevoked: revokeOldAfterMinutes <= 0 };
}

export async function revokeApiKey(e: Engine, ctx: AuthContext, keyId: string) {
  requirePermission(ctx, "developers");
  const res = await e.db.update(schema.apiKeys).set({ revokedAt: e.now() }).where(and(eq(schema.apiKeys.id, keyId), eq(schema.apiKeys.merchantId, ctx.merchantId), isNull(schema.apiKeys.revokedAt))).returning({ id: schema.apiKeys.id });
  if (res.length === 0) throw new EngineError("NOT_FOUND", "API key not found", 404);
  await audit(e.db, { merchantId: ctx.merchantId, actor: ctx.actor, action: "api_key.revoked", targetType: "api_key", targetId: keyId });
}

export async function listApiKeys(e: Engine, ctx: AuthContext) {
  const rows = await e.db.select().from(schema.apiKeys).where(eq(schema.apiKeys.merchantId, ctx.merchantId));
  return rows.map((k) => ({ id: k.id, name: k.name, environment: k.environment, prefix: k.prefix, last_used_at: k.lastUsedAt?.toISOString() ?? null, revoked_at: k.revokedAt?.toISOString() ?? null, created_at: k.createdAt.toISOString() }));
}

// ------------------------------------------------------------------ team

export async function addTeamMember(e: Engine, ctx: AuthContext, input: { email: string; role: Role }) {
  requirePermission(ctx, "team");
  if (input.role === "OWNER" && ctx.role !== "OWNER") throw new EngineError("FORBIDDEN", "Only an owner can add another owner", 403);
  const email = input.email.trim().toLowerCase();
  const [dup] = await e.db.select({ id: schema.merchantUsers.id }).from(schema.merchantUsers).where(eq(schema.merchantUsers.email, email));
  if (dup) throw new EngineError("EMAIL_TAKEN", "A user with this email already exists", 409);
  const temp = randomToken("tmp", 12);
  const id = newId("usr");
  await e.db.transaction(async (tx) => {
    await tx.insert(schema.merchantUsers).values({ id, merchantId: ctx.merchantId, email, passwordHash: await hashPassword(temp), role: input.role });
    await audit(tx, { merchantId: ctx.merchantId, actor: ctx.actor, action: "team.member_added", targetType: "user", targetId: id, data: { email, role: input.role } });
  });
  return { id, email, role: input.role, temporary_password: temp };
}

export async function listTeam(e: Engine, ctx: AuthContext) {
  const rows = await e.db.select().from(schema.merchantUsers).where(eq(schema.merchantUsers.merchantId, ctx.merchantId));
  return rows.map((u) => ({ id: u.id, email: u.email, role: u.role, last_login_at: u.lastLoginAt?.toISOString() ?? null, created_at: u.createdAt.toISOString() }));
}

export async function setMemberRole(e: Engine, ctx: AuthContext, userId: string, role: Role) {
  requirePermission(ctx, "team");
  const [u] = await e.db.select().from(schema.merchantUsers).where(and(eq(schema.merchantUsers.id, userId), eq(schema.merchantUsers.merchantId, ctx.merchantId)));
  if (!u) throw new EngineError("NOT_FOUND", "User not found", 404);
  if ((u.role === "OWNER" || role === "OWNER") && ctx.role !== "OWNER") throw new EngineError("FORBIDDEN", "Only an owner can change owner roles", 403);
  if (u.role === "OWNER" && role !== "OWNER") {
    const [{ n } = { n: 0 }] = await e.db.select({ n: count() }).from(schema.merchantUsers).where(and(eq(schema.merchantUsers.merchantId, ctx.merchantId), eq(schema.merchantUsers.role, "OWNER")));
    if (n <= 1) throw new EngineError("LAST_OWNER", "A merchant must keep at least one owner", 409);
  }
  await e.db.transaction(async (tx) => {
    await tx.update(schema.merchantUsers).set({ role }).where(eq(schema.merchantUsers.id, userId));
    await audit(tx, { merchantId: ctx.merchantId, actor: ctx.actor, action: "team.role_changed", targetType: "user", targetId: userId, data: { from: u.role, to: role } });
  });
}
