import { verifySignature } from "./plinth";

/** Order references look like `tg:<chatId>:<sku>`; the prefix keeps them apart from other sales channels. */
export const makeReference = (chatId: number, sku: string) => `tg:${chatId}:${sku}`;
export function parseReference(ref: string | null | undefined): { chatId: number; sku: string } | null {
  const m = /^tg:(-?\d+):([\w-]+)$/.exec(ref ?? "");
  return m ? { chatId: Number(m[1]), sku: m[2]! } : null;
}

export interface WebhookDeps {
  secret: string;
  /** Returns true the first time an event id is seen. Back this with a database in production. */
  firstSight(eventId: string): Promise<boolean>;
  /** Deliver the product or open access. Must be safe to call twice. */
  onPaid(buyer: { chatId: number; sku: string }, paymentId: string): Promise<void>;
  now?: () => number;
}

/** Returns the HTTP status to send back. A thrown error or a non-2xx makes Plinth retry later. */
export async function handleWebhook(rawBody: string, signature: string | undefined, d: WebhookDeps): Promise<number> {
  if (!verifySignature(d.secret, rawBody, signature, d.now?.())) return 401;
  let event: { id?: string; type?: string; data?: { object?: { id?: string; order_reference?: string | null } } };
  try { event = JSON.parse(rawBody); } catch { return 400; }
  if (!event.id || !event.type) return 400;
  if (!(await d.firstSight(event.id))) return 200; // a replay: already handled
  // payment.confirmed is the fast signal, payment.completed the strict one. This template acts on confirmed.
  if (event.type === "payment.confirmed") {
    const obj = event.data?.object;
    const buyer = parseReference(obj?.order_reference);
    if (buyer && obj?.id) await d.onPaid(buyer, obj.id);
  }
  return 200;
}
