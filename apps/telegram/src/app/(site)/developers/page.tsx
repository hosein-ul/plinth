import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { WEBHOOK_EVENT_TYPES } from "@plinth/shared";
import { PageIntro } from "@/components/marketing/chrome";
import { C } from "@/components/marketing/code";
import { CopyCode as Code } from "@/components/marketing/pages/copy-code";
import { DEMO_HREF } from "@/lib/routes";
import { pageMeta, SITE_URL } from "@/lib/site";
import { Method, OnThisPage, Step } from "@/components/marketing/docs";
import { LangTabs } from "@/components/marketing/pages/lang-tabs";
import { createPaymentSamples, webhookSamples } from "@/lib/examples";
import { H2, TableCard, td, wrap } from "@/components/marketing/parts";
import { Chip } from "@/components/badge";
import { buttonStyles } from "@/components/ui/button";
import { STATUS_META } from "@/lib/format";
import { cn } from "@/lib/cn";

export const metadata = pageMeta({ title: "Developers", description: "The Plinth REST API, signed webhooks, payment states and a testnet sandbox. Quickstart in cURL.", path: "/developers" });

const NAV = [
  { id: "quickstart", label: "Quickstart" },
  { id: "api", label: "API" },
  { id: "webhooks", label: "Webhooks" },
  { id: "states", label: "Payment states" },
  { id: "sandbox", label: "Sandbox" },
];

const EVENT_NOTES: Record<string, string> = {
  "payment.detected": "A transfer was seen and verified. Not final.",
  "payment.confirmed": "Final funds satisfy the amount and your policy. Safe to fulfil.",
  "payment.completed": "Funds are confirmed inside the merchant vault.",
  "payment.underpaid": "Expired with only part of the amount.",
  "payment.overpaid": "More than the amount arrived (excess in data).",
  "payment.expired": "Expired with nothing received.",
  "payment.late": "Funds became final after expiry.",
  "payment.invalid_asset": "A non-official token was sent.",
  "settlement.submitted": "Relayer broadcast the sweep.",
  "settlement.completed": "Sweep is final.",
  "settlement.failed": "Sweep could not execute; being retried.",
  "refund.requested": "A refund was requested.",
  "refund.completed": "The refund transfer was verified on-chain.",
};

const ENDPOINTS: ["GET" | "POST", string, string][] = [
  ["POST", "/v1/payment-intents", "Create a payment (idempotent)"],
  ["GET", "/v1/payment-intents/{id}", "Retrieve a payment"],
  ["GET", "/v1/payments", "List and search payments"],
  ["POST", "/v1/payment-links", "Create a reusable link"],
  ["POST", "/v1/invoices", "Create a numbered invoice"],
  ["GET", "/v1/networks · /v1/assets", "Networks, capabilities, official assets"],
  ["GET", "/v1/settlements · /v1/transactions", "Settlement and on-chain movements"],
  ["POST", "/v1/refund-requests", "Request a refund; completes when your vault transfer is verified"],
  ["POST", "/v1/webhook-endpoints", "Register a signed webhook endpoint"],
  ["GET", "/v1/webhook-deliveries", "Delivery log, with manual retry"],
  ["GET", "/v1/settlement-policy", "Accounting policy and live on-chain vault policy"],
];

const RULES: [string, React.ReactNode][] = [
  ["Signature header", <C key="h">Plinth-Signature</C>],
  ["Timestamp tolerance", "Reject older than 5 minutes"],
  ["Retries", "8 over about 10 hours"],
  ["Deduplicate on", <C key="d">event.id</C>],
];

const SECTION = "scroll-mt-32";
const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");

