import type { Address } from "viem";

/**
 * Central network registry. Static facts only (chain id, official USDC, capabilities).
 * Deployed contract addresses live in `deployments/<id>.json` and are merged at runtime, so a
 * network cannot be operational without a recorded, verified deployment.
 *
 * Every USDC address below comes from Circle's official list
 * (https://developers.circle.com/stablecoins/usdc-contract-addresses) and was probed on-chain on
 * `verifiedAt` (see scripts/verify-networks.ts). Never edit an address from any other source.
 */
export type NetworkId =
  | "arc-testnet"
  | "base-sepolia"
  | "arc-mainnet"
  | "base-mainnet"
  | "arbitrum-mainnet"
  | "optimism-mainnet"
  | "polygon-mainnet"
  | "ethereum-mainnet";

export interface FinalityPolicy {
  /** `confirmations`: head - block + 1 >= n.  `finalized-tag`: block <= the chain's finalized block. */
  strategy: "confirmations" | "finalized-tag";
  confirmations: number;
  note: string;
}

export interface NetworkConfig {
  /** Built-in ids are `NetworkId`; local/dev networks may use any slug (e.g. `local-dev`). */
  id: string;
  chainId: number;
  name: string;
  environment: "testnet" | "mainnet";
  nativeCurrency: { symbol: string; decimals: number };
  /** Public defaults for development. Production must override with dedicated providers. */
  rpcUrls: string[];
  explorerUrl: string;
  usdc: {
    address: Address;
    decimals: 6;
    symbol: "USDC";
    eip712: { name: string; version: string };
  };
  authorization: {
    transferWithAuthorization: boolean;
    receiveWithAuthorization: boolean;
    permit: boolean;
    /** true only if the receive/transfer selectors were probed on this chain's official token. */
    verified: boolean;
    verifiedAt: string | null;
  };
  gas: {
    model: "usdc-native" | "eth";
    /** Arc rejects maxFeePerGas below this floor (wei, 18-dec native units). */
    minMaxFeePerGasWei?: bigint;
  };
  finality: FinalityPolicy;
  circle: {
    cctpDomain: number | null;
    /** Product support is independent of USDC support. null = not verified, do not rely on it. */
    gatewayNanopayments: boolean | null;
    gasStation: boolean | null;
  };
  /** Max block range per eth_getLogs request on typical public RPCs for this chain. */
  maxLogRange: number;
}

const GWEI = 1_000_000_000n;

