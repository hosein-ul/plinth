/**
 * Everything an AI coding assistant needs to integrate Plinth. The same text feeds /llms.txt, /llms-full.txt and the
 * copy-to-clipboard prompts on /build-with-ai, so the three can never disagree. Facts come from docs/api-guide.md and
 * the generated OpenAPI document; nothing here describes a feature that does not exist.
 */
import { SITE_URL } from "@/lib/site";

export const API_FACTS = [
  "Base path /v1. Authenticate with `Authorization: Bearer sk_test_...` (test networks only today). Keys are shown once.",
  "Amounts are decimal strings in USDC (\"25.00\", at most 6 decimals). Never use floating point.",
  "Send an `Idempotency-Key` header on every create. The same key and body returns the original response.",
  "Create a payment with `POST /v1/payment-intents` ({\"amount\",\"order_reference\",\"success_url\"}). Redirect the customer to `checkout_url`.",
  "Never fulfil an order from a redirect. Fulfil from the signed webhook `payment.confirmed` (fast) or `payment.completed` (strict).",
  "Verify `Plinth-Signature: t=<unix>,v1=<hex>`: v1 = HMAC-SHA256(secret, \"<t>.<rawBody>\"). Reject if |now - t| > 300 s. Deduplicate on event.id.",
  "Read a payment with `GET /v1/payments/{id}` (timeline, transactions, settlements, refunds).",
  "The secret API key must stay on the server. Never put it in browser code or a Telegram Mini App bundle.",
] as const;

export const LLMS_TXT = `# Plinth

> Non-custodial USDC payment gateway. Customers pay with a wallet or to a unique per-payment address; funds settle into a vault only the merchant can withdraw from. Test networks only today; contracts are not yet independently audited.

## Docs
- [API guide](${SITE_URL}/llms-full.txt): authentication, creating payments, webhooks, refunds, in plain text
- OpenAPI 3.1 document: served by a running Plinth API at /v1/openapi.json (every endpoint and schema)
- [Build with AI](${SITE_URL}/build-with-ai): ready-made prompts for common projects

## Key facts
${API_FACTS.map((f) => `- ${f}`).join("\n")}

## Status
- Available: REST API, signed webhooks, payment links, invoices, hosted checkout, dashboard, sandbox on test networks.
- Planned, not built: MCP server, published SDKs, starter templates.
`;

export const LLMS_FULL = `# Plinth API guide (plain text for AI assistants)

${API_FACTS.map((f) => `- ${f}`).join("\n")}

## Take a payment
POST /v1/payment-intents
Headers: Authorization: Bearer sk_test_..., Idempotency-Key: order-1042, Content-Type: application/json
Body: {"amount":"25.00","order_reference":"order-1042","checkout_methods":["WALLET","ADDRESS"],"expires_in_seconds":3600,"success_url":"https://shop.example/thanks"}
Response includes: id, status, checkout_url, networks[].deposit_address.

Checkout offers two methods: pay with a connected wallet (one signature, no gas for the customer where the network supports it) or send USDC to a unique address (QR / copy). Partial payments add up.

## Webhook events
- payment.detected: transfer seen and verified, not final. Do not fulfil.
- payment.confirmed: final funds satisfy the amount. Fulfil (fast).
- payment.completed: funds confirmed inside the merchant vault. Fulfil (strict).
- payment.underpaid / payment.expired / payment.late: do not fulfil.
- payment.overpaid: excess received (excess_amount). Fulfil; the excess is refundable.
- payment.invalid_asset: a non-USDC token was sent and is ignored.
- settlement.submitted / completed / failed: sweep lifecycle, informational.
- refund.requested / refund.completed: refund lifecycle.

## Verify a webhook (Node.js)
import { createHmac, timingSafeEqual } from "node:crypto";
export function verify(rawBody: string, header: string, secret: string): boolean {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const expected = createHmac("sha256", secret).update(t + "." + rawBody).digest("hex");
  const given = Buffer.from(parts.v1 ?? "", "hex");
  const want = Buffer.from(expected, "hex");
  return given.length === want.length && timingSafeEqual(given, want);
}

## Other useful endpoints
GET /v1/payments, GET /v1/payments/{id}, POST /v1/payment-links, POST /v1/invoices, GET /v1/networks, POST /v1/refund-requests, POST /v1/webhook-endpoints.
Errors: {"error":{"type","code","message","request_id"}}. 400 validation, 401/403 auth, 404, 409 conflict, 422 semantic, 429 rate limited.
`;

