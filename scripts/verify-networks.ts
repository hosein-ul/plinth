/**
 * READ-ONLY capability verification of every network in the registry against the live chain.
 *   pnpm verify:networks            # all networks
 *   pnpm verify:networks arc-testnet base-sepolia
 *
 * Sends no transactions. For each network it checks that the hard-coded registry facts are TRUE on-chain, for the
 * chain id and then for EVERY payment token the registry lists (USDC and any extra token such as Arc's EURC):
 *   - chain id matches the RPC,
 *   - the token address has code and the expected symbol/decimals/version,
 *   - the registry's EIP-712 name+version reproduce the token's real DOMAIN_SEPARATOR (a wrong value would
 *     make every wallet signature invalid),
 *   - EIP-3009 receiveWithAuthorization / transferWithAuthorization / permit exist (probed with an
 *     expired authorization: the token reverts with a FiatTokenV2 reason, an absent selector would not),
 *   - receiveWithAuthorization enforces "caller must be the payee" (why the router exists).
 * Exit code 1 if any enabled-by-registry capability is false. Run before enabling or changing any network.
 */
import { createPublicClient, encodeFunctionData, getAddress, hashDomain, http, zeroHash, type Address, type Hex } from "viem";
import { NETWORKS, networkTokens, type NetworkConfig, type TokenConfig } from "@plinth/shared";
import { resolveRpcUrls } from "@plinth/blockchain";

const abi = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "version", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "DOMAIN_SEPARATOR", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  {
    type: "function", name: "receiveWithAuthorization", stateMutability: "nonpayable", outputs: [],
    inputs: [{ type: "address" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "bytes32" }, { type: "uint8" }, { type: "bytes32" }, { type: "bytes32" }],
  },
  {
    type: "function", name: "transferWithAuthorization", stateMutability: "nonpayable", outputs: [],
    inputs: [{ type: "address" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "bytes32" }, { type: "uint8" }, { type: "bytes32" }, { type: "bytes32" }],
  },
  { type: "function", name: "permit", stateMutability: "nonpayable", outputs: [], inputs: [{ type: "address" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint8" }, { type: "bytes32" }, { type: "bytes32" }] },
] as const;

type Check = { name: string; ok: boolean; detail: string };

type Client = ReturnType<typeof createPublicClient>;

async function probeToken(client: Client, net: NetworkConfig, tok: TokenConfig): Promise<Check[]> {
  const out: Check[] = [];
  const sym = tok.symbol;
  const add = (name: string, ok: boolean, detail: string) => out.push({ name: `${sym}: ${name}`, ok, detail });
  const token = tok.address;

  const code = await client.getCode({ address: token });
  add("has code", !!code && code !== "0x", `${token}`);
  const read = <T extends "name" | "symbol" | "decimals" | "version" | "DOMAIN_SEPARATOR">(fn: T) => client.readContract({ address: token, abi, functionName: fn });
  const [name, symbol, decimals, version, ds] = await Promise.all([read("name"), read("symbol"), read("decimals"), read("version"), read("DOMAIN_SEPARATOR")]).catch(() => [null, null, null, null, null] as const);
  add("symbol/decimals", symbol === sym && decimals === 6, `${symbol}/${decimals}`);
  add("version", version === tok.eip712.version, `token=${version} registry=${tok.eip712.version}`);
  const expectedDomain = hashDomain({ domain: { name: tok.eip712.name, version: tok.eip712.version, chainId: net.chainId, verifyingContract: token }, types: { EIP712Domain: [{ name: "name", type: "string" }, { name: "version", type: "string" }, { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }] } });
  add("EIP-712 domain reproduces DOMAIN_SEPARATOR", ds === expectedDomain, `token name()="${name}" registry domain name="${tok.eip712.name}"`);

  const z = zeroHash as Hex;
  const a1 = getAddress("0x0000000000000000000000000000000000000001") as Address;
  const callExpect = async (data: Hex, re: RegExp) => {
    try {
      await client.call({ to: token, data });
      return { ok: false, detail: "call unexpectedly succeeded" };
    } catch (e) {
      const msg = String((e as { shortMessage?: string; details?: string }).details ?? (e as Error).message);
      return { ok: re.test(msg), detail: msg.slice(0, 90) };
    }
  };
  const recv = await callExpect(encodeFunctionData({ abi, functionName: "receiveWithAuthorization", args: [a1, a1, 1n, 0n, 1n, z, 27, z, z] }), /payee/i);
  add("receiveWithAuthorization (caller must be payee)", recv.ok === tok.authorization.receiveWithAuthorization, `${recv.detail}`);
  const xfer = await callExpect(encodeFunctionData({ abi, functionName: "transferWithAuthorization", args: [a1, a1, 1n, 0n, 1n, z, 27, z, z] }), /authorization is expired|FiatToken/i);
  add("transferWithAuthorization", xfer.ok === tok.authorization.transferWithAuthorization, xfer.detail);
  const pm = await callExpect(encodeFunctionData({ abi, functionName: "permit", args: [a1, a1, 1n, 1n, 27, z, z] }), /permit is expired|FiatToken/i);
  add("permit", pm.ok === tok.authorization.permit, pm.detail);
  return out;
}

async function probe(net: NetworkConfig): Promise<Check[]> {
  const urls = resolveRpcUrls(net);
  if (urls.length === 0) return [{ name: "rpc", ok: false, detail: "no RPC URL (set RPC_URLS_<NETWORK>)" }];
  const client = createPublicClient({ transport: http(urls[0], { timeout: 20_000, retryCount: 1 }) });
  const chainId = await client.getChainId().catch(() => -1);
  const out: Check[] = [{ name: "chain id", ok: chainId === net.chainId, detail: `rpc=${chainId} registry=${net.chainId}` }];
  if (chainId !== net.chainId) return out;
  for (const tok of Object.values(networkTokens(net))) out.push(...(await probeToken(client, net, tok!)));
  // The watcher asks for logs in windows of `maxLogRange` blocks: the public RPC must answer a window that size.
  try {
    const head = await client.getBlockNumber();
    await client.getLogs({ address: net.usdc.address, fromBlock: head - BigInt(net.maxLogRange - 1), toBlock: head });
    out.push({ name: "log range", ok: true, detail: `eth_getLogs over ${net.maxLogRange} blocks answered` });
  } catch (e) {
    out.push({ name: "log range", ok: false, detail: String((e as { shortMessage?: string }).shortMessage ?? (e as Error).message).slice(0, 100) });
  }
  return out;
}

const wanted = process.argv.slice(2);
const targets = Object.values(NETWORKS).filter((n) => wanted.length === 0 || wanted.includes(n.id));
let failed = false;
for (const net of targets) {
  console.log(`\n${net.name} (${net.id})  [${net.environment}]`);
  try {
    for (const c of await probe(net)) {
      console.log(`  ${c.ok ? "PASS" : "FAIL"}  ${c.name} — ${c.detail}`);
      const prefix = c.name.split(":")[0] as string;
      const counted = (networkTokens(net) as Record<string, TokenConfig | undefined>)[prefix]?.authorization.verified ?? net.authorization.verified;
      if (!c.ok && counted) failed = true;
      if (!c.ok && !counted) console.log("        (network is registered as unverified/disabled; not counted)");
    }
  } catch (e) {
    console.log(`  ERROR  ${(e as Error).message}`);
    if (net.authorization.verified) failed = true;
  }
}
process.exit(failed ? 1 : 0);
