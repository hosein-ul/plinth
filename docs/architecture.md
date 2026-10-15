# Architecture

## 1. Goals and the one rule

Accept USDC (and EURC on Arc) on many chains, settle automatically, **never hold a key that can move merchant funds**, and never require funding thousands of
deposit addresses with gas. The rule that shapes everything: *a total compromise of the gateway backend and relayer key must not let an
attacker take or redirect funds that are already at issued addresses or in vaults.* It does not stop a compromised backend from handing out
new addresses; [threat-model.md](threat-model.md) says exactly what is and is not protected.

## 2. Contract trust boundaries

```
VaultFactory ──creates──▶ MerchantVault          (owner = merchant; no operator/admin/upgrade)
      ▲                         ▲
      │ isVault()               │ funds in (sweep / router)
InvoiceFactory ──clones──▶ InvoiceDeposit        (implementation immutables: token, chainId, version, treasury, max fee;
                                                  clone args: destination, feeBps, kind, merchantId, invoiceId)
PaymentRouter  ──pulls EIP-3009──▶ destination   (stateless, no admin, holds nothing between txs)

destination = a MerchantVault (kind VAULT) or the merchant's own payout wallet (kind DIRECT); the fee leg goes to the treasury
```

| Contract | Authority | Notes |
| --- | --- | --- |
| `MerchantVault` | `owner` only (`Ownable2Step`, renounce disabled) | `withdraw`, `rescueToken`, `scheduleSettlement`, `cancelPendingSettlement`. `forward()` and `applyPendingSettlement()` are permissionless but cannot choose a recipient or amount. Policies that forward funds activate after `CONFIG_DELAY`; returning to `BALANCE_IN_VAULT` is immediate. |
| `VaultFactory` | none | Address = CREATE2(merchantId, owner, delay) so nobody can squat a vault with a different owner. Keeps the `isVault` registry. Idempotent `createVault`. |
| `InvoiceDeposit` | none (impl behind clones) | `sweep()` (no params) splits the balance: `floor(balance × feeBps / 10 000)` to the treasury, the rest to the immutable destination. The fee leg is fail-open (`FeeSkipped`); the destination leg reverts on failure. The fee rate must not exceed the implementation's immutable `MAX_FEE_BPS` (100 = 1%). `rescueToken()` for **other** tokens: the vault's current owner (VAULT) or the payout wallet (DIRECT). Reverts if the chain id differs from the baked-in one. 87-byte packed args: `destination(20) ‖ feeBps(2) ‖ kind(1) ‖ merchantId(32) ‖ invoiceId(32)`. |
| `InvoiceFactory` | none | `predict()` (view) and `deployAndSweep()` (deploy-if-needed + sweep in one tx, idempotent). Token, version, treasury and fee cap are read from the implementation. For kind VAULT it requires `VAULTS.isVault(destination)`; for DIRECT the destination must be a non-zero account. `deployAndSweepBatch` isolates failing items. |
| `PaymentRouter` | none | `pay(Payment, v, r, s)` calls the token's `receiveWithAuthorization(from, router, …)` (token requires caller == payee) then splits and forwards like `sweep()`. Nonce = `keccak256("Plinth.PaymentRouter.v2", chainid, router, invoiceId, merchantId, destination, kind, treasury, feeBps, from, value, salt)`. |

Why clones with immutable args: no `initialize()` exists, so there is nothing to front-run; the destination and fee rate are part of the code the
address commits to. A different destination/kind/fee/token/treasury/invoice/chain/version ⇒ a different address (tested).

**One implementation and one factory per token per chain.** The token is an immutable of the implementation, so EURC on Arc has its own
implementation, `InvoiceFactory`, `VaultFactory` and `PaymentRouter`. A merchant has one vault per (network, token).

