import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { connect, type DbHandle } from "@plinth/db";
import { MockFiatTokenAbi } from "@plinth/blockchain";
import { startDevChain, type DevChain } from "@plinth/blockchain/dev";
import { createSiweMessage } from "viem/siwe";
import { getAddress, type Address } from "viem";
import type { TokenSymbol } from "@plinth/shared";
import pg from "pg";
import {
  MemoryAlertSink,
  MemoryEmailSender,
  createEngine,
  custodyTick,
  processWebhookJobs,
  relayerTick,
  signup,
  watcherTick,
  silentLogger,
  type AuthContext,
  type Engine,
} from "../src";

export interface Harness {
  chain: DevChain;
  handle: DbHandle;
  engine: Engine;
  alerts: MemoryAlertSink;
  /** Every email the engine sent, readable by tests (including one-time links). */
  mail: MemoryEmailSender;
  net: string;
  clock: { offsetMs: number };
  webhookSink: { server: Server; url: string; received: { headers: Record<string, string>; body: string }[]; status: number };
  newMerchant(name?: string): Promise<AuthContext>;
  /** One pass of watcher → relayer → webhook delivery. */
  pump(rounds?: number, opts?: { mine?: number }): Promise<void>;
  payUsdc(to: Address, units: bigint, from?: number): Promise<`0x${string}`>;
  /** Pay any deployed token (USDC or EURC) to an address from an anvil account. */
  payToken(symbol: TokenSymbol, to: Address, units: bigint, from?: number): Promise<`0x${string}`>;
  stop(): Promise<void>;
}

/**
 * What the payout-wallet flow stores for a confirmed DIRECT config: the EIP-4361 message the wallet signed and its signature.
 * For tests that insert a confirmed config directly instead of running the whole email flow; the engine re-verifies it
 * before it issues an address, so these must be real.
 */
export async function payoutProofFor(h: Harness, merchantId: string, address: Address) {
  const account = h.chain.accounts.find((a) => a.address.toLowerCase() === address.toLowerCase());
  if (!account) throw new Error("payoutProofFor needs one of the dev chain's accounts");
  const net = h.engine.chains.get(h.chain.network.id)!.network;
  const message = createSiweMessage({
    address: getAddress(address), chainId: net.chainId, domain: "localhost:3000", nonce: "a".repeat(16), uri: "http://localhost:3000", version: "1",
    statement: `Confirm that this wallet may receive stablecoin payouts directly on ${net.name} for Plinth merchant ${merchantId}. This signature does not send a transaction or move funds.`,
    requestId: merchantId, issuedAt: new Date(),
  });
  return { proofMessage: message, proofSignature: await account.signMessage({ message }), proofSignedAt: new Date() };
}

/** Migrates once per process into a template database; each harness then clones it server-side (fast, no network migration). */
let templateName: Promise<string> | undefined;
function migratedTemplate(adminUrl: string): Promise<string> {
  templateName ??= (async () => {
    const name = `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const admin = new pg.Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${name}`);
    await admin.end();
    const u = new URL(adminUrl);
    u.pathname = `/${name}`;
    const h = connect(u.toString());
    await h.migrate();
    await h.close();
    return name;
  })();
  return templateName;
}

