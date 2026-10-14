// Node 18+, no dependencies. Receives Plinth webhooks, verifies them, and acts once per event.
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

const SECRET = process.env.PLINTH_WEBHOOK_SECRET;
const seen = new Set(); // use a database table in production, so a restart cannot cause a double delivery

export function verify(rawBody, header, secret = SECRET, now = Math.floor(Date.now() / 1000)) {
  const parts = Object.fromEntries((header ?? "").split(",").map((p) => p.split("=")));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || !parts.v1 || Math.abs(now - t) > 300) return false;
  const want = Buffer.from(createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex"), "hex");
  const got = Buffer.from(parts.v1, "hex");
  return got.length === want.length && timingSafeEqual(got, want);
}

export function onPaid(orderReference) {
  console.log("paid:", orderReference); // mark the order paid and fulfil it here
}

createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/webhooks/plinth") return res.writeHead(404).end();
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8"); // verify the raw bytes, before any JSON parsing
  if (!verify(raw, req.headers["plinth-signature"])) return res.writeHead(401).end();
  const event = JSON.parse(raw);
  if (!seen.has(event.id)) {
    seen.add(event.id);
    if (event.type === "payment.confirmed") onPaid(event.data.object.order_reference);
  }
  res.writeHead(200).end(); // a non-2xx makes Plinth retry later
}).listen(Number(process.env.PORT ?? 8788));
