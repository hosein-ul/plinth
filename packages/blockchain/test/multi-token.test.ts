import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getAddress, parseUnits, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { computeFee, destinationKindIndex, networkTokens, toBytes32Id, contractsFor } from "@plinth/shared";
import { EvmAdapter, MockEurcAbi, buildReceiveAuthorization, recoverAuthorizationSigner, splitSignature, type InvoiceRoute } from "../src";
import { startDevChain, type DevChain } from "../src/dev";

let chain: DevChain;
let usdc: EvmAdapter;
let eurc: EvmAdapter;
const merchantId = toBytes32Id("mer_multi");
const FEE = 20;
let vaultU: Address;
let vaultE: Address;

const send = async (from: number, tx: { to: Address; data: Hex }) => {
  const hash = await chain.walletFor(from).sendTransaction({ ...tx, account: chain.accounts[from]!, chain: undefined });
  return chain.publicClient.waitForTransactionReceipt({ hash });
};

beforeAll(async () => {
  chain = await startDevChain({ tokens: ["EURC"] });
  usdc = new EvmAdapter(chain.network, chain.deployment, chain.publicClient);
  eurc = new EvmAdapter(chain.network, chain.deployment, chain.publicClient, "EURC");
  const owner = chain.accounts[2]!.address;
  for (const a of [usdc, eurc]) expect((await send(1, a.encodeCreateVault(merchantId, owner))).status).toBe("success");
  vaultU = await usdc.predictVault(merchantId, owner);
  vaultE = await eurc.predictVault(merchantId, owner);
}, 90_000);
afterAll(async () => chain?.stop());

