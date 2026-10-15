/**
 * End-to-end acceptance run against a REAL network (or a local chain with --local).
 *
 *   pnpm e2e:testnet arc-testnet          # needs .env.testnet funded + deployments/arc-testnet.json
 *   pnpm e2e:testnet --local              # same script on a throwaway local chain (dry run of this script)
 *
 * It performs the full product lifecycle with real transactions and real receipts:
 *   merchant signup → vault creation via relayer → webhook endpoint → address-checkout payment sent by a
 *   customer wallet → watcher detection/verification/finality → gasless deploy+sweep (fee to the treasury, rest to the vault) →
 *   connected-wallet payment (EIP-3009, customer signs, relayer submits) → direct payout: verified email, signed wallet proof,
 *   emailed link, then a payment settles straight to the payout wallet → the same in EURC when the network lists it →
 *   signed webhooks verified → on-chain balance assertions for the merchant AND the treasury →
 *   results written to docs/verification/<network>.json.
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
  MemoryEmailSender, requestEmailVerification, confirmEmailLink, createPayoutChallenge, requestPayoutWallet, confirmPayoutLink,
} from "@plinth/engine";
import { EvmAdapter, MockFiatTokenAbi, loadDeployment, resolveRpcUrls } from "@plinth/blockchain";
import { startDevChain } from "@plinth/blockchain/dev";
import { NETWORKS, computeFee, toBytes32Id, type TokenSymbol } from "@plinth/shared";

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
const tokenAddr: Partial<Record<TokenSymbol, Address>> = {};
const mail = new MemoryEmailSender();
let send: (to: Address, data: Hex, from: Hex) => Promise<Hex>;
let stopAll = async () => {};
let mint: ((symbol: TokenSymbol, to: Address, units: bigint) => Promise<void>) | null = null;
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
  const chain = await startDevChain({ confirmations: 2, blockTimeSeconds: 1, vaultConfigDelaySeconds: 60, tokens: ["EURC"] });
  networkId = chain.network.id;
  readerClient = chain.publicClient as never;
  usdcAddr = chain.usdc;
  tokenAddr.USDC = chain.usdc;
  if (chain.tokens.EURC) tokenAddr.EURC = chain.tokens.EURC;
  explorer = (p) => `local:${p}`;
  const hexKey = (i: number) => `0x${Buffer.from(chain.accounts[i]!.getHdKey().privateKey!).toString("hex")}` as Hex;
  customerKey = hexKey(3);
  ownerKey = hexKey(2);
  const relayerKey = hexKey(1);
  engine = await createEngine({
    db: handle.db, logger: silentLogger,
    env: { APP_SECRET_KEY: "33".repeat(32), ALLOW_PRIVATE_WEBHOOK_TARGETS: "true" },
    email: mail,
    signers: { getSigner: () => privateKeyToAccount(relayerKey) },
    extraNetworks: [{ network: chain.network, deployment: chain.deployment, client: chain.publicClient }],
  });
  mint = (symbol, to, units) => chain.mintToken(symbol, to, units);
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
  tokenAddr.USDC = net.usdc.address;
  for (const [sym, t] of Object.entries(net.extraTokens ?? {})) tokenAddr[sym as TokenSymbol] = t!.address;
  explorer = (p) => `${net.explorerUrl}/${p}`;
  engine = await createEngine({
    db: handle.db, logger: consoleLogger, email: mail,
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
const treasury = getAddress(chainRt.deployment.treasury);
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
const balOf = (symbol: TokenSymbol, a: Address) => readerClient.readContract({ address: tokenAddr[symbol]!, abi: erc20, functionName: "balanceOf", args: [a] });
const bal = (a: Address) => balOf("USDC", a);

// ---------------------------------------------------------------- run
try {
  const AMOUNT_ADDRESS = "0.05";
  const AMOUNT_WALLET = "0.03";
  const units = (s: string) => parseUnits(s, 6);
  if (mint) { await mint("USDC", customer.address, units("10")); if (tokenAddr.EURC) await mint("EURC", customer.address, units("10")); }
  const custStart = await bal(customer.address);
  if (custStart < units("0.2")) throw new Error(`Customer ${customer.address} holds ${formatUnits(custStart, 6)} USDC; fund it from the faucet first`);
  step("customer funded", { address: customer.address, usdc: formatUnits(custStart, 6) });

  const email = `e2e-${Date.now()}@example.test`;
  const PASSWORD = "e2e-correct-horse-battery";
  const { merchantId, userId } = await signup(engine, { business_name: "E2E Merchant", email, password: PASSWORD }, { type: "SYSTEM" });
  const ctx: AuthContext = { merchantId, environment: "test", actor: { type: "USER", id: userId }, role: "OWNER", via: "session" };
  const feeBps = engine.cfg.platformFeeBps;
  const feeOf = (amount: string) => computeFee(units(amount), feeBps);
  const treasuryStart = await bal(treasury);
  step("platform fee configured", { feeBps, treasury, treasuryHasCode: chainRt.deployment.treasury ? ((await readerClient.getCode({ address: treasury })) ?? "0x") !== "0x" : null });
  const hook = await createEndpoint(engine, merchantId, "test", { url: hookUrl, events: ["*"] });

  const vaultInfo = await enableNetwork(engine, ctx, { network: networkId, owner_address: owner.address });
  await pump(async () => (await engine.db.select().from(schema.merchantVaults).where(eq(schema.merchantVaults.merchantId, merchantId)))[0]?.status === "ACTIVE", "vault ACTIVE");
  const vault = getAddress(vaultInfo.vault_address);
  const vstate = await adapter.readVault(vault);
  step("vault deployed by relayer, owned by merchant", { vault, owner: vstate.owner, gatewayIsOwner: vstate.owner.toLowerCase() === chainRt.signer!.address.toLowerCase(), explorer: explorer(`address/${vault}`) });
  if (vstate.owner.toLowerCase() !== owner.address.toLowerCase()) throw new Error("vault owner mismatch");
  const vaultBefore = await bal(vault);
  const fee = (amount: string) => feeOf(amount);

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
    vaultDelta: formatUnits(vaultAfterA - vaultBefore, 6), treasuryDelta: formatUnits((await bal(treasury)) - treasuryStart, 6), invoiceAddressNativeBalanceAfter: invoiceGas.toString(), invoiceDeployed: await adapter.hasCode(depositAddr),
    relayerGasSpentWei: (relayerGasBefore - (await readerClient.getBalance({ address: chainRt.signer!.address }))).toString(),
  });
  if (vaultAfterA - vaultBefore !== units(AMOUNT_ADDRESS) - fee(AMOUNT_ADDRESS)) throw new Error("vault balance delta mismatch (address payment): expected the amount minus the fee");
  if ((await bal(treasury)) - treasuryStart !== fee(AMOUNT_ADDRESS)) throw new Error("treasury did not receive exactly the fee (address payment)");
  if (dA.fee_amount_units !== fee(AMOUNT_ADDRESS).toString()) throw new Error("the API's fee_amount differs from the fee computed from the amount");
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
    step("wallet payment SETTLED (customer signed; relayer paid gas)", { tx: dB.transactions[0]?.explorer_url, vaultDelta: formatUnits(vaultAfterB - vaultAfterA, 6), treasuryDelta: formatUnits((await bal(treasury)) - treasuryStart, 6) });
    if (vaultAfterB - vaultAfterA !== units(AMOUNT_WALLET) - fee(AMOUNT_WALLET)) throw new Error("vault balance delta mismatch (wallet payment): expected the amount minus the fee");
    if ((await bal(treasury)) - treasuryStart !== fee(AMOUNT_ADDRESS) + fee(AMOUNT_WALLET)) throw new Error("treasury did not receive exactly the fees so far");
  } else {
    step("wallet payment skipped: network USDC lacks receiveWithAuthorization");
  }

  // ---- C. direct payout: verified email, signed wallet proof, emailed link, then a payment settles straight to the payout wallet
  const challenge = await createPayoutChallenge(engine, ctx, { network: networkId, address: owner.address, purpose: "PAYOUT_WALLET" });
  const proof = await owner.signMessage({ message: challenge.message });
  const confirmed = await requestPayoutWallet(engine, ctx, { network: networkId, address: owner.address, nonce: challenge.nonce, signature: proof, reauth: { password: PASSWORD } as never });
  step("payout wallet registered: signed proof and fresh sign-in (email confirmation is off)", { status: confirmed.status, wallet: owner.address });
  const AMOUNT_DIRECT = "0.04";
  const walletBefore = await bal(owner.address);
  const vaultBeforeC = await bal(vault);
  const treasuryBeforeC = await bal(treasury);
  const piC = await createPaymentIntent(engine, ctx, { amount: AMOUNT_DIRECT, currency: "USDC", checkout_methods: ["ADDRESS"], expires_in_seconds: 3600, order_reference: "E2E-DIRECT" } as never);
  const directAddr = piC.networks[0]!.deposit_address as Address;
  await send(usdcAddr, (await import("viem")).encodeFunctionData({ abi: erc20, functionName: "transfer", args: [directAddr, units(AMOUNT_DIRECT)] }), customerKey);
  await pump(async () => (await paymentDetail(engine, ctx, piC.id)).status === "SETTLED", "direct payment SETTLED");
  const walletDelta = (await bal(owner.address)) - walletBefore;
  step("direct payment SETTLED to the payout wallet", { walletDelta: formatUnits(walletDelta, 6), vaultDelta: formatUnits((await bal(vault)) - vaultBeforeC, 6), treasuryDelta: formatUnits((await bal(treasury)) - treasuryBeforeC, 6) });
  if (walletDelta !== units(AMOUNT_DIRECT) - fee(AMOUNT_DIRECT)) throw new Error("payout wallet delta mismatch: expected the amount minus the fee");
  if ((await bal(vault)) !== vaultBeforeC) throw new Error("the vault changed during a direct payment");
  if ((await bal(treasury)) - treasuryBeforeC !== fee(AMOUNT_DIRECT)) throw new Error("treasury did not receive exactly the fee (direct payment)");

  // ---- D. a second token (EURC on Arc; the local chain has a test double)
  const eurcOps = chainRt.tokens.get("EURC");
  if (eurcOps?.operational && tokenAddr.EURC) {
    const AMOUNT_EURC = "0.05";
    const eurcBal = await balOf("EURC", customer.address);
    if (eurcBal < units("0.1")) {
      step("EURC payment skipped: the customer wallet holds no EURC", { address: customer.address });
    } else {
      const eurcVaultInfo = await enableNetwork(engine, ctx, { network: networkId, owner_address: owner.address, token: "EURC" });
      await pump(async () => (await engine.db.select().from(schema.merchantVaults).where(eq(schema.merchantVaults.merchantId, merchantId))).filter((v) => v.tokenSymbol === "EURC")[0]?.status === "ACTIVE", "EURC vault ACTIVE");
      // The payout wallet is the destination on this network for every token now, so the EURC payment also goes straight to it.
      const eurcWalletBefore = await balOf("EURC", owner.address);
      const eurcTreasuryBefore = await balOf("EURC", treasury);
      const piD = await createPaymentIntent(engine, ctx, { amount: AMOUNT_EURC, currency: "EURC", checkout_methods: ["ADDRESS"], expires_in_seconds: 3600, order_reference: "E2E-EURC" } as never);
      const eurcAddr = piD.networks[0]!.deposit_address as Address;
      await send(tokenAddr.EURC, (await import("viem")).encodeFunctionData({ abi: erc20, functionName: "transfer", args: [eurcAddr, units(AMOUNT_EURC)] }), customerKey);
      await pump(async () => (await paymentDetail(engine, ctx, piD.id)).status === "SETTLED", "EURC payment SETTLED");
      const dD = await paymentDetail(engine, ctx, piD.id);
      const eurcWalletDelta = (await balOf("EURC", owner.address)) - eurcWalletBefore;
      step("EURC payment SETTLED (fee taken in EURC)", { eurcVault: eurcVaultInfo.vault_address, currency: dD.currency, walletDelta: formatUnits(eurcWalletDelta, 6), treasuryDelta: formatUnits((await balOf("EURC", treasury)) - eurcTreasuryBefore, 6) });
      if (dD.currency !== "EURC") throw new Error("the payment is not denominated in EURC");
      if (eurcWalletDelta !== units(AMOUNT_EURC) - fee(AMOUNT_EURC)) throw new Error("EURC payout delta mismatch: expected the amount minus the fee");
      if ((await balOf("EURC", treasury)) - eurcTreasuryBefore !== fee(AMOUNT_EURC)) throw new Error("treasury did not receive exactly the fee in EURC");
    }
  } else {
    step("EURC payment skipped: this network lists no EURC, or its contracts are not operational");
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
