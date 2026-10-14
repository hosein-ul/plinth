import { EvmAdapter, createChainPublicClient, createChainWalletClient, loadDeployment, resolveRpcUrls } from "@plinth/blockchain";
import { schema, type Database } from "@plinth/db";
import { DEFAULT_FEE_BPS, NETWORKS, operationalGate, type Deployment, type NetworkConfig } from "@plinth/shared";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex, LocalAccount, PublicClient } from "viem";
import { DefaultAlertSink } from "./alerts";
import { checkChain } from "./deployment-check";
import type { AlertSink, ChainRuntime, Engine, EngineConfig, Logger } from "./context";
import { parseSecretKey } from "./crypto";
import { resolvePolicyDetails } from "./policy";

export const consoleLogger: Logger = {
  info: (m, c) => console.log(JSON.stringify({ level: "info", msg: m, ...c })),
  warn: (m, c) => console.warn(JSON.stringify({ level: "warn", msg: m, ...c })),
  error: (m, c) => console.error(JSON.stringify({ level: "error", msg: m, ...c })),
};

export const silentLogger: Logger = { info() {}, warn() {}, error() {} };

/**
 * Where the relayer's signing key comes from. The env provider is for development and for small
 * deployments that accept the risk; production should implement this interface against a KMS/HSM
 * (the viem LocalAccount returned only needs signTransaction).
 */
export interface SignerProvider {
  getSigner(networkId: string): LocalAccount | undefined;
}

export function envSignerProvider(env: Record<string, string | undefined> = process.env): SignerProvider {
  return {
    getSigner(networkId) {
      const key = env[`RELAYER_PRIVATE_KEY_${networkId.toUpperCase().replace(/-/g, "_")}`] ?? env.RELAYER_PRIVATE_KEY;
      if (!key) return undefined;
      if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("RELAYER_PRIVATE_KEY must be a 0x-prefixed 32-byte hex string");
      return privateKeyToAccount(key as Hex);
    },
  };
}

export interface CreateEngineOptions {
  db: Database;
  env?: Record<string, string | undefined>;
  logger?: Logger;
  alerts?: AlertSink;
  signers?: SignerProvider;
  now?: () => Date;
  /** Extra runtime-defined networks (local dev chains, tests). */
  extraNetworks?: { network: NetworkConfig; deployment: Deployment; client?: PublicClient }[];
  config?: Partial<EngineConfig>;
}

export async function createEngine(opts: CreateEngineOptions): Promise<Engine> {
  const env = opts.env ?? process.env;
  const log = opts.logger ?? consoleLogger;
  const now = opts.now ?? (() => new Date());
  const enabled = (env.ENABLED_NETWORKS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const allowMainnet = env.ALLOW_MAINNET === "true";
  const signers = opts.signers ?? envSignerProvider(env);

  const production = env.NODE_ENV === "production";
  if (production && !opts.signers && (env.RELAYER_PRIVATE_KEY || Object.keys(env).some((k) => k.startsWith("RELAYER_PRIVATE_KEY_"))) && env.ALLOW_ENV_SIGNER_IN_PRODUCTION !== "true") {
    throw new Error("Refusing to load a relayer private key from the environment in production. Provide a KMS-backed SignerProvider, or set ALLOW_ENV_SIGNER_IN_PRODUCTION=true to accept the risk explicitly.");
  }

  const cfg: EngineConfig = {
    publicWebUrl: env.PUBLIC_WEB_URL ?? "http://localhost:3000",
    secretKey: parseSecretKey(env.APP_SECRET_KEY ?? (production ? "" : "00".repeat(32))),
    lateWindowDays: Number(env.LATE_WINDOW_DAYS ?? 30),
    allowPrivateWebhookTargets: env.ALLOW_PRIVATE_WEBHOOK_TARGETS === "true",
    alertWebhookUrl: env.ALERT_WEBHOOK_URL,
    sessionTtlSeconds: Number(env.SESSION_TTL_SECONDS ?? 60 * 60 * 24 * 7),
    platformFeeBps: Number(env.PLATFORM_FEE_BPS ?? DEFAULT_FEE_BPS),
    ...opts.config,
  };
  const alerts = opts.alerts ?? new DefaultAlertSink(opts.db, log, cfg.alertWebhookUrl, undefined, now);

  const chains = new Map<string, ChainRuntime>();
  const register = (network: NetworkConfig, deployment: Deployment | undefined, client?: PublicClient) => {
    const gate = operationalGate(network, deployment, { enabledNetworks: [...enabled, ...(opts.extraNetworks?.map((x) => x.network.id) ?? [])], allowMainnet });
    const resolved = resolvePolicyDetails(network, env);
    const policy = resolved.policy;
    if (!deployment) return;
    const urls = resolveRpcUrls(network, env);
    let c = client;
    if (!c) {
      if (urls.length === 0) return;
      c = createChainPublicClient(network, urls);
    }
    let signer: LocalAccount | undefined;
    const policyBlocked = false;
    if (gate.operational) {
      if (network.environment === "mainnet" && resolved.source === "default") {
        log.warn("mainnet relayer is using the default spending limits for its tier; review RELAYER_POLICY_<NETWORK>", { network: network.id, tier: resolved.tier });
      }
      signer = signers.getSigner(network.id);
    }
    chains.set(network.id, {
      network, deployment, adapter: new EvmAdapter(network, deployment, c), client: c, signer,
      wallet: signer && !client ? createChainWalletClient(network, urls, signer) : undefined, policy,
      operational: gate.operational && !policyBlocked, gateReasons: policyBlocked ? [...gate.reasons, "relayer policy not configured"] : gate.reasons,
      baseOperational: gate.operational && !policyBlocked, baseReasons: policyBlocked ? [...gate.reasons, "relayer policy not configured"] : gate.reasons,
    });
    registryIds.add(network.id);
  };
  const registryIds = new Set<string>();

  for (const net of Object.values(NETWORKS)) register(net, loadDeployment(net.id));
  const registryOnly = new Set(registryIds);
  for (const x of opts.extraNetworks ?? []) register(x.network, x.deployment, x.client);

  const engine: Engine = { db: opts.db, cfg, chains, log, alerts, now };
  // Read the deployed contracts back and compare them with the records before any network takes payments.
  for (const chain of chains.values()) {
    if (chain.baseOperational) await checkChain(engine, chain, registryOnly.has(chain.network.id));
  }
  await syncNetworks(engine);
  return engine;
}

/** Mirror the registry + deployments into the `networks` and `assets` tables (FK targets, dashboard reads). */
export async function syncNetworks(e: Engine): Promise<void> {
  for (const c of e.chains.values()) {
    await e.db
      .insert(schema.networks)
      .values({ id: c.network.id, chainId: c.network.chainId, name: c.network.name, environment: c.network.environment, enabled: c.operational, operational: c.operational, gateReasons: c.gateReasons, deployment: c.deployment as never })
      .onConflictDoUpdate({ target: schema.networks.id, set: { enabled: c.operational, operational: c.operational, gateReasons: c.gateReasons, deployment: c.deployment as never, updatedAt: e.now() } });
    await e.db
      .insert(schema.assets)
      .values({ id: `${c.network.id}:usdc`, networkId: c.network.id, symbol: "USDC", address: c.network.usdc.address.toLowerCase(), decimals: 6, isOfficial: true, supportsReceiveAuthorization: c.network.authorization.receiveWithAuthorization })
      .onConflictDoNothing();
  }
}