export const NETWORKS: Record<NetworkId, NetworkConfig> = {
  "arc-testnet": {
    id: "arc-testnet",
    chainId: 5042002,
    name: "Arc Testnet",
    environment: "testnet",
    nativeCurrency: { symbol: "USDC", decimals: 18 },
    rpcUrls: ["https://rpc.testnet.arc.io"],
    explorerUrl: "https://explorer.testnet.arc.io",
    usdc: {
      address: "0x3600000000000000000000000000000000000000",
      decimals: 6,
      symbol: "USDC",
      eip712: { name: "USDC", version: "2" },
    },
    authorization: {
      transferWithAuthorization: true,
      receiveWithAuthorization: true,
      permit: true,
      verified: true,
      verifiedAt: "2026-10-09",
    },
    gas: { model: "usdc-native", minMaxFeePerGasWei: 20n * GWEI },
    finality: {
      strategy: "confirmations",
      confirmations: 1,
      note: "Arc provides deterministic finality; inclusion in a block is final. Re-verify before mainnet.",
    },
    circle: { cctpDomain: 26, gatewayNanopayments: null, gasStation: null },
    maxLogRange: 2000,
  },
  "base-sepolia": {
    id: "base-sepolia",
    chainId: 84532,
    name: "Base Sepolia",
    environment: "testnet",
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://sepolia.base.org"],
    explorerUrl: "https://sepolia.basescan.org",
    usdc: {
      address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      decimals: 6,
      symbol: "USDC",
      eip712: { name: "USDC", version: "2" },
    },
    authorization: {
      transferWithAuthorization: true,
      receiveWithAuthorization: true,
      permit: true,
      verified: true,
      verifiedAt: "2026-10-09",
    },
    gas: { model: "eth" },
    finality: { strategy: "confirmations", confirmations: 12, note: "L2 soft confirmations; reorgs are rare but possible." },
    circle: { cctpDomain: 6, gatewayNanopayments: null, gasStation: null },
    maxLogRange: 5000,
  },
  "arc-mainnet": {
    id: "arc-mainnet",
    chainId: 5042,
    name: "Arc",
    environment: "mainnet",
    nativeCurrency: { symbol: "USDC", decimals: 18 },
    rpcUrls: ["https://rpc.mainnet.arc.io"],
    explorerUrl: "https://explorer.arc.io",
    usdc: {
      address: "0x3600000000000000000000000000000000000000",
      decimals: 6,
      symbol: "USDC",
      eip712: { name: "USDC", version: "2" },
    },
    authorization: {
      transferWithAuthorization: true,
      receiveWithAuthorization: true,
      permit: true,
      verified: true,
      verifiedAt: "2026-10-09",
    },
    gas: { model: "usdc-native", minMaxFeePerGasWei: 20n * GWEI },
    finality: {
      strategy: "confirmations",
      confirmations: 1,
      note: "Deterministic finality per Arc documentation; confirm parameters against mainnet before enabling.",
    },
    circle: { cctpDomain: 26, gatewayNanopayments: null, gasStation: null },
    maxLogRange: 2000,
  },
  "base-mainnet": {
    id: "base-mainnet",
    chainId: 8453,
    name: "Base",
    environment: "mainnet",
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://mainnet.base.org"],
    explorerUrl: "https://basescan.org",
    usdc: {
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      decimals: 6,
      symbol: "USDC",
      eip712: { name: "USD Coin", version: "2" },
    },
    authorization: {
      transferWithAuthorization: true,
      receiveWithAuthorization: true,
      permit: true,
      verified: true,
      verifiedAt: "2026-10-09",
    },
    gas: { model: "eth" },
    finality: { strategy: "confirmations", confirmations: 20, note: "Conservative L2 depth; tune per risk appetite." },
    circle: { cctpDomain: 6, gatewayNanopayments: null, gasStation: null },
    maxLogRange: 5000,
  },
  "arbitrum-mainnet": {
    id: "arbitrum-mainnet",
    chainId: 42161,
    name: "Arbitrum One",
    environment: "mainnet",
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://arb1.arbitrum.io/rpc"],
    explorerUrl: "https://arbiscan.io",
    usdc: {
      address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      decimals: 6,
      symbol: "USDC",
      eip712: { name: "USD Coin", version: "2" },
    },
    authorization: {
      transferWithAuthorization: true,
      receiveWithAuthorization: true,
      permit: true,
      verified: true,
      verifiedAt: "2026-10-09",
    },
    gas: { model: "eth" },
    finality: { strategy: "confirmations", confirmations: 20, note: "Conservative L2 depth; tune per risk appetite." },
    circle: { cctpDomain: 3, gatewayNanopayments: null, gasStation: null },
    maxLogRange: 10000,
  },
  "optimism-mainnet": {
    id: "optimism-mainnet",
    chainId: 10,
    name: "OP Mainnet",
    environment: "mainnet",
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://mainnet.optimism.io"],
    explorerUrl: "https://optimistic.etherscan.io",
    usdc: {
      address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
      decimals: 6,
      symbol: "USDC",
      eip712: { name: "USD Coin", version: "2" },
    },
    authorization: {
      transferWithAuthorization: true,
      receiveWithAuthorization: true,
      permit: true,
      verified: true,
      verifiedAt: "2026-10-09",
    },
    gas: { model: "eth" },
    finality: { strategy: "confirmations", confirmations: 20, note: "Conservative L2 depth; tune per risk appetite." },
    circle: { cctpDomain: 2, gatewayNanopayments: null, gasStation: null },
    maxLogRange: 5000,
  },
  "polygon-mainnet": {
    id: "polygon-mainnet",
    chainId: 137,
    name: "Polygon PoS",
    environment: "mainnet",
    nativeCurrency: { symbol: "POL", decimals: 18 },
    rpcUrls: [],
    explorerUrl: "https://polygonscan.com",
    usdc: {
      address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
      decimals: 6,
      symbol: "USDC",
      eip712: { name: "USD Coin", version: "2" },
    },
    // Not probed: no working public RPC was available. Do not enable until verified.
    authorization: {
      transferWithAuthorization: false,
      receiveWithAuthorization: false,
      permit: false,
      verified: false,
      verifiedAt: null,
    },
    gas: { model: "eth" },
    finality: { strategy: "confirmations", confirmations: 128, note: "Polygon PoS reorg depth; verify before use." },
    circle: { cctpDomain: 7, gatewayNanopayments: null, gasStation: null },
    maxLogRange: 3000,
  },
  "ethereum-mainnet": {
    id: "ethereum-mainnet",
    chainId: 1,
    name: "Ethereum",
    environment: "mainnet",
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://ethereum-rpc.publicnode.com"],
    explorerUrl: "https://etherscan.io",
    usdc: {
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      decimals: 6,
      symbol: "USDC",
      eip712: { name: "USD Coin", version: "2" },
    },
    authorization: {
      transferWithAuthorization: true,
      receiveWithAuthorization: true,
      permit: true,
      verified: true,
      verifiedAt: "2026-10-09",
    },
    gas: { model: "eth" },
    finality: { strategy: "finalized-tag", confirmations: 0, note: "Wait for the finalized block (~13 min)." },
    circle: { cctpDomain: 0, gatewayNanopayments: null, gasStation: null },
    maxLogRange: 5000,
  },
};

