import type { LocalAccount, PublicClient, WalletClient } from "viem";
import type { EvmAdapter } from "@plinth/blockchain";
import type { Database } from "@plinth/db";
import type { Deployment, NetworkConfig } from "@plinth/shared";
import type { EmailSender } from "./email";

/** Per-network guardrails on what the relayer may spend and do. Fail-closed on mainnet. */
export interface RelayerPolicy {
  /** Maximum total fee spend per rolling 24h, in the chain's native wei. */
  maxDailyGasWei: bigint;
  /** Hard cap on gasLimit * maxFeePerGas for any single transaction. */
  maxFeePerTxWei: bigint;
  /** Maximum relayer transactions per rolling 24h. */
  maxOpsPerDay: number;
  /** Do not send if the signer balance would drop below this. */
  minBalanceWei: bigint;
  /** Alert when the signer balance is below this. */
  lowBalanceAlertWei: bigint;
  /** Replace a pending transaction with higher fees after this long. */
  replaceAfterSeconds: number;
  maxReplacements: number;
  /** Do not spend gas sweeping less than this (dust-griefing protection). */
  minSweepUnits: bigint;
  /** Automatic settlement attempts before a human must retry. */
  maxSettlementAttempts: number;
}

export interface ChainRuntime {
  network: NetworkConfig;
  deployment: Deployment;
  adapter: EvmAdapter;
  client: PublicClient;
  /** Absent when no relayer key is configured: the chain is then observe-only. */
  signer?: LocalAccount;
  wallet?: WalletClient;
  policy: RelayerPolicy;
  /** Effective state: the static gate AND the latest on-chain deployment check. Non-operational chains accept no new invoices. */
  operational: boolean;
  gateReasons: string[];
  /** Result of operationalGate() alone (registry, env and deployment record). */
  baseOperational: boolean;
  baseReasons: string[];
  /** Latest comparison of the deployed contracts with the deployment record and configuration. */
  deploymentCheck?: { ok: boolean; reasons: string[]; at: number; registry: boolean };
}

export interface EngineConfig {
  publicWebUrl: string;
  /** 32-byte key encrypting webhook signing secrets at rest. */
  secretKey: Buffer;
  /** Keep watching invoice addresses this long after creation (late deposits). */
  lateWindowDays: number;
  /** Allow webhooks to http://localhost style targets (development only). */
  allowPrivateWebhookTargets: boolean;
  alertWebhookUrl?: string;
  sessionTtlSeconds: number;
  /** Default platform fee in basis points for merchants without their own override. */
  platformFeeBps: number;
  /** How long an emailed one-time link stays valid. */
  emailLinkTtlSeconds: number;
  /** How recently a user must have signed in again to change sensitive settings. */
  reauthWindowSeconds: number;
  /** Require a signature from the vault owner wallet when a vault is created (default on in production). */
  requireVaultOwnerProof: boolean;
  /** Time a newly confirmed payout wallet waits before new invoices use it (0 in development). */
  payoutCooldownSeconds: number;
  /** Web3Auth client id the identity tokens must be issued for. */
  web3authClientId?: string;
  /** Replaces identity-token verification (tests only). */
  verifyIdentityToken?: (idToken: string) => Promise<import("./web3auth").Web3AuthIdentity>;
}

export interface Logger {
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
}

export type AlertSeverity = "info" | "warning" | "critical";
export interface Alert {
  key: string;
  severity: AlertSeverity;
  title: string;
  detail: Record<string, unknown>;
}
export interface AlertSink {
  raise(alert: Alert): Promise<void>;
}

export interface Engine {
  db: Database;
  cfg: EngineConfig;
  chains: Map<string, ChainRuntime>;
  log: Logger;
  alerts: AlertSink;
  email: EmailSender;
  now(): Date;
}

export function chainOf(e: Engine, networkId: string): ChainRuntime {
  const c = e.chains.get(networkId);
  if (!c) throw new EngineError("UNKNOWN_NETWORK", `Network ${networkId} is not configured`, 400);
  return c;
}

export class EngineError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const norm = (a: string) => a.toLowerCase();
