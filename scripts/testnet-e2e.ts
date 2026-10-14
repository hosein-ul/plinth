/**
 * End-to-end acceptance run against a REAL network (or a local chain with --local).
 *
 *   pnpm e2e:testnet arc-testnet          # needs .env.testnet funded + deployments/arc-testnet.json
 *   pnpm e2e:testnet --local              # same script on a throwaway local chain (dry run of this script)
 *
 * It performs the full product lifecycle with real transactions and real receipts:
 *   merchant signup → vault creation via relayer → webhook endpoint → address-checkout payment sent by a
 *   customer wallet → watcher detection/verification/finality → gasless deploy+sweep into the vault →
 *   connected-wallet payment (EIP-3009, customer signs, relayer submits) → signed webhooks verified →
 *   on-chain balance assertions → results written to docs/verification/<network>.json.
 * Amounts are tiny. Mainnets are refused outright.
 */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, createWalletClient, formatUnits, getAddress, http, parseUnits, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { connect } from "@plinth/db";
import { schema, eq } from "@plinth/db";
import {
  consoleLogger, createEngine, createEndpoint, createPaymentIntent, enableNetwork, paymentDetail, prepareWalletPayment, processWebhookJobs, relayerTick, signup,
  submitWalletPayment, verifyWebhookSignature, watcherTick, silentLogger, forwardTick, expireDueIntents, type AuthContext, type Engine,
} from "@plinth/engine";
import { EvmAdapter, MockFiatTokenAbi, loadDeployment, resolveRpcUrls } from "@plinth/blockchain";
import { startDevChain } from "@plinth/blockchain/dev";
import { NETWORKS, toBytes32Id } from "@plinth/shared";

