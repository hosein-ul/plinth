/**
 * DEV ONLY. A stand-in for a browser wallet's signing step, so the hosted checkout's wallet flow can be
 * exercised in a browser that has no wallet extension (e.g. an automated/embedded browser).
 *
 * It holds anvil's PUBLIC test key #3 (mnemonic "test … junk") and signs EIP-712 requests over HTTP on
 * 127.0.0.1:4010. It refuses any request whose domain chain id is not the local dev chain (31337), so it
 * cannot sign for a real network even if misused. Never put a real key here.
 */
import { createServer } from "node:http";
import { anvilAccount } from "@plinth/blockchain/dev";

const account = anvilAccount(3);
const PORT = Number(process.env.DEV_WALLET_PORT ?? 4010);

createServer(async (req, res) => {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type");
  if (req.method === "OPTIONS") return void res.writeHead(204).end();
  if (req.method === "GET") return void res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ address: account.address }));
  let body = "";
  for await (const c of req) body += c;
  try {
    const { typedData } = JSON.parse(body);
    if (Number(typedData?.domain?.chainId) !== 31337) throw new Error("dev signer only signs for chain 31337");
    const { EIP712Domain: _omit, ...types } = typedData.types;
    const message = { ...typedData.message, value: BigInt(typedData.message.value), validAfter: BigInt(typedData.message.validAfter), validBefore: BigInt(typedData.message.validBefore) };
    // JSON-RPC delivers chainId as a decimal string; EIP-712 hashes it as uint256.
    const domain = { ...typedData.domain, chainId: BigInt(typedData.domain.chainId) };
    const signature = await account.signTypedData({ domain, types, primaryType: typedData.primaryType, message });
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ signature }));
  } catch (e) {
    res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: String(e instanceof Error ? e.message : e) }));
  }
}).listen(PORT, "127.0.0.1", () => console.log(`dev wallet signer for ${account.address} on http://127.0.0.1:${PORT}`));
