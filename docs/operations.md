# Operations runbook

## Processes

| Process | Replicas | Notes |
| --- | --- | --- |
| `apps/api` | N (stateless) | rate-limit store is in-memory per process |
| `apps/worker` | **1 active per network** recommended | watcher/relayer are idempotent and safe to race, but one relayer signer ⇒ one nonce sequence; a per-network in-process lock serialises it. Run a standby, not two actives, until multi-signer sharding exists |
| `apps/web` | N | needs `API_URL` (server-side only) |
| Postgres | managed | PITR + restore drills; the ledger is the system of record |

## Secrets & keys

* Production relayer key: implement `SignerProvider` against your KMS/HSM (returns a viem `LocalAccount` whose `signTransaction` calls the KMS).
  Env keys are refused in production unless `ALLOW_ENV_SIGNER_IN_PRODUCTION=true`.
* Keep three roles separate: **deployer** (one-off), **relayer** (gas only), **merchant owners** (never ours).
* Rotate `APP_SECRET_KEY` by re-encrypting `webhook_endpoints.secret_enc` (decrypt with old, encrypt with new) in a maintenance window.

## Alerts and what to do

| Alert key / title | Meaning | Action |
| --- | --- | --- |
| `low-balance:<net>` | relayer gas below `lowBalanceAlertWei` | top up the relayer wallet (it holds nothing else) |
| `balance-block:<net>` | cannot submit without breaching `minBalanceWei` | top up immediately; ops stay QUEUED and are safe |
| `fee-cap:<net>` / `gas-cap:<net>` / `ops-cap:<net>` | policy limit reached | inspect the cause (fee spike, abuse); raise the limit deliberately or wait |
| `stuck-op:<opId>` | max fee replacements reached | check mempool/RPC; cancel by sending a 0-value tx on that nonce from the relayer, then the op auto-requeues |
| `op-failed:<opId>` / `settlement-failed:<pi>` | simulation or on-chain revert | read `relayer_operations.last_error`; fix cause (e.g. vault not registered); the planner retries with back-off |
| `settlement-exhausted:<addr>` | `maxSettlementAttempts` used up | fix the cause; anyone (including the merchant) can still call `InvoiceDeposit.sweep()` — funds are never trapped by our software |
| `invalid-asset:<tx>` | wrong token sent to an invoice | informational; merchant vault owner can recover via `InvoiceDeposit.rescueToken` |
| `loop-failing:<net>:watcher/relayer` | ≥ 5 consecutive failures (RPC outage) | check providers; state is durable, work resumes and rescans an overlap window |

## Emergency stop

`POST /admin/relayer/<network>/pause {"reason":"…"}` (header `x-admin-token`) or `RELAYER_KILL_SWITCH=true` stops **new** relayer actions; in-flight
transactions still reconcile; watcher/ledger keep running so no deposit is missed. Resume with `/resume`. Because merchants own their vaults and anyone
can call `sweep()`, pausing never endangers funds; it only delays settlement.

## Common procedures

* **RPC outage:** providers fail over automatically (`RPC_URLS_*`). After recovery the watcher rescans `finality + 6` blocks of overlap; if the outage was
  long, set `watcher_cursors.last_scanned_block` to the last known-good block and let it catch up (≤ 40 chunks/tick).
* **Missed deposit suspicion:** reset the cursor for the network to the invoice's `created_block`; ingestion is idempotent.
* **Reorg:** automatic; look for `chain.reorg` in the payment timeline and `chain.reorg_detected` in the audit log.
* **Stuck invoice at `SETTLEMENT_FAILED`:** fix cause; the `replan` job retries after back-off; or call `sweep()` yourself.
* **Add a network:** `docs/architecture.md` §6. **Retire a network:** remove from `ENABLED_NETWORKS`; existing vaults remain the merchants' on-chain.
* **Reconciliation:** compare `GET /v1/vaults/<net>` balance with the sum of `SETTLED_TO_VAULT` ledger entries minus withdrawals/forwards. Swept events whose invoice, merchant, vault or token disagree with our records are rejected and written to the audit log (`sweep.mismatch`). A scheduled automatic balance-vs-ledger reconciliation job is **not built yet** (see verification report).

## Backups & retention

Back up Postgres; keep `audit_events`, `ledger_entries`, `transactions`, `payment_events` indefinitely. `webhook_attempts` may be pruned after 90 days.
`relayer_operations.calldata` for wallet payments is wiped on completion by design (it contains customer signatures).
