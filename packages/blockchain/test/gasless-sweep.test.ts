import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decodeEventLog, encodeFunctionData, getAddress, parseUnits, zeroAddress, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { computeFee, destinationKindIndex, toBytes32Id, type DestinationKind } from "@plinth/shared";
import {
  EvmAdapter,
  InvoiceDepositAbi,
  InvoiceFactoryAbi,
  MockFiatTokenAbi,
  MerchantVaultAbi,
  PaymentRouterAbi,
  VaultFactoryAbi,
  INVOICE_ARGS_LENGTH,
  buildReceiveAuthorization,
  computeInvoiceAddress,
  invoiceCloneArgs,
  recoverAuthorizationSigner,
  splitSignature,
  type InvoiceRoute,
} from "../src";
import { startDevChain, type DevChain } from "../src/dev";

let chain: DevChain;
let adapter: EvmAdapter;
const merchantId = toBytes32Id("mer_test_a");
let vault: Address;
const FEE = 20;
let vaultRoute: InvoiceRoute;
let directRoute: InvoiceRoute;

const send = async (from: number, tx: { to: Address; data: Hex }) => {
  const hash = await chain.walletFor(from).sendTransaction({ ...tx, account: chain.accounts[from]!, chain: undefined });
  return chain.publicClient.waitForTransactionReceipt({ hash });
};

beforeAll(async () => {
  chain = await startDevChain();
  adapter = new EvmAdapter(chain.network, chain.deployment, chain.publicClient);
  // Relayer (account 1) creates the vault for the merchant-owned address (account 2).
  const owner = chain.accounts[2]!.address;
  const predicted = await adapter.predictVault(merchantId, owner);
  const r = await send(1, adapter.encodeCreateVault(merchantId, owner));
  expect(r.status).toBe("success");
  vault = predicted;
  expect(await adapter.isRegisteredVault(vault)).toBe(true);
  vaultRoute = { destination: vault, kind: "VAULT", feeBps: FEE };
  directRoute = { destination: chain.accounts[6]!.address, kind: "DIRECT", feeBps: FEE };
}, 60_000);

afterAll(async () => {
  await chain?.stop();
});

describe("deployment facts", () => {
  it("the deployed contracts report the treasury, fee cap, token, chain and version we expect", async () => {
    const f = await adapter.readDeploymentFacts();
    expect(f.implementation).toMatchObject({ token: getAddress(chain.usdc), chainId: chain.chainId, version: 2, treasury: getAddress(chain.treasury), maxFeeBps: 100 });
    expect(f.factory).toMatchObject({ implementation: getAddress(chain.deployment.invoiceImplementation), token: getAddress(chain.usdc), treasury: getAddress(chain.treasury), maxFeeBps: 100, version: 2 });
    expect(f.router).toMatchObject({ token: getAddress(chain.usdc), treasury: getAddress(chain.treasury), maxFeeBps: 100 });
    expect(f.treasuryHasCode).toBe(false);
  });
});

