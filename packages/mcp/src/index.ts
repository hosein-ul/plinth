import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { INTEGRATION_PLAYBOOK, WEBHOOK_VERIFY_NODE } from "@plinth/shared";

export interface PlinthMcpOptions {
  apiUrl: string;
  /** An sk_test_ key. Live keys are refused: mainnet is not available and an assistant must not move real funds. */
  apiKey: string;
  fetchImpl?: typeof fetch;
}

const ok = (value: unknown) => ({ content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] });
const fail = (message: string) => ({ isError: true, content: [{ type: "text" as const, text: message }] });

const amount = z.string().regex(/^\d{1,12}(\.\d{1,6})?$/).describe('USDC amount as a decimal string, for example "25.00". Never a number.');

/**
 * A Model Context Protocol server that lets an AI assistant create and check TEST payments on Plinth, and read the integration
 * playbook, so "add USDC checkout to my project" can be done end to end in plain English.
 */
export function createPlinthMcpServer(opts: PlinthMcpOptions): McpServer {
  if (!opts.apiKey.startsWith("sk_test_")) throw new Error("PLINTH_API_KEY must be an sk_test_ key. Plinth runs on test networks only.");
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

  const server = new McpServer({ name: "plinth", version: "0.1.0" });

  server.registerTool("get_integration_playbook", {
    title: "How to add Plinth to a project",
    description: "Read this first. Step-by-step instructions for adding Plinth USDC checkout to an existing app or site, with the rules to follow.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => ok(INTEGRATION_PLAYBOOK));

  server.registerTool("get_webhook_verifier", {
    title: "Webhook signature verifier (Node.js)",
    description: "Code that verifies the Plinth-Signature header on the raw request body. Adapt it to the project's language.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => ok(WEBHOOK_VERIFY_NODE));

  server.registerTool("create_payment", {
    title: "Create a test payment",
    description: "Create a payment for one order. Returns a checkout_url to send the customer to. Use the real order total, computed on the server.",
    inputSchema: {
      amount,
      order_reference: z.string().max(200).describe("Your own order id").optional(),
      description: z.string().max(500).optional(),
      success_url: z.string().url().optional(),
      cancel_url: z.string().url().optional(),
      idempotency_key: z.string().min(1).max(200).describe("Reuse the same key to get the same payment back, for example order id + attempt").optional(),
    },
  }, async ({ idempotency_key, ...body }) => {
    try { return ok(await call("POST", "/v1/payment-intents", body, idempotency_key ?? body.order_reference)); } catch (e) { return fail((e as Error).message); }
  });

  server.registerTool("get_payment", {
    title: "Get a payment",
    description: "Read one payment with its status, timeline, transactions, settlements and refunds.",
    inputSchema: { id: z.string().min(1).describe("The payment id, for example pi_...") },
    annotations: { readOnlyHint: true },
  }, async ({ id }) => {
    try { return ok(await call("GET", `/v1/payments/${encodeURIComponent(id)}`)); } catch (e) { return fail((e as Error).message); }
  });

  server.registerTool("list_payments", {
    title: "List payments",
    description: "List recent payments, newest first. Use it to check that a test payment arrived.",
    inputSchema: { limit: z.number().int().min(1).max(100).default(20).optional() },
    annotations: { readOnlyHint: true },
  }, async ({ limit }) => {
    try { return ok(await call("GET", `/v1/payments?limit=${limit ?? 20}`)); } catch (e) { return fail((e as Error).message); }
  });

  server.registerTool("create_payment_link", {
    title: "Create a fixed-price payment link",
    description: "Create a reusable link for ONE fixed price (a donation, a single service). Not for a shop: for per-order totals use create_payment from the app's server.",
    inputSchema: { name: z.string().min(1).max(120), amount, description: z.string().max(500).optional() },
  }, async (body) => {
    try { return ok(await call("POST", "/v1/payment-links", body)); } catch (e) { return fail((e as Error).message); }
  });

  server.registerTool("list_networks", {
    title: "List networks",
    description: "The networks this account can accept USDC on, and whether each is enabled.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => {
    try { return ok(await call("GET", "/v1/networks")); } catch (e) { return fail((e as Error).message); }
  });

  return server;
}
