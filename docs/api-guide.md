# API integration guide

Machine-readable spec: [`openapi.json`](openapi.json) (OpenAPI 3.1, generated from the same route definitions the server registers —
a test fails if they diverge; also served at `/v1/openapi.json`). Regenerate with `pnpm openapi`.

## Basics

* Base path `/v1`. Auth: `Authorization: Bearer sk_test_…` (testnets) or `sk_live_…` (mainnets). Keys are hashed at rest and shown once;
  rotate with `POST /v1/api-keys/{id}/rotate`. API keys act with *developer* rights: they cannot manage wallets, vaults, keys or team.
* Money: decimal strings in USDC (`"12.50"`, ≤ 6 decimals) with exact base-unit twins (`amount_units`). Never floats.
* Errors: `{"error":{"type","code","message","request_id","details?"}}`. 400 validation, 401/403 auth, 404, 409 conflict, 422 semantic, 429 rate-limited.
* **Idempotency:** send `Idempotency-Key` on creates. Same key + same body ⇒ the original response (header `Idempotent-Replayed: true`); same key +
  different body ⇒ `422 IDEMPOTENCY_KEY_REUSED`; concurrent duplicate ⇒ `409`.

## 1 · Set up (once, dashboard or API)

1. Sign up, then **Networks & assets → Create vault**, giving the address (preferably a multisig) that will own the vault. The gateway relayer pays
   for the deployment; you stay the sole owner. (`POST /v1/vaults`)
2. Create an API key and a webhook endpoint (store the signing secret).

## 2 · Take a payment

```bash
curl -X POST $API/v1/payment-intents -H "Authorization: Bearer sk_test_…" \
  -H "Idempotency-Key: order-1042" -H "Content-Type: application/json" \
  -d '{"amount":"25.00","order_reference":"order-1042","checkout_methods":["WALLET","ADDRESS"],
       "success_url":"https://shop.example/thanks"}'
```

A payment stays payable for 20 minutes (1200 seconds) by default. Pass `expires_in_seconds` (300 to 2,592,000) to override it for one payment, or change the merchant default under Settings. Payment links cap `intent_expires_in_seconds` at 7 days and also default to 20 minutes.

Redirect the customer to `checkout_url`, or build your own UI from `networks[].deposit_address`. The checkout shows two methods:

* **Pay with wallet** — customer signs one EIP-3009 authorization; the relayer submits and pays gas. Offered per network only when that network's
  USDC was verified to support it **and** a relayer is available; otherwise the UI says why and offers the address.
* **Pay with address / QR** — unique address per payment per network; partial payments add up; status is live from the backend.

## 3 · Fulfil from webhooks, not redirects

| Event | Meaning | Fulfil? |
| --- | --- | --- |
| `payment.detected` | transfer seen and verified, not final | no |
| `payment.confirmed` | final funds satisfy amount + policy | **yes (fast)** |
| `payment.completed` | funds confirmed inside the merchant vault | **yes (strict)** |
| `payment.underpaid` / `payment.expired` / `payment.late` | partial at expiry / nothing / final after expiry | no |
| `payment.overpaid` | excess received (`excess_amount`); refundable | yes |
| `payment.invalid_asset` | a non-USDC token was sent (ignored) | no |
| `settlement.submitted/completed/failed` | sweep lifecycle (informational) | — |
| `refund.requested/completed` | refund lifecycle | — |

Verify `Plinth-Signature: t=<unix>,v1=<hex>` = HMAC-SHA256(secret, `"<t>.<rawBody>"`), reject if `|now−t| > 300 s`, and deduplicate on `event.id`.
A reference verifier ships in `packages/engine/src/crypto.ts` (`verifyWebhookSignature`) and the web app's `/api/demo-webhook`.

## 4 · Reconcile

`GET /v1/payments/{id}` returns the full picture: `timeline`, `transactions` (chain, tx hash, log index, finality), `settlements` (with the relayer fee),
`attempts` and `refunds`. `GET /v1/overview` labels *received (final)*, *settled to vault* and *pending* separately.

## 5 · Refunds

A refund is a **new transfer you send from your vault** (owner wallet → `withdraw`). `POST /v1/refund-requests` records intent; after sending, call
`POST /v1/refund-requests/{id}/proof {tx_hash}`. It completes only after the receipt is verified: a final USDC transfer vault → recipient for exactly that amount.

## 6 · Settlement policy

`GET /v1/vaults/{network}` reads live on-chain state (owner, mode, destination, balance). Changing it is a transaction **you** sign:
`POST /v1/vaults/{network}/settlement-tx` returns the calldata for `scheduleSettlement`; the dashboard sends it with your connected wallet.
Forwarding modes activate after the vault's delay; a permissionless call applies them, and the relayer then forwards per the on-chain rule.

## Public checkout endpoints (capability-URL, no auth)

`GET /public/checkout/{id}` · `POST …/wallet/prepare` · `POST …/wallet/submit` · `GET …/wallet/attempts/{attemptId}`; links: `GET /public/links/{slug}`,
`POST /public/links/{slug}/checkout`. Rate-limited; signatures are never logged or echoed.
