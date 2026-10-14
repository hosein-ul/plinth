# Vendored contract dependencies

These are vendored as plain source (no git submodules) so builds are reproducible offline.

| Library | Version | Source |
| --- | --- | --- |
| OpenZeppelin Contracts | v5.6.1 — commit `5fd1781b1454fd1ef8e722282f86f9293cacf256` | https://github.com/OpenZeppelin/openzeppelin-contracts (used for `Clones` with immutable args, `Create2`, `SafeERC20`, `Ownable2Step`, `ReentrancyGuard`) |
| forge-std | v1.17.0 (as installed by `forge init` with Foundry 1.8.1; test/script helpers only, not part of deployed bytecode) | https://github.com/foundry-rs/forge-std |

Re-vendor OpenZeppelin with: `git clone --depth 1 --branch v5.6.1 https://github.com/OpenZeppelin/openzeppelin-contracts.git lib/openzeppelin-contracts && rm -rf lib/openzeppelin-contracts/.git`
Any change to the OpenZeppelin version changes deployed bytecode and therefore requires a fresh audit and `finalize-deployment`.
