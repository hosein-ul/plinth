import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { INTEGRATION_PLAYBOOK, WEBHOOK_VERIFY_NODE } from "@plinth/shared";

export interface PlinthMcpOptions {
  /** Base URL of the Plinth API the tools call. */
  apiUrl: string;
  /** A Plinth secret API key (`sk_test_...` on test networks, `sk_live_...` where mainnet is enabled). Rights are the key's own. */
  apiKey: string;
  fetchImpl?: typeof fetch;
}

const ok = (value: unknown) => ({ content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] });
const fail = (message: string) => ({ isError: true, content: [{ type: "text" as const, text: message }] });

const amount = z.string().regex(/^\d{1,12}(\.\d{1,6})?$/).describe('Amount in the payment token (USDC unless currency says otherwise) as a decimal string, for example "25.00". Never a number.');
const currency = z.enum(["USDC", "EURC"]).optional().describe("The token to be paid in. Defaults to USDC. EURC is available on Arc only.");
const limit = z.number().int().min(1).max(100).default(20).optional().describe("How many rows to return (1 to 100).");
const id = (what: string) => z.string().min(1).describe(`The ${what} id`);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/).describe("An EVM address (0x followed by 40 hex characters)");

const PROMPT = `Add Plinth payments to THIS project. Do not create a new project and do not make payment links by hand.

First call the get_integration_playbook tool and follow it exactly. Inspect the project, say what you found, then add server-side code that creates a payment per order with the real total (computed on the server), a webhook route that verifies the Plinth-Signature on the raw body, and an order status page that reads from your own database. Test with a test key: a real order total is charged, the order flips to paid from the webhook only, a bad signature is rejected, a replayed event is ignored.`;

/**
 * The Plinth MCP server: an AI assistant can add Plinth checkout to an existing project, create and read payments, links and
 * invoices, record refunds, manage webhooks and read reports. It is a client of the REST API and has exactly the rights of the
 * API key it is given. There is deliberately no tool that changes where money goes (payout wallets, vaults, custody
 * withdrawals), creates keys or changes the team: those need a signed-in person.
 */
