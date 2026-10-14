import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { LangSample } from "@/components/marketing/pages/lang-tabs";

/**
 * The code shown on the Developers page is read from real files in content/examples. scripts/test-doc-examples.mjs runs those
 * same files against a live API (create a payment, verify and reject webhooks, idempotency), so a sample cannot rot unnoticed.
 */
const read = (f: string) => readFileSync(join(process.cwd(), "content", "examples", f), "utf8").trimEnd();

export function createPaymentSamples(): LangSample[] {
  return [
    { id: "curl", label: "cURL", file: "create-payment.sh", code: read("create-payment.sh") },
    { id: "node", label: "Node.js", file: "create-payment.mjs", code: read("create-payment.mjs") },
    { id: "python", label: "Python", file: "create_payment.py", code: read("create_payment.py") },
  ];
}
export function webhookSamples(): LangSample[] {
  return [
    { id: "node", label: "Node.js", file: "webhook-server.mjs", code: read("webhook-server.mjs") },
    { id: "python", label: "Python", file: "webhook_server.py", code: read("webhook_server.py") },
  ];
}
