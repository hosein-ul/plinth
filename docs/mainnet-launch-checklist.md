# Mainnet launch checklist

Mainnet is the product's target, **not** a default. This repository never deploys to a mainnet, moves real funds or enables production signing on its own.
Every item must be checked, with an owner and a date, before `pnpm approve:deployment` is run. The same checklist applies per network.

## A · Contracts

- [ ] **Independent security audit** of `MerchantVault`, `VaultFactory`, `InvoiceDeposit`, `InvoiceFactory`, `PaymentRouter` completed; all high/medium findings resolved; report referenced in the approval.
- [ ] Foundry suite green on the audited commit (`pnpm test:contracts`); fork tests run against the target chain's live USDC (`FORK_URL`/`FORK_USDC`).
- [ ] `pnpm verify:networks <network>` PASS against **the production RPC**; the token address re-checked by a second person against Circle's page.
- [ ] Deployment with a **hardware wallet or KMS-backed key**; `ALLOW_MAINNET_DEPLOY=true` set deliberately; deployer key is not the relayer key and holds no leftover funds.
- [ ] `pnpm finalize:deployment` PASS (bytecode == audited artifacts, wiring, derivation). Source verified on the block explorer.
- [ ] `CONTRACT_VERSION` and `VAULT_CONFIG_DELAY_SECONDS` final (changing either later changes addresses/vault creation).
- [ ] A canary run with a trivial amount: invoice → sweep → vault → owner withdraw, using the real token on the real chain, for **each token** and **each payout mode** (vault and direct), checking that the treasury received exactly the fee.
- [ ] **Treasury**: the address in `packages/shared/src/fees.ts` for this network is the one the business controls, was checked by a second person, has **no contract code** on this chain (`finalize-deployment` reports it), and its key is held in a hardware wallet or multisig. Rotating it later means a new contract version (docs/operations.md).
- [ ] **Fee**: `PLATFORM_FEE_BPS` and every per-merchant override are within the deployed `MAX_FEE_BPS` (1%); public Pricing, FAQ and Terms say the same numbers (they ship in the same release as the contracts).
- [ ] **Tokens**: every token enabled on the network (USDC; EURC on Arc) has its own contract set finalized (`--token`), `pnpm verify:networks` PASS for it, and its address was re-checked against the network's official documentation.

## B · Keys and custody

- [ ] Email delivery (`RESEND_API_KEY`, `EMAIL_FROM` on a verified domain) tested end to end for verification and payout-wallet confirmation; `PAYOUT_COOLDOWN_SECONDS` and `REQUIRE_VAULT_OWNER_PROOF` set deliberately; Web3Auth "User details in ID token" enabled if Google sign-in is offered.
- [ ] Relayer key lives in KMS/HSM via a `SignerProvider`; `ALLOW_ENV_SIGNER_IN_PRODUCTION` is **not** set.
- [ ] Relayer wallet funded only with a bounded gas budget; refill procedure documented; alert thresholds set.
- [ ] Merchant vault owners are multisigs (docs and onboarding copy say so); no gateway-controlled key is an owner or can become one.
- [ ] `APP_SECRET_KEY`, DB credentials, admin token in a secrets manager; rotation procedure tested.

## C · Policy and limits

- [ ] `RELAYER_POLICY_<NETWORK>` set explicitly (daily gas, per-tx cap, op cap, min/low balance, `minSweepUnits` sized to gas economics). Each network has tier defaults (low caps on the L2s, higher on Ethereum, native-token sized on Polygon and Arc); review them and override per network before opening a mainnet.
- [ ] Finality parameters for the network reviewed against current chain behaviour (Arc deterministic finality is documented, not assumed; L2 depth chosen per risk appetite).
- [ ] Per-payment amount ceilings and merchant onboarding limits decided (not yet enforced in code — see verification report).

## D · Infrastructure & observability

- [ ] ≥ 2 independent RPC providers per network (`RPC_URLS_*`), tested failover; archive/log range limits verified against `maxLogRange`.
- [ ] Managed Postgres with PITR, tested restore; migrations applied (`RUN_MIGRATIONS` off in prod, run as a deploy step).
- [ ] API behind TLS + WAF/gateway; shared rate-limit store if > 1 replica; `TRUST_PROXY` set correctly.
- [ ] Alerts wired (`ALERT_WEBHOOK_URL`): low relayer balance, stuck op, settlement failed/exhausted, invalid asset, loop failing (RPC outage), fee-cap/gas-cap hits. On-call and runbooks (docs/operations.md) rehearsed.
- [ ] `/public/status` monitored externally; `/admin/relayer` reachable only from the operator network.

## E · Legal / product

- [ ] Terms, privacy policy, sanctions/KYB posture decided by counsel; support and security contact addresses configured (`NEXT_PUBLIC_*`).
- [ ] Marketing copy re-read for claims: no "audited", no volume/customers/partners that do not exist.

## F · Enable

1. `I_HAVE_COMPLETED_THE_MAINNET_CHECKLIST=yes pnpm approve:deployment --network <id> --reviewer "<name>" --audit "<ref>"` and commit the updated record.
2. Add the network to `ENABLED_NETWORKS`, set `ALLOW_MAINNET=true`, deploy; confirm `/public/status` shows it `operational`.
3. Enable for a single design-partner merchant first; watch the first 24 h of settlements with the pause switch at hand.