describe("gasless invoice sweep (real EVM, real receipts)", () => {
  it("offline address derivation equals the on-chain factory prediction and the deployed address, in both modes", async () => {
    for (const route of [vaultRoute, directRoute]) {
      const invoiceId = toBytes32Id(`pi_derivation_${route.kind}`);
      const offline = adapter.predictInvoiceAddress(route, merchantId, invoiceId);
      const onchain = await chain.publicClient.readContract({
        address: chain.deployment.invoiceFactory,
        abi: InvoiceFactoryAbi,
        functionName: "predict",
        args: [merchantId, invoiceId, route.destination, destinationKindIndex(route.kind), route.feeBps],
      });
      expect(offline).toBe(onchain);
      expect(await adapter.predictInvoiceAddressOnChain(route, merchantId, invoiceId)).toBe(offline);

      const receipt = await send(1, adapter.encodeDeployAndSweep(merchantId, invoiceId, route));
      expect(receipt.status).toBe("success");
      expect(await adapter.hasCode(offline)).toBe(true);
    }
  });

  it("the clone args are 87 packed bytes", () => {
    const args = invoiceCloneArgs({
      factory: chain.deployment.invoiceFactory, implementation: chain.deployment.invoiceImplementation, token: chain.usdc, treasury: chain.treasury,
      ...vaultRoute, merchantId, invoiceId: toBytes32Id("pi_len"), chainId: chain.chainId, version: 2,
    });
    expect((args.length - 2) / 2).toBe(INVOICE_ARGS_LENGTH);
  });

  it("every input changes the derived address", () => {
    const base = {
      factory: chain.deployment.invoiceFactory,
      implementation: chain.deployment.invoiceImplementation,
      token: chain.usdc,
      treasury: chain.treasury,
      destination: vault,
      kind: "VAULT" as DestinationKind,
      feeBps: FEE,
      merchantId,
      invoiceId: toBytes32Id("pi_x"),
      chainId: chain.chainId,
      version: 2,
    };
    const a = computeInvoiceAddress(base);
    expect(computeInvoiceAddress({ ...base, invoiceId: toBytes32Id("pi_y") })).not.toBe(a);
    expect(computeInvoiceAddress({ ...base, merchantId: toBytes32Id("mer_other") })).not.toBe(a);
    expect(computeInvoiceAddress({ ...base, destination: chain.accounts[4]!.address })).not.toBe(a);
    expect(computeInvoiceAddress({ ...base, kind: "DIRECT" })).not.toBe(a);
    expect(computeInvoiceAddress({ ...base, feeBps: FEE + 1 })).not.toBe(a);
    expect(computeInvoiceAddress({ ...base, token: chain.accounts[4]!.address })).not.toBe(a);
    expect(computeInvoiceAddress({ ...base, treasury: chain.accounts[4]!.address })).not.toBe(a);
    expect(computeInvoiceAddress({ ...base, chainId: base.chainId + 1 })).not.toBe(a);
    expect(computeInvoiceAddress({ ...base, version: 3 })).not.toBe(a);
    expect(computeInvoiceAddress(base)).toBe(a);
  });

  it("CRITICAL: USDC sent to an undeployed address is swept by the relayer with no gas at the invoice address (fee to treasury, net to the vault)", async () => {
    const invoiceId = toBytes32Id("pi_critical");
    const invoiceAddr = adapter.predictInvoiceAddress(vaultRoute, merchantId, invoiceId);

    // Preconditions: no code, no native balance, nobody holds a key for it.
    expect(await adapter.hasCode(invoiceAddr)).toBe(false);
    expect(await chain.publicClient.getBalance({ address: invoiceAddr })).toBe(0n);

    // Customer pays the counterfactual address with a plain ERC-20 transfer.
    const amount = parseUnits("125", 6);
    await chain.mintUsdc(chain.accounts[3]!.address, amount);
    const payHash = await chain.walletFor(3).writeContract({
      address: chain.usdc, abi: MockFiatTokenAbi, functionName: "transfer", args: [invoiceAddr, amount],
      account: chain.accounts[3]!, chain: undefined,
    });
    await chain.publicClient.waitForTransactionReceipt({ hash: payHash });
    expect(await adapter.usdcBalanceOf(invoiceAddr)).toBe(amount);
    expect(await adapter.hasCode(invoiceAddr)).toBe(false); // still not deployed

    // Watcher view: the transfer is observable and independently verifiable.
    const head = await chain.publicClient.getBlockNumber();
    const seen = await adapter.scanTransfers(head - 5n, head, [invoiceAddr]);
    expect(seen).toHaveLength(1);
    const verified = await adapter.verifyTransfer(seen[0]!.txHash, seen[0]!.logIndex, invoiceAddr);
    expect(verified.ok && verified.official && verified.transfer.value === amount).toBe(true);

    // Relayer deploys + sweeps in ONE transaction.
    const vaultBefore = await adapter.usdcBalanceOf(vault);
    const treasuryBefore = await adapter.usdcBalanceOf(chain.treasury);
    const relayerBefore = await chain.publicClient.getBalance({ address: chain.accounts[1]!.address });
    const receipt = await send(1, adapter.encodeDeployAndSweep(merchantId, invoiceId, vaultRoute));
    expect(receipt.status).toBe("success");
    expect(receipt.to?.toLowerCase()).toBe(chain.deployment.invoiceFactory.toLowerCase());

    // Real balances after.
    const fee = computeFee(amount, FEE);
    expect(fee).toBe(250_000n);
    expect(await adapter.hasCode(invoiceAddr)).toBe(true);
    expect(await adapter.usdcBalanceOf(invoiceAddr)).toBe(0n);
    expect(await adapter.usdcBalanceOf(vault)).toBe(vaultBefore + amount - fee);
    expect(await adapter.usdcBalanceOf(chain.treasury)).toBe(treasuryBefore + fee);
    expect(await chain.publicClient.getBalance({ address: invoiceAddr })).toBe(0n); // never held gas
    expect(await chain.publicClient.getBalance({ address: chain.accounts[1]!.address })).toBeLessThan(relayerBefore);

    // The adapter decodes the Swept event the way the watcher will.
    const sweeps = adapter.decodeReceiptEvents(receipt).sweeps;
    expect(sweeps).toHaveLength(1);
    expect(sweeps[0]).toMatchObject({ invoiceId, merchantId, destination: getAddress(vault), kind: "VAULT", amount, fee, token: getAddress(chain.usdc), emitter: invoiceAddr });

    // And the raw ABI decode agrees.
    const swept = receipt.logs
      .filter((l) => l.address.toLowerCase() === invoiceAddr.toLowerCase())
      .map((l) => decodeEventLog({ abi: InvoiceDepositAbi, data: l.data, topics: l.topics }))
      .find((e) => e.eventName === "Swept");
    expect(swept?.args).toMatchObject({ invoiceId, merchantId, destination: getAddress(vault), amount, fee });
  });

  it("DIRECT mode: the merchant wallet and the treasury are paid in one transaction, no vault involved", async () => {
    const invoiceId = toBytes32Id("pi_direct");
    const invoiceAddr = adapter.predictInvoiceAddress(directRoute, merchantId, invoiceId);
    const amount = parseUnits("80", 6);
    await chain.mintUsdc(invoiceAddr, amount);
    const walletBefore = await adapter.usdcBalanceOf(directRoute.destination);
    const treasuryBefore = await adapter.usdcBalanceOf(chain.treasury);
    const vaultBefore = await adapter.usdcBalanceOf(vault);

    const receipt = await send(1, adapter.encodeDeployAndSweep(merchantId, invoiceId, directRoute));
    expect(receipt.status).toBe("success");
    const fee = computeFee(amount, FEE);
    expect(await adapter.usdcBalanceOf(directRoute.destination)).toBe(walletBefore + amount - fee);
    expect(await adapter.usdcBalanceOf(chain.treasury)).toBe(treasuryBefore + fee);
    expect(await adapter.usdcBalanceOf(vault)).toBe(vaultBefore);
    expect(adapter.decodeReceiptEvents(receipt).sweeps[0]).toMatchObject({ kind: "DIRECT", destination: getAddress(directRoute.destination), amount, fee });
  });

  it("later transfers to an already-deployed invoice are swept by a plain permissionless sweep()", async () => {
    const invoiceId = toBytes32Id("pi_repeat");
    const invoiceAddr = adapter.predictInvoiceAddress(vaultRoute, merchantId, invoiceId);
    await chain.mintUsdc(invoiceAddr, parseUnits("10", 6));
    await send(1, adapter.encodeDeployAndSweep(merchantId, invoiceId, vaultRoute));
    const vaultBefore = await adapter.usdcBalanceOf(vault);
    await chain.mintUsdc(invoiceAddr, parseUnits("4", 6)); // second payment arrives later
    // A stranger (account 5) may trigger the sweep; funds can only reach the vault and the treasury.
    const receipt = await send(5, {
      to: invoiceAddr,
      data: encodeFunctionData({ abi: InvoiceDepositAbi, functionName: "sweep" }),
    });
    expect(receipt.status).toBe("success");
    expect(await adapter.usdcBalanceOf(vault)).toBe(vaultBefore + parseUnits("4", 6) - computeFee(parseUnits("4", 6), FEE));
    expect(await adapter.usdcBalanceOf(chain.accounts[5]!.address)).toBe(0n);
  });

  it("flags non-official tokens instead of treating them as USDC", async () => {
    const invoiceId = toBytes32Id("pi_fake");
    const invoiceAddr = adapter.predictInvoiceAddress(vaultRoute, merchantId, invoiceId);
    // A second token contract with the same symbol.
    const { loadArtifact } = await import("../src");
    const art = loadArtifact("MockFiatToken");
    const hash = await chain.walletFor(0).deployContract({ abi: MockFiatTokenAbi, bytecode: art.bytecode, account: chain.accounts[0]!, chain: undefined });
    const fake = (await chain.publicClient.waitForTransactionReceipt({ hash })).contractAddress!;
    const mintHash = await chain.walletFor(0).writeContract({ address: fake, abi: MockFiatTokenAbi, functionName: "mint", args: [invoiceAddr, 5_000_000n], account: chain.accounts[0]!, chain: undefined });
    const mintReceipt = await chain.publicClient.waitForTransactionReceipt({ hash: mintHash });
    expect(mintReceipt.status).toBe("success");
    const head = await chain.publicClient.getBlockNumber();
    const seen = await adapter.scanTransfers(head - 3n, head, [invoiceAddr]);
    expect(seen.some((t) => t.token === getAddress(fake))).toBe(true);
    const t = seen.find((x) => x.token === getAddress(fake))!;
    const v = await adapter.verifyTransfer(t.txHash, t.logIndex, invoiceAddr);
    expect(v.ok && v.official).toBe(false);
  });
});

