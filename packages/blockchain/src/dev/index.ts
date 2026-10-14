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
import type { Deployment, NetworkConfig } from "@plinth/shared";
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
  /** Accounts: 0 deployer, 1 relayer, 2 merchant owner, 3 customer, 4 second merchant owner. */
  accounts: ReturnType<typeof anvilAccount>[];
  usdc: Address;
  mine(blocks?: number): Promise<void>;
  setTime(unixSeconds: number): Promise<void>;
  mintUsdc(to: Address, amount: bigint): Promise<void>;
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
  const invoiceImplementation = await deploy("InvoiceDeposit");
  const version = 1;
  const invoiceFactory = await deploy("InvoiceFactory", [invoiceImplementation, usdc, vaultFactory, version]);
  const paymentRouter = await deploy("PaymentRouter", [usdc, vaultFactory]);
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
  };
  const deployment: Deployment = {
    networkId: network.id,
    chainId,
    version,
    vaultFactory,
    invoiceImplementation,
    invoiceFactory,
    paymentRouter,
    deployBlock: Number(head),
    deployer: accounts[0]!.address,
    bytecodeVerified: true,
    productionApproved: false,
    vaultConfigDelaySeconds: opts.vaultConfigDelaySeconds ?? 86_400,
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
    stop: async () => {
      proc.kill();
    },
  };
}

export { parseEther, privateKeyToAccount };
export type { Hex };
