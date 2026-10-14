import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEther,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import type { Deployment, NetworkConfig, TokenConfig, TokenContracts, TokenSymbol } from "@plinth/shared";
import { loadArtifact } from "../artifacts";
import { MockFiatTokenAbi } from "../abi/generated";

/** Well-known anvil mnemonic. PUBLIC test keys: only ever valid on a local throwaway chain. */
export const ANVIL_MNEMONIC = "test test test test test test test test test test test junk";
export const anvilAccount = (i: number) => mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: i });

function anvilBinary(): string {
  const exe = process.platform === "win32" ? "anvil.exe" : "anvil";
  const p = join(process.env.FOUNDRY_BIN ?? join(homedir(), ".foundry", "bin"), exe);
  return existsSync(p) ? p : exe;
}

export interface DevChain {
  rpcUrl: string;
  chainId: number;
  network: NetworkConfig;
  deployment: Deployment;
  publicClient: PublicClient;
  walletFor(index: number): WalletClient;
  /** Accounts: 0 deployer, 1 relayer, 2 merchant owner, 3 customer, 4 second merchant owner, 9 treasury. */
  accounts: ReturnType<typeof anvilAccount>[];
  /** Platform fee recipient (account 9) baked into the dev implementation and router. */
  treasury: Address;
  usdc: Address;
  /** Address of every payment token deployed on this chain (USDC always; EURC when requested). */
  tokens: Partial<Record<TokenSymbol, Address>>;
  mine(blocks?: number): Promise<void>;
  setTime(unixSeconds: number): Promise<void>;
  mintUsdc(to: Address, amount: bigint): Promise<void>;
  /** Mint any deployed payment token (a test double with a public mint). */
  mintToken(symbol: TokenSymbol, to: Address, amount: bigint): Promise<void>;
  stop(): Promise<void>;
}

export interface StartOptions {
  port?: number;
  chainId?: number;
  /** Fork an existing network instead of a blank chain (e.g. Arc Testnet with real USDC bytecode). */
  forkUrl?: string;
  /** Slug used for the runtime network config. */
  networkId?: string;
  confirmations?: number;
  blockTimeSeconds?: number;
  vaultConfigDelaySeconds?: number;
  /** Immutable fee cap of the dev deployment (default 100 = 1%). */
  maxFeeBps?: number;
  /** Payment tokens to deploy contracts for. USDC is always included; add "EURC" for a second stablecoin. */
  tokens?: TokenSymbol[];
}