**Fee.** Default 20 bps, immutable cap 100 bps, `merchants.fee_bps` nullable override bounded by the cap. The fee is floor-rounded in the token's own
units. The treasury (one address, kept as a per-network map in `packages/shared/src/fees.ts`) is an implementation immutable; rotating it means a new
implementation version, which changes the CREATE2 salt and so affects only **new** invoices (see operations.md). Gas for the split, measured on the
local EVM (cold, single call): `deployAndSweep` 161 209 → 158 743 (vault), 153 538 (direct); `sweep()` 42 295 → 59 355; `router.pay` 93 490 → 113 889 (vault) / 108 998 (direct). A first fee to a zero-balance treasury costs about 17 k more.

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
2. **Verified** — the receipt is re-fetched and the log re-decoded: status, emitting contract == the official address of the payment's token, recipient, amount, block hash.
3. **Final** — confirmations ≥ network policy, or the chain's *finalized* block. Block hash is re-compared each tick; a mismatch marks the row
   `REORGED`, reverses its ledger entries, rewinds the cursor and the row is revived if the transfer reappears.
4. **Swept** — settlement planned **in the same DB transaction** as the finality transition (outbox); relayer op deduped by
   `(address, final total, attempt)`; one open sweep per address (partial unique index).
5. **In vault or payout wallet** — the `Swept` (or router `InvoicePaid`) event is itself observed, verified and finalised; its `fee` and `kind` are checked against the committed route (`FeeSkipped` records fee 0). Sweeps triggered by third parties are recorded too.

Ledger accounts: `DETECTED`, `VERIFIED`, `FINALIZED`, `SETTLED_TO_VAULT`, `SETTLED_TO_WALLET`, `PLATFORM_FEE`, `FORWARDED`, `REFUNDED`, `GAS_COST` (credits/debits, idempotency-keyed, each with an `asset`; amounts of different tokens are never added).

## 5. Relayer

One signer per network; strictly sequential per network. Per operation: **simulate** (`estimateGas`; a revert marks the op failed with no spend) →
check policy (per-tx fee cap, daily gas budget, daily op cap, minimum balance, kill switch) → choose nonce (`max(pending, db+1)`) → sign →
**persist the raw transaction** → broadcast. Pending ops are reconciled each tick: receipt ⇒ confirmed/reverted + gas accounting; unknown to
the node ⇒ re-broadcast the stored raw tx; stuck ⇒ replace on the same nonce with +25% fees (up to N times); nonce consumed elsewhere ⇒ re-queue.
Fees come from the live network at send time (`estimateGas`, `estimateFeesPerGas`; a replacement is +25% relative to the stuck fee). Spend limits are policy tiers (testnet, L2, Ethereum, Polygon, Arc) overridable per network with `RELAYER_POLICY_<NETWORK>`; a limit defers the work and alerts, it never fails a payment. Costs are recorded per op (native wei; USDC units on Arc where the native unit *is* USDC at 18 decimals). Wallet-payment calldata, which carries
the customer's signature, is wiped once the op is terminal. Signing goes through a `SignerProvider` interface so a KMS/HSM adapter can replace the
env key; the engine refuses an env key in production unless explicitly overridden.

## 6. Networks

`packages/shared/src/networks.ts` is the registry (chain id, official USDC and any further official token such as Arc's EURC, EIP-712 name/version, authorization capabilities, finality, gas model,
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

## 8. Payout modes, email and re-authentication

A merchant settles either to a **vault** (default; owner-only, delayed policy changes) or **directly** to a payout wallet (`merchant_payout_configs`).
The route a payment uses is **committed** when its address is issued (`payment_intent_routes`, `invoice_addresses.destination_*`), so a later
change affects only new payments. Choosing Direct needs: a fresh re-authentication, an EIP-4361 signature from the payout wallet and the cooldown; when `REQUIRE_EMAIL_CONFIRMATION` is on (off by default) it also needs a verified email (Google sign-in counts; a wallet-only account must add and verify one) and a
fresh re-authentication, an EIP-4361 signature from the payout wallet, and a single-use link emailed to the account; the newest confirmed config whose
`activeFrom` has passed wins. `EmailSender` has Resend, console (development) and in-memory (tests) implementations. Deployment self-check: the engine reads
TOKEN, CHAIN_ID, VERSION, TREASURY and MAX_FEE_BPS back from every deployed contract and closes the network or token on any mismatch, rechecked every 5 minutes.

## 9. Tokens

`TOKEN_SYMBOLS = USDC, EURC`. USDC is on every network. EURC is listed only where the network's official documentation lists it (Arc; addresses and
sources in the registry). USYC (permissioned), cirBTC and WETH (volatile, different decimals) are deliberately not supported. A payment is created in
one token; its address, vault, router, ledger rows, amounts and webhooks all name that token. Gasless wallet checkout is used only for a token whose
`receiveWithAuthorization` was probed (`pnpm verify:networks`); otherwise the address flow is the way to pay.

