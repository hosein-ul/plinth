import {
  createPublicClient,
  createWalletClient,
  defineChain,
  fallback,
  http,
  type Chain,
  type PublicClient,
  type Transport,
  type WalletClient,
  type LocalAccount,
} from "viem";
import type { NetworkConfig } from "@plinth/shared";

export function viemChain(net: NetworkConfig, rpcUrls: string[]): Chain {
  return defineChain({
    id: net.chainId,
    name: net.name,
    nativeCurrency: { name: net.nativeCurrency.symbol, symbol: net.nativeCurrency.symbol, decimals: net.nativeCurrency.decimals },
    rpcUrls: { default: { http: rpcUrls } },
    blockExplorers: { default: { name: "Explorer", url: net.explorerUrl } },
    testnet: net.environment === "testnet",
  });
}

/**
 * RPC resolution: RPC_URLS_<NETWORK_ID> (comma separated, e.g. RPC_URLS_ARC_TESTNET) overrides the
 * registry's public defaults. Production must configure at least two independent providers.
 */
export function resolveRpcUrls(net: NetworkConfig, env: Record<string, string | undefined> = process.env): string[] {
  const key = `RPC_URLS_${net.id.toUpperCase().replace(/-/g, "_")}`;
  const configured = (env[key] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return configured.length ? configured : net.rpcUrls;
}

export function createTransport(urls: string[]): Transport {
  const transports = urls.map((u) => http(u, { retryCount: 2, retryDelay: 300, timeout: 15_000 }));
  if (transports.length === 0) throw new Error("No RPC URL configured");
  return transports.length === 1 ? transports[0]! : fallback(transports, { rank: false, retryCount: 1 });
}

export function createChainPublicClient(net: NetworkConfig, urls: string[]): PublicClient {
  // cacheTime 0: finality decisions must never use a cached (stale) head block number.
  return createPublicClient({ chain: viemChain(net, urls), transport: createTransport(urls), cacheTime: 0 }) as PublicClient;
}

export function createChainWalletClient(net: NetworkConfig, urls: string[], account: LocalAccount): WalletClient {
  return createWalletClient({ chain: viemChain(net, urls), transport: createTransport(urls), account });
}
