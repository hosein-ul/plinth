# Verification report

What was actually run, what it proved, what was **not** done. Dates are 2026-10-09 unless stated. Nothing here is an audit.

## Test results (this machine: Windows 11, Node 24, Foundry 1.8.1, pnpm 12)

| Suite | Result | What it exercises |
| --- | --- | --- |
| `contracts` (`forge test`) | **48 passed** = 45 unit/fuzz tests + 1 invariant test (2 invariants, 64 runs × depth 64) + 2 fork tests (these return early unless `FORK_URL` is set) | address prediction == deployment (512-run fuzz), every input changes the address, prefunded-undeployed → deploy+sweep with zero native gas, repeated/partial/over deposits, unauthorized changes, arbitrary-recipient attempts, cross-merchant isolation, chain-id binding, rescue, vault authority/policy/delay, router nonce binding/replay/expiry/tamper/front-run |
| fork tests, **real USDC bytecode** | passed on Arc Testnet and Base Sepolia (read-only forks) | token has the expected EIP-3009 typehash/version/decimals; factory deploys, predicts, sweeps against the real token |
| `packages/shared` | 17 passed | money exactness, full status derivation table, transition guard |
| `packages/db` | 6 passed (PGlite) | migrations apply; unique/partial-unique constraints (duplicate transfer log, one open sweep per address, idempotent ledger); queue claim/dedupe/retry/lock-expiry |
| `packages/blockchain` | 8 passed (real anvil + real contracts) | offline CREATE2 == on-chain `predict`; **USDC to an undeployed address swept by a relayer, invoice address never holds gas**; later transfers swept by a stranger; wrong-token detection; gasless EIP-3009 payment by a customer with **zero** native balance; tamper/replay rejected; relayer cannot withdraw |
| `packages/engine` | 36 passed (real anvil + PGlite) | full lifecycle partial→full, idempotent rescans, overpay, invalid asset, expiry classes (EXPIRED/UNDERPAID/LATE), reorg reversal, failed settlement → retry, kill switch, webhook retry, wallet checkout, refunds verified on-chain, tenant isolation; **resilience**: stuck-tx fee replacement, node-lost tx rebroadcast, rejected broadcast retry, RPC outage + alert, racing watchers, fee/min-balance/op-cap policies; **multi-network**: two chains/finality policies, distinct addresses, wrong-network deposit not credited |
| `apps/api` | 17 passed | auth, permissions (API key ≠ wallets/keys/team), key rotation, structured validation errors, idempotency replay/conflict, merchant + environment isolation, rate limiting (429), public wallet checkout over HTTP, links, invoices, OpenAPI ↔ routes parity, no error leakage |
| TypeScript | clean in all 8 packages | |
| `pnpm verify:networks` | PASS on Arc Testnet/Mainnet, Base Sepolia/Mainnet, Arbitrum One, OP Mainnet, Ethereum | read-only; EIP-712 domain reproduces each token's real `DOMAIN_SEPARATOR` |
| `pnpm e2e:local` | passed | scripted acceptance run: vault → address payment → gasless sweep → wallet payment → signed webhooks (`docs/verification/local-dry-run.json`) |
| Browser run (embedded browser against the local stack) | passed | hosted checkout renders; wallet discovered via EIP-6963, chain switch, EIP-712 signature, relayed, status flipped to **Settled** from backend state; dashboard overview/detail show real data |
| `deploy` pipeline on a throwaway chain | passed | `Deploy.s.sol` guards (wrong chain id reverts), `finalize-deployment` byte-verification + wiring + derivation, mainnet-override refusal |

Measured gas (local EVM, optimizer 200): `createVault` ≈ 1.29 M, **`deployAndSweep` (clone deploy + sweep) ≈ 175 k**, relayed wallet payment ≈ 90 k.

## Verified feature list

