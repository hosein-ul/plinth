import { z } from "zod";
import type { RouteDef } from "./define";

const toOpenApiPath = (p: string) => p.replace(/:([A-Za-z]+)/g, "{$1}");

const errorSchema = {
  type: "object",
  required: ["error"],
  properties: {
    error: {
      type: "object",
      required: ["type", "code", "message", "request_id"],
      properties: { type: { type: "string" }, code: { type: "string" }, message: { type: "string" }, request_id: { type: "string" }, details: {} },
    },
  },
} as const;

function jsonSchema(s: z.ZodType) {
  const j = z.toJSONSchema(s, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  delete j.$schema;
  return j;
}

/** OpenAPI 3.1 document generated from the SAME route definitions the server registers. */
export function buildOpenApi(routes: RouteDef[], serverUrl = "https://api.example.com") {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const r of routes) {
    const path = toOpenApiPath(r.path);
    const params = [...r.path.matchAll(/:([A-Za-z]+)/g)].map((m) => ({ name: m[1], in: "path", required: true, schema: { type: "string" } }));
    const queryParams = r.query
      ? Object.entries((jsonSchema(r.query).properties ?? {}) as Record<string, unknown>).map(([name, schema]) => ({ name, in: "query", required: false, schema }))
      : [];
    const security = r.auth === "none" ? [] : r.auth === "admin" ? [{ operatorToken: [] }] : r.auth === "session" ? [{ sessionToken: [] }] : [{ apiKey: [] }, { sessionToken: [] }];
    paths[path] ??= {};
    paths[path][r.method.toLowerCase()] = {
      tags: [r.tag],
      summary: r.summary,
      ...(r.description ? { description: r.description } : {}),
      operationId: `${r.method.toLowerCase()}_${r.path.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "")}`,
      security,
      parameters: [
        ...params,
        ...queryParams,
        ...(r.idempotent ? [{ name: "Idempotency-Key", in: "header", required: false, description: "Makes retries safe: the first response is stored and replayed.", schema: { type: "string", maxLength: 200 } }] : []),
      ],
      ...(r.body ? { requestBody: { required: true, content: { "application/json": { schema: jsonSchema(r.body) } } } } : {}),
      responses: {
        [String(r.successStatus ?? 200)]: { description: r.response ?? "Success", content: { "application/json": { schema: { type: "object" } } } },
        "400": { description: "Validation failed", content: { "application/json": { schema: errorSchema } } },
        ...(r.auth !== "none" ? { "401": { description: "Missing or invalid credentials", content: { "application/json": { schema: errorSchema } } }, "403": { description: "Forbidden", content: { "application/json": { schema: errorSchema } } } } : {}),
        "429": { description: "Rate limited", content: { "application/json": { schema: errorSchema } } },
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Plinth API",
      version: "2026-10-01",
      description:
        "Non-custodial multi-chain USDC payment gateway. Amounts are decimal strings in USDC (`\"12.50\"`) with exact integer base-unit twins (`*_units`). " +
        "Test keys (`sk_test_`) operate on testnets; live keys (`sk_live_`) on mainnets.",
    },
    servers: [{ url: serverUrl }],
    tags: [...new Set(routes.map((r) => r.tag))].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        apiKey: { type: "http", scheme: "bearer", description: "`sk_test_...` / `sk_live_...` secret key" },
        sessionToken: { type: "http", scheme: "bearer", description: "Dashboard session token (`sess_...`); send `X-Plinth-Environment: test|live`" },
        operatorToken: { type: "apiKey", in: "header", name: "x-admin-token" },
      },
      schemas: { Error: errorSchema },
    },
    "x-webhooks": {
      signature: "Plinth-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, `${t}.${rawBody}`)>; reject if |now - t| > 300s",
      retries: "8 attempts over ~10 hours with exponential back-off; every attempt is logged. Handlers must be idempotent (dedupe on event.id).",
    },
  };
}
