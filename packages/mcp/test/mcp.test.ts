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
    expect(names).toEqual(["create_payment", "create_payment_link", "get_integration_playbook", "get_payment", "get_webhook_verifier", "list_networks", "list_payments"]);
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

  it("refuses to start with a live key", () => {
    expect(() => createPlinthMcpServer({ apiUrl: "http://x", apiKey: "sk_live_abc" })).toThrow(/sk_test_/);
  });
});
