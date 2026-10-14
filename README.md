# Plinth

Non-custodial, multi-chain **stablecoin payment gateway** (USDC on every network, EURC on Arc). Customers pay with a connected
wallet (gasless via EIP-3009 where the token supports it) or by sending the token to a **unique per-invoice address**. A watcher
verifies every transfer independently; a permission-restricted relayer pays the gas to sweep funds, minus a **0.20% platform fee**
(contract-capped at 1%), into a **merchant-owned vault** or straight to the merchant's own **payout wallet**. The gateway holds no
key that can move merchant funds.

> **Status: pre-audit, testnet-verified.** Mainnet is a first-class, fully-specified configuration but is **disabled by default** and
> was **not deployed to** from this repository. The contracts have **not** been independently audited.
> Read [docs/verification.md](docs/verification.md) for what is proven, what is not, and known limitations.

## How it works

```
 customer ──USDC──▶ invoice address (counterfactual CREATE2, no code, no gas, no key)
                          │  watcher: log → receipt → official token → finality
                          ▼
              relayer (pays gas) ── InvoiceFactory.deployAndSweep() ──┬──▶ MerchantVault (owner = merchant multisig)   [vault mode]
                                                                      │    or the merchant's payout wallet            [direct mode]
                                                                      └──▶ treasury: the platform fee (fail-open)
```

* **Invoice contracts** — ERC-1167 clones with immutable args (destination, fee rate, kind, merchant, invoice; the token, chain, version,
  treasury and fee cap are immutables of the implementation). `sweep()` has no parameters, so nobody — including us — can pick a
  recipient. The address is computable before deployment and commits to every input.
* **Fee** — default 20 bps, rounded down, taken in the settlement transaction. The contract caps any fee at 100 bps (1%). If the treasury
  transfer fails the merchant gets the full amount (`FeeSkipped`). The fee is not refunded.
* **Payout modes** — vault (owner-only, delayed policy changes) or direct to a payout wallet, which needs a verified email, a wallet
  signature, an emailed confirmation link and a cooldown. Direct mode has no vault timelock: the payout wallet is a hot destination.
* **Merchant vault** — non-upgradeable; the only authority is its `owner`. Settlement modes `BALANCE_IN_VAULT` (default),
  `INSTANT_FORWARD`, `THRESHOLD_OR_PERIODIC` pay only an owner-authorised destination, activated after an owner-chosen delay.
* **Wallet checkout** — customer signs EIP-3009 `receiveWithAuthorization` to a stateless `PaymentRouter`; any relayer submits it. The nonce
  binds invoice, merchant, destination, fee, treasury, payer, amount, chain and router, so a signature can't be re-pointed.
* **Payment engine** — status is *derived* from verified facts (transfers, settlements, refunds); partial / repeated / late /
  over / wrong-token payments are handled and reorgs are reversed. Webhooks are signed, retried and idempotent.

Full design: [docs/architecture.md](docs/architecture.md) · Threats: [docs/threat-model.md](docs/threat-model.md)

**What a compromised backend can and cannot do.** It cannot move funds out of a vault or redirect funds sent to an address that has
already been issued. It **can** hand out new checkout addresses that pay an attacker, because a customer cannot verify an address. See
the threat model for the partial mitigation and the Direct-mode trade-off.

## Repository

| Path | What |
| --- | --- |
| `contracts/` | Foundry project: `MerchantVault`, `VaultFactory`, `InvoiceDeposit`, `InvoiceFactory`, `PaymentRouter`, tests, deploy script |
| `packages/shared` | Network registry, state machine, money, ids, zod schemas |
| `packages/blockchain` | viem adapter: offline CREATE2 derivation, EIP-3009, log scanning/verification, fee policy, dev chain helper |
| `packages/db` | Drizzle schema + migrations (Postgres; PGlite for local/tests), durable job queue |
| `packages/engine` | Payment engine: ingest, ledger, settlement planner, relayer, watcher, webhooks, refunds, auth |
| `apps/api` | Fastify REST API (`/v1`), idempotency, rate limits, OpenAPI |
| `apps/worker` | Background loop (watcher, relayer, forwarding, expiry, webhooks) |
| `apps/web` | Next.js: marketing site, hosted checkout, merchant dashboard |
| `scripts/` | Dev stack, deploy finalisation/approval, registry verification, testnet E2E |
| `docs/` | Architecture, threat model, API guide, runbooks, verification report, `openapi.json` |
| `deployments/` | Verified per-network deployment records |

## Quick start (local, no Docker needed)

Requirements: Node ≥ 22, pnpm, [Foundry](https://getfoundry.sh) (`forge`, `anvil`).

```bash
pnpm install
(cd contracts && forge build) && pnpm abis        # compile + export ABIs/artifacts
pnpm dev:stack                                    # local chain + contracts + embedded Postgres + API :4000 + worker + seeded merchant
pnpm web                                          # dashboard + checkout at http://localhost:3000   (separate terminal)
```

`dev:stack` prints a demo login (`demo@plinth.test`), a test API key and the local contract addresses. Create a payment:

```bash
curl -X POST localhost:4000/v1/payment-intents -H "Authorization: Bearer <test key>" \
  -H "Idempotency-Key: demo-1" -H "Content-Type: application/json" -d '{"amount":"25.00","order_reference":"DEMO-1"}'
```

Open the returned `checkout_url`. To drive the *wallet* flow in a browser with no wallet extension, run
`pnpm dev:wallet` (local public test key only) and see `docs/verification.md`.

### With separate API and worker processes (Postgres)

```bash
docker compose up -d db
cp .env.example .env        # fill APP_SECRET_KEY (openssl rand -hex 32), relayer key, RPC URLs
pnpm db:migrate
pnpm api &  pnpm worker &  pnpm web
```

## Tests

```bash
pnpm test:contracts                 # forge: unit, fuzz (512 runs), invariants, real-USDC-bytecode fork tests (opt-in via FORK_URL)
pnpm typecheck && pnpm test         # all TypeScript suites; they start real anvil chains and deploy the real contracts
pnpm verify:networks                # READ-ONLY probe of every registry network's live tokens, USDC and EURC (EIP-712 domain, EIP-3009)
pnpm e2e:local                      # acceptance run on a throwaway chain
pnpm e2e:testnet arc-testnet        # the same acceptance run on a real testnet (needs funded keys: docs/deploy-testnet.md)
```

## Going to a real network

* Testnet: [docs/deploy-testnet.md](docs/deploy-testnet.md)
* Mainnet: **do not** until [docs/mainnet-launch-checklist.md](docs/mainnet-launch-checklist.md) is complete (independent audit,
  KMS signer, spend policy, monitoring). Tooling refuses to proceed without explicit flags and a recorded human approval.
* Day-2 operations and incident runbooks: [docs/operations.md](docs/operations.md)

## Deliberate deviations from the brief (and why)

* **No Redis/BullMQ.** Durable jobs and the outbox live in Postgres (`FOR UPDATE SKIP LOCKED`), so the state change and its follow-up work
  commit atomically — stronger for money than a separate queue. Rate limiting is in-process (swap the store for multi-instance deployments).
* **Embedded Postgres (PGlite) for single-process dev/tests**, because Docker/Postgres were not available in the build environment.
  The `pg` driver path and the Docker Compose database were therefore **not exercised here** — see the verification report.
* **`packages/engine`** was added to the proposed layout to keep payment logic shared between `api` and `worker`.
