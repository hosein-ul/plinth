# Brand and wallet components

All logos come from `@web3icons/react` (MIT) or are built from SVG primitives. Never hand-write icon path data.

## Usage

```tsx
import { TokenIcon, ChainIcon, ChainBadge, AssetOnChain, WalletIcon, Logo, LogoMark, LogoMarkAnimated } from "@/components/brand";

<TokenIcon symbol="USDC" size={20} />                 // USDC | USDT | EURC
<ChainIcon id="base-mainnet" size={20} />              // any Plinth NetworkId, or an alias ("base", "local-dev")
<ChainBadge id="arc-testnet" />                        // icon + name + neutral "Testnet" chip
<AssetOnChain symbol="USDC" id="base-mainnet" size={28} />  // token with the chain mark as an overlapping badge
<WalletIcon id="metamask" size={28} icon={eip6963IconUrl} /> // falls back to the announced icon, then a Wallet tile
<Logo size={22} tone="light" /> <LogoMark tone="mono" /> <LogoMarkAnimated />
```

`networkIdForChainId(chainId)` maps an EVM chain id to a Plinth network id (unknown chains become `local-dev`, shown as a neutral Boxes tile).

## Wallet connection

```tsx
import { ConnectWalletDialog, WalletButton, useWalletConnect } from "@/components/wallet/connect-dialog";

<WalletButton chainId={84532} />   // connect / connected pill; opens the dialog in both states
<ConnectWalletDialog open={open} onOpenChange={setOpen} chainId={84532} onConnected={({ address }) => ...} />
```

Everything must render under `WalletProvider` (`components/checkout/wallet-provider.tsx`).

- Detected wallets come from EIP-6963 (wagmi `multiInjectedProviderDiscovery`), de-duplicated by rdns. Nothing connects until a click.
- Coinbase Wallet uses wagmi's `coinbaseWallet` connector.
- WalletConnect (QR) appears only when `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is set (create a project at https://cloud.reown.com). Without it the option is not rendered. Add the variable to `apps/web/.env.local`.
- Wrong network shows a "Switch network" action using wagmi `useSwitchChain` (`wallet_switchEthereumChain`, falling back to `wallet_addEthereumChain` on error 4902; the chain must be in the provider's configured chains).
- Mobile deep links for MetaMask, Trust and Phantom open the page in the wallet's own browser. Rainbow and Ledger use WalletConnect when enabled, otherwise their install pages.

## Licences and marks

- `@web3icons/react` code is MIT. The marks themselves belong to their owners (Circle, Tether, Arc, Base, Ethereum, MetaMask, Coinbase and others). Use them unedited and only to identify an asset, network or wallet. Do not imply endorsement or partnership.
- Arc and Polygon use the `background` variant because their `branded` variants are white on transparent. The Arc mark in `@web3icons` is a third-party redraw: compare it with the official file in Circle's brand kit (trademarks@circle.com, https://arc.io/brand-guidelines-and-partner-toolkit) before public launch and swap in the official asset if they differ.
- Testnets reuse the mainnet mark with a text "Testnet" chip. Never invent a testnet mark.
- Wallet icons announced through EIP-6963 are rendered only through `<img>`, never inlined.
- The Plinth mark and wordmark are original work. The wordmark outlines in `public/brand/plinth-logo*.svg` come from General Sans Semibold (Fontshare, Indian Type Foundry licence, free for commercial use).
