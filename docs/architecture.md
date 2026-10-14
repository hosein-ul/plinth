# Architecture

## 1. Goals and the one rule

Accept USDC on many chains, settle automatically, **never hold a key that can move merchant funds**, and never require funding thousands of
deposit addresses with gas. The rule that shapes everything: *a total compromise of the gateway backend and relayer key must not let an
attacker take merchant funds.*

## 2. Contract trust boundaries

```
VaultFactory ──creates──▶ MerchantVault          (owner = merchant; no operator/admin/upgrade)
      ▲                         ▲
      │ isVault()               │ funds in (sweep / router)
InvoiceFactory ──clones──▶ InvoiceDeposit        (immutable: token, vault, merchantId, invoiceId, chainId, version)
PaymentRouter  ──pulls EIP-3009──▶ vault         (stateless, no admin, holds nothing between txs)
```

| Contract | Authority | Notes |
| --- | --- | --- |
| `MerchantVault` | `owner` only (`Ownable2Step`, renounce disabled) | `withdraw`, `rescueToken`, `scheduleSettlement`, `cancelPendingSettlement`. `forward()` and `applyPendingSettlement()` are permissionless but cannot choose a recipient or amount. Policies that forward funds activate after `CONFIG_DELAY`; returning to `BALANCE_IN_VAULT` is immediate. |
| `VaultFactory` | none | Address = CREATE2(merchantId, owner, delay) so nobody can squat a vault with a different owner. Keeps the `isVault` registry. Idempotent `createVault`. |
| `InvoiceDeposit` | none (impl behind clones) | `sweep()` (no params) moves the full USDC balance to the immutable vault. `rescueToken()` for **non-USDC** tokens, callable only by the vault's current owner. Reverts if the chain id differs from the baked-in one. |
| `InvoiceFactory` | none | `predict()` (view) and `deployAndSweep()` (deploy-if-needed + sweep in one tx, idempotent). Requires `VAULTS.isVault(vault)` and implementation code. `deployAndSweepBatch` isolates failing items. |
| `PaymentRouter` | none | `pay(Payment, v, r, s)` calls the token's `receiveWithAuthorization(from, router, …)` (token requires caller == payee) then forwards to the vault. Nonce = `keccak256(tag, chainid, router, invoiceId, merchantId, vault, from, value, salt)`. |

Why clones with immutable args: no `initialize()` exists, so there is nothing to front-run; the destination is part of the code the address
commits to. A different vault/token/invoice/chain/version ⇒ a different address (tested).

## 3. Counterfactual addresses

`computeInvoiceAddress()` (`packages/blockchain/src/invoice-address.ts`) reproduces OpenZeppelin's `Clones` init-code layout and
`InvoiceFactory._salt` offline. Before showing a customer an address the API **cross-checks it against the deployed factory's
`predict()`**; a mismatch aborts creation. `finalize-deployment` also asserts offline == on-chain on every new deployment.

## 4. Payment lifecycle

```
CREATED → AWAITING_PAYMENT → DETECTED → CONFIRMING → PAID/OVERPAID → SETTLEMENT_PENDING → SETTLED
                 │                                         └→ SETTLEMENT_FAILED ⇄ (retry) SETTLEMENT_PENDING
                 ├→ EXPIRED   ├→ UNDERPAID (partial, past expiry)   ├→ LATE_PAYMENT   └→ INVALID_ASSET (wrong token)
   any funded state → REFUND_REQUESTED → PARTIALLY_REFUNDED | REFUNDED
```

`deriveIntentStatus()` (`packages/shared/src/state-machine.ts`) is a pure function of verified facts; `recomputeIntent()` is the **only**
writer of status. An explicit transition table guards the persisted status; an unexpected edge is audited rather than hidden.

Stages of an on-chain deposit (`transactions` row, unique per `(network, txHash, logIndex)`):

1. **Detected** — `eth_getLogs` for *every* ERC-20 `Transfer` to registered addresses (any token ⇒ wrong-token deposits are visible).
2. **Verified** — the receipt is re-fetched and the log re-decoded: status, emitting contract == official USDC, recipient, amount, block hash.
3. **Final** — confirmations ≥ network policy, or the chain's *finalized* block. Block hash is re-compared each tick; a mismatch marks the row
   `REORGED`, reverses its ledger entries, rewinds the cursor and the row is revived if the transfer reappears.
4. **Swept** — settlement planned **in the same DB transaction** as the finality transition (outbox); relayer op deduped by
   `(address, final total, attempt)`; one open sweep per address (partial unique index).
5. **In vault** — the `Swept` event is itself observed, verified and finalised. Sweeps triggered by third parties are recorded too.

Ledger accounts: `DETECTED`, `VERIFIED`, `FINALIZED`, `SETTLED_TO_VAULT`, `FORWARDED`, `REFUNDED`, `GAS_COST` (credits/debits, idempotency-keyed).

## 5. Relayer

One signer per network; strictly sequential per network. Per operation: **simulate** (`estimateGas`; a revert marks the op failed with no spend) →
check policy (per-tx fee cap, daily gas budget, daily op cap, minimum balance, kill switch) → choose nonce (`max(pending, db+1)`) → sign →
**persist the raw transaction** → broadcast. Pending ops are reconciled each tick: receipt ⇒ confirmed/reverted + gas accounting; unknown to
the node ⇒ re-broadcast the stored raw tx; stuck ⇒ replace on the same nonce with +25% fees (up to N times); nonce consumed elsewhere ⇒ re-queue.
Costs are recorded per op (native wei; USDC units on Arc where the native unit *is* USDC at 18 decimals). Wallet-payment calldata, which carries
the customer's signature, is wiped once the op is terminal. Signing goes through a `SignerProvider` interface so a KMS/HSM adapter can replace the
env key; the engine refuses an env key in production unless explicitly overridden.

## 6. Networks

`packages/shared/src/networks.ts` is the registry (chain id, official USDC, EIP-712 name/version, authorization capabilities, finality, gas model,
CCTP domain). A network is **operational** only if: listed in `ENABLED_NETWORKS`, its token capabilities were probed, a deployment record matches the
chain id with `bytecodeVerified`, and (mainnets) `ALLOW_MAINNET=true` **and** the record is `productionApproved`. `ChainAdapter` is the
interface the engine depends on; `EvmAdapter` implements it with viem. Adding an EVM network = registry entry → `verify-networks` → deploy →
`finalize-deployment` → run the E2E → enable. No payment-engine changes. **Arc** differs: gas is USDC (18-dec native view vs 6-dec ERC-20 view of
the same balance); fee floor 20 gwei is enforced by `quoteFees`.

Solana would be a separate adapter (SPL token accounts, PDA/ATA derivation, fee payer, rent) — it must not reuse CREATE2/EIP-3009. Not built.

## 7. Services and data

`apps/api` (Fastify) · `apps/worker` · `apps/web` (Next.js; a BFF keeps the session token in an httpOnly cookie) · PostgreSQL (Drizzle). Every
table named in the brief exists, plus `sessions`, `payment_links`, `invoices`, `merchant_vaults`, `payment_events`, `webhook_attempts`,
`watcher_cursors`, `relayer_state`, `jobs`, `idempotency_keys`. Money is `bigint` base units everywhere.

Webhooks: `Plinth-Signature: t=<unix>,v1=HMAC-SHA256(secret, "t.body")`, 8 attempts over ≈ 10 h with jitter, every attempt stored, manual retry,
SSRF guard (https only, private ranges rejected, re-resolved at delivery, redirects not followed). Secrets are AES-256-GCM encrypted at rest.