export async function startHarness(opts: { confirmations?: number; tokens?: TokenSymbol[]; custody?: boolean; emailConfirmation?: boolean } = {}): Promise<Harness> {
  const chain = await startDevChain({ confirmations: opts.confirmations ?? 3, tokens: opts.tokens });
  // With TEST_DATABASE_URL set, each harness gets its own throwaway database on that Postgres server.
  const pgAdmin = process.env.TEST_DATABASE_URL;
  let dropDb: (() => Promise<void>) | undefined;
  let dbUrl = "pglite://memory";
  if (pgAdmin) {
    const tpl = await migratedTemplate(pgAdmin);
    const name = `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const admin = new pg.Client({ connectionString: pgAdmin });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${name} TEMPLATE ${tpl}`);
    await admin.end();
    const u = new URL(pgAdmin);
    u.pathname = `/${name}`;
    dbUrl = u.toString();
    dropDb = async () => {
      const a = new pg.Client({ connectionString: pgAdmin });
      await a.connect();
      await a.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await a.end();
    };
  }
  const handle = connect(dbUrl);
  if (!pgAdmin) await handle.migrate();
  const alerts = new MemoryAlertSink();
  const mail = new MemoryEmailSender();
  const clock = { offsetMs: 0 };

  const received: Harness["webhookSink"]["received"] = [];
  const sink: Harness["webhookSink"] = { server: undefined as never, url: "", received, status: 200 };
  sink.server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      received.push({ headers: req.headers as Record<string, string>, body });
      res.statusCode = sink.status;
      res.end("ok");
    });
  });
  await new Promise<void>((r) => sink.server.listen(0, "127.0.0.1", r));
  sink.url = `http://127.0.0.1:${(sink.server.address() as AddressInfo).port}/hook`;

  const engine = await createEngine({
    db: handle.db,
    logger: silentLogger,
    alerts,
    email: mail,
    // Tests mint "identity tokens" as JSON; the override returns them as-is (real verification is tested in web3auth.test.ts).
    config: { verifyIdentityToken: async (t: string) => JSON.parse(t), requireEmailConfirmation: opts.emailConfirmation ?? true, ...(opts.custody ? { custodyEnabled: true } : {}) },
    now: () => new Date(Date.now() + clock.offsetMs),
    env: { APP_SECRET_KEY: "11".repeat(32), ALLOW_PRIVATE_WEBHOOK_TARGETS: "true", PUBLIC_WEB_URL: "http://localhost:3000" },
    signers: { getSigner: (n) => (n === chain.network.id ? chain.accounts[1] : undefined), getCustodySigner: (n) => (opts.custody && n === chain.network.id ? chain.accounts[4] : undefined) },
    extraNetworks: [{ network: chain.network, deployment: chain.deployment, client: chain.publicClient }],
  });

  let n = 0;
  const h: Harness = {
    chain, handle, engine, alerts, mail, net: chain.network.id, clock, webhookSink: sink,
    async newMerchant(name = `Merchant ${++n}`) {
      const { merchantId } = await signup(engine, { business_name: name, email: `m${n}-${Math.random().toString(36).slice(2)}@example.com`, password: "correct horse battery staple" }, { type: "SYSTEM" });
      return { merchantId, environment: "test", actor: { type: "SYSTEM" }, role: "OWNER", via: "session" } as AuthContext;
    },
    async pump(rounds = 6, o = {}) {
      for (let i = 0; i < rounds; i++) {
        await chain.mine(o.mine ?? 1);
        await watcherTick(engine, chain.network.id);
        await relayerTick(engine, chain.network.id);
        await custodyTick(engine, chain.network.id);
        await processWebhookJobs(engine);
      }
    },
    async payUsdc(to, units, from = 3) {
      const owner = chain.accounts[from]!.address;
      await chain.mintUsdc(owner, units);
      const hash = await chain.walletFor(from).writeContract({ address: chain.usdc, abi: MockFiatTokenAbi, functionName: "transfer", args: [to, units], account: chain.accounts[from]!, chain: undefined });
      await chain.publicClient.waitForTransactionReceipt({ hash });
      return hash;
    },
    async payToken(symbol, to, units, from = 3) {
      const owner = chain.accounts[from]!.address;
      await chain.mintToken(symbol, owner, units);
      const hash = await chain.walletFor(from).writeContract({ address: chain.tokens[symbol]!, abi: MockFiatTokenAbi, functionName: "transfer", args: [to, units], account: chain.accounts[from]!, chain: undefined });
      await chain.publicClient.waitForTransactionReceipt({ hash });
      return hash;
    },
    async stop() {
      await chain.stop();
      sink.server.close();
      await handle.close();
      await dropDb?.();
    },
  };
  return h;
}

