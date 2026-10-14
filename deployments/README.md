# Deployment records

One JSON file per network, written by `pnpm finalize:deployment` after the Foundry deploy script ran and the
on-chain bytecode and wiring were verified. The application refuses to enable a network without a matching,
`bytecodeVerified` record, and refuses a mainnet unless `productionApproved` was set by a human via
`pnpm approve:deployment`.

- `raw-<chainId>.json` — raw output of `contracts/script/Deploy.s.sol` (input to the finalizer)
- `<network-id>.json`  — verified record consumed by the app (see `Deployment` in `packages/shared/src/networks.ts`)

No secrets live here: only public addresses.