export default function DevelopersPage() {
  return (
    <>
      <PageIntro eyebrow="Developers" title="A payments API that tells the truth about money">
        Amounts are exact decimal strings with integer twins. Status is derived only from verified on-chain facts. Webhooks are signed, retried and idempotent. Never fulfil from a redirect.
      </PageIntro>

      <div className={cn(wrap, "grid gap-8 py-12 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-14 lg:py-16")}>
        <OnThisPage items={NAV} />

        <div className="min-w-0 space-y-24">
          <section id="quickstart" aria-labelledby="quickstart-h" className={SECTION}>
            <H2 id="quickstart-h">Quickstart</H2>
            <p className="mt-3 max-w-2xl text-[0.9375rem] text-ink-2">
              Charge each order at its real total, send the customer to checkout, and fulfil from a signed webhook. These are the same four steps in every language, and every sample below is a real file we run against the API.
            </p>

            <ol className="mt-8 space-y-12">
              <li className="min-w-0 space-y-4">
                <Step n={1} title="Get your keys" />
                <p className="max-w-2xl text-[0.9375rem] text-ink-2">
                  Create a test account, then open <b className="font-medium text-ink">API keys</b> in the dashboard for a secret key (<C>sk_test_…</C>) and <b className="font-medium text-ink">Webhooks</b> for an endpoint secret. Keep both on your server, as environment variables.
                </p>
                <Code label=".env">{`PLINTH_API_URL=${API_BASE ?? "https://your-plinth-api.example"}
PLINTH_SECRET_KEY=sk_test_...
PLINTH_WEBHOOK_SECRET=whsec_...`}</Code>
              </li>

              <li className="min-w-0 space-y-4">
                <Step n={2} title="Create a payment when the customer checks out" />
                <p className="max-w-2xl text-[0.9375rem] text-ink-2">
                  Compute the total on your server and send it as a string. The <C>Idempotency-Key</C> makes a retry return the same payment instead of a second one. Then redirect the customer to <C>checkout_url</C>.
                </p>
                <LangTabs samples={createPaymentSamples()} caption="Tested: each file is run against a live API by scripts/test-doc-examples.mjs." />
                <p className="pt-2 text-sm font-medium text-ink">What comes back (abridged)</p>
                <Code label="response">{`{
  "id": "pi_9e78c740ce82e30fdbed754ad9a97ea6",
  "status": "AWAITING_PAYMENT",
  "amount": "25.00",
  "amount_units": "25000000",
  "currency": "USDC",
  "order_reference": "order-1042",
  "checkout_url": "${SITE_URL}/pay/pi_9e78c740ce82e30fdbed754ad9a97ea6",
  "success_url": "https://shop.example/thanks",
  "expires_at": "2026-10-14T14:48:00.720Z",
  "networks": [{
    "network": "arc-testnet",
    "usdc_address": "0x3600000000000000000000000000000000000000",
    "deposit_address": "0x08D7…7188",
    "wallet_checkout_supported": true
  }]
}`}</Code>
                <p className="text-xs text-ink-3">Taken from a real response on a local test chain; the network entry is shown for Arc Testnet. The deposit address is unique to this payment and no contract is deployed for it yet.</p>
              </li>

              <li className="min-w-0 space-y-4">
                <Step n={3} title="Fulfil from the webhook, never from the redirect" />
                <p className="max-w-2xl text-[0.9375rem] text-ink-2">
                  Add an endpoint in the dashboard that points at your server. This receiver verifies the signature on the raw body, rejects stale timestamps, ignores an event it has already seen, and acts on <C>payment.confirmed</C>.
                </p>
                <LangTabs samples={webhookSamples()} caption="Tested: valid, tampered, stale and missing signatures, and a replayed event, in both languages." />
              </li>

              <li className="min-w-0 space-y-4">
                <Step n={4} title="Test it end to end" />
                <p className="max-w-2xl text-[0.9375rem] text-ink-2">
                  Pay the test checkout from a wallet with test USDC, or send test USDC to the deposit address. Your order should turn paid from the webhook alone. Then check the two failure cases: a webhook with a bad signature must be rejected (401), and a replayed event must change nothing.
                </p>
                <p className="text-sm text-ink-3">Prefer an AI assistant? <Link href="/build-with-ai" className="font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">It can do these four steps for you</Link>.</p>
              </li>
            </ol>
          </section>

          <section id="api" aria-labelledby="api-h" className={SECTION}>
            <H2 id="api-h">API</H2>
            <p className="mt-3 max-w-2xl text-[0.9375rem] text-ink-2">
              Versioned under <C>/v1</C>. Test keys (<C>sk_test_</C>) operate on testnets, live keys on mainnets. Keys are stored hashed. The full OpenAPI 3.1 document is served by the API at <C>/v1/openapi.json</C> and committed to the repository as <C>docs/openapi.json</C>.
            </p>
            <p className="mt-4 text-sm text-ink-3">
              {API_BASE
                ? <a className="inline-flex items-center gap-1.5 font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink" href={`${API_BASE}/v1/openapi.json`}>Open the OpenAPI document<ExternalLink className="size-3.5" aria-hidden /></a>
                : <>The public API host is not configured for this site (<C>NEXT_PUBLIC_API_URL</C>), so there is no OpenAPI link here yet.</>}
            </p>
            <div className="card mt-8 overflow-hidden">
              <p className="border-b border-line bg-wash px-5 py-3 text-xs font-medium text-ink-3 sm:px-6">Core endpoints</p>
              <ul className="divide-y divide-line">
                {ENDPOINTS.map(([m, p, d]) => (
                  <li
                    key={p}
                    className="grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-x-4 gap-y-1 px-5 py-3.5 transition-colors duration-[var(--duration-fast)] hover:bg-wash sm:px-6 md:grid-cols-[3rem_minmax(0,20rem)_minmax(0,1fr)]"
                  >
                    <Method>{m}</Method>
                    <code className="min-w-0 break-words font-mono text-[0.8125rem] text-ink">{p}</code>
                    <p className="col-start-2 text-sm text-ink-3 md:col-start-auto">{d}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-6">
              <p className="mb-3 text-sm font-medium text-ink">Errors</p>
              <Code label="errors">{`{ "error": { "type": "invalid_request_error", "code": "VALIDATION_FAILED",
    "message": "Request validation failed", "request_id": "req_…",
    "details": [{ "path": "amount", "message": "Amount must be a decimal string…" }] } }`}</Code>
            </div>
          </section>

          <section id="webhooks" aria-labelledby="webhooks-h" className={SECTION}>
            <H2 id="webhooks-h">Webhooks</H2>
            <p className="mt-3 max-w-2xl text-[0.9375rem] text-ink-2">
              Each request is signed: <C>Plinth-Signature: t=&lt;unix&gt;,v1=&lt;hex&gt;</C> where v1 is HMAC-SHA256 of <C>{"`${t}.${rawBody}`"}</C> with your endpoint secret. Reject timestamps older than 5 minutes. Failed deliveries are retried 8 times over about 10 hours; every attempt is logged in the dashboard. Deduplicate on <C>event.id</C>.
            </p>
            <dl className="card mt-8 grid divide-y divide-line sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
              {RULES.map(([k, v]) => (
                <div key={k} className="min-w-0 px-5 py-4 sm:px-6 sm:[&:nth-child(n+3)]:border-t sm:[&:nth-child(n+3)]:border-line lg:[&:nth-child(n+3)]:border-t-0">
                  <dt className="label">{k}</dt>
                  <dd className="mt-1.5 break-words text-sm font-medium text-ink">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-6">
              <TableCard caption="Webhook events" head={["Event", "Meaning"]} minWidth="34rem">
                {WEBHOOK_EVENT_TYPES.map((e) => (
                  <tr key={e} className="transition-colors duration-[var(--duration-fast)] hover:bg-wash">
                    <td className={cn(td, "whitespace-nowrap py-3 font-mono text-[0.8125rem] text-ink")}>{e}</td>
                    <td className={cn(td, "py-3 text-ink-2")}>{EVENT_NOTES[e]}</td>
                  </tr>
                ))}
              </TableCard>
            </div>
          </section>

          <section id="states" aria-labelledby="states-h" className={SECTION}>
            <H2 id="states-h">Payment states</H2>
            <p className="mt-3 max-w-2xl text-[0.9375rem] text-ink-2">
              Status is derived from verified facts; it is never set by a client. Multiple transfers add up. Past expiry, partial funds are <em>underpaid</em> and funds that become final late are a <em>late payment</em>.
            </p>
            <div className="card mt-8 overflow-hidden">
              <ul className="divide-y divide-line">
                {Object.entries(STATUS_META).map(([k, m]) => (
                  <li
                    key={k}
                    className="grid items-center gap-x-4 gap-y-1.5 px-5 py-3.5 transition-colors duration-[var(--duration-fast)] hover:bg-wash sm:px-6 md:grid-cols-[11rem_12.5rem_minmax(0,1fr)]"
                  >
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 md:contents">
                      <span><Chip tone={m.tone}>{m.label}</Chip></span>
                      <code className="min-w-0 break-all font-mono text-2xs text-ink-3">{k}</code>
                    </div>
                    <p className="text-sm text-ink-2">{m.hint}</p>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section id="sandbox" aria-labelledby="sandbox-h" className={SECTION}>
            <H2 id="sandbox-h">Test in the sandbox</H2>
            <p className="mt-3 max-w-2xl text-[0.9375rem] text-ink-2">Everything runs on testnets with test keys. No real funds are involved at any step.</p>
            <div className="card mt-8 overflow-hidden">
              <ol className="grid divide-y divide-line md:grid-cols-4 md:divide-x md:divide-y-0">
                {[
                  ["Create an account", "Sign up and enable a testnet. No card, no KYC."],
                  ["Create a vault", "Name a wallet you control as the owner. The relayer pays for the deployment."],
                  ["Make a test key and a payment", <>Create an <C>sk_test_</C> key and call <C>POST /v1/payment-intents</C>.</>],
                  ["Pay it and watch the webhook", "Fund a wallet from Circle's faucet, pay your own checkout and receive signed events."],
                ].map(([t, d], i) => (
                  <li key={i} className="p-5 sm:p-6">
                    <span className="tnum grid size-6 place-items-center rounded-full bg-sunk text-xs font-medium text-ink-2">{i + 1}</span>
                    <h3 className="t-3 mt-4">{t}</h3>
                    <p className="mt-1.5 text-sm text-ink-2">{d}</p>
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap items-center gap-3 border-t border-line bg-wash px-5 py-4 sm:px-6">
                <Link href="/signup" className={buttonStyles({ variant: "primary", size: "lg" })}>
                  Create a free account
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
                <Link href={DEMO_HREF} className={buttonStyles({ variant: "secondary", size: "lg" })}>Watch a payment in the demo</Link>
                <p className="w-full text-sm text-ink-3 lg:ml-auto lg:w-auto">Locally, <C>pnpm dev:stack</C> starts a full stack with a seeded merchant, a local chain and test USDC.</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
