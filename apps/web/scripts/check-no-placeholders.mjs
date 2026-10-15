#!/usr/bin/env node
/**
 * No placeholders in the site's code:  pnpm --filter @plinth/web check:placeholders   (also runs before `build`)
 *
 * Every address and link the site shows must come from configuration (src/lib/config.ts) or be a real value. This fails (exit 1)
 * when apps/web/src contains, outside tests and the clearly labelled demo area (app/demo, lib/demo-data, lib/demo-source):
 *
 *   - `localhost` or a loopback address       (a dev fallback shipped to production)
 *   - a `.example` host                        (a made-up domain)
 *   - a `.invalid` host                        (except the backend's own wallet-identity marker `sso.plinth.invalid`)
 *   - `your-...`                               (a placeholder such as your-plinth-api)
 *   - `sk_live_`                               (a live-key literal)
 *
 * Code samples that need the visitor's own domain use an obviously marked token such as YOUR_DOMAIN or ORDER_ID.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL("..", import.meta.url)), "src");
const rel = (p) => relative(root, p).split(sep).join("/");
const isExempt = (f) => /(^|\/)(__tests__|test|tests)\//.test(f) || /\.(test|spec)\.[tj]sx?$/.test(f) || f.startsWith("app/demo/") || f === "lib/demo-data.ts" || f === "lib/demo-source.ts";

const RULES = [
  [/localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]/, "localhost or a loopback address"],
  [/\.example\b/, "a .example host"],
  [/\.invalid\b/, "a .invalid host"],
  [/\byour-[a-z]/, "a your-... placeholder"],
  [/sk_live_/, "an sk_live_ literal"],
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|jsx|mjs|css|json)$/.test(name)) out.push(p);
  }
  return out;
}

const problems = [];
for (const file of walk(root)) {
  const f = rel(file);
  if (isExempt(f)) continue;
  readFileSync(file, "utf8").split("\n").forEach((line, i) => {
    const text = line.replaceAll("sso.plinth.invalid", "").replaceAll("sso\\.plinth\\.invalid", "");
    for (const [re, what] of RULES) if (re.test(text)) problems.push(`${f}:${i + 1}  ${what}: ${line.trim().slice(0, 140)}`);
  });
}

if (problems.length) {
  console.error(`Placeholder check failed (${problems.length}):\n` + problems.map((p) => "  " + p).join("\n"));
  console.error("\nUse the values from src/lib/config.ts, a real value, or an obvious token such as YOUR_DOMAIN.");
  process.exit(1);
}
console.log("Placeholder check passed: no localhost, .example, .invalid, your-... or sk_live_ in the site's code.");