const local = process.argv.includes("--local");
const wanted = process.argv.slice(2).find((a) => !a.startsWith("--"));
const erc20 = [
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

function loadEnvFile(path: string) {
  try {
    for (const l of readFileSync(path, "utf8").split("\n")) if (l.includes("=") && !l.startsWith("#")) process.env[l.slice(0, l.indexOf("="))] ??= l.slice(l.indexOf("=") + 1).trim();
  } catch { /* optional */ }
}

const results: Record<string, unknown> = { startedAt: new Date().toISOString(), steps: [] as unknown[] };
const step = (name: string, detail: Record<string, unknown> = {}) => {
  (results.steps as unknown[]).push({ name, ...detail, at: new Date().toISOString() });
  console.log(`✔ ${name}`, Object.keys(detail).length ? JSON.stringify(detail, (_k, v) => (typeof v === "bigint" ? v.toString() : v)) : "");
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- environment
let engine: Engine;
let networkId: string;
let explorer: (path: string) => string;
let customerKey: Hex, ownerKey: Hex;
let readerClient: ReturnType<typeof createPublicClient>;
let usdcAddr: Address;
let send: (to: Address, data: Hex, from: Hex) => Promise<Hex>;
let stopAll = async () => {};
let mint: ((to: Address, units: bigint) => Promise<void>) | null = null;
let fastBlocks: () => Promise<void> = async () => {};

const handle = connect("pglite://memory");
await handle.migrate();
const received: { headers: Record<string, string>; body: string }[] = [];
const sink = createServer((req, res) => {
  let b = "";
  req.on("data", (c) => (b += c));
  req.on("end", () => { received.push({ headers: req.headers as Record<string, string>, body: b }); res.end("ok"); });
});
await new Promise<void>((r) => sink.listen(0, "127.0.0.1", r));
const hookUrl = `http://127.0.0.1:${(sink.address() as AddressInfo).port}/hook`;

if (local) {
  const chain = await startDevChain({ confirmations: 2, blockTimeSeconds: 1, vaultConfigDelaySeconds: 60 });
  networkId = chain.network.id;
  readerClient = chain.publicClient as never;
  usdcAddr = chain.usdc;
  explorer = (p) => `local:${p}`;
  const hexKey = (i: number) => `0x${Buffer.from(chain.accounts[i]!.getHdKey().privateKey!).toString("hex")}` as Hex;
  customerKey = hexKey(3);
  ownerKey = hexKey(2);
  const relayerKey = hexKey(1);
  engine = await createEngine({
    db: handle.db, logger: silentLogger,
    env: { APP_SECRET_KEY: "33".repeat(32), ALLOW_PRIVATE_WEBHOOK_TARGETS: "true" },
    signers: { getSigner: () => privateKeyToAccount(relayerKey) },
    extraNetworks: [{ network: chain.network, deployment: chain.deployment, client: chain.publicClient }],
  });
  mint = (to, units) => chain.mintUsdc(to, units);
  send = async (to, data, from) => {
    const a = privateKeyToAccount(from);
    const w = createWalletClient({ account: a, chain: undefined, transport: http(chain.rpcUrl) });
    const h = await w.sendTransaction({ to, data, chain: undefined });
    await chain.publicClient.waitForTransactionReceipt({ hash: h });
    return h;
  };
  stopAll = async () => chain.stop();
} else {
  loadEnvFile(".env.testnet");
  networkId = wanted ?? "";
  const net = NETWORKS[networkId as keyof typeof NETWORKS];
  if (!net) throw new Error(`Usage: pnpm e2e:testnet <${Object.keys(NETWORKS).filter((k) => NETWORKS[k as keyof typeof NETWORKS].environment === "testnet").join("|")}> | --local`);
  if (net.environment !== "testnet") throw new Error("Refusing to run the acceptance script on a mainnet");
  const dep = loadDeployment(net.id);
  if (!dep) throw new Error(`No deployments/${net.id}.json — deploy with forge and run pnpm finalize:deployment first`);
  for (const k of ["RELAYER_PRIVATE_KEY", "CUSTOMER_PRIVATE_KEY", "MERCHANT_OWNER_PRIVATE_KEY"]) if (!process.env[k]) throw new Error(`${k} missing (run pnpm keys:testnet)`);
  customerKey = process.env.CUSTOMER_PRIVATE_KEY as Hex;
  ownerKey = process.env.MERCHANT_OWNER_PRIVATE_KEY as Hex;
  const urls = resolveRpcUrls(net);
  readerClient = createPublicClient({ transport: http(urls[0]) }) as never;
  usdcAddr = net.usdc.address;
  explorer = (p) => `${net.explorerUrl}/${p}`;
  engine = await createEngine({
    db: handle.db, logger: consoleLogger,
    env: { ...process.env, ENABLED_NETWORKS: net.id, APP_SECRET_KEY: "33".repeat(32), ALLOW_PRIVATE_WEBHOOK_TARGETS: "true" } as never,
  });
  const chainRt = engine.chains.get(net.id);
  if (!chainRt?.operational) throw new Error(`Network not operational: ${chainRt?.gateReasons.join("; ")}`);
  if (!chainRt.signer) throw new Error("No relayer signer (RELAYER_PRIVATE_KEY)");
  send = async (to, data, from) => {
    const a = privateKeyToAccount(from);
    const w = createWalletClient({ account: a, transport: http(urls[0]), chain: chainRt.client.chain });
    const h = await w.sendTransaction({ to, data, chain: chainRt.client.chain });
    await readerClient.waitForTransactionReceipt({ hash: h });
    return h;
  };
}
void formatUnits; void MockFiatTokenAbi; void forwardTick; void expireDueIntents; void toBytes32Id;

const chainRt = engine.chains.get(networkId)!;
const adapter: EvmAdapter = chainRt.adapter;
const customer = privateKeyToAccount(customerKey);
const owner = privateKeyToAccount(ownerKey);
results.network = networkId;
results.contracts = chainRt.deployment;
results.relayer = chainRt.signer!.address;
results.customer = customer.address;
results.vaultOwner = owner.address;

async function pump(until: () => Promise<boolean>, label: string, timeoutMs = 240_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    await watcherTick(engine, networkId);
    await relayerTick(engine, networkId);
    await processWebhookJobs(engine);
    if (await until()) return;
    await sleep(local ? 700 : 2000);
  }
  throw new Error(`Timed out waiting for: ${label}`);
}
const bal = (a: Address) => readerClient.readContract({ address: usdcAddr, abi: erc20, functionName: "balanceOf", args: [a] });

// ---------------------------------------------------------------- run
try {
  const AMOUNT_ADDRESS = "0.05";
  const AMOUNT_WALLET = "0.03";
  const units = (s: string) => parseUnits(s, 6);
  if (mint) await mint(customer.address, units("10"));
  const custStart = await bal(customer.address);
  if (custStart < units("0.2")) throw new Error(`Customer ${customer.address} holds ${formatUnits(custStart, 6)} USDC; fund it from the faucet first`);
  step("customer funded", { address: customer.address, usdc: formatUnits(custStart, 6) });

  const { merchantId } = await signup(engine, { business_name: "E2E Merchant", email: `e2e-${Date.now()}@example.test`, password: "e2e-correct-horse-battery" }, { type: "SYSTEM" });
  const ctx: AuthContext = { merchantId, environment: "test", actor: { type: "SYSTEM" }, role: "OWNER", via: "session" };
  const hook = await createEndpoint(engine, merchantId, "test", { url: hookUrl, events: ["*"] });

  const vaultInfo = await enableNetwork(engine, ctx, { network: networkId, owner_address: owner.address });
  await pump(async () => (await engine.db.select().from(schema.merchantVaults).where(eq(schema.merchantVaults.merchantId, merchantId)))[0]?.status === "ACTIVE", "vault ACTIVE");
  const vault = getAddress(vaultInfo.vault_address);
  const vstate = await adapter.readVault(vault);
  step("vault deployed by relayer, owned by merchant", { vault, owner: vstate.owner, gatewayIsOwner: vstate.owner.toLowerCase() === chainRt.signer!.address.toLowerCase(), explorer: explorer(`address/${vault}`) });
  if (vstate.owner.toLowerCase() !== owner.address.toLowerCase()) throw new Error("vault owner mismatch");
  const vaultBefore = await bal(vault);

  // ---- A. address checkout
  const piA = await createPaymentIntent(engine, ctx, { amount: AMOUNT_ADDRESS, currency: "USDC", checkout_methods: ["ADDRESS"], expires_in_seconds: 3600, order_reference: "E2E-ADDR" } as never);
  const depositAddr = piA.networks[0]!.deposit_address as Address;
  step("invoice created with counterfactual address", { id: piA.id, depositAddr, deployed: await adapter.hasCode(depositAddr) });
  const relayerGasBefore = await readerClient.getBalance({ address: chainRt.signer!.address });
  const payTx = await send(usdcAddr, (await import("viem")).encodeFunctionData({ abi: erc20, functionName: "transfer", args: [depositAddr, units(AMOUNT_ADDRESS)] }), customerKey);
  step("customer transferred USDC to the deposit address", { tx: payTx, explorer: explorer(`tx/${payTx}`), invoiceNativeBalance: (await readerClient.getBalance({ address: depositAddr })).toString() });
  await pump(async () => (await paymentDetail(engine, ctx, piA.id)).status === "SETTLED", "address payment SETTLED");
  const dA = await paymentDetail(engine, ctx, piA.id);
  const invoiceGas = await readerClient.getBalance({ address: depositAddr });
  const vaultAfterA = await bal(vault);
  step("address payment SETTLED", {
    transfer: dA.transactions.find((t: any) => t.kind === "INCOMING_TRANSFER")?.explorer_url, sweep: dA.settlements[0]?.explorer_url,
    vaultDelta: formatUnits(vaultAfterA - vaultBefore, 6), invoiceAddressNativeBalanceAfter: invoiceGas.toString(), invoiceDeployed: await adapter.hasCode(depositAddr),
    relayerGasSpentWei: (relayerGasBefore - (await readerClient.getBalance({ address: chainRt.signer!.address }))).toString(),
  });
  if (vaultAfterA - vaultBefore !== units(AMOUNT_ADDRESS)) throw new Error("vault balance delta mismatch (address payment)");
  if (invoiceGas !== 0n) throw new Error("invoice address held native gas");

  // ---- B. wallet checkout (EIP-3009)
  if (chainRt.network.authorization.receiveWithAuthorization) {
    const piB = await createPaymentIntent(engine, ctx, { amount: AMOUNT_WALLET, currency: "USDC", checkout_methods: ["WALLET"], expires_in_seconds: 3600, order_reference: "E2E-WALLET" } as never);
    const prep = await prepareWalletPayment(engine, piB.id, { network: networkId, payer: customer.address });
    const td = prep.typed_data;
    const signature = await customer.signTypedData({
      domain: td.domain as never, types: { ReceiveWithAuthorization: td.types.ReceiveWithAuthorization } as never, primaryType: "ReceiveWithAuthorization",
      message: { ...td.message, value: BigInt(td.message.value), validAfter: BigInt(td.message.validAfter), validBefore: BigInt(td.message.validBefore) } as never,
    });
    await submitWalletPayment(engine, piB.id, { attempt_id: prep.attempt_id, signature });
    await pump(async () => (await paymentDetail(engine, ctx, piB.id)).status === "SETTLED", "wallet payment SETTLED");
    const dB = await paymentDetail(engine, ctx, piB.id);
    const vaultAfterB = await bal(vault);
    step("wallet payment SETTLED (customer signed; relayer paid gas)", { tx: dB.transactions[0]?.explorer_url, vaultDelta: formatUnits(vaultAfterB - vaultAfterA, 6) });
    if (vaultAfterB - vaultAfterA !== units(AMOUNT_WALLET)) throw new Error("vault balance delta mismatch (wallet payment)");
  } else {
    step("wallet payment skipped: network USDC lacks receiveWithAuthorization");
  }

  // ---- webhooks
  await processWebhookJobs(engine);
  const bad = received.filter((r) => !verifyWebhookSignature(hook.secret, r.body, r.headers["plinth-signature"] ?? ""));
  const types = [...new Set(received.map((r) => JSON.parse(r.body).type))];
  step("signed webhooks delivered", { count: received.length, types, invalidSignatures: bad.length });
  if (bad.length) throw new Error("webhook signature verification failed");

  const ops = await engine.db.select().from(schema.relayerOperations);
  step("relayer operations", { ops: ops.map((o) => ({ kind: o.kind, status: o.status, tx: o.txHash, gasUsed: o.gasUsed?.toString(), feeNativeWei: o.feeNativeWei?.toString(), feeUsdc: o.feeUsdcUnits?.toString() ?? null })) });
  results.ok = true;
} catch (e) {
  results.ok = false;
  results.error = e instanceof Error ? e.message : String(e);
  console.error("✘", results.error);
} finally {
  results.finishedAt = new Date().toISOString();
  mkdirSync("docs/verification", { recursive: true });
  const out = `docs/verification/${local ? "local-dry-run" : networkId}.json`;
  writeFileSync(out, JSON.stringify(results, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  console.log(`\nResults written to ${out}`);
  sink.close();
  await handle.close();
  await stopAll();
  void fastBlocks;
  process.exit(results.ok ? 0 : 1);
}
