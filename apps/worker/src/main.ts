import { connect } from "@plinth/db";
import { consoleLogger, createEngine, startWorkerLoop } from "@plinth/engine";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (databaseUrl.startsWith("pglite://")) throw new Error("The worker needs a shared Postgres. Use `pnpm dev:stack` to run API and worker together on PGlite.");

const handle = connect(databaseUrl);
const engine = await createEngine({ db: handle.db, logger: consoleLogger });

const operational = [...engine.chains.values()].filter((c) => c.operational).map((c) => `${c.network.id}${c.signer ? "" : " (observe-only: no relayer key)"}`);
consoleLogger.info("worker started", { operational: operational.length ? operational : "none — check ENABLED_NETWORKS and deployments/" });
for (const c of engine.chains.values()) if (!c.operational) consoleLogger.info("network not operational", { network: c.network.id, reasons: c.gateReasons });

const loop = startWorkerLoop(engine, Number(process.env.WORKER_INTERVAL_MS ?? 2000));
for (const s of ["SIGINT", "SIGTERM"] as const) {
  process.on(s, async () => {
    consoleLogger.info("worker stopping", { signal: s });
    await loop.stop();
    await handle.close();
    process.exit(0);
  });
}
