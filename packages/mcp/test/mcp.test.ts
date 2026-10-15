import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createPlinthMcpServer } from "../src";

interface Seen { url: string; init: RequestInit }

async function connect(reply: (url: string) => Response) {
  const seen: Seen[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => { seen.push({ url, init }); return reply(url); }) as unknown as typeof fetch;
  const server = createPlinthMcpServer({ apiUrl: "http://api.test/", apiKey: "sk_test_abc", fetchImpl });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  return { client, seen };
}
const text = (r: unknown) => ((r as { content: { text: string }[] }).content[0]!.text);

describe("Plinth MCP server", () => {
  it("lists the tools an assistant needs", async () => {
    const { client } = await connect(() => new Response("{}"));
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "create_invoice", "create_payment", "create_payment_link", "create_webhook_endpoint", "delete_webhook_endpoint", "get_account", "get_custody", "get_integration_playbook", "get_invoice", "get_overview",
      "get_payment", "get_payment_link", "get_payout_methods", "get_refund", "get_settlement_policy", "get_webhook_verifier", "list_invoices", "list_networks", "list_payment_links", "list_payments",
      "list_refunds", "list_settlements", "list_transactions", "list_webhook_deliveries", "list_webhook_endpoints", "request_refund", "retry_webhook_delivery", "set_payment_link_active", "submit_refund_proof",
    ]);
    // Nothing here can change who gets paid, create keys, change the team or withdraw.
    for (const n of names) expect(n).not.toMatch(/payout_wallet|withdraw(?!al)|api_key|team|custody_withdraw|switch/);
  });

  it("serves the playbook, which tells the assistant to price on the server and fulfil from webhooks", async () => {
    const { client } = await connect(() => new Response("{}"));
    const t = text(await client.callTool({ name: "get_integration_playbook", arguments: {} }));
    expect(t).toMatch(/computed ON THE SERVER/);
    expect(t).toMatch(/Fulfil only from the verified webhook/);
  });

  it("creates a payment with the bearer key, a string amount and an idempotency key", async () => {
    const { client, seen } = await connect(() => new Response(JSON.stringify({ id: "pi_1", checkout_url: "https://pay/x" }), { status: 201 }));
    const r = await client.callTool({ name: "create_payment", arguments: { amount: "25.00", order_reference: "order-1", success_url: "https://shop.test/ok" } });
    expect(text(r)).toContain("https://pay/x");
    const call = seen[0]!;
    expect(call.url).toBe("http://api.test/v1/payment-intents");
    const h = call.init.headers as Record<string, string>;
    expect(h.authorization).toBe("Bearer sk_test_abc");
    expect(h["idempotency-key"]).toBe("order-1");
    expect(JSON.parse(String(call.init.body))).toEqual({ amount: "25.00", order_reference: "order-1", success_url: "https://shop.test/ok" });
  });

  it("rejects a numeric or malformed amount before calling the API", async () => {
    const { client, seen } = await connect(() => new Response("{}"));
    const r = await client.callTool({ name: "create_payment", arguments: { amount: "25.0000001" } }).catch((e) => e);
    const bad = (r as { isError?: boolean }).isError || r instanceof Error;
    expect(bad).toBe(true);
    expect(seen).toHaveLength(0);
  });

  it("reports an API error as a tool error instead of throwing", async () => {
    const { client } = await connect(() => new Response(JSON.stringify({ error: { code: "NO_VAULT", message: "Create a vault first" } }), { status: 409 }));
    const r = await client.callTool({ name: "create_payment", arguments: { amount: "5.00" } });
    expect((r as { isError?: boolean }).isError).toBe(true);
    expect(text(r)).toContain("NO_VAULT");
  });

  it("refuses to start with anything that is not a Plinth secret key", () => {
    expect(() => createPlinthMcpServer({ apiUrl: "http://x", apiKey: "pk_abc" })).toThrow(/secret key/);
    expect(() => createPlinthMcpServer({ apiUrl: "http://x", apiKey: "whsec_abc" })).toThrow(/secret key/);
    expect(() => createPlinthMcpServer({ apiUrl: "http://x", apiKey: "sk_test_abc" })).not.toThrow();
    expect(() => createPlinthMcpServer({ apiUrl: "http://x", apiKey: "sk_live_abc" })).not.toThrow();
  });

  it("routes each tool to the right endpoint, method and body", async () => {
    const { client, seen } = await connect(() => new Response("{}"));
    const calls: [string, Record<string, unknown>, string, string][] = [
      ["get_account", {}, "GET", "/v1/me"],
      ["list_payments", { limit: 5, status: "SETTLED" }, "GET", "/v1/payments?limit=5&status=SETTLED"],
      ["list_payment_links", {}, "GET", "/v1/payment-links?limit=20"],
      ["set_payment_link_active", { id: "plink_1", active: false }, "PATCH", "/v1/payment-links/plink_1"],
      ["create_invoice", { customer_name: "Ada", customer_email: "ada@example.test", line_items: [{ description: "Work", quantity: 2, unit_amount: "10.00" }] }, "POST", "/v1/invoices"],
      ["request_refund", { payment_intent_id: "pi_1", amount: "5.00", recipient: "0x" + "ab".repeat(20) }, "POST", "/v1/refund-requests"],
      ["submit_refund_proof", { id: "ref_1", tx_hash: "0x" + "cd".repeat(32) }, "POST", "/v1/refund-requests/ref_1/proof"],
      ["create_webhook_endpoint", { url: "https://shop.example/hook" }, "POST", "/v1/webhook-endpoints"],
      ["delete_webhook_endpoint", { id: "we_1" }, "DELETE", "/v1/webhook-endpoints/we_1"],
      ["retry_webhook_delivery", { id: "wd_1" }, "POST", "/v1/webhook-deliveries/wd_1/retry"],
      ["get_overview", { days: 7, currency: "EURC" }, "GET", "/v1/overview?days=7&currency=EURC"],
      ["get_payout_methods", {}, "GET", "/v1/payout-methods"],
      ["get_custody", {}, "GET", "/v1/custody"],
    ];
    for (const [name, args, method, path] of calls) {
      seen.length = 0;
      const r = await client.callTool({ name, arguments: args });
      expect((r as { isError?: boolean }).isError, name).toBeFalsy();
      expect(seen[0]!.url, name).toBe(`http://api.test${path}`);
      expect(seen[0]!.init.method, name).toBe(method);
    }
  });

  it("offers the playbook as a resource and a ready prompt", async () => {
    const { client } = await connect(() => new Response("{}"));
    expect((await client.listResources()).resources.map((r) => r.uri).sort()).toEqual(["plinth://playbook", "plinth://webhook-verifier"]);
    const res = await client.readResource({ uri: "plinth://playbook" });
    expect(JSON.stringify(res)).toMatch(/computed ON THE SERVER/);
    const prompt = await client.getPrompt({ name: "add_plinth_checkout" });
    expect(JSON.stringify(prompt)).toMatch(/get_integration_playbook/);
  });
});
