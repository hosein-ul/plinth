# Plinth MCP server

The MCP (Model Context Protocol) server lets an AI assistant add Plinth checkout to **your existing project** and test it, in plain English:
it can read the integration playbook, create and read **test** payments and payment links, and list networks. It is a thin client over the public
REST API (`docs/api-guide.md`); everything it does you could do with `curl`.

> **Test keys only.** The server refuses to start with anything but an `sk_test_` key, and it has no tool that moves, withdraws or refunds money.
> Wallet, vault, payout, custody and team changes are *session-only* in the API on purpose and are not exposed here.

## Install and run

It runs from this repository today (there is no published npm package yet).

```bash
pnpm install
PLINTH_API_URL=https://your-api.example.com PLINTH_API_KEY=sk_test_... pnpm --dir packages/mcp start
```

| Variable | Required | Meaning |
| --- | --- | --- |
| `PLINTH_API_URL` | yes | Base URL of a Plinth API (no trailing slash needed). Local dev stack: `http://localhost:4000`. |
| `PLINTH_API_KEY` | yes | A **test** secret key created in the dashboard (Developers, API keys). Keys are shown once. |

The transport is stdio. Add it to any MCP-capable assistant (Claude Desktop, Claude Code, Cursor, and others):

```json
{
  "mcpServers": {
    "plinth": {
      "command": "pnpm",
      "args": ["--dir", "/path/to/plinth/packages/mcp", "start"],
      "env": { "PLINTH_API_URL": "https://your-api.example.com", "PLINTH_API_KEY": "sk_test_..." }
    }
  }
}
```

Never paste the key into a chat or commit it. Keep it in the assistant's MCP settings or your secret store.

## Tools

| Tool | Read-only | What it does |
| --- | --- | --- |
| `get_integration_playbook` | yes | Returns the step-by-step instructions and rules for adding Plinth to an existing project. **Read this first.** The same text is served at `/llms-full.txt`. |
| `get_webhook_verifier` | yes | Returns Node.js code that verifies the `Plinth-Signature` header on the raw request body. Adapt it to the project's language. |
| `create_payment` | no | Creates a payment for one order and returns `checkout_url`. |
| `get_payment` | yes | Reads one payment: status, timeline, transactions, settlements, refunds, fee and net amounts, payout route. |
| `list_payments` | yes | Lists recent payments, newest first (`limit` 1 to 100, default 20). |
| `create_payment_link` | no | Creates a reusable link for **one fixed price** (a donation, a single service). Not for shops. |
| `list_networks` | yes | The networks and tokens the account can accept and whether each is enabled, including vault status and the platform fee. |

### `create_payment`

| Input | Type | Notes |
| --- | --- | --- |
| `amount` | string | Required. Decimal string in the payment token, at most 6 decimals, for example `"25.00"`. **Never a number.** Compute it on the server from your own prices. |
| `currency` | `"USDC"` or `"EURC"` | Optional, default USDC. EURC exists on Arc only. |
| `order_reference` | string, max 200 | Your own order id. Also used as the idempotency key when none is given. |
| `description` | string, max 500 | Shown at checkout. |
| `success_url`, `cancel_url` | URL | Your own pages. A redirect is **not** proof of payment. |
| `idempotency_key` | string | Reuse the same key to get the same payment back (for example order id plus attempt). |

Returns the payment object. Redirect the customer to `checkout_url`. The payment is payable for 20 minutes by default (see `docs/api-guide.md`).

### `create_payment_link`

`name` (required), `amount` (required), `currency`, `description`. Returns the link and its `url`. Each visit to the link opens a fresh payment.

### Errors

A failed call returns an MCP error result whose text is `Plinth <status>: <error code and message>`. The common ones: `401` bad or revoked key, `403` the key lacks the right,
`400` validation (the message names the field), `409` conflict (same idempotency key, different body), `422` the action cannot be done in the current state, `429` rate limited.

## What the assistant should do (the playbook in short)

1. Inspect the project and say what it found (framework, where an order is created, where prices come from).
2. Add server-side variables `PLINTH_API_URL`, `PLINTH_SECRET_KEY` (an `sk_test_` key) and `PLINTH_WEBHOOK_SECRET`; document them in `.env.example`; never print them or send them to the browser.
3. At the moment a customer commits to pay, call `create_payment` **from the server** with the real total, then redirect to `checkout_url`.
4. Add a webhook route that reads the **raw** body, verifies `Plinth-Signature`, rejects timestamps older than five minutes, ignores event ids it has seen, and fulfils on `payment.confirmed` (fast) or `payment.completed` (strict).
5. Show order status from **your database**, never from the redirect.
6. Test: pay an order, watch it flip to paid from the webhook only; send a bad signature (must be rejected); replay a real event (must be ignored).

The full text, including the rules, is returned by `get_integration_playbook`.

## What the money does (so the assistant explains it correctly)

* The customer pays the amount on the invoice in the payment's token. The platform fee (0.20% by default, never above 1%) is taken inside the settlement transaction, so `amount` is what the customer pays,
  `fee_amount` is the fee and `net_amount` is what the merchant receives.
* The net amount reaches the merchant's **vault**, their own **payout wallet**, or, where an operator enabled it, their **custody balance**. See `docs/architecture.md`.
* Today everything runs on **test networks**. Nothing real moves and the contracts are not independently audited.

## Safety properties

* `sk_live_` keys are rejected at startup.
* No tool changes who gets paid, creates API keys, edits webhooks, withdraws, or issues refunds.
* The server is stateless; it stores nothing and logs nothing beyond the MCP transport.
* Secrets cross only as the `Authorization` header to the API URL you configured.

## Limits and not done

* Not published as a package; runs from the repository.
* No tool for invoices, refunds, webhooks management or custody, by design (the API supports them with a session or the right key rights).
* One account per server process (one API key).

## Development

```bash
pnpm --filter @plinth/mcp test        # 6 tests: tool list, playbook, request shape, amount validation, error mapping, live-key refusal
pnpm --filter @plinth/mcp typecheck
```

The tool definitions are in `packages/mcp/src/index.ts`; the playbook text is generated from `packages/shared/src/ai-playbook.ts`, which also feeds `/llms.txt`, `/llms-full.txt` and the website prompts, so they cannot drift apart.
