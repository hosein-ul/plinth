# Deployment records

One JSON file per network, written by `pnpm finalize:deployment` after the Foundry deploy script ran and the
on-chain bytecode and wiring were verified. The application refuses to enable a network without a matching,
`bytecodeVerified` record, and refuses a mainnet unless `productionApproved` was set by a human via
`pnpm approve:deployment`.

- `raw-<chainId>.json` — raw output of `contracts/script/Deploy.s.sol` for USDC (input to the finalizer)
- `raw-<chainId>-<TOKEN>.json` — the same for a further token (e.g. `raw-5042002-EURC.json`; run the deploy script with `TOKEN_SYMBOL=EURC`)
- `<network-id>.json`  — verified record consumed by the app (see `Deployment` in `packages/shared/src/networks.ts`).
  A further token has its own contract set (the token is an immutable of the implementation) and is added to the same
  file by `pnpm finalize:deployment --network <id> --token EURC` under `tokens.EURC`; the USDC record must exist first.

No secrets live here: only public addresses.
