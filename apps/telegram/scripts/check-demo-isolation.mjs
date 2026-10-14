#!/usr/bin/env node
/**
 * Demo isolation check:  pnpm --filter @plinth/web check:demo-isolation
 *
 * The /demo dashboard renders sample data. That data must never be reachable from the real dashboard,
 * or a bug could show invented numbers to a paying merchant. This script fails (exit 1) when:
 *
 *  1. any file other than the allowed ones imports or requires lib/demo-data or lib/demo-source
 *     (this covers app/dashboard/**, components/**, lib/hooks, lib/data-source, shell, ...);
 *  2. the demo data/source modules reference the network, cookies, the API clients or wallets;
 *  3. files under app/demo import the API clients (the demo makes no API calls and reads no session).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL("..", import.meta.url)), "src");
const rel = (p) => relative(root, p).split(sep).join("/");

const DEMO_MODULES = ["lib/demo-data", "lib/demo-source"];
/** Files allowed to import the demo modules. */
const isAllowedImporter = (f) => f.startsWith("app/demo/") || DEMO_MODULES.some((m) => f === `${m}.ts`);
const isDemoModule = (f) => DEMO_MODULES.some((m) => f === `${m}.ts`);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

// import x from "…demo-data", export … from "…", require("…"), import("…")
const SPEC = /(?:from\s*|import\s*\(\s*|require\s*\(\s*|import\s+)["']([^"']+)["']/g;
const specifiers = (src) => [...src.matchAll(SPEC)].map((m) => m[1]);
const reachesDemo = (spec) => /(^|\/)demo-(data|source)(\.[tj]sx?)?$/.test(spec);

const problems = [];
for (const file of walk(root)) {
  const f = rel(file);
  const src = readFileSync(file, "utf8");
  const specs = specifiers(src);

  if (!isAllowedImporter(f)) {
    for (const s of specs) if (reachesDemo(s)) problems.push(`${f}: imports "${s}". Only app/demo/** may use the demo data.`);
  }
  if (isDemoModule(f)) {
    if (/\bfetch\s*\(|\bapiFetch\b|XMLHttpRequest|next\/headers|document\.cookie|\bcookies\s*\(/.test(src)) problems.push(`${f}: touches the network or cookies. The demo must be self-contained.`);
    for (const s of specs) if (/client-api|server-api|wagmi|viem/.test(s)) problems.push(`${f}: imports "${s}". The demo must not reach the API or a wallet.`);
  }
  if (f.startsWith("app/demo/")) {
    for (const s of specs) if (/client-api|server-api|next\/headers/.test(s)) problems.push(`${f}: imports "${s}". The demo makes no API calls and reads no session.`);
  }
}

if (problems.length) {
  console.error("Demo isolation check FAILED:\n" + problems.map((p) => `  - ${p}`).join("\n"));
  process.exit(1);
}
console.log("Demo isolation check passed: the real dashboard never imports the demo data.");
