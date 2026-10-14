import { describe, expect, it } from "vitest";
import { handleWebhook, makeReference, parseReference } from "../src/handler";
import { createPayment, sign, verifySignature } from "../src/plinth";

const SECRET = "whsec_test";
const T = 1_800_000_000;
const event = (type: string, ref: string | null = makeReference(42, "access"), id = "evt_1") =>
  JSON.stringify({ id, object: "event", type, data: { object: { id: "pi_1", order_reference: ref } } });

type Deps = Parameters<typeof handleWebhook>[2];
function deps(over: Partial<Deps> = {}) {
  const paid: { chatId: number; sku: string }[] = [];
  const seen = new Set<string>();
  const d: Deps = {
    secret: SECRET,
    now: () => T,
    firstSight: async (id) => !seen.has(id) && !!seen.add(id),
    onPaid: async (b) => void paid.push(b),
    ...over,
  };
  return { paid, d };
}

describe("signature", () => {
  it("accepts a valid one and rejects tampering, a wrong secret and a stale timestamp", () => {
    const body = event("payment.confirmed");
    expect(verifySignature(SECRET, body, sign(SECRET, body, T), T)).toBe(true);
    expect(verifySignature(SECRET, body + " ", sign(SECRET, body, T), T)).toBe(false);
    expect(verifySignature("other", body, sign(SECRET, body, T), T)).toBe(false);
    expect(verifySignature(SECRET, body, sign(SECRET, body, T - 301), T)).toBe(false);
    expect(verifySignature(SECRET, body, undefined, T)).toBe(false);
  });
});

describe("webhook handler", () => {
  it("delivers once on payment.confirmed, even if the event is replayed", async () => {
    const { paid, d } = deps();
    const body = event("payment.confirmed");
    expect(await handleWebhook(body, sign(SECRET, body, T), d)).toBe(200);
    expect(await handleWebhook(body, sign(SECRET, body, T), d)).toBe(200);
    expect(paid).toEqual([{ chatId: 42, sku: "access" }]);
  });

  it("ignores events that are not safe to fulfil on", async () => {
    const { paid, d } = deps();
    for (const [i, type] of ["payment.detected", "payment.underpaid", "payment.expired"].entries()) {
      const body = event(type, makeReference(42, "access"), `evt_${i}`);
      expect(await handleWebhook(body, sign(SECRET, body, T), d)).toBe(200);
    }
    expect(paid).toHaveLength(0);
  });

  it("rejects a bad signature with 401 and never delivers", async () => {
    const { paid, d } = deps();
    expect(await handleWebhook(event("payment.confirmed"), "t=1,v1=00", d)).toBe(401);
    expect(paid).toHaveLength(0);
  });

  it("does not swallow a delivery error, so the server can answer 500 and Plinth retries", async () => {
    const { d } = deps({ onPaid: async () => { throw new Error("chat service down"); } });
    const body = event("payment.confirmed");
    await expect(handleWebhook(body, sign(SECRET, body, T), d)).rejects.toThrow("chat service down");
  });

  it("ignores payments that did not come from this bot", async () => {
    const { paid, d } = deps();
    const body = event("payment.confirmed", "order-1042");
    expect(await handleWebhook(body, sign(SECRET, body, T), d)).toBe(200);
    expect(paid).toHaveLength(0);
  });
});

describe("references and payment creation", () => {
  it("round-trips a chat reference, including a negative group id", () => {
    expect(parseReference(makeReference(-100123, "access"))).toEqual({ chatId: -100123, sku: "access" });
    expect(parseReference("order-1")).toBeNull();
  });

  it("sends the secret only as a bearer header, with an idempotency key and a decimal-string amount", async () => {
    let seen: RequestInit | undefined;
    let url = "";
    const f = (async (u: string, init: RequestInit) => {
      url = u;
      seen = init;
      return new Response(JSON.stringify({ id: "pi_1", status: "AWAITING_PAYMENT", checkout_url: "https://pay/x", order_reference: "r" }), { status: 201 });
    }) as unknown as typeof fetch;
    const p = await createPayment({ apiUrl: "http://api/", secretKey: "sk_test_abc" }, { amount: "25.00", orderReference: "tg:1:access", idempotencyKey: "k1" }, f);
    expect(p.checkout_url).toBe("https://pay/x");
    expect(url).toBe("http://api/v1/payment-intents");
    const h = seen!.headers as Record<string, string>;
    expect(h.authorization).toBe("Bearer sk_test_abc");
    expect(h["idempotency-key"]).toBe("k1");
    expect(JSON.parse(String(seen!.body)).amount).toBe("25.00");
    expect(String(seen!.body)).not.toContain("sk_test");
  });
});