export const NETWORK_IDS = Object.keys(NETWORKS) as NetworkId[];

export function getNetwork(id: string): NetworkConfig {
  const n = (NETWORKS as Record<string, NetworkConfig | undefined>)[id];
  if (!n) throw new Error(`Unknown network: ${id}`);
  return n;
}

export function tryGetNetwork(id: string): NetworkConfig | undefined {
  return (NETWORKS as Record<string, NetworkConfig | undefined>)[id];
}

/** Contract deployment record written by contracts/script/Deploy.s.sol + scripts/record-deployment.ts. */
export interface Deployment {
  networkId: string;
  chainId: number;
  version: number;
  vaultFactory: Address;
  invoiceImplementation: Address;
  invoiceFactory: Address;
  paymentRouter: Address;
  deployBlock: number;
  deployer: Address;
  /** Set only after bytecode on the target chain was compared with the audited build artifacts. */
  bytecodeVerified: boolean;
  /** Set by a human after reviewing explorer verification + operational readiness. Required for mainnet. */
  productionApproved: boolean;
  vaultConfigDelaySeconds: number;
}

export interface OperationalGate {
  operational: boolean;
  reasons: string[];
}

/**
 * A network is operational only when: it is listed in ENABLED_NETWORKS, its token behaviour was
 * probed, a deployment record matches its chain id, and (for mainnets) the operator explicitly
 * allowed mainnet AND a human flagged the deployment productionApproved.
 */
export function operationalGate(
  net: NetworkConfig,
  deployment: Deployment | undefined,
  env: { enabledNetworks: string[]; allowMainnet: boolean },
): OperationalGate {
  const reasons: string[] = [];
  if (!env.enabledNetworks.includes(net.id)) reasons.push("not listed in ENABLED_NETWORKS");
  if (!net.authorization.verified) reasons.push("USDC capabilities not verified");
  if (net.rpcUrls.length === 0) reasons.push("no RPC configured");
  if (!deployment) reasons.push("no deployment record");
  else {
    if (deployment.chainId !== net.chainId) reasons.push("deployment chain id mismatch");
    if (!deployment.bytecodeVerified) reasons.push("deployed bytecode not verified");
  }
  if (net.environment === "mainnet") {
    if (!env.allowMainnet) reasons.push("ALLOW_MAINNET is not true");
    if (deployment && !deployment.productionApproved) reasons.push("deployment not productionApproved");
  }
  return { operational: reasons.length === 0, reasons };
}