describe("connected-wallet payment (EIP-3009 via PaymentRouter, customer holds no gas)", () => {
  async function payViaRouter(route: InvoiceRoute, label: string) {
    const customer = privateKeyToAccount(generatePrivateKey());
    expect(await chain.publicClient.getBalance({ address: customer.address })).toBe(0n);
    const value = parseUnits("42.5", 6);
    await chain.mintUsdc(customer.address, value);

    const invoiceId = toBytes32Id(`pi_wallet_${label}`);
    const now = Number((await chain.publicClient.getBlock()).timestamp);
    const payment = {
      from: customer.address,
      destination: route.destination,
      kind: destinationKindIndex(route.kind),
      feeBps: route.feeBps,
      merchantId,
      invoiceId,
      value,
      validAfter: BigInt(now - 60),
      validBefore: BigInt(now + 3600),
      salt: toBytes32Id(`customer-salt-${label}`),
    };
    const auth = buildReceiveAuthorization(chain.network, chain.deployment.paymentRouter, chain.treasury, payment);

    // On-chain nonce == offline nonce.
    const onchainNonce = await chain.publicClient.readContract({
      address: chain.deployment.paymentRouter, abi: PaymentRouterAbi, functionName: "paymentNonce", args: [payment],
    });
    expect(onchainNonce).toBe(auth.nonce);

    const signature = await customer.signTypedData({
      domain: auth.domain, types: auth.types, primaryType: auth.primaryType, message: auth.message,
    });
    expect(await recoverAuthorizationSigner(auth, signature)).toBe(customer.address);

    const { v, r, s } = splitSignature(signature);
    const destBefore = await adapter.usdcBalanceOf(route.destination);
    const treasuryBefore = await adapter.usdcBalanceOf(chain.treasury);
    const receipt = await send(1, adapter.encodePay(payment, v, r, s));
    expect(receipt.status).toBe("success");

    const fee = computeFee(value, route.feeBps);
    expect(await adapter.usdcBalanceOf(route.destination)).toBe(destBefore + value - fee);
    expect(await adapter.usdcBalanceOf(chain.treasury)).toBe(treasuryBefore + fee);
    expect(await adapter.usdcBalanceOf(chain.deployment.paymentRouter)).toBe(0n);
    expect(await adapter.usdcBalanceOf(customer.address)).toBe(0n);
    expect(await chain.publicClient.getBalance({ address: customer.address })).toBe(0n);
    expect(await adapter.isAuthorizationUsed(customer.address, auth.nonce)).toBe(true);

    const paid = adapter.decodeReceiptEvents(receipt).payments;
    expect(paid).toHaveLength(1);
    expect(paid[0]).toMatchObject({ invoiceId, merchantId, destination: getAddress(route.destination), kind: route.kind, payer: customer.address, amount: value, fee, nonce: auth.nonce });

    // Replay is rejected by the token.
    await expect(send(1, adapter.encodePay(payment, v, r, s))).rejects.toThrow();
  }

  it("VAULT: customer with ZERO native balance pays; relayer submits; vault and treasury are credited", async () => {
    await payViaRouter(vaultRoute, "vault");
  });

  it("DIRECT: the same flow pays the merchant wallet", async () => {
    await payViaRouter(directRoute, "direct");
  });

  it("a signature tampered to point at another invoice, destination or fee does not execute", async () => {
    const customer = privateKeyToAccount(generatePrivateKey());
    await chain.mintUsdc(customer.address, 5_000_000n);
    const now = Number((await chain.publicClient.getBlock()).timestamp);
    const p = {
      from: customer.address, destination: vault, kind: 0, feeBps: FEE, merchantId, invoiceId: toBytes32Id("pi_orig"), value: 5_000_000n,
      validAfter: BigInt(now - 60), validBefore: BigInt(now + 3600), salt: toBytes32Id("s2"),
    };
    const auth = buildReceiveAuthorization(chain.network, chain.deployment.paymentRouter, chain.treasury, p);
    const sig = await customer.signTypedData({ domain: auth.domain, types: auth.types, primaryType: auth.primaryType, message: auth.message });
    const { v, r, s } = splitSignature(sig);
    await expect(send(1, adapter.encodePay({ ...p, invoiceId: toBytes32Id("pi_other") }, v, r, s))).rejects.toThrow();
    await expect(send(1, adapter.encodePay({ ...p, destination: directRoute.destination, kind: 1 }, v, r, s))).rejects.toThrow();
    await expect(send(1, adapter.encodePay({ ...p, feeBps: 0 }, v, r, s))).rejects.toThrow();
  });
});