* Counterfactual per-invoice addresses; gasless deploy+sweep in one transaction; permissionless re-sweeps; unregistered-vault rejection.
* Merchant-owned vault with no gateway role; settlement modes `BALANCE_IN_VAULT` (default), `INSTANT_FORWARD`, `THRESHOLD_OR_PERIODIC` (contract-level, tested); owner-signed policy changes through the dashboard (built, calldata endpoint tested; the in-browser wallet *signing* of policy/withdraw transactions was **not** browser-tested).
* Independent verification, finality, reorg handling, partial/repeat/over/late/wrong-token/wrong-network accounting; ledger with distinct stages.
* Gasless wallet checkout (EIP-3009 via router) with a fallback to the address flow; capability reported per network.
* Relayer with simulation, nonce management, persisted raw tx, replacement, spend policies, kill switch, gas accounting.
* Signed, retried, idempotent webhooks with delivery log and manual retry; API keys (hashed, rotated); idempotency; rate limits; team roles; audit log.
* Dashboard pages: Overview, Payments (+detail/timeline), Transactions, Payment links, Invoices, Settlements, Refund requests, API keys, Webhooks, Webhook logs, Networks & assets, Wallets & payouts, Team, Audit log, Settings. Public site: product, networks, developers, security, pricing, status, contact.

## NOT done / not verified (be explicit)

1. **No live testnet run yet.** The throwaway testnet wallets are unfunded (Circle's faucet needs a human). Everything that would run there was dry-run on a local chain
   and the live USDC bytecode was exercised through read-only forks. The live acceptance (`pnpm e2e:testnet arc-testnet`) is one command once funded.
2. **No mainnet deployment of any kind**, by design. Mainnet configurations exist, are probed read-only, and are disabled.
3. **No independent audit.** Do not hold meaningful value until one is complete.
4. **Real Postgres (`pg` driver) path and Docker Compose DB were not run** (Docker unavailable). Schema/migrations were generated for Postgres and exercised on PGlite
   (real Postgres engine compiled to WASM, single connection). Queue claim uses `FOR UPDATE SKIP LOCKED` which should be re-tested under true multi-connection concurrency.
5. **Phase 6 Circle integrations (CCTP, Gateway Nanopayments, Gas Station) are not implemented**; see [circle-integrations.md](circle-integrations.md) for verified facts and why.
6. **Solana** not started (separate adapter by design).
7. **Second EVM testnet (Base Sepolia)** is configured and probed, and multi-network behaviour is tested with two local chains, but contracts are **not deployed** there.
8. **No KMS/HSM `SignerProvider` implementation** (interface + env provider only).
9. **No automatic balance-vs-ledger reconciliation job** and **no per-payment amount ceilings / merchant risk limits** yet.
10. **Arc native-currency transfers** to a deposit address (value transfers, not ERC-20 `transfer`) are not log-detected; whether Arc emits a `Transfer` log for them was not tested.
11. **WalletConnect / mobile wallets** not wired (browser-injected EIP-6963 wallets only). **EIP-1271 smart-contract-wallet** payers unsupported on the gasless path.
12. No email delivery (invoices are shared as links); rate limiting and some counters are per-process; no multi-signer relayer sharding.
13. Explorer source verification is manual; no CI pipeline is included.
14. `apps/web` is typechecked/built and spot-checked in a browser (home, checkout both methods, login, overview, payment detail); not every dashboard page was visually reviewed,
    and no automated browser/e2e UI tests or accessibility audit (axe) were run. Contrast of the palette was computed, not user-tested.

## Known issues / sharp edges

* `payment.confirmed` can fire when status jumps straight to `SETTLEMENT_PENDING` (e.g. a top-up after a partial sweep) — intended, but consumers must key off the event, not on seeing `PAID`.
* With the relayer enabled, `PAID` is usually skipped in the stored status because the sweep is planned in the same transaction (the transition is still emitted as `payment.confirmed`).
* Vault addresses are identical across chains for the same owner + factory address (CREATE2); invoice addresses are not (chain id is bound in). This is intentional.
* The dev stack and tests use a faithful FiatTokenV2 *test double* for USDC; the real token is only exercised through read-only forks and probes.