export async function startDevChain(opts: StartOptions = {}): Promise<DevChain> {
  const port = opts.port ?? 18545 + Math.floor(Math.random() * 2000);
  const chainId = opts.chainId ?? 31337;
  const args = ["--port", String(port), "--chain-id", String(chainId), "--silent", "--mnemonic", ANVIL_MNEMONIC];
  if (opts.blockTimeSeconds) args.push("--block-time", String(opts.blockTimeSeconds));
  const proc: ChildProcess = spawn(anvilBinary(), args, { stdio: "ignore", windowsHide: true });
  const rpcUrl = `http://127.0.0.1:${port}`;
  const chain = defineChain({
    id: chainId,
    name: "Local Dev",
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl), pollingInterval: 100, cacheTime: 0 }) as PublicClient;
  for (let i = 0; i < 100; i++) {
    try {
      await publicClient.getChainId();
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
      if (i === 99) {
        proc.kill();
        throw new Error("anvil did not start (is Foundry installed? set FOUNDRY_BIN)");
      }
    }
  }
  const accounts = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(anvilAccount);
  const walletFor = (i: number) => createWalletClient({ chain, transport: http(rpcUrl), account: accounts[i]!, pollingInterval: 100 });
  const deployer = walletFor(0);

  const deploy = async (name: string, ctorArgs: readonly unknown[] = []): Promise<Address> => {
    const art = loadArtifact(name);
    const { abiOf } = await import("./abis");
    const hash = await deployer.deployContract({
      abi: abiOf(name),
      bytecode: art.bytecode,
      args: ctorArgs as never,
      account: accounts[0]!,
      chain,
    });
    const r = await publicClient.waitForTransactionReceipt({ hash });
    if (!r.contractAddress || r.status !== "success") throw new Error(`deploy ${name} failed`);
    return r.contractAddress;
  };

  const usdc = await deploy("MockFiatToken");
  const vaultFactory = await deploy("VaultFactory", [usdc]);
  const treasury = accounts[9]!.address;
  const maxFeeBps = opts.maxFeeBps ?? 100;
  const version = 2;
  const invoiceImplementation = await deploy("InvoiceDeposit", [usdc, treasury, maxFeeBps, version]);
  const invoiceFactory = await deploy("InvoiceFactory", [invoiceImplementation, vaultFactory]);
  const paymentRouter = await deploy("PaymentRouter", [usdc, vaultFactory, treasury, maxFeeBps]);

  // Further payment tokens each get a complete contract set of their own: the token is an immutable of every contract.
  const tokenAddresses: Partial<Record<TokenSymbol, Address>> = { USDC: usdc };
  const extraContracts: Partial<Record<TokenSymbol, TokenContracts>> = {};
  const extraTokens: Partial<Record<TokenSymbol, TokenConfig>> = {};
  const mockOf: Record<TokenSymbol, string> = { USDC: "MockFiatToken", EURC: "MockEurc" };
  for (const symbol of (opts.tokens ?? []).filter((t) => t !== "USDC")) {
    const token = await deploy(mockOf[symbol]);
    const vf = await deploy("VaultFactory", [token]);
    const impl = await deploy("InvoiceDeposit", [token, treasury, maxFeeBps, version]);
    const factory = await deploy("InvoiceFactory", [impl, vf]);
    const router = await deploy("PaymentRouter", [token, vf, treasury, maxFeeBps]);
    tokenAddresses[symbol] = token;
    extraContracts[symbol] = { vaultFactory: vf, invoiceImplementation: impl, invoiceFactory: factory, paymentRouter: router, version, deployBlock: Number(await publicClient.getBlockNumber()), bytecodeVerified: true };
    extraTokens[symbol] = {
      symbol, address: token, decimals: 6, eip712: { name: symbol, version: "2" },
      authorization: { transferWithAuthorization: true, receiveWithAuthorization: true, permit: false, verified: true, verifiedAt: new Date().toISOString().slice(0, 10) },
    };
  }
  const head = await publicClient.getBlockNumber();

  const network: NetworkConfig = {
    id: opts.networkId ?? "local-dev",
    chainId,
    name: "Local Dev (anvil)",
    environment: "testnet",
    nativeCurrency: { symbol: "ETH", decimals: 18 },
    rpcUrls: [rpcUrl],
    explorerUrl: "http://localhost/explorer",
    usdc: { address: usdc, decimals: 6, symbol: "USDC", eip712: { name: "USDC", version: "2" } },
    authorization: {
      transferWithAuthorization: true,
      receiveWithAuthorization: true,
      permit: false,
      verified: true,
      verifiedAt: new Date().toISOString().slice(0, 10),
    },
    gas: { model: "eth" },
    finality: { strategy: "confirmations", confirmations: opts.confirmations ?? 1, note: "local anvil" },
    circle: { cctpDomain: null, gatewayNanopayments: null, gasStation: null },
    maxLogRange: 10_000,
    ...(Object.keys(extraTokens).length ? { extraTokens } : {}),
  };
  const deployment: Deployment = {
    networkId: network.id,
    chainId,
    version,
    vaultFactory,
    invoiceImplementation,
    invoiceFactory,
    paymentRouter,
    treasury,
    maxFeeBps,
    deployBlock: Number(head),
    deployer: accounts[0]!.address,
    bytecodeVerified: true,
    productionApproved: false,
    vaultConfigDelaySeconds: opts.vaultConfigDelaySeconds ?? 86_400,
    ...(Object.keys(extraContracts).length ? { tokens: extraContracts } : {}),
  };

  const rpc = (method: string, params: unknown[] = []) =>
    publicClient.request({ method: method as never, params: params as never });
  return {
    rpcUrl,
    chainId,
    network,
    deployment,
    publicClient,
    walletFor,
    accounts,
    treasury,
    usdc,
    mine: async (blocks = 1) => {
      await rpc("anvil_mine", [`0x${blocks.toString(16)}`]);
    },
    setTime: async (t: number) => {
      await rpc("evm_setNextBlockTimestamp", [t]);
      await rpc("anvil_mine", ["0x1"]);
    },
    mintUsdc: async (to: Address, amount: bigint) => {
      const hash = await deployer.writeContract({ address: usdc, abi: MockFiatTokenAbi, functionName: "mint", args: [to, amount], account: accounts[0]!, chain });
      await publicClient.waitForTransactionReceipt({ hash });
    },
    tokens: tokenAddresses,
    mintToken: async (symbol: TokenSymbol, to: Address, amount: bigint) => {
      const address = tokenAddresses[symbol];
      if (!address) throw new Error(`${symbol} is not deployed on this dev chain`);
      const hash = await deployer.writeContract({ address, abi: MockFiatTokenAbi, functionName: "mint", args: [to, amount], account: accounts[0]!, chain });
      await publicClient.waitForTransactionReceipt({ hash });
    },
    stop: async () => {
      proc.kill();
    },
  };
}

export { parseEther, privateKeyToAccount };
export type { Hex };