export function createPlinthMcpServer(opts: PlinthMcpOptions): McpServer {
  if (!/^sk_(test|live)_/.test(opts.apiKey)) throw new Error("The API key must be a Plinth secret key (sk_test_... or sk_live_...).");
  const base = opts.apiUrl.replace(/\/$/, "");
  const f = opts.fetchImpl ?? fetch;

  async function call(method: string, path: string, body?: unknown, idempotencyKey?: string) {
    const res = await f(`${base}${path}`, {
      method,
      headers: { authorization: `Bearer ${opts.apiKey}`, "content-type": "application/json", ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: unknown = text;
    try { json = JSON.parse(text); } catch { /* keep the text */ }
    if (!res.ok) throw new Error(`Plinth ${res.status}: ${typeof json === "string" ? json.slice(0, 300) : JSON.stringify((json as { error?: unknown }).error ?? json).slice(0, 300)}`);
    return json;
  }
  const run = async (fn: () => Promise<unknown>) => { try { return ok(await fn()); } catch (e) { return fail((e as Error).message); } };
  const qs = (o: Record<string, string | number | undefined>) => {
    const p = Object.entries(o).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
    return p.length ? `?${p.join("&")}` : "";
  };

  const server = new McpServer({ name: "plinth", version: "1.0.0" }, {
    instructions: "Plinth is a non-custodial stablecoin payment gateway. Call get_integration_playbook first when adding checkout to a project. Amounts are decimal strings. Fulfil orders only from a verified webhook, never from a redirect.",
  });

  // ------------------------------------------------------------------ guidance
  server.registerTool("get_integration_playbook", {
    title: "How to add Plinth to a project",
    description: "Read this first. Step-by-step instructions for adding Plinth checkout to an existing app or site, with the rules to follow.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => ok(INTEGRATION_PLAYBOOK));

  server.registerTool("get_webhook_verifier", {
    title: "Webhook signature verifier (Node.js)",
    description: "Code that verifies the Plinth-Signature header on the raw request body. Adapt it to the project's language.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => ok(WEBHOOK_VERIFY_NODE));

  // ------------------------------------------------------------------ account and networks
  server.registerTool("get_account", {
    title: "Who this key belongs to",
    description: "The merchant and environment (test or live) the API key acts for, and its rights.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => run(() => call("GET", "/v1/me")));

  server.registerTool("list_networks", {
    title: "List networks",
    description: "The networks and tokens (USDC, and EURC on Arc) this account can accept, whether each is enabled, the vault status and the platform fee that applies.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => run(() => call("GET", "/v1/networks")));

  // ------------------------------------------------------------------ payments
  server.registerTool("create_payment", {
    title: "Create a payment",
    description: "Create a payment for one order. Returns a checkout_url to send the customer to. Use the real order total, computed on the server. Payable for 20 minutes unless the merchant default says otherwise.",
    inputSchema: {
      amount,
      currency,
      order_reference: z.string().max(200).describe("Your own order id").optional(),
      description: z.string().max(500).optional(),
      customer_email: z.string().email().optional(),
      success_url: z.string().url().optional(),
      cancel_url: z.string().url().optional(),
      expires_in_seconds: z.number().int().min(300).max(2_592_000).describe("How long the payment stays payable (300 to 2592000)").optional(),
      metadata: z.record(z.string(), z.string()).describe("Up to 20 string key/value pairs echoed back in webhooks").optional(),
      idempotency_key: z.string().min(1).max(200).describe("Reuse the same key to get the same payment back, for example order id + attempt").optional(),
    },
  }, async ({ idempotency_key, ...body }) => run(() => call("POST", "/v1/payment-intents", body, idempotency_key ?? body.order_reference)));

  server.registerTool("get_payment", {
    title: "Get a payment",
    description: "Read one payment with its status, timeline, transactions, settlements, refunds, fee and net amounts, and payout route.",
    inputSchema: { id: id("payment (pi_...)") },
    annotations: { readOnlyHint: true },
  }, async ({ id: pid }) => run(() => call("GET", `/v1/payments/${encodeURIComponent(pid)}`)));

  server.registerTool("list_payments", {
    title: "List payments",
    description: "List recent payments, newest first. Optionally filter by status (for example SETTLED, AWAITING_PAYMENT, EXPIRED, UNDERPAID, OVERPAID, INVALID_ASSET, SETTLEMENT_FAILED).",
    inputSchema: { limit, status: z.string().describe("One status, or several separated by commas").optional() },
    annotations: { readOnlyHint: true },
  }, async ({ limit: n, status }) => run(() => call("GET", `/v1/payments${qs({ limit: n ?? 20, status })}`)));

  // ------------------------------------------------------------------ payment links
  server.registerTool("create_payment_link", {
    title: "Create a fixed-price payment link",
    description: "Create a reusable link for ONE fixed price (a donation, a single service). Not for a shop: for per-order totals use create_payment from the app's server.",
    inputSchema: { name: z.string().min(1).max(120), amount, currency, description: z.string().max(500).optional() },
  }, async (body) => run(() => call("POST", "/v1/payment-links", body)));

  server.registerTool("list_payment_links", {
    title: "List payment links",
    description: "List payment links with their URL, amount, token and whether they are active.",
    inputSchema: { limit },
    annotations: { readOnlyHint: true },
  }, async ({ limit: n }) => run(() => call("GET", `/v1/payment-links${qs({ limit: n ?? 20 })}`)));

  server.registerTool("get_payment_link", {
    title: "Get a payment link",
    description: "Read one payment link.",
    inputSchema: { id: id("payment link") },
    annotations: { readOnlyHint: true },
  }, async ({ id: lid }) => run(() => call("GET", `/v1/payment-links/${encodeURIComponent(lid)}`)));

  server.registerTool("set_payment_link_active", {
    title: "Pause or resume a payment link",
    description: "Turn a payment link off (visitors see it is unavailable) or on again.",
    inputSchema: { id: id("payment link"), active: z.boolean() },
  }, async ({ id: lid, active }) => run(() => call("PATCH", `/v1/payment-links/${encodeURIComponent(lid)}`, { active })));

  // ------------------------------------------------------------------ invoices
  server.registerTool("create_invoice", {
    title: "Create an invoice",
    description: "Create a numbered invoice with exact line-item totals. The customer pays the total from its checkout page.",
    inputSchema: {
      customer_name: z.string().min(1).max(200),
      customer_email: z.string().email(),
      line_items: z.array(z.object({ description: z.string().min(1).max(300), quantity: z.number().int().min(1).max(100000).default(1), unit_amount: amount })).min(1).max(100),
      currency,
      memo: z.string().max(1000).optional(),
      due_in_days: z.number().int().min(1).max(90).default(14).optional(),
      idempotency_key: z.string().min(1).max(200).optional(),
    },
  }, async ({ idempotency_key, ...body }) => run(() => call("POST", "/v1/invoices", body, idempotency_key)));

  server.registerTool("list_invoices", {
    title: "List invoices",
    description: "List invoices, newest first, with their payment status.",
    inputSchema: { limit },
    annotations: { readOnlyHint: true },
  }, async ({ limit: n }) => run(() => call("GET", `/v1/invoices${qs({ limit: n ?? 20 })}`)));

  server.registerTool("get_invoice", {
    title: "Get an invoice",
    description: "Read one invoice with its line items and payment.",
    inputSchema: { id: id("invoice (inv_...)") },
    annotations: { readOnlyHint: true },
  }, async ({ id: iid }) => run(() => call("GET", `/v1/invoices/${encodeURIComponent(iid)}`)));

  // ------------------------------------------------------------------ refunds (the merchant sends the money; Plinth verifies it)
  server.registerTool("request_refund", {
    title: "Record a refund request",
    description: "Record that a payment should be refunded. This moves no money: the merchant sends the transfer from the account that received the funds (vault or payout wallet) and then attaches its transaction hash with submit_refund_proof. At most the net amount (after the platform fee) can be refunded.",
    inputSchema: { payment_intent_id: id("payment (pi_...)"), amount, recipient: address, reason: z.string().max(500).optional() },
  }, async (body) => run(() => call("POST", "/v1/refund-requests", body)));

  server.registerTool("submit_refund_proof", {
    title: "Attach the refund transaction",
    description: "Give the transaction hash of the refund transfer. The refund completes only after the receipt is verified on-chain: right token, from the right account, to the recipient, for exactly that amount.",
    inputSchema: { id: id("refund request"), tx_hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) },
  }, async ({ id: rid, tx_hash }) => run(() => call("POST", `/v1/refund-requests/${encodeURIComponent(rid)}/proof`, { tx_hash })));

  server.registerTool("list_refunds", {
    title: "List refund requests",
    description: "List refund requests and their status.",
    inputSchema: { limit },
    annotations: { readOnlyHint: true },
  }, async ({ limit: n }) => run(() => call("GET", `/v1/refund-requests${qs({ limit: n ?? 20 })}`)));

  server.registerTool("get_refund", {
    title: "Get a refund request",
    description: "Read one refund request, including where it must be sent from.",
    inputSchema: { id: id("refund request") },
    annotations: { readOnlyHint: true },
  }, async ({ id: rid }) => run(() => call("GET", `/v1/refund-requests/${encodeURIComponent(rid)}`)));

  // ------------------------------------------------------------------ webhooks
  server.registerTool("list_webhook_endpoints", {
    title: "List webhook endpoints",
    description: "List the URLs that receive signed events.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => run(() => call("GET", "/v1/webhook-endpoints")));

  server.registerTool("create_webhook_endpoint", {
    title: "Create a webhook endpoint",
    description: "Register an https URL to receive signed events (for example payment.confirmed and payment.completed). The signing secret (whsec_...) is returned ONCE: store it as PLINTH_WEBHOOK_SECRET on the server and never print it.",
    inputSchema: { url: z.string().url().max(2000), events: z.array(z.string()).min(1).default(["*"]).optional(), description: z.string().max(200).optional() },
  }, async (body) => run(() => call("POST", "/v1/webhook-endpoints", body)));

  server.registerTool("delete_webhook_endpoint", {
    title: "Delete a webhook endpoint",
    description: "Stop sending events to an endpoint.",
    inputSchema: { id: id("webhook endpoint") },
  }, async ({ id: wid }) => run(() => call("DELETE", `/v1/webhook-endpoints/${encodeURIComponent(wid)}`)));

  server.registerTool("list_webhook_deliveries", {
    title: "List webhook deliveries",
    description: "Recent webhook deliveries with their status, to debug an integration. Use retry_webhook_delivery to resend one.",
    inputSchema: { limit },
    annotations: { readOnlyHint: true },
  }, async ({ limit: n }) => run(() => call("GET", `/v1/webhook-deliveries${qs({ limit: n ?? 20 })}`)));

  server.registerTool("retry_webhook_delivery", {
    title: "Retry a webhook delivery",
    description: "Send a failed delivery again.",
    inputSchema: { id: id("webhook delivery") },
  }, async ({ id: did }) => run(() => call("POST", `/v1/webhook-deliveries/${encodeURIComponent(did)}/retry`)));

  // ------------------------------------------------------------------ reports (read only)
  server.registerTool("get_overview", {
    title: "Dashboard figures",
    description: "Received (final), pending, platform fee, refunded and settled amounts, counts and daily totals for one token. Received and settled are different facts and are reported separately.",
    inputSchema: { days: z.number().int().min(1).max(365).default(30).optional(), currency },
    annotations: { readOnlyHint: true },
  }, async ({ days, currency: cur }) => run(() => call("GET", `/v1/overview${qs({ days, currency: cur })}`)));

  server.registerTool("list_transactions", {
    title: "List on-chain transactions",
    description: "Transfers detected and settled, with their chain, hash, finality and token.",
    inputSchema: { limit },
    annotations: { readOnlyHint: true },
  }, async ({ limit: n }) => run(() => call("GET", `/v1/transactions${qs({ limit: n ?? 20 })}`)));

  server.registerTool("list_settlements", {
    title: "List settlements",
    description: "Sweeps that delivered payments to the vault, payout wallet or custody, with amount, fee and net.",
    inputSchema: { limit },
    annotations: { readOnlyHint: true },
  }, async ({ limit: n }) => run(() => call("GET", `/v1/settlements${qs({ limit: n ?? 20 })}`)));

  server.registerTool("get_payout_methods", {
    title: "How the merchant is paid (read only)",
    description: "Per network: the payout mode (vault, direct wallet or custodial), the destination, the fee and any change waiting. Changing it needs a signed-in person and is not possible here.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => run(() => call("GET", "/v1/payout-methods")));

  server.registerTool("get_custody", {
    title: "Custody balances (read only)",
    description: "Where an operator enabled custodial payouts: the balance per network and token, pending withdrawals and the withdrawal wallet. Withdrawing needs a signed-in person.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => run(() => call("GET", "/v1/custody")));

  server.registerTool("get_settlement_policy", {
    title: "Settlement policy (read only)",
    description: "Underpayment and overpayment handling, the default expiry, and each vault's on-chain settlement rules.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => run(() => call("GET", "/v1/settlement-policy")));

  // ------------------------------------------------------------------ resources and prompts
  server.registerResource("integration-playbook", "plinth://playbook", {
    title: "Plinth integration playbook",
    description: "The same text get_integration_playbook returns.",
    mimeType: "text/markdown",
  }, async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: INTEGRATION_PLAYBOOK }] }));

  server.registerResource("webhook-verifier", "plinth://webhook-verifier", {
    title: "Webhook signature verifier (Node.js)",
    description: "The same text get_webhook_verifier returns.",
    mimeType: "text/plain",
  }, async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/plain", text: WEBHOOK_VERIFY_NODE }] }));

  server.registerPrompt("add_plinth_checkout", {
    title: "Add Plinth checkout to this project",
    description: "A ready prompt that adds server-side payments, a verified webhook and an order status page to the project you are in.",
  }, async () => ({ messages: [{ role: "user" as const, content: { type: "text" as const, text: PROMPT } }] }));

  return server;
}
