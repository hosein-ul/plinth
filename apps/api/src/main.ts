import { connect } from "@plinth/db";
import { createEngine, consoleLogger } from "@plinth/engine";
import { buildServer } from "./server";
import { buildOpenApi } from "./openapi";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (databaseUrl.startsWith("pglite://")) {
  console.warn("DATABASE_URL points at embedded PGlite: the worker must run in the same process (use `pnpm dev:stack`).");
}

const handle = connect(databaseUrl);
if (process.env.RUN_MIGRATIONS === "true") await handle.migrate();

const engine = await createEngine({ db: handle.db, logger: consoleLogger });
const { app, routes } = await buildServer(engine, {
  adminToken: process.env.ADMIN_API_TOKEN,
  corsOrigins: (process.env.CORS_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  trustProxy: process.env.TRUST_PROXY === "true",
  logger: true,
});
app.get("/v1/openapi.json", async () => buildOpenApi(routes, process.env.PUBLIC_API_URL));

const port = Number(process.env.API_PORT ?? 4000);
await app.listen({ port, host: process.env.API_HOST ?? "0.0.0.0" });
for (const s of ["SIGINT", "SIGTERM"] as const) {
  process.on(s, async () => {
    await app.close();
    await handle.close();
    process.exit(0);
  });
}
