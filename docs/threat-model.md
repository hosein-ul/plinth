# Threat model

Assets, in order: (1) merchant USDC in vaults and in transit at invoice addresses, (2) correctness of payment status (never "paid" when not),
(3) the relayer's operational funds, (4) credentials/signatures, (5) availability.

Actors: customer, merchant, merchant staff, **gateway operator (assumed fully compromised for custody purposes)**, relayer key holder,
third-party callers, RPC providers, token issuer.

## Custody (the headline property)

| Threat | Mitigation | Evidence |
| --- | --- | --- |
| Gateway/relayer redirects funds | No admin/operator/upgrade role exists; `sweep()` has no parameters; vault is in the clone's immutable args and its CREATE2 address | `InvoiceSweep.t.sol` (hijack, arbitrary-recipient, direct-call tests), `Invariants.t.sol` (no leakage, relayer/attacker never hold funds) |
| Gateway changes vault policy / withdraws | Only `owner`; engine test calls `withdraw`, `scheduleSettlement`, `transferOwnership` as the relayer and expects reverts | `lifecycle.test.ts` "relayer address has no authority", `gasless-sweep.test.ts` |
| Compromised merchant key redirects payouts | Forwarding policies activate after `CONFIG_DELAY`; `cancelPendingSettlement`; going back to vault-only is instant; recommend a multisig owner | `MerchantVault.t.sol` |
| Squatting a merchant's vault address | Address commits to `(merchantId, owner, delay)` | `test_vaultAddressCommitsToOwnerSoItCannotBeSquatted` |
| Front-running invoice deployment | No initializer; immutable args; attacker's different vault ⇒ different address | `test_attackerCannotRedirectBySupplyingDifferentVault` |
| Cross-chain replay of invoice clones | `chainId` in args + salt; `sweep()` checks `block.chainid` | `test_chainIdIsBoundIntoCloneArgs`, `multichain.test.ts` |
| Signature re-pointing (invoice/amount/vault) | Nonce is a hash of every field and is inside the signed message | `PaymentRouter.t.sol` tamper tests |
| Signature replay / expiry | Token's single-use nonce; validity window; relayer rejects expired authorizations; calldata wiped post-confirmation | router + lifecycle tests |
| Wrong/forged token counted as USDC | Only the registry's official address counts; others recorded as `INVALID_ASSET` and ignored; never auto-swept | `lifecycle.test.ts` invalid-asset |
| Non-USDC tokens stuck in a clone | `rescueToken` for the vault owner only; cannot touch USDC | `InvoiceSweep.t.sol` |

## Accounting integrity

| Threat | Mitigation |
| --- | --- |
| Double-credit from duplicate scans / racing workers | Unique `(network, txHash, logIndex)`; idempotency-keyed ledger; one open sweep per address; tests with concurrent watchers and deep rescans |
| Reorg after crediting | Block hash re-checked every tick until final; `REORGED` reverses ledger and rewinds cursor |
| Lagging RPC node mistaken for a reorg | "Node behind" check (`head < block`) skips instead of reversing |
| Fake success from the browser | Checkout renders status from the backend only; webhooks come from the backend; redirect is a link shown after verified status |
| Underpay / overpay / late | Pure derivation with tolerance policy; late funds never count as on-time |
| Dust griefing (gas burn) | `minSweepUnits` per network; below it, sweep only when the invoice is satisfied |
| Stale head → premature finality | `cacheTime: 0` on chain clients |

## Relayer & backend

| Threat | Mitigation |
| --- | --- |
| Runaway spend / fee spike | per-tx fee cap, daily budget, op cap, min balance, deferral + alerts, kill switch (`/admin/relayer/:net/pause`, `RELAYER_KILL_SWITCH`) |
| Stuck / lost transactions | persist raw tx before broadcast; rebroadcast; same-nonce fee bump; nonce re-queue; tested with automine off + dropped tx |
| Key theft | Separate key per role; `SignerProvider` for KMS/HSM; env key refused in production without explicit override; relayer holds **only gas** |
| API abuse | Rate limits (per credential / IP), strict zod validation, 100 KB body cap, structured errors without internals, idempotency keys (replay + conflict detection) |
| Credential stuffing | scrypt hashing, uniform login errors/timing, 10 req/min limit on auth routes |
| SSRF via webhooks | https only, DNS-resolved private-range rejection at create **and** delivery, no redirects |
| Secret leakage | API keys/sessions stored as SHA-256; webhook secrets AES-GCM; audit/alert detail redacts keys named secret/token/signature/etc. |
| CSRF on dashboard | httpOnly SameSite=Lax cookie; BFF requires same-origin `Origin` + custom header |
| Cross-tenant access | Every query scoped by merchant id; tests for payments, refunds, vaults |

## Residual risks (not mitigated by this repository)

* **Unaudited contracts.** An independent audit is a precondition for mainnet. See [mainnet-launch-checklist.md](mainnet-launch-checklist.md).
* **Issuer controls.** USDC can be paused/blocklisted by its issuer; a blocked vault or invoice address cannot receive or sweep.
* **Wrong network deposits** sent to an address that does not exist on that chain are unrecoverable (no one holds a key); the UI warns prominently.
* **RPC integrity.** Verification trusts RPC responses; production should use ≥ 2 independent providers (supported via fallback transport) and consider a quorum check.
* **Arc native-balance transfers** (value transfers rather than ERC-20 `transfer`) are not detected from logs; they appear only via reconciliation. Not verified live.
* **Smart-contract wallet payers** (EIP-1271) are unsupported on the gasless path; they can use the address flow.
* **Rate-limit store** is per process; run behind a gateway or add a shared store before scaling API replicas.
* **Single relayer signer per network**, so throughput is bounded by one nonce sequence; horizontal scaling needs multiple signers/shards.