## 10. Custodial payout mode (off by default)

A third way to be paid, next to the vault and direct payouts: the **platform holds the balance** and the merchant withdraws it in crypto, like the custodial mode of
other gateways. It is a different trust model, and it is disabled unless `CUSTODY_ENABLED=true`; on a mainnet it also needs `ALLOW_CUSTODY_MAINNET=true`, which
nobody should set without the owner's explicit approval.

* **On-chain** nothing changes: the invoice address is a normal `DestinationKind.DIRECT` address whose destination is the network's **custody wallet** (a key separate from the
  relayer and from the treasury, `SignerProvider.getCustodySigner`, `CUSTODY_PRIVATE_KEY[_<NETWORK>]`). `custodial` is committed with the route and the address
  (`payment_intent_routes.custodial`, `invoice_addresses.custodial`), so a later change of mode affects only new invoices. Fee and expiry work as in every mode.
* **Ledger.** A final payment on a custodial route credits `SETTLED_TO_CUSTODY` and `CUSTODY_BALANCE` with the net amount (amount minus fee). The balance of a merchant, network
  and token is the sum of `CUSTODY_BALANCE` credits minus debits. Reorgs reverse the credits by reference, as for every other account.
* **Withdrawal wallet.** The merchant's `payout wallet` row has `mode = CUSTODIAL` and its `address` is the **withdrawal** wallet. It uses the same flow as a direct payout wallet:
  fresh re-authentication, an EIP-4361 proof with its own statement ("withdraw your Plinth custody balance", purpose `CUSTODY_WITHDRAWAL`), the cooldown and, when email confirmation is on, an emailed single-use
  link. The proof is re-verified before every address is issued and before every withdrawal. Withdrawals go only to the newest confirmed custodial
  wallet whose cooldown has passed, even if the active mode has changed since. The custody wallet, the relayer and the treasury can never be named as a withdrawal wallet.
* **Withdrawals** (`custody_withdrawals`: REQUESTED, SUBMITTED, CONFIRMED, FAILED; MANUAL or SCHEDULED). A request needs a fresh sign-in, is idempotent per key, and debits the
  ledger in the same transaction that creates it (serialised per merchant). `custodyTick` (called by the worker) reconciles sent withdrawals by receipt, sends **one withdrawal in flight per
  network** (simulate first, honour the per-transaction fee cap and the minimum gas balance, persist the signed transaction before broadcasting), and credits a failed or reverted
  withdrawal back exactly once. Scheduled payouts (`custody_settings`: DAILY or WEEKLY, minimum amount) send the whole balance in one transfer per period.
* **Solvency.** Each tick compares the custody wallet's on-chain token balance with what is owed (all balances plus withdrawals still in flight). If it holds less, that token's withdrawals
  are paused and a critical alert `custody-insolvent:<network>:<token>` is raised until it does not.
* **Not done:** refunds of custodial payments (refused with `REFUND_UNSUPPORTED_CUSTODIAL`; the merchant has no account to refund from), a KMS signer for the custody key, merchant-facing
  statements, per-merchant withdrawal limits, an operator tool to reconcile the custody wallet against the ledger beyond the solvency check.
