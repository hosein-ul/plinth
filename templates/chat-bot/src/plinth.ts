import { createHmac, timingSafeEqual } from "node:crypto";

export interface PlinthConfig { apiUrl: string; secretKey: string }
export interface PaymentIntent { id: string; status: string; checkout_url: string; order_reference: string | null }

/** Create a payment. The idempotency key makes a double tap on the button return the same payment. */
export async function createPayment(cfg: PlinthConfig, input: { amount: string; orderReference: string; idempotencyKey: string }, fetchImpl: typeof fetch = fetch): Promise<PaymentIntent> {
  const res = await fetchImpl(`${cfg.apiUrl.replace(/\/$/, "")}/v1/payment-intents`, {
    method: "POST",
    headers: { authorization: `Bearer ${cfg.secretKey}`, "content-type": "application/json", "idempotency-key": input.idempotencyKey },
    body: JSON.stringify({ amount: input.amount, order_reference: input.orderReference, checkout_methods: ["WALLET", "ADDRESS"], expires_in_seconds: 3600 }),
  });
  if (!res.ok) throw new Error(`Plinth returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as PaymentIntent;
}

/** Plinth-Signature: t=<unix>,v1=<hex>, where v1 = HMAC-SHA256(secret, "<t>.<rawBody>"). */
export function verifySignature(secret: string, rawBody: string, header: string | undefined, nowSeconds = Math.floor(Date.now() / 1000), toleranceSeconds = 300): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || !parts.v1 || Math.abs(nowSeconds - t) > toleranceSeconds) return false;
  const want = Buffer.from(createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex"), "hex");
  const got = Buffer.from(parts.v1, "hex");
  return got.length === want.length && timingSafeEqual(got, want);
}

export function sign(secret: string, rawBody: string, t: number): string {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex")}`;
}
