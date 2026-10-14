import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { connect, type DbHandle } from "@plinth/db";
import { MockFiatTokenAbi } from "@plinth/blockchain";
import { startDevChain, type DevChain } from "@plinth/blockchain/dev";
import type { Address } from "viem";
import pg from "pg";
import {
  MemoryAlertSink,
  createEngine,
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
  net: string;
  clock: { offsetMs: number };
  webhookSink: { server: Server; url: string; received: { headers: Record<string, string>; body: string }[]; status: number };
  newMerchant(name?: string): Promise<AuthContext>;
  /** One pass of watcher → relayer → webhook delivery. */
  pump(rounds?: number, opts?: { mine?: number }): Promise<void>;
  payUsdc(to: Address, units: bigint, from?: number): Promise<`0x${string}`>;
  stop(): Promise<void>;
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

export async function startHarness(opts: { confirmations?: number } = {}): Promise<Harness> {
  const chain = await startDevChain({ confirmations: opts.confirmations ?? 3 });
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
    now: () => new Date(Date.now() + clock.offsetMs),
    env: { APP_SECRET_KEY: "11".repeat(32), ALLOW_PRIVATE_WEBHOOK_TARGETS: "true", PUBLIC_WEB_URL: "http://localhost:3000" },
    signers: { getSigner: (n) => (n === chain.network.id ? chain.accounts[1] : undefined) },
    extraNetworks: [{ network: chain.network, deployment: chain.deployment, client: chain.publicClient }],
  });

  let n = 0;
  const h: Harness = {
    chain, handle, engine, alerts, net: chain.network.id, clock, webhookSink: sink,
    async newMerchant(name = `Merchant ${++n}`) {
      const { merchantId } = await signup(engine, { business_name: name, email: `m${n}-${Math.random().toString(36).slice(2)}@example.com`, password: "correct horse battery staple" }, { type: "SYSTEM" });
      return { merchantId, environment: "test", actor: { type: "SYSTEM" }, role: "OWNER", via: "session" } as AuthContext;
    },
    async pump(rounds = 6, o = {}) {
      for (let i = 0; i < rounds; i++) {
        await chain.mine(o.mine ?? 1);
        await watcherTick(engine, chain.network.id);
        await relayerTick(engine, chain.network.id);
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
    async stop() {
      await chain.stop();
      sink.server.close();
      await handle.close();
      await dropDb?.();
    },
  };
  return h;
}

