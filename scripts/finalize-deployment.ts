/**
 * Verify a fresh deployment ON-CHAIN, then record it so the network may be enabled.
 *
 *   pnpm finalize:deployment --network arc-testnet
 *   pnpm finalize:deployment --network local-dev --rpc http://127.0.0.1:8545 --chain-id 31337 --usdc 0x…   (non-production only)
 *
 * Input : deployments/raw-<chainId>.json written by contracts/script/Deploy.s.sol
 * Checks: (1) runtime bytecode of all four contracts equals the audited build artifacts (immutables masked),
 *         (2) the contracts are wired to each other and to the OFFICIAL USDC of the registry,
 *         (3) the factory's CREATE2 prediction equals the backend's offline derivation (a mismatch would show
 *             customers a wrong deposit address),
 * Output: deployments/<network>.json with bytecodeVerified=true and productionApproved=false.
 * It never approves production use: that is a separate, deliberate human step (approve-deployment).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createPublicClient, getAddress, http, keccak256, type Address, type Hex } from "viem";
import { NETWORKS, type Deployment, type NetworkId } from "@plinth/shared";
import { computeInvoiceAddress, deploymentsDir, InvoiceFactoryAbi, loadArtifact, maskImmutables, PaymentRouterAbi, resolveRpcUrls, VaultFactoryAbi } from "@plinth/blockchain";

const args = Object.fromEntries(process.argv.slice(2).reduce<[string, string][]>((a, v, i, all) => (v.startsWith("--") ? [...a, [v.slice(2), all[i + 1] ?? "true"]] : a), []));
const networkId = args.network;
if (!networkId) throw new Error("--network is required");
const registry = NETWORKS[networkId as NetworkId];
if (registry && registry.environment === "mainnet" && (args.rpc !== undefined || args.usdc || args["chain-id"])) {
  // A mainnet's token and chain id come from the registry only; overrides would defeat the verification.
  throw new Error("Overrides (--usdc/--chain-id) are not allowed for registry mainnets");
}
const chainId = registry?.chainId ?? Number(args["chain-id"]);
const usdc = (registry?.usdc.address ?? args.usdc) as Address | undefined;
if (!chainId || !usdc) throw new Error("Unknown network: pass --chain-id and --usdc for non-registry networks");
const rpc = args.rpc ?? (registry ? resolveRpcUrls(registry)[0] : undefined);
if (!rpc) throw new Error("No RPC URL");

const dir = deploymentsDir();
const rawPath = join(dir, `raw-${chainId}.json`);
if (!existsSync(rawPath)) throw new Error(`Missing ${rawPath}. Run the Foundry deploy script first.`);
const raw = JSON.parse(readFileSync(rawPath, "utf8")) as Record<string, string | number>;
const client = createPublicClient({ transport: http(rpc) });

const problems: string[] = [];
const ok = (cond: boolean, msg: string) => { console.log(`  ${cond ? "PASS" : "FAIL"}  ${msg}`); if (!cond) problems.push(msg); };

console.log(`Finalizing ${networkId} (chain ${chainId}) via ${rpc}`);
ok((await client.getChainId()) === chainId, "RPC chain id matches");
ok(getAddress(String(raw.usdc)) === getAddress(usdc), `deployment USDC equals the registry's official USDC (${usdc})`);

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
ok(eq(await read<string>(raw.invoiceFactory as Address, InvoiceFactoryAbi, "TOKEN"), usdc), "InvoiceFactory.TOKEN = official USDC");
ok(eq(await read<string>(raw.invoiceFactory as Address, InvoiceFactoryAbi, "VAULTS"), String(raw.vaultFactory)), "InvoiceFactory.VAULTS = VaultFactory");
ok(Number(await read<bigint>(raw.invoiceFactory as Address, InvoiceFactoryAbi, "CHAIN_ID")) === chainId, "InvoiceFactory.CHAIN_ID = chain id");
ok(Number(await read<number>(raw.invoiceFactory as Address, InvoiceFactoryAbi, "VERSION")) === Number(raw.version), "InvoiceFactory.VERSION = recorded version");
ok(eq(await read<string>(raw.vaultFactory as Address, VaultFactoryAbi, "TOKEN"), usdc), "VaultFactory.TOKEN = official USDC");
ok(eq(await read<string>(raw.paymentRouter as Address, PaymentRouterAbi, "TOKEN"), usdc), "PaymentRouter.TOKEN = official USDC");
ok(eq(await read<string>(raw.paymentRouter as Address, PaymentRouterAbi, "VAULTS"), String(raw.vaultFactory)), "PaymentRouter.VAULTS = VaultFactory");

// Backend offline derivation must equal the deployed factory's prediction.
const sample = { merchantId: keccak256("0x01"), invoiceId: keccak256("0x02"), vault: getAddress("0x00000000000000000000000000000000000000aa") };
const onchainPredict = await client.readContract({ address: raw.invoiceFactory as Address, abi: InvoiceFactoryAbi, functionName: "predict", args: [sample.merchantId, sample.invoiceId, sample.vault] });
const offline = computeInvoiceAddress({ factory: raw.invoiceFactory as Address, implementation: raw.invoiceImplementation as Address, token: usdc, ...sample, chainId, version: Number(raw.version) });
ok(eq(onchainPredict, offline), `offline CREATE2 derivation equals InvoiceFactory.predict() (${offline})`);

if (problems.length) {
  console.error(`\n${problems.length} check(s) failed. Nothing was recorded.`);
  process.exit(1);
}

const out: Deployment & Record<string, unknown> = {
  networkId, chainId, version: Number(raw.version),
  vaultFactory: getAddress(String(raw.vaultFactory)), invoiceImplementation: getAddress(String(raw.invoiceImplementation)),
  invoiceFactory: getAddress(String(raw.invoiceFactory)), paymentRouter: getAddress(String(raw.paymentRouter)),
  deployBlock: Number(raw.deployBlock), deployer: getAddress(String(raw.deployer)),
  bytecodeVerified: true, productionApproved: false,
  vaultConfigDelaySeconds: Number(process.env.VAULT_CONFIG_DELAY_SECONDS ?? 86_400),
  verifiedAt: new Date().toISOString(),
  artifactHashes: Object.fromEntries(contracts.map(([n]) => [n, loadArtifact(n).deployedCodeHash])),
};
writeFileSync(join(dir, `${networkId}.json`), JSON.stringify(out, null, 2) + "\n");
console.log(`\nRecorded deployments/${networkId}.json  (bytecodeVerified=true, productionApproved=false)`);
if (registry?.environment === "mainnet") console.log("Mainnet: now independently verify source on the explorer, review operations, then run `pnpm approve:deployment`.");
