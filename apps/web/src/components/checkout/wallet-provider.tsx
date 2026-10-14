"use client";
import { useMemo } from "react";
import { createConfig, http, WagmiProvider } from "wagmi";
import { coinbaseWallet, injected, walletConnect } from "wagmi/connectors";
import { defineChain, type Chain } from "viem";

/** WalletConnect is offered only when a project id is configured (https://cloud.reown.com). Never render a broken option. */
export const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() || "";
export const WALLETCONNECT_ENABLED = WALLETCONNECT_PROJECT_ID.length > 0;

export interface NetInfo {
  network: string;
  chain_id: number;
  name: string;
  environment: string;
  explorer_url: string;
  native_currency: { symbol: string; decimals: number };
  public_rpc_urls: string[];
}

export const toChain = (n: NetInfo): Chain =>
  defineChain({
    id: n.chain_id,
    name: n.name,
    nativeCurrency: { name: n.native_currency.symbol, symbol: n.native_currency.symbol, decimals: n.native_currency.decimals },
    rpcUrls: { default: { http: n.public_rpc_urls } },
    blockExplorers: { default: { name: "Explorer", url: n.explorer_url } },
    testnet: n.environment === "testnet",
  });

/**
 * wagmi is configured from the networks THIS payment accepts (served by the backend), not a hardcoded
 * list. Wallets are discovered through EIP-6963 (multiInjectedProviderDiscovery adds one connector per
 * announced wallet); the plain `injected()` connector is the fallback for legacy window.ethereum
 * wallets. Coinbase Wallet is always available; WalletConnect only when configured.
 * Nothing is connected until the customer asks (the dialog lives in components/wallet/connect-dialog.tsx).
 */
export function WalletProvider({ networks, children }: { networks: NetInfo[]; children: React.ReactNode }) {
  const config = useMemo(() => {
    const chains = networks.map(toChain) as [Chain, ...Chain[]];
    return createConfig({
      chains,
      transports: Object.fromEntries(chains.map((c) => [c.id, http(c.rpcUrls.default.http[0])])),
      connectors: [
        injected(),
        coinbaseWallet({ version: "4", appName: "Plinth", preference: "all" }),
        ...(WALLETCONNECT_ENABLED
          ? [walletConnect({ projectId: WALLETCONNECT_PROJECT_ID, showQrModal: false, metadata: { name: "Plinth", description: "Non-custodial USDC payments", url: typeof window === "undefined" ? "https://plinth.invalid" : window.location.origin, icons: [] } })]
          : []),
      ],
      ssr: true,
      multiInjectedProviderDiscovery: true,
    });
  }, [networks]);
  return <WagmiProvider config={config}>{children}</WagmiProvider>;
}
