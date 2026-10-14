// Runs every code example shown on the Developers page against a real API and checks what it does.
// Usage: PLINTH_API_URL=http://localhost:4000 PLINTH_SECRET_KEY=sk_test_... node scripts/test-doc-examples.mjs
import { spawn, spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "web", "content", "examples");
const { PLINTH_API_URL, PLINTH_SECRET_KEY } = process.env;
if (!PLINTH_API_URL || !PLINTH_SECRET_KEY) throw new Error("Set PLINTH_API_URL and PLINTH_SECRET_KEY");
let failed = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); if (!ok) failed++; };

// ---- create a payment, four ways
const sh = spawnSync("sh", [join(dir, "create-payment.sh")], { env: process.env, encoding: "utf8" });
let j; try { j = JSON.parse(sh.stdout); } catch { j = {}; }
check("create-payment.sh returns a checkout_url", /\/pay\/pi_/.test(j.checkout_url ?? ""), j.error?.message ?? "");

const { createPayment } = await import(pathToFileURL(join(dir, "create-payment.mjs")).href);
const n = await createPayment({ orderId: `doc-node-${Date.now()}`, total: "12.50" });
check("create-payment.mjs returns a checkout_url and the exact amount", /\/pay\/pi_/.test(n.checkout_url) && n.amount === "12.50" && n.amount_units === "12500000");

const py = spawnSync("python", ["-c", `import sys; sys.path.insert(0, r"${dir}"); from create_payment import create_payment; import json; print(json.dumps(create_payment("doc-py-${Date.now()}", "7.25")))`], { env: process.env, encoding: "utf8" });
let p; try { p = JSON.parse(py.stdout.trim().split("\n").pop()); } catch { p = {}; }
check("create_payment.py returns a checkout_url and the exact amount", /\/pay\/pi_/.test(p.checkout_url ?? "") && p.amount === "7.25", py.stderr.slice(-120));

const again = await createPayment({ orderId: "doc-idem-fixed", total: "3.00" });
const twice = await createPayment({ orderId: "doc-idem-fixed", total: "3.00" });
check("the same idempotency key returns the same payment", again.id === twice.id);

// ---- webhook receivers: valid, tampered, stale, replay
const secret = "whsec_doc_test";
const event = (id) => JSON.stringify({ id, object: "event", type: "payment.confirmed", data: { object: { id: "pi_1", order_reference: "order-1042" } } });
const sign = (body, t) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
async function post(port, body, header) { const r = await fetch(`http://127.0.0.1:${port}/webhooks/plinth`, { method: "POST", body, headers: header ? { "plinth-signature": header } : {} }); return r.status; }

for (const [label, cmd, args, port] of [["webhook-server.mjs", "node", [join(dir, "webhook-server.mjs")], 8788], ["webhook_server.py", "python", [join(dir, "webhook_server.py")], 8789]]) {
  const child = spawn(cmd, args, { env: { ...process.env, PLINTH_WEBHOOK_SECRET: secret, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });
  let out = ""; child.stdout.on("data", (d) => (out += d)); child.stderr.on("data", (d) => (out += d));
  await new Promise((r) => setTimeout(r, 2500));
  const now = Math.floor(Date.now() / 1000), body = event(`evt_${label}`);
  check(`${label}: a valid signature is accepted`, (await post(port, body, sign(body, now))) === 200);
  check(`${label}: a tampered body is rejected`, (await post(port, body + " ", sign(body, now))) === 401);
  check(`${label}: a stale timestamp is rejected`, (await post(port, body, sign(body, now - 400))) === 401);
  check(`${label}: a missing signature is rejected`, (await post(port, body)) === 401);
  await post(port, body, sign(body, now)); // replay
  await new Promise((r) => setTimeout(r, 300));
  check(`${label}: the order is marked paid exactly once, even on a replay`, (out.match(/paid: order-1042/g) ?? []).length === 1, `(${(out.match(/paid:/g) ?? []).length}x)`);
  child.kill();
}
console.log(failed ? `\n${failed} example check(s) failed` : "\nAll doc examples pass");
process.exit(failed ? 1 : 0);
