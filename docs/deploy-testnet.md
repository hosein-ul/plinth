# Deploying to a testnet (Arc Testnet, Base Sepolia)

Everything below is read-only until you broadcast. Testnet keys are throwaway; **never reuse them on a mainnet.**

## 0 · Preconditions

```bash
pnpm install && (cd contracts && forge build) && pnpm abis
pnpm verify:networks arc-testnet base-sepolia     # must PASS: chain id, USDC, EIP-712 domain, EIP-3009
pnpm test:contracts
```

`verify:networks` proves the registry's facts against the live token. If a line says FAIL, **do not deploy**; fix the registry from Circle's
official list ([USDC addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses)).

## 1 · Keys and funds (needs a human: faucets use captchas)

```bash
pnpm keys:testnet            # writes .env.testnet (gitignored) and prints the addresses to fund
```

| Network | Faucet | Funding |
| --- | --- | --- |
| Arc Testnet (5042002) | https://faucet.circle.com → *Arc Testnet* | One request covers gas **and** USDC (USDC is Arc's gas token). Fund DEPLOYER, RELAYER, CUSTOMER |
| Base Sepolia (84532) | Circle faucet for USDC + any Base Sepolia ETH faucet | ETH for DEPLOYER/RELAYER/CUSTOMER gas; USDC for CUSTOMER |

Arc fee model (from Arc's docs): fees in USDC, EIP-1559 with a **minimum `maxFeePerGas` of 20 gwei** (the relayer enforces this floor).

## 2 · Deploy

Preferred: a Foundry keystore (`cast wallet import deployer --interactive`). For throwaway testnet keys a raw key is acceptable **locally only**.

```bash
set -a; source .env.testnet; set +a
cd contracts
USDC_ADDRESS=0x3600000000000000000000000000000000000000 EXPECTED_CHAIN_ID=5042002 \
  forge script script/Deploy.s.sol --rpc-url https://rpc.testnet.arc.io --private-key $DEPLOYER_PRIVATE_KEY --broadcast
cd .. && pnpm finalize:deployment --network arc-testnet
```

The script refuses a mismatched chain id, a token without code or with ≠ 6 decimals, and any production chain id without `ALLOW_MAINNET_DEPLOY=true`.
`finalize:deployment` then **byte-compares** all four contracts with the build artifacts (immutables masked), checks the wiring to the official USDC, and
checks the offline CREATE2 derivation equals `InvoiceFactory.predict()`. Only then does it write `deployments/arc-testnet.json`
(`bytecodeVerified: true`, `productionApproved: false`).

Base Sepolia: `USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e EXPECTED_CHAIN_ID=84532 … --rpc-url https://sepolia.base.org`, then `--network base-sepolia`.

Optional: verify source on the explorer (`forge verify-contract`, explorer API key required — not automated here).

## 3 · Run the acceptance test with real transactions

```bash
pnpm e2e:testnet arc-testnet
```

Creates a merchant, has the relayer deploy a vault owned by `MERCHANT_OWNER`, pays an address-checkout invoice from `CUSTOMER`, asserts the
sweep reached the vault **with the invoice address never holding gas**, performs a gasless wallet payment (customer signs, relayer submits),
verifies the signed webhooks, and writes `docs/verification/arc-testnet.json` with explorer links, balances and gas used.

## 4 · Run the stack against the testnet

```bash
cp .env.example .env     # ENABLED_NETWORKS=arc-testnet, RELAYER_PRIVATE_KEY from .env.testnet, APP_SECRET_KEY, DATABASE_URL
docker compose up -d db && pnpm db:migrate
pnpm api & pnpm worker & pnpm web
```

## Notes

* A fresh `forge script` run overwrites `deployments/raw-<chainId>.json`; re-run `finalize:deployment` after every deploy.
* Changing `CONTRACT_VERSION` changes every deposit address; do not change it for a live network.
* `VAULT_CONFIG_DELAY_SECONDS` (default 86400) is baked into each vault at creation; shorten it only on testnets.
