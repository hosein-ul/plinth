# Circle integrations — what was verified, what is built

Checked against Circle's current docs on 2026-10-09. Support for USDC on a chain does **not** imply support for any other Circle product there.

| Product | Finding | Status in this repo |
| --- | --- | --- |
| **USDC / EIP-3009** | Official addresses from Circle's list; probed on-chain: `receiveWithAuthorization` ("caller must be the payee"), `transferWithAuthorization`, `permit`, EIP-712 domain reproduces `DOMAIN_SEPARATOR` on Arc (test+main), Base Sepolia, Base, Arbitrum One, OP Mainnet, Ethereum. Polygon PoS not probed (no working public RPC). | **Used.** `pnpm verify:networks` |
| **CCTP** | Domains: Ethereum 0, OP 2, Arbitrum 3, Base 6 (mainnet + Base Sepolia), Polygon 7, **Arc 26** (mainnet + testnet; standard transfer, upfront fees, Forwarding Service; Fast Transfer N/A). | Domains recorded in the registry. **Cross-chain consolidation not implemented.** Design: separate `cross_chain_transfers` lifecycle (burn tx → attestation → mint tx) with its own fee accounting and recovery; never on the same-chain payment path. |
| **Gateway Nanopayments** | Gasless signed USDC payments on supported EVM chains (x402/agent use). Arc and Base Sepolia support **not confirmed** on the docs page (it defers to a "supported blockchains" reference); Base is shown in examples. Different model (signed payment + batched settlement) from invoice-address sweeping. | Not integrated. Registry field `gatewayNanopayments: null` ("unverified — do not rely on it"). Would sit behind an adapter; checkout does not depend on it. |
| **Gas Station** | Sponsors fees for **ERC-4337 smart-contract-account Circle Wallets** (developer- or user-controlled); EOA support not documented; lists Arc and Base (mainnet + Base Sepolia). | **Not used.** Our payers are EOAs and our relayer pays gas directly, so Gas Station does not apply. Kept as a future option for an SCA-based payer flow. |
| **Circle Wallets / Smart Contract Platform** | Alternative signing/deployment backends. | Not used; the relayer uses a viem signer behind `SignerProvider` (a Circle developer-controlled wallet could implement it). |

Rule applied: where support could not be verified, the integration is isolated behind the registry/adapter boundary and the core flow does not depend on it.
