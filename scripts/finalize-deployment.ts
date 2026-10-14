/**
 * Verify a fresh deployment ON-CHAIN, then record it so the network may be enabled.
 *
 *   pnpm finalize:deployment --network arc-testnet
 *   pnpm finalize:deployment --network arc-testnet --token EURC      (a further payment token: its own contracts)
 *   pnpm finalize:deployment --network local-dev --rpc http://127.0.0.1:8545 --chain-id 31337 --usdc 0x…   (non-production only)
 *
 * Input : deployments/raw-<chainId>.json (USDC) or raw-<chainId>-<TOKEN>.json written by contracts/script/Deploy.s.sol
 * Checks: (1) runtime bytecode of all four contracts equals the audited build artifacts (immutables masked),
 *         (2) the contracts are wired to each other and to the OFFICIAL USDC of the registry,
 *         (3) the factory's CREATE2 prediction equals the backend's offline derivation (a mismatch would show
 *             customers a wrong deposit address),
 * Output: deployments/<network>.json with bytecodeVerified=true and productionApproved=false. A further token is merged
 *         into that record under `tokens.<TOKEN>` (the USDC record must exist first; approval stays one human step).
 * It never approves production use: that is a separate, deliberate human step (approve-deployment).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createPublicClient, getAddress, http, keccak256, type Address, type Hex } from "viem";
import { destinationKindIndex, isTokenSymbol, MAX_FEE_BPS, NETWORKS, tokenOf, treasuryFor, type Deployment, type NetworkId, type TokenSymbol } from "@plinth/shared";
import { computeInvoiceAddress, deploymentsDir, InvoiceDepositAbi, InvoiceFactoryAbi, loadArtifact, maskImmutables, PaymentRouterAbi, resolveRpcUrls, VaultFactoryAbi } from "@plinth/blockchain";

const args = Object.fromEntries(process.argv.slice(2).reduce<[string, string][]>((a, v, i, all) => (v.startsWith("--") ? [...a, [v.slice(2), all[i + 1] ?? "true"]] : a), []));
const networkId = args.network;
if (!networkId) throw new Error("--network is required");
const registry = NETWORKS[networkId as NetworkId];
if (registry && registry.environment === "mainnet" && (args.rpc !== undefined || args.usdc || args["chain-id"])) {
  // A mainnet's token and chain id come from the registry only; overrides would defeat the verification.
  throw new Error("Overrides (--usdc/--chain-id) are not allowed for registry mainnets");
}
const symbol = (args.token ?? "USDC").toUpperCase();
if (!isTokenSymbol(symbol)) throw new Error(`Unsupported token ${symbol}`);
const tokenSym: TokenSymbol = symbol;
const chainId = registry?.chainId ?? Number(args["chain-id"]);
// The token address comes from the registry (official docs), never from the deployment file being checked.
const usdc = ((registry ? tokenOf(registry, tokenSym)?.address : undefined) ?? args.usdc) as Address | undefined;
if (!chainId || !usdc) throw new Error(registry ? `The registry lists no ${tokenSym} for ${networkId}` : "Unknown network: pass --chain-id and --usdc for non-registry networks");
const rpc = args.rpc ?? (registry ? resolveRpcUrls(registry)[0] : undefined);
if (!rpc) throw new Error("No RPC URL");

const dir = deploymentsDir();
const rawPath = join(dir, tokenSym === "USDC" ? `raw-${chainId}.json` : `raw-${chainId}-${tokenSym}.json`);
const recordPath = join(dir, `${networkId}.json`);
if (tokenSym !== "USDC" && !existsSync(recordPath)) throw new Error(`Finalize the USDC deployment of ${networkId} first (${recordPath} is missing).`);
if (!existsSync(rawPath)) throw new Error(`Missing ${rawPath}. Run the Foundry deploy script first.`);
const raw = JSON.parse(readFileSync(rawPath, "utf8")) as Record<string, string | number>;
const client = createPublicClient({ transport: http(rpc) });

const problems: string[] = [];
const ok = (cond: boolean, msg: string) => { console.log(`  ${cond ? "PASS" : "FAIL"}  ${msg}`); if (!cond) problems.push(msg); };

console.log(`Finalizing ${networkId} (chain ${chainId}, token ${tokenSym}) via ${rpc}`);
ok((await client.getChainId()) === chainId, "RPC chain id matches");
ok(getAddress(String(raw.usdc)) === getAddress(usdc), `deployment USDC equals the registry's official token (${usdc})`);

const contracts: [string, string, Address][] = [
  ["VaultFactory", "VaultFactory", raw.vaultFactory as Address],
  ["InvoiceDeposit", "InvoiceDeposit (implementation)", raw.invoiceImplementation as Address],
  ["InvoiceFactory", "InvoiceFactory", raw.invoiceFactory as Address],
  ["PaymentRouter", "PaymentRouter", raw.paymentRouter as Address],
];
for (const [artifactName, label, address] of contracts) {
  const art = loadArtifact(artifactName);
  const onchain = ((await client.getCode({ address })) ?? "0x") as Hex;
  const same = keccak256(maskImmutables(onchain, art.immutableReferences)) === art.deployedCodeHash;
  ok(same, `${label} at ${address}: on-chain runtime bytecode equals build artifact (${art.deployedCodeHash.slice(0, 12)}…)`);
}

const read = <T,>(address: Address, abi: readonly unknown[], fn: string) => client.readContract({ address, abi: abi as never, functionName: fn as never }) as Promise<T>;
const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
ok(eq(await read<string>(raw.invoiceFactory as Address, InvoiceFactoryAbi, "IMPLEMENTATION"), String(raw.invoiceImplementation)), "InvoiceFactory.IMPLEMENTATION = implementation");
ok(eq(await read<string>(raw.invoiceFactory as Address, InvoiceFactoryAbi, "TOKEN"), usdc), "InvoiceFactory.TOKEN = official token");
ok(eq(await read<string>(raw.invoiceFactory as Address, InvoiceFactoryAbi, "VAULTS"), String(raw.vaultFactory)), "InvoiceFactory.VAULTS = VaultFactory");
ok(Number(await read<bigint>(raw.invoiceFactory as Address, InvoiceFactoryAbi, "CHAIN_ID")) === chainId, "InvoiceFactory.CHAIN_ID = chain id");
ok(Number(await read<number>(raw.invoiceFactory as Address, InvoiceFactoryAbi, "VERSION")) === Number(raw.version), "InvoiceFactory.VERSION = recorded version");
ok(eq(await read<string>(raw.vaultFactory as Address, VaultFactoryAbi, "TOKEN"), usdc), "VaultFactory.TOKEN = official token");
ok(eq(await read<string>(raw.paymentRouter as Address, PaymentRouterAbi, "TOKEN"), usdc), "PaymentRouter.TOKEN = official token");
ok(eq(await read<string>(raw.paymentRouter as Address, PaymentRouterAbi, "VAULTS"), String(raw.vaultFactory)), "PaymentRouter.VAULTS = VaultFactory");

// Fee wiring: treasury and fee cap must be what the configuration says, and identical in implementation, factory and router.
const expectedTreasury = treasuryFor(String(networkId));
const impl = raw.invoiceImplementation as Address;
const factory = raw.invoiceFactory as Address;
const router = raw.paymentRouter as Address;
const implTreasury = await read<string>(impl, InvoiceDepositAbi, "TREASURY");
const implMax = Number(await read<number>(impl, InvoiceDepositAbi, "MAX_FEE_BPS"));
ok(eq(implTreasury, expectedTreasury), `InvoiceDeposit.TREASURY = configured treasury for ${networkId} (${expectedTreasury})`);
ok(eq(await read<string>(factory, InvoiceFactoryAbi, "TREASURY"), expectedTreasury), "InvoiceFactory.TREASURY = configured treasury");
ok(eq(await read<string>(router, PaymentRouterAbi, "TREASURY"), expectedTreasury), "PaymentRouter.TREASURY = configured treasury");
ok(implMax === MAX_FEE_BPS, `InvoiceDeposit.MAX_FEE_BPS = ${MAX_FEE_BPS} (the platform cap)`);
ok(Number(await read<number>(factory, InvoiceFactoryAbi, "MAX_FEE_BPS")) === implMax && Number(await read<number>(router, PaymentRouterAbi, "MAX_FEE_BPS")) === implMax, "factory and router carry the same fee cap");
ok(eq(await read<string>(impl, InvoiceDepositAbi, "TOKEN"), usdc), "InvoiceDeposit.TOKEN = official token");
ok(Number(await read<bigint>(impl, InvoiceDepositAbi, "CHAIN_ID")) === chainId && Number(await read<number>(impl, InvoiceDepositAbi, "VERSION")) === Number(raw.version), "InvoiceDeposit chain id and version match the record");
const treasuryCode = (await client.getCode({ address: expectedTreasury })) ?? "0x";
const treasuryHasCode = treasuryCode !== "0x";
if (treasuryHasCode) console.warn(`  WARN  the treasury ${expectedTreasury} has contract code on ${networkId}. It is assumed to be a plain EOA: confirm it can receive USDC before opening this network.`);
else console.log("  PASS  the treasury is a plain account (no code) on this chain");

// Backend offline derivation must equal the deployed factory's prediction, in both modes.
const sample = { merchantId: keccak256("0x01"), invoiceId: keccak256("0x02"), destination: getAddress("0x00000000000000000000000000000000000000aa"), feeBps: 20 };
for (const kind of ["VAULT", "DIRECT"] as const) {
  const onchainPredict = await client.readContract({ address: factory, abi: InvoiceFactoryAbi, functionName: "predict", args: [sample.merchantId, sample.invoiceId, sample.destination, destinationKindIndex(kind), sample.feeBps] });
  const offline = computeInvoiceAddress({ factory, implementation: impl, token: usdc, treasury: expectedTreasury, ...sample, kind, chainId, version: Number(raw.version) });
  ok(eq(onchainPredict, offline), `offline CREATE2 derivation equals InvoiceFactory.predict() for ${kind} (${offline})`);
}

if (problems.length) {
  console.error(`\n${problems.length} check(s) failed. Nothing was recorded.`);
  process.exit(1);
}

const artifactHashes = Object.fromEntries(contracts.map(([n]) => [n, loadArtifact(n).deployedCodeHash]));
if (tokenSym !== "USDC") {
  const record = JSON.parse(readFileSync(recordPath, "utf8")) as Deployment & Record<string, unknown>;
  record.tokens = {
    ...(record.tokens ?? {}),
    [tokenSym]: {
      vaultFactory: getAddress(String(raw.vaultFactory)), invoiceImplementation: getAddress(String(raw.invoiceImplementation)),
      invoiceFactory: getAddress(String(raw.invoiceFactory)), paymentRouter: getAddress(String(raw.paymentRouter)),
      version: Number(raw.version), deployBlock: Number(raw.deployBlock), bytecodeVerified: true,
    },
  };
  if (record.productionApproved) {
    // An approval covers the contract sets that existed when a human reviewed them; a new token set needs its own review.
    record.productionApproved = false;
    delete record.approval;
    console.warn(`  WARN  ${networkId} was approved for production; adding ${tokenSym} withdraws that approval. Run pnpm approve:deployment again after review.`);
  }
  writeFileSync(recordPath, JSON.stringify(record, null, 2) + "\n");
  console.log(`\nMerged ${tokenSym} into deployments/${networkId}.json (tokens.${tokenSym}.bytecodeVerified=true; productionApproved unchanged)`);
  process.exit(0);
}

const out: Deployment & Record<string, unknown> = {
  networkId, chainId, version: Number(raw.version),
  vaultFactory: getAddress(String(raw.vaultFactory)), invoiceImplementation: getAddress(String(raw.invoiceImplementation)),
  invoiceFactory: getAddress(String(raw.invoiceFactory)), paymentRouter: getAddress(String(raw.paymentRouter)),
  treasury: getAddress(expectedTreasury), maxFeeBps: implMax,
  deployBlock: Number(raw.deployBlock), deployer: getAddress(String(raw.deployer)),
  bytecodeVerified: true, productionApproved: false,
  vaultConfigDelaySeconds: Number(process.env.VAULT_CONFIG_DELAY_SECONDS ?? 86_400),
  treasuryHasCode,
  verifiedAt: new Date().toISOString(),
  artifactHashes,
};
writeFileSync(join(dir, `${networkId}.json`), JSON.stringify(out, null, 2) + "\n");
console.log(`\nRecorded deployments/${networkId}.json  (bytecodeVerified=true, productionApproved=false)`);
if (registry?.environment === "mainnet") console.log("Mainnet: now independently verify source on the explorer, review operations, then run `pnpm approve:deployment`.");
