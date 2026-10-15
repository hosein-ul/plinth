/**
 * One-command local stack for development and demos:
 *   anvil (chain id 31337, 1s blocks) → real contracts deployed → embedded Postgres (PGlite) →
 *   API (:4000) + worker (same process) → seeded demo merchant with an active vault.
 *
 * Everything on-chain is REAL contract bytecode compiled from /contracts. Only the USDC token is a
 * faithful FiatTokenV2 test double (the real token only exists on live networks).
 * Local keys are anvil's public test keys: worthless outside this process.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { connect } from "@plinth/db";
import { createEngine, consoleLogger, MemoryEmailSender, requestEmailVerification, confirmEmailLink, createPayoutChallenge, requestPayoutWallet, confirmPayoutLink, createPaymentIntent, createApiKey, enableNetwork, login, signup, startWorkerLoop, createEndpoint, relayerTick, watcherTick } from "@plinth/engine";
import { buildOpenApi, buildServer } from "@plinth/api";
import { startDevChain } from "@plinth/blockchain/dev";
import { parseUsdc } from "@plinth/shared";

const API_PORT = Number(process.env.API_PORT ?? 4000);
const RPC_PORT = Number(process.env.DEV_RPC_PORT ?? 8545);
const WEB_URL = process.env.PUBLIC_WEB_URL ?? "http://localhost:3000";

const chain = await startDevChain({ port: RPC_PORT, blockTimeSeconds: 1, confirmations: 2, vaultConfigDelaySeconds: 60, tokens: ["EURC"] });
const mail = new MemoryEmailSender();
const handle = connect(process.env.DATABASE_URL ?? "pglite://memory");
await handle.migrate();

const engine = await createEngine({
  db: handle.db,
  // Development: print the emails the console sender would have sent (they carry the one-time links).
  email: mail,
  logger: { info: (m, c) => { if (m.startsWith("email")) console.log(m, c ?? ""); }, warn: (m, c) => console.warn(m, c ?? ""), error: (m, c) => console.error(m, c ?? "") },
  env: { APP_SECRET_KEY: "42".repeat(32), PUBLIC_WEB_URL: WEB_URL, ALLOW_PRIVATE_WEBHOOK_TARGETS: "true", NODE_ENV: "development", ...(process.env.CUSTODY_ENABLED === "true" ? { CUSTODY_ENABLED: "true" } : {}) },
  signers: { getSigner: (n) => (n === chain.network.id ? chain.accounts[1] : undefined), getCustodySigner: (n) => (n === chain.network.id ? chain.accounts[4] : undefined) },
  extraNetworks: [{ network: chain.network, deployment: chain.deployment, client: chain.publicClient }],
});

// ---- seed a demo merchant
const demo = { email: "demo@plinth.test", password: "demo-password-123456" };
const { merchantId, userId } = await signup(engine, { business_name: "Demo Roasters", email: demo.email, password: demo.password }, { type: "SYSTEM" });
const session = await login(engine, demo.email, demo.password, { type: "SYSTEM" });
const ctx = { merchantId, environment: "test" as const, actor: { type: "SYSTEM" as const }, role: "OWNER" as const, via: "session" as const };
await enableNetwork(engine, ctx, { network: chain.network.id, owner_address: chain.accounts[2]!.address });
// The local chain also has a EURC test double (like Arc), so the two-token flows can be tried by hand.
await enableNetwork(engine, ctx, { network: chain.network.id, owner_address: chain.accounts[2]!.address, token: "EURC" });
for (let i = 0; i < 4; i++) {
  await relayerTick(engine, chain.network.id);
  await watcherTick(engine, chain.network.id);
  await new Promise((r) => setTimeout(r, 1200));
}
// CUSTODY_ENABLED=true pnpm dev:stack: the demo merchant is also set up for custodial payouts (withdrawal wallet: anvil #6) with one paid payment.
if (process.env.CUSTODY_ENABLED === "true") {
  const uctx = { ...ctx, actor: { type: "USER" as const, id: userId } };
  const tokenOf = (to: string) => new URL(mail.linkTo(to)!).searchParams.get("token")!;
  await requestEmailVerification(engine, uctx);
  await confirmEmailLink(engine, tokenOf(demo.email));
  const payee = chain.accounts[6]!;
  const ch = await createPayoutChallenge(engine, uctx, { network: chain.network.id, address: payee.address, purpose: "CUSTODY_WITHDRAWAL" });
  await requestPayoutWallet(engine, uctx, { network: chain.network.id, mode: "CUSTODIAL", address: payee.address, nonce: ch.nonce, signature: await payee.signMessage({ message: ch.message }), reauth: { password: demo.password } });
  await confirmPayoutLink(engine, tokenOf(demo.email));
  const pi = await createPaymentIntent(engine, uctx, { amount: "120.00", currency: "USDC", checkout_methods: ["ADDRESS"], expires_in_seconds: 3600, order_reference: "CUSTODY-DEMO" } as never);
  await chain.mintUsdc(chain.accounts[3]!.address, parseUsdc("200"));
  const w = chain.walletFor(3);
  const { MockFiatTokenAbi } = await import("@plinth/blockchain");
  await w.writeContract({ address: chain.usdc, abi: MockFiatTokenAbi, functionName: "transfer", args: [pi.networks[0]!.deposit_address as `0x${string}`, parseUsdc("120")], account: chain.accounts[3]!, chain: undefined });
  for (let i = 0; i < 6; i++) { await chain.mine(1); await watcherTick(engine, chain.network.id); await relayerTick(engine, chain.network.id); await new Promise((r) => setTimeout(r, 400)); }
}
const key = await createApiKey(engine, ctx, { name: "Demo server key", environment: "test" });
const hook = await createEndpoint(engine, merchantId, "test", { url: `${WEB_URL}/api/demo-webhook`, events: ["*"] });
await chain.mintUsdc(chain.accounts[3]!.address, parseUsdc("1000"));
await chain.mintToken("EURC", chain.accounts[3]!.address, parseUsdc("1000"));

// ---- serve
const { app, routes } = await buildServer(engine, { adminToken: "dev-operator-token", rateLimitDisabled: true });
app.get("/v1/openapi.json", async () => buildOpenApi(routes, `http://localhost:${API_PORT}`));
await app.listen({ port: API_PORT, host: "127.0.0.1" });
const loop = startWorkerLoop(engine, 1500);

mkdirSync(".data", { recursive: true });
const summary = {
  api: `http://localhost:${API_PORT}`,
  rpc: chain.rpcUrl,
  chainId: chain.chainId,
  network: chain.network.id,
  demoLogin: demo,
  merchantId,
  sessionToken: session.token,
  apiKey: key.key,
  webhookSecret: hook.secret,
  vaultOwner: { address: chain.accounts[2]!.address, note: "anvil account #2 — import into your wallet to manage the vault" },
  customerWallet: { address: chain.accounts[3]!.address, usdc: "1000", privateKeyNote: "anvil account #3 (public test key, mnemonic: test … junk)" },
  contracts: chain.deployment,
  usdc: chain.usdc,
};
writeFileSync(".data/dev-stack.json", JSON.stringify(summary, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));

console.log(`
  Plinth dev stack is running
  ───────────────────────────────────────────────────────────────
  API            http://localhost:${API_PORT}        OpenAPI: /v1/openapi.json
  Local chain    ${chain.rpcUrl}  (chain id ${chain.chainId}, 1s blocks)
  Web app        run \`pnpm web\` → ${WEB_URL}
  Dashboard      ${demo.email}  /  ${demo.password}
  Test API key   ${key.key}
  Mock USDC      ${chain.usdc}
  Mock EURC      ${chain.tokens.EURC}
  Customer       ${chain.accounts[3]!.address}  (1000 test USDC and 1000 test EURC; anvil key #3)
  Vault owner    ${chain.accounts[2]!.address}  (anvil key #2)

  Try it:
    curl -s -X POST http://localhost:${API_PORT}/v1/payment-intents \\
      -H "Authorization: Bearer ${key.key}" -H "Content-Type: application/json" \\
      -d '{"amount":"25.00","order_reference":"DEMO-1"}'
  Details saved to .data/dev-stack.json
`);

for (const s of ["SIGINT", "SIGTERM"] as const) {
  process.on(s, async () => {
    await loop.stop();
    await app.close();
    await chain.stop();
    await handle.close();
    process.exit(0);
  });
}
