/**
 * READ-ONLY survey of candidate networks before they enter the registry. For each candidate it tries public RPCs until one
 * answers with the expected chain id, then reads the token at Circle's published USDC address (name, symbol, decimals, version,
 * DOMAIN_SEPARATOR) and probes the EIP-3009 and permit selectors the same way `pnpm verify:networks` does. Nothing is sent.
 *
 *   tsx scripts/probe-candidates.ts > .data/candidates.json
 *
 * The output is evidence for a registry entry, not a registry entry: finality, log range and explorer still need a human decision.
 */
import { createPublicClient, encodeFunctionData, hashDomain, http, zeroHash, type Address, type Hex } from "viem";

interface Candidate { id: string; name: string; chainId: number; usdc: Address; rpcs: string[] }

const CANDIDATES: Candidate[] = [
  { id: "avalanche-mainnet", name: "Avalanche C-Chain", chainId: 43114, usdc: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", rpcs: ["https://api.avax.network/ext/bc/C/rpc", "https://avalanche-c-chain-rpc.publicnode.com"] },
  { id: "codex-mainnet", name: "Codex", chainId: 81224, usdc: "0xd996633a415985DBd7D6D12f4A4343E31f5037cf", rpcs: ["https://rpc.codex.xyz"] },
  { id: "celo-mainnet", name: "Celo", chainId: 42220, usdc: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C", rpcs: ["https://forno.celo.org", "https://celo-rpc.publicnode.com"] },
  { id: "cronos-mainnet", name: "Cronos", chainId: 25, usdc: "0x3D7F2C478aAfdB65542BCB44bCeeC05849999d2D", rpcs: ["https://evm.cronos.org", "https://cronos-evm-rpc.publicnode.com"] },
  { id: "edge-mainnet", name: "EDGE", chainId: 3343, usdc: "0x98d2919b9A214E6Fa5384AC81E6864bA686Ad74c", rpcs: ["https://edge-mainnet.g.alchemy.com/public"] },
  { id: "hyperevm-mainnet", name: "HyperEVM", chainId: 999, usdc: "0xb88339CB7199b77E23DB6E890353E22632Ba630f", rpcs: ["https://rpc.hyperliquid.xyz/evm"] },
  { id: "injective-mainnet", name: "Injective", chainId: 1776, usdc: "0xa00C59fF5a080D2b954d0c75e46E22a0c371235a", rpcs: ["https://sentry.evm-rpc.injective.network"] },
  { id: "ink-mainnet", name: "Ink", chainId: 57073, usdc: "0x2D270e6886d130D724215A266106e6832161EAEd", rpcs: ["https://rpc-gel.inkonchain.com", "https://rpc-qnd.inkonchain.com"] },
  { id: "linea-mainnet", name: "Linea", chainId: 59144, usdc: "0x176211869cA2b568f2A7D4EE941E073a821EE1ff", rpcs: ["https://rpc.linea.build", "https://linea-rpc.publicnode.com"] },
  { id: "monad-mainnet", name: "Monad", chainId: 143, usdc: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603", rpcs: ["https://rpc.monad.xyz", "https://rpc1.monad.xyz"] },
  { id: "morph-mainnet", name: "Morph", chainId: 2818, usdc: "0xCfb1186F4e93D60E60a8bDd997427D1F33bc372B", rpcs: ["https://rpc.morphl2.io", "https://rpc-quicknode.morphl2.io"] },
  { id: "pharos-mainnet", name: "Pharos", chainId: 1672, usdc: "0xC879C018dB60520F4355C26eD1a6D572cdAC1815", rpcs: ["https://rpc.pharos.xyz"] },
  { id: "plasma-mainnet", name: "Plasma", chainId: 9745, usdc: "0x2d661C89D812261039AF9764eceaAee884f5F67F", rpcs: ["https://rpc.plasma.to"] },
  { id: "plume-mainnet", name: "Plume", chainId: 98866, usdc: "0x222365EF19F7947e5484218551B56bb3965Aa7aF", rpcs: ["https://rpc.plume.org"] },
  { id: "sei-mainnet", name: "Sei", chainId: 1329, usdc: "0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392", rpcs: ["https://evm-rpc.sei-apps.com", "https://sei-evm-rpc.publicnode.com"] },
  { id: "sonic-mainnet", name: "Sonic", chainId: 146, usdc: "0x29219dd400f2Bf60E5a23d13Be72B486D4038894", rpcs: ["https://rpc.soniclabs.com", "https://sonic-rpc.publicnode.com"] },
  { id: "unichain-mainnet", name: "Unichain", chainId: 130, usdc: "0x078D782b760474a361dDA0AF3839290b0EF57AD6", rpcs: ["https://mainnet.unichain.org", "https://unichain-rpc.publicnode.com"] },
  { id: "worldchain-mainnet", name: "World Chain", chainId: 480, usdc: "0x79a02482a880bce3f13e09da970dc34db4cd24d1", rpcs: ["https://worldchain-mainnet.g.alchemy.com/public", "https://worldchain-mainnet.gateway.tenderly.co"] },
  { id: "xlayer-mainnet", name: "X Layer", chainId: 196, usdc: "0xB6CEceAB302E2E4948951eE7843FC24E92933061", rpcs: ["https://rpc.xlayer.tech", "https://xlayerrpc.okx.com"] },
  { id: "xdc-mainnet", name: "XDC", chainId: 50, usdc: "0xfA2958CB79b0491CC627c1557F441eF849Ca8eb1", rpcs: ["https://rpc.xdcrpc.com", "https://erpc.xinfin.network", "https://rpc.xdc.org", "https://rpc.ankr.com/xdc", "https://xdc.publicnode.com"] },
];

const abi = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "version", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "DOMAIN_SEPARATOR", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "receiveWithAuthorization", stateMutability: "nonpayable", outputs: [], inputs: [{ type: "address" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "bytes32" }, { type: "uint8" }, { type: "bytes32" }, { type: "bytes32" }] },
  { type: "function", name: "transferWithAuthorization", stateMutability: "nonpayable", outputs: [], inputs: [{ type: "address" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "bytes32" }, { type: "uint8" }, { type: "bytes32" }, { type: "bytes32" }] },
  { type: "function", name: "permit", stateMutability: "nonpayable", outputs: [], inputs: [{ type: "address" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint8" }, { type: "bytes32" }, { type: "bytes32" }] },
] as const;

const z = zeroHash as Hex;
const a1 = "0x0000000000000000000000000000000000000001" as Address;

async function survey(c: Candidate) {
  const out: Record<string, unknown> = { id: c.id, name: c.name, chainId: c.chainId, usdc: c.usdc };
  for (const url of c.rpcs) {
    const client = createPublicClient({ transport: http(url, { timeout: 10_000, retryCount: 0 }) });
    try {
      const chainId = await client.getChainId();
      if (chainId !== c.chainId) { out[`rpc ${url}`] = `answers chain id ${chainId}, expected ${c.chainId}`; continue; }
      const code = await client.getCode({ address: c.usdc });
      if (!code || code === "0x") { out[`rpc ${url}`] = "no code at the Circle address"; continue; }
      const read = (fn: "name" | "symbol" | "decimals" | "version" | "DOMAIN_SEPARATOR") => client.readContract({ address: c.usdc, abi, functionName: fn }).catch((e) => `ERR ${String(e.shortMessage ?? e.message).slice(0, 60)}`);
      const [name, symbol, decimals, version, ds] = await Promise.all([read("name"), read("symbol"), read("decimals"), read("version"), read("DOMAIN_SEPARATOR")]);
      const domainMatches = typeof name === "string" && typeof version === "string" && !String(name).startsWith("ERR") && !String(version).startsWith("ERR")
        ? hashDomain({ domain: { name, version, chainId, verifyingContract: c.usdc }, types: { EIP712Domain: [{ name: "name", type: "string" }, { name: "version", type: "string" }, { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }] } }) === ds
        : false;
      const probe = async (data: Hex, re: RegExp) => {
        try { await client.call({ to: c.usdc, data }); return "call succeeded?"; } catch (e) { const m = String((e as { details?: string }).details ?? (e as Error).message); return re.test(m) ? "present" : `other: ${m.slice(0, 70)}`; }
      };
      const recv = await probe(encodeFunctionData({ abi, functionName: "receiveWithAuthorization", args: [a1, a1, 1n, 0n, 1n, z, 27, z, z] }), /payee/i);
      const xfer = await probe(encodeFunctionData({ abi, functionName: "transferWithAuthorization", args: [a1, a1, 1n, 0n, 1n, z, 27, z, z] }), /authorization is expired|FiatToken/i);
      const permit = await probe(encodeFunctionData({ abi, functionName: "permit", args: [a1, a1, 1n, 1n, 27, z, z] }), /permit is expired|FiatToken/i);
      const head = await client.getBlock();
      const fin = await client.getBlock({ blockTag: "finalized" }).then((b) => Number(head.number - b.number)).catch(() => null);
      return { ...out, rpc: url, tokenName: name, symbol, decimals, version, domainSeparatorMatches: domainMatches, receiveWithAuthorization: recv, transferWithAuthorization: xfer, permit, blockTimeHintSeconds: null, finalizedTagLagBlocks: fin, headBlock: Number(head.number) };
    } catch (e) {
      out[`rpc ${url}`] = `ERR ${String((e as { shortMessage?: string }).shortMessage ?? (e as Error).message).slice(0, 80)}`;
    }
  }
  return { ...out, verified: false };
}

const wanted = process.argv.slice(2);
const results = await Promise.all(CANDIDATES.filter((x) => wanted.length === 0 || wanted.includes(x.id)).map(survey));
console.log(JSON.stringify(results, null, 2));