export interface Scenario { id: string; label: string; blurb: string; prompt: string }

const COMMON_RULES = `Rules you must follow:
- Use only test credentials (sk_test_...). Read the key and the webhook secret from environment variables, never hard-code them, never expose them to the browser.
- Amounts are decimal strings, never floats. Send an Idempotency-Key on every create.
- Fulfil orders only from the verified webhook, never from a redirect or a client message.
- Verify the Plinth-Signature header on the RAW body before parsing, reject stale timestamps, and deduplicate by event id.
- Read the API reference first: ${SITE_URL}/llms-full.txt`;

const DONE = `Definition of done (test each item and show me the result):
1. A payment is created and I get a working checkout link.
2. I pay it on a test network and the order flips to paid, driven only by the webhook.
3. A webhook with a bad signature is rejected, and a replayed event is ignored.
4. A short README explains the environment variables and how to run it.`;

export const SCENARIOS: Scenario[] = [
  {
    id: "store",
    label: "Online store",
    blurb: "Checkout, order status and fulfilment for a shop.",
    prompt: `Build a minimal online store checkout that accepts USDC through Plinth.

Stack: use the framework already in this project (or Next.js with TypeScript if the folder is empty).
What to build:
- A cart page that, on "Pay", calls my server, which creates a payment with POST /v1/payment-intents (amount = cart total, order_reference = my order id, success_url = my thank-you page) and redirects the customer to checkout_url.
- A webhook route that verifies the signature, then marks the order paid on payment.confirmed.
- An order page that shows the live status from my own database.

${COMMON_RULES}

${DONE}`,
  },
  {
    id: "chat-bot",
    label: "Chat bot",
    blurb: "Take payments inside a Telegram or Discord bot.",
    prompt: `Build a chat bot that sells something for USDC through Plinth. Use the bot library already in this project, or grammY with TypeScript for Telegram if there is none.
What to build:
- A /buy command that shows the item and a "Pay 25 USDC" button. The button opens the Plinth checkout_url created for this user (order_reference = chat id + item id).
- A webhook route that verifies the signature and, on payment.confirmed, messages the buyer "Payment received" and delivers the item or grants access (for example an invite link to a private channel).
- A /status command that reads GET /v1/payments/{id}.
Do not put the Plinth secret key anywhere a user or a client bundle could read it.

${COMMON_RULES}

${DONE}`,
  },
  {
    id: "subscription",
    label: "Paid access",
    blurb: "Charge for a membership, channel or course.",
    prompt: `Build paid access (a membership or course) that is paid in USDC through Plinth.
What to build:
- A page with the price and a "Join" button that creates a payment (order_reference = user id + plan) and redirects to checkout_url.
- A webhook route that, on payment.confirmed, grants access for 30 days and stores the expiry.
- A daily job that revokes expired access and sends the member a renewal link (a new payment).
- An admin view listing members, their expiry and their last payment id.

${COMMON_RULES}

${DONE}`,
  },
  {
    id: "invoices",
    label: "Invoices",
    blurb: "Send numbered invoices and track who has paid.",
    prompt: `Build a small invoicing tool that collects USDC through Plinth.
What to build:
- A form to create an invoice (client, line items, due date). On save, call POST /v1/invoices or POST /v1/payment-intents with the total, and store the returned id and checkout link.
- A shareable invoice page with a "Pay now" button that goes to the checkout link.
- A webhook route that marks the invoice paid on payment.confirmed, and shows partial payments from payment.underpaid.
- A list of invoices with status: draft, sent, partially paid, paid, overdue.

${COMMON_RULES}

${DONE}`,
  },
];
