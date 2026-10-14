import {
  decodeEventLog,
  encodeFunctionData,
  getAddress,
  isAddressEqual,
  parseAbiItem,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import type { Deployment, NetworkConfig } from "@plinth/shared";
import { InvoiceFactoryAbi, MerchantVaultAbi, PaymentRouterAbi, VaultFactoryAbi } from "./abi/generated";
import { computeInvoiceAddress } from "./invoice-address";
import type { RouterPayment } from "./eip3009";

const erc20Transfer = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const invoicePaidEvent = parseAbiItem(
  "event InvoicePaid(bytes32 indexed invoiceId, bytes32 indexed merchantId, address indexed vault, address payer, uint256 amount, bytes32 nonce)",
);
const sweptEvent = parseAbiItem(
  "event Swept(bytes32 indexed invoiceId, bytes32 indexed merchantId, address indexed vault, address token, uint256 amount)",
);
const erc20Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

export interface ObservedTransfer {
  /** Token contract that emitted the Transfer (may NOT be the official USDC). */
  token: Address;
  from: Address;
  to: Address;
  value: bigint;
  txHash: Hex;
  logIndex: number;
  blockNumber: bigint;
  blockHash: Hex;
}

export interface ObservedRouterPayment {
  invoiceId: Hex;
  merchantId: Hex;
  vault: Address;
  payer: Address;
  amount: bigint;
  nonce: Hex;
  txHash: Hex;
  logIndex: number;
  blockNumber: bigint;
  blockHash: Hex;
  emitter: Address;
}

export interface ObservedSweep {
  invoiceId: Hex;
  merchantId: Hex;
  vault: Address;
  token: Address;
  amount: bigint;
  /** The invoice clone that emitted the event. */
  emitter: Address;
  txHash: Hex;
  logIndex: number;
  blockNumber: bigint;
  blockHash: Hex;
}

export type TransferVerification =
  | { ok: true; transfer: ObservedTransfer; blockTimestamp: number; official: boolean }
  | { ok: false; reason: string };

export interface HeadInfo {
  head: bigint;
  /** Chain's finalized block when the finality strategy uses it. */
  finalized: bigint | null;
}

export interface VaultState {
  address: Address;
  owner: Address;
  pendingOwner: Address;
  mode: "BALANCE_IN_VAULT" | "INSTANT_FORWARD" | "THRESHOLD_OR_PERIODIC";
  destination: Address;
  threshold: bigint;
  interval: bigint;
  configDelay: bigint;
  balance: bigint;
  canForward: boolean;
  /** Policy change waiting out its configuration delay (null if none). */
  pending: { effectiveAt: bigint; mode: VaultState["mode"]; destination: Address } | null;
}

const MODES = ["BALANCE_IN_VAULT", "INSTANT_FORWARD", "THRESHOLD_OR_PERIODIC"] as const;

/**
 * Network-agnostic surface the payment engine depends on. A Solana adapter would implement the same
 * observation/verification methods with its own address derivation; it must NOT reuse CREATE2/EIP-3009.
 */
export interface ChainAdapter {
  readonly network: NetworkConfig;
  getHeadInfo(): Promise<HeadInfo>;
  blockMeta(blockNumber: bigint): Promise<{ hash: Hex; timestamp: number } | null>;
  scanTransfers(from: bigint, to: bigint, addresses: Address[]): Promise<ObservedTransfer[]>;
  verifyTransfer(txHash: Hex, logIndex: number, expectedTo: Address): Promise<TransferVerification>;
  isFinal(blockNumber: bigint, info: HeadInfo): boolean;
  confirmations(blockNumber: bigint, info: HeadInfo): number;
}

export class EvmAdapter implements ChainAdapter {
  constructor(
    readonly network: NetworkConfig,
    readonly deployment: Deployment,
    readonly client: PublicClient,
  ) {}

  get usdc(): Address {
    return this.network.usdc.address;
  }

  // ------------------------------------------------------------------ observation

  async getHeadInfo(): Promise<HeadInfo> {
    const head = await this.client.getBlockNumber();
    let finalized: bigint | null = null;
    if (this.network.finality.strategy === "finalized-tag") {
      const b = await this.client.getBlock({ blockTag: "finalized" });
      finalized = b.number;
    }
    return { head, finalized };
  }

  async blockMeta(blockNumber: bigint) {
    try {
      const b = await this.client.getBlock({ blockNumber });
      return { hash: b.hash as Hex, timestamp: Number(b.timestamp) };
    } catch {
      return null;
    }
  }

  confirmations(blockNumber: bigint, info: HeadInfo): number {
    return info.head >= blockNumber ? Number(info.head - blockNumber) + 1 : 0;
  }

  isFinal(blockNumber: bigint, info: HeadInfo): boolean {
    const f = this.network.finality;
    if (f.strategy === "finalized-tag") return info.finalized !== null && blockNumber <= info.finalized;
    return this.confirmations(blockNumber, info) >= f.confirmations;
  }

  /**
   * ALL ERC-20 Transfer events whose recipient is one of `addresses`, from any token contract.
   * Scanning every token (not just USDC) is what lets us flag unsupported-token deposits.
   */
  async scanTransfers(from: bigint, to: bigint, addresses: Address[]): Promise<ObservedTransfer[]> {
    const out: ObservedTransfer[] = [];
    if (addresses.length === 0 || to < from) return out;
    const chunk = 100;
    for (let i = 0; i < addresses.length; i += chunk) {
      const logs = await this.client.getLogs({
        event: erc20Transfer,
        args: { to: addresses.slice(i, i + chunk) },
        fromBlock: from,
        toBlock: to,
      });
      for (const l of logs) {
        // ERC-721 Transfer shares topic0 but has 4 topics; ERC-20 value lives in data.
        if (l.topics.length !== 3 || l.data.length !== 66) continue;
        if (l.blockNumber === null || l.logIndex === null || l.transactionHash === null || l.blockHash === null) continue;
        out.push({
          token: getAddress(l.address),
          from: getAddress(`0x${l.topics[1]!.slice(26)}`),
          to: getAddress(`0x${l.topics[2]!.slice(26)}`),
          value: BigInt(l.data),
          txHash: l.transactionHash,
          logIndex: l.logIndex,
          blockNumber: l.blockNumber,
          blockHash: l.blockHash,
        });
      }
    }
    return out.sort((a, b) => Number(a.blockNumber - b.blockNumber) || a.logIndex - b.logIndex);
  }

  /** InvoicePaid events from the PaymentRouter for the given invoice ids (wallet checkout). */
  async scanRouterPayments(from: bigint, to: bigint, invoiceIds: Hex[]): Promise<ObservedRouterPayment[]> {
    const out: ObservedRouterPayment[] = [];
    if (invoiceIds.length === 0 || to < from) return out;
    for (let i = 0; i < invoiceIds.length; i += 100) {
      const logs = await this.client.getLogs({
        address: this.deployment.paymentRouter,
        event: invoicePaidEvent,
        args: { invoiceId: invoiceIds.slice(i, i + 100) },
        fromBlock: from,
        toBlock: to,
      });
      for (const l of logs) {
        if (l.blockNumber === null || l.logIndex === null || l.transactionHash === null || l.blockHash === null) continue;
        out.push({ ...l.args, txHash: l.transactionHash, logIndex: l.logIndex, blockNumber: l.blockNumber, blockHash: l.blockHash, emitter: getAddress(l.address) } as ObservedRouterPayment);
      }
    }
    return out;
  }

  /** Swept events emitted by invoice clones (including sweeps triggered by third parties). */
  async scanSweeps(from: bigint, to: bigint, invoiceAddresses: Address[]): Promise<ObservedSweep[]> {
    const out: ObservedSweep[] = [];
    if (invoiceAddresses.length === 0 || to < from) return out;
    for (let i = 0; i < invoiceAddresses.length; i += 100) {
      const logs = await this.client.getLogs({ address: invoiceAddresses.slice(i, i + 100), event: sweptEvent, fromBlock: from, toBlock: to });
      for (const l of logs) {
        if (l.blockNumber === null || l.logIndex === null || l.transactionHash === null || l.blockHash === null) continue;
        out.push({ ...l.args, emitter: getAddress(l.address), txHash: l.transactionHash, logIndex: l.logIndex, blockNumber: l.blockNumber, blockHash: l.blockHash } as ObservedSweep);
      }
    }
    return out;
  }

  /** Decode router/sweep logs from a receipt we submitted ourselves (same shape as the scans). */
  decodeReceiptEvents(receipt: { logs: readonly { address: Address; topics: readonly Hex[]; data: Hex; logIndex: number | null; transactionHash: Hex | null; blockNumber: bigint | null; blockHash: Hex | null }[] }) {
    const payments: ObservedRouterPayment[] = [];
    const sweeps: ObservedSweep[] = [];
    for (const l of receipt.logs) {
      if (l.logIndex === null || l.transactionHash === null || l.blockNumber === null || l.blockHash === null) continue;
      const base = { txHash: l.transactionHash, logIndex: l.logIndex, blockNumber: l.blockNumber, blockHash: l.blockHash, emitter: getAddress(l.address) };
      try {
        if (isAddressEqual(l.address, this.deployment.paymentRouter)) {
          const d = decodeEventLog({ abi: [invoicePaidEvent], data: l.data, topics: l.topics as [Hex, ...Hex[]] });
          payments.push({ ...(d.args as object), ...base } as ObservedRouterPayment);
          continue;
        }
        const d = decodeEventLog({ abi: [sweptEvent], data: l.data, topics: l.topics as [Hex, ...Hex[]] });
        sweeps.push({ ...(d.args as object), ...base } as ObservedSweep);
      } catch {
        /* unrelated log */
      }
    }
    return { payments, sweeps };
  }

  /**
   * Independent verification: re-fetch the receipt and decode the specific log instead of trusting
   * the getLogs response. Checks execution status, destination, emitting contract and amount.
   */
  async verifyTransfer(txHash: Hex, logIndex: number, expectedTo: Address): Promise<TransferVerification> {
    let receipt;
    try {
      receipt = await this.client.getTransactionReceipt({ hash: txHash });
    } catch {
      return { ok: false, reason: "receipt not found" };
    }
    if (receipt.status !== "success") return { ok: false, reason: "transaction reverted" };
    const log = receipt.logs.find((l) => l.logIndex === logIndex);
    if (!log) return { ok: false, reason: "log not found in receipt" };
    let decoded;
    try {
      decoded = decodeEventLog({ abi: [erc20Transfer], data: log.data, topics: log.topics });
    } catch {
      return { ok: false, reason: "log is not an ERC-20 Transfer" };
    }
    if (!isAddressEqual(decoded.args.to, expectedTo)) return { ok: false, reason: "recipient mismatch" };
    const meta = await this.blockMeta(receipt.blockNumber);
    if (!meta) return { ok: false, reason: "block not found" };
    if (meta.hash.toLowerCase() !== receipt.blockHash.toLowerCase()) return { ok: false, reason: "block hash changed" };
    return {
      ok: true,
      blockTimestamp: meta.timestamp,
      official: isAddressEqual(log.address, this.usdc),
      transfer: {
        token: getAddress(log.address),
        from: decoded.args.from,
        to: decoded.args.to,
        value: decoded.args.value,
        txHash,
        logIndex,
        blockNumber: receipt.blockNumber,
        blockHash: receipt.blockHash,
      },
    };
  }

  // ------------------------------------------------------------------ reads

  async usdcBalanceOf(address: Address): Promise<bigint> {
    return this.client.readContract({ address: this.usdc, abi: erc20Abi, functionName: "balanceOf", args: [address] });
  }

  async hasCode(address: Address): Promise<boolean> {
    const code = await this.client.getCode({ address });
    return !!code && code !== "0x";
  }

  predictInvoiceAddress(vault: Address, merchantId: Hex, invoiceId: Hex): Address {
    return computeInvoiceAddress({
      factory: this.deployment.invoiceFactory,
      implementation: this.deployment.invoiceImplementation,
      token: this.usdc,
      vault,
      merchantId,
      invoiceId,
      chainId: this.network.chainId,
      version: this.deployment.version,
    });
  }

  async predictVault(merchantId: Hex, owner: Address): Promise<Address> {
    return this.client.readContract({
      address: this.deployment.vaultFactory,
      abi: VaultFactoryAbi,
      functionName: "predictVault",
      args: [merchantId, owner, BigInt(this.deployment.vaultConfigDelaySeconds)],
    });
  }

  async isRegisteredVault(vault: Address): Promise<boolean> {
    return this.client.readContract({ address: this.deployment.vaultFactory, abi: VaultFactoryAbi, functionName: "isVault", args: [vault] });
  }

  async readVault(vault: Address): Promise<VaultState> {
    const read = <T extends string>(fn: T) =>
      this.client.readContract({ address: vault, abi: MerchantVaultAbi, functionName: fn as never }) as Promise<any>;
    const [owner, pendingOwner, settlement, configDelay, balance, can, pending] = await Promise.all([
      read("owner"),
      read("pendingOwner"),
      read("settlement"),
      read("CONFIG_DELAY"),
      read("balance"),
      read("canForward"),
      read("pendingSettlement"),
    ]);
    return {
      address: vault,
      owner,
      pendingOwner,
      mode: MODES[Number(settlement.mode)]!,
      destination: settlement.destination,
      threshold: BigInt(settlement.threshold),
      interval: BigInt(settlement.interval),
      configDelay: BigInt(configDelay),
      balance,
      canForward: can[0] as boolean,
      pending: BigInt(pending.effectiveAt) === 0n ? null : { effectiveAt: BigInt(pending.effectiveAt), mode: MODES[Number(pending.settlement.mode)]!, destination: pending.settlement.destination },
    };
  }

  async isAuthorizationUsed(authorizer: Address, nonce: Hex): Promise<boolean> {
    return this.client.readContract({
      address: this.usdc,
      abi: [
        { type: "function", name: "authorizationState", stateMutability: "view", inputs: [{ type: "address" }, { type: "bytes32" }], outputs: [{ type: "bool" }] },
      ] as const,
      functionName: "authorizationState",
      args: [authorizer, nonce],
    });
  }

  // ------------------------------------------------------------------ calldata (relayer-submitted)

  encodeDeployAndSweep(merchantId: Hex, invoiceId: Hex, vault: Address): { to: Address; data: Hex } {
    return {
      to: this.deployment.invoiceFactory,
      data: encodeFunctionData({ abi: InvoiceFactoryAbi, functionName: "deployAndSweep", args: [merchantId, invoiceId, vault] }),
    };
  }

  encodeCreateVault(merchantId: Hex, owner: Address): { to: Address; data: Hex } {
    return {
      to: this.deployment.vaultFactory,
      data: encodeFunctionData({
        abi: VaultFactoryAbi,
        functionName: "createVault",
        args: [merchantId, owner, BigInt(this.deployment.vaultConfigDelaySeconds)],
      }),
    };
  }

  encodeApplyPending(vault: Address): { to: Address; data: Hex } {
    return { to: vault, data: encodeFunctionData({ abi: MerchantVaultAbi, functionName: "applyPendingSettlement" }) };
  }

  encodeForward(vault: Address): { to: Address; data: Hex } {
    return { to: vault, data: encodeFunctionData({ abi: MerchantVaultAbi, functionName: "forward" }) };
  }

  encodePay(p: RouterPayment, v: number, r: Hex, s: Hex): { to: Address; data: Hex } {
    return {
      to: this.deployment.paymentRouter,
      data: encodeFunctionData({ abi: PaymentRouterAbi, functionName: "pay", args: [p, v, r, s] }),
    };
  }
}
