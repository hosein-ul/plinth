import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import pg from "pg";
import * as schema from "./schema";

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
/** A database handle or an open transaction: both expose the same query-builder surface. */
export type Executor = Pick<Database, "select" | "insert" | "update" | "delete" | "execute" | "transaction">;

export interface DbHandle {
  db: Database;
  kind: "postgres" | "pglite";
  migrate(): Promise<void>;
  close(): Promise<void>;
}

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "..", "drizzle");

/**
 * DATABASE_URL forms:
 *   postgres://user:pass@host:5432/db   production / docker compose (separate api + worker processes)
 *   pglite://memory                     tests
 *   pglite://./.data/dev                embedded Postgres (WASM) for single-process local dev
 * PGlite is real Postgres semantics but single-connection, single-process.
 */
export function connect(url: string): DbHandle {
  if (url.startsWith("pglite://")) {
    const target = url.slice("pglite://".length);
    const client = new PGlite(target === "memory" || target === "" ? undefined : target);
    const db = drizzlePglite(client, { schema }) as unknown as Database;
    return {
      db,
      kind: "pglite",
      migrate: () => migratePglite(db as never, { migrationsFolder }),
      close: () => client.close(),
    };
  }
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  // An idle client dropped by the server or a proxy emits 'error'; unhandled, it would kill the process.
  pool.on("error", (err) => console.error("[db] idle client error:", err.message));
  const db = drizzlePg(pool, { schema }) as unknown as Database;
  return {
    db,
    kind: "postgres",
    migrate: () => migratePg(db as never, { migrationsFolder }),
    close: () => pool.end(),
  };
}

export { schema };