describe("two payment tokens on one chain", () => {
  it("the registry and deployment describe both, each with its own contracts", () => {
    const tokens = networkTokens(chain.network);
    expect(Object.keys(tokens).sort()).toEqual(["EURC", "USDC"]);
    expect(tokens.EURC!.eip712).toEqual({ name: "EURC", version: "2" });
    const u = contractsFor(chain.deployment, "USDC")!;
    const e = contractsFor(chain.deployment, "EURC")!;
    for (const k of ["vaultFactory", "invoiceImplementation", "invoiceFactory", "paymentRouter"] as const) expect(e[k]).not.toBe(u[k]);
    expect(getAddress(eurc.usdc)).toBe(getAddress(chain.tokens.EURC!));
    expect(getAddress(usdc.usdc)).toBe(getAddress(chain.usdc));
  });

  it("the same invoice has a different address per token, and each matches its own factory", async () => {
    const invoiceId = toBytes32Id("pi_two_tokens");
    const route = (v: Address): InvoiceRoute => ({ destination: v, kind: "VAULT", feeBps: FEE });
    const a = usdc.predictInvoiceAddress(route(vaultU), merchantId, invoiceId);
    const b = eurc.predictInvoiceAddress(route(vaultE), merchantId, invoiceId);
    expect(a).not.toBe(b);
    expect(await usdc.predictInvoiceAddressOnChain(route(vaultU), merchantId, invoiceId)).toBe(a);
    expect(await eurc.predictInvoiceAddressOnChain(route(vaultE), merchantId, invoiceId)).toBe(b);
    // a direct wallet gets different addresses too, because the token is part of the commitment
    const direct = (a2: EvmAdapter): InvoiceRoute => ({ destination: chain.accounts[6]!.address, kind: "DIRECT", feeBps: FEE });
    expect(usdc.predictInvoiceAddress(direct(usdc), merchantId, invoiceId)).not.toBe(eurc.predictInvoiceAddress(direct(eurc), merchantId, invoiceId));
  });

  it("a EURC payment is swept and split in EURC units; USDC is untouched", async () => {
    const invoiceId = toBytes32Id("pi_eurc_sweep");
    const route: InvoiceRoute = { destination: vaultE, kind: "VAULT", feeBps: FEE };
    const addr = eurc.predictInvoiceAddress(route, merchantId, invoiceId);
    const amount = parseUnits("90", 6);
    await chain.mintToken("EURC", addr, amount);
    const r = await send(1, eurc.encodeDeployAndSweep(merchantId, invoiceId, route));
    expect(r.status).toBe("success");
    const fee = computeFee(amount, FEE);
    expect(await eurc.tokenBalanceOf(vaultE)).toBe(amount - fee);
    expect(await eurc.tokenBalanceOf(chain.treasury)).toBe(fee);
    expect(await usdc.tokenBalanceOf(chain.treasury)).toBe(0n);
    const sweeps = eurc.decodeReceiptEvents(r).sweeps;
    expect(sweeps[0]).toMatchObject({ amount, fee, token: getAddress(chain.tokens.EURC!) });
  });

  it("wallet checkout in EURC signs the EURC domain and pays through the EURC router", async () => {
    const customer = privateKeyToAccount(generatePrivateKey());
    const value = parseUnits("12.5", 6);
    await chain.mintToken("EURC", customer.address, value);
    const now = Number((await chain.publicClient.getBlock()).timestamp);
    const route: InvoiceRoute = { destination: vaultE, kind: "VAULT", feeBps: FEE };
    const payment = { from: customer.address, destination: route.destination, kind: destinationKindIndex(route.kind), feeBps: FEE, merchantId, invoiceId: toBytes32Id("pi_eurc_wallet"), value, validAfter: BigInt(now - 60), validBefore: BigInt(now + 3600), salt: toBytes32Id("s-e1") };
    const eurcToken = networkTokens(chain.network).EURC!;
    const auth = buildReceiveAuthorization(chain.network, eurc.contracts.paymentRouter, chain.treasury, payment, eurcToken);
    expect(auth.domain).toMatchObject({ name: "EURC", version: "2", verifyingContract: eurcToken.address });
    const sig = await customer.signTypedData({ domain: auth.domain, types: auth.types, primaryType: auth.primaryType, message: auth.message });
    expect(await recoverAuthorizationSigner(auth, sig)).toBe(customer.address);
    const { v, r, s } = splitSignature(sig);
    const before = await eurc.tokenBalanceOf(vaultE);
    const receipt = await send(1, eurc.encodePay(payment, v, r, s));
    expect(receipt.status).toBe("success");
    expect(await eurc.tokenBalanceOf(vaultE)).toBe(before + value - computeFee(value, FEE));
    expect(eurc.decodeReceiptEvents(receipt).payments[0]).toMatchObject({ amount: value, fee: computeFee(value, FEE) });
    // The same signature cannot be replayed through the USDC router, whose domain is different.
    await expect(send(1, usdc.encodePay(payment, v, r, s))).rejects.toThrow();
  });

  it("a USDC transfer to a EURC invoice address is never counted or swept as EURC", async () => {
    const invoiceId = toBytes32Id("pi_wrong_token");
    const route: InvoiceRoute = { destination: vaultE, kind: "VAULT", feeBps: FEE };
    const addr = eurc.predictInvoiceAddress(route, merchantId, invoiceId);
    await chain.mintUsdc(addr, parseUnits("7", 6));
    await send(1, eurc.encodeDeployAndSweep(merchantId, invoiceId, route));
    expect(await usdc.tokenBalanceOf(addr)).toBe(parseUnits("7", 6)); // stays put
    const head = await chain.publicClient.getBlockNumber();
    const seen = await eurc.scanTransfers(head - 6n, head, [addr]);
    const t = seen.find((x) => x.token === getAddress(chain.usdc))!;
    const v = await eurc.verifyTransfer(t.txHash, t.logIndex, addr);
    // For the EURC adapter a USDC transfer is not the official asset.
    expect(v.ok && v.official).toBe(false);
  });

  it("facts read back from the contracts name the right token for each set", async () => {
    const fe = await eurc.readDeploymentFacts();
    const fu = await usdc.readDeploymentFacts();
    expect(fe.implementation.token).toBe(getAddress(chain.tokens.EURC!));
    expect(fu.implementation.token).toBe(getAddress(chain.usdc));
    expect(fe.router.token).toBe(fe.factory.token);
    expect(await eurc.client.readContract({ address: chain.tokens.EURC!, abi: MockEurcAbi, functionName: "symbol" })).toBe("EURC");
  });
});