describe("merchant vault authority", () => {
  it("the relayer cannot withdraw or redirect; only the merchant owner can", async () => {
    const bal = await adapter.usdcBalanceOf(vault);
    expect(bal).toBeGreaterThan(0n);
    await expect(
      send(1, { to: vault, data: encodeFunctionData({ abi: MerchantVaultAbi, functionName: "withdraw", args: [chain.accounts[1]!.address, 1n] }) }),
    ).rejects.toThrow();
    await expect(
      send(1, {
        to: vault,
        data: encodeFunctionData({ abi: MerchantVaultAbi, functionName: "scheduleSettlement", args: [{ mode: 1, destination: chain.accounts[1]!.address, threshold: 0n, interval: 0n }] }),
      }),
    ).rejects.toThrow();

    const receipt = await send(2, {
      to: vault,
      data: encodeFunctionData({ abi: MerchantVaultAbi, functionName: "withdraw", args: [chain.accounts[2]!.address, 1_000_000n] }),
    });
    expect(receipt.status).toBe("success");
    expect(await adapter.usdcBalanceOf(chain.accounts[2]!.address)).toBe(1_000_000n);

    const state = await adapter.readVault(vault);
    expect(state.owner).toBe(chain.accounts[2]!.address);
    expect(state.mode).toBe("BALANCE_IN_VAULT");
    expect(state.destination).toBe(zeroAddress);
  });

  it("the vault factory registry is unchanged by the fee work", async () => {
    expect(await chain.publicClient.readContract({ address: chain.deployment.vaultFactory, abi: VaultFactoryAbi, functionName: "isVault", args: [vault] })).toBe(true);
  });
});
