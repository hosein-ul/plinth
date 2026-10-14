import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decodeEventLog, encodeFunctionData, getAddress, parseUnits, zeroAddress, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { toBytes32Id } from "@plinth/shared";
import {
  EvmAdapter,
  InvoiceDepositAbi,
  InvoiceFactoryAbi,
  MockFiatTokenAbi,
  MerchantVaultAbi,
  PaymentRouterAbi,
  VaultFactoryAbi,
  buildReceiveAuthorization,
  computeInvoiceAddress,
  recoverAuthorizationSigner,
  splitSignature,
} from "../src";
import { startDevChain, type DevChain } from "../src/dev";

let chain: DevChain;
let adapter: EvmAdapter;
const merchantId = toBytes32Id("mer_test_a");
let vault: Address;

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
}, 60_000);

afterAll(async () => {
  await chain?.stop();
});

describe("gasless invoice sweep (real EVM, real receipts)", () => {
  it("offline address derivation equals the on-chain factory prediction and the deployed address", async () => {
    const invoiceId = toBytes32Id("pi_derivation");
    const offline = adapter.predictInvoiceAddress(vault, merchantId, invoiceId);
    const onchain = await chain.publicClient.readContract({
      address: chain.deployment.invoiceFactory,
      abi: InvoiceFactoryAbi,
      functionName: "predict",
      args: [merchantId, invoiceId, vault],
    });
    expect(offline).toBe(onchain);

    const receipt = await send(1, adapter.encodeDeployAndSweep(merchantId, invoiceId, vault));
    expect(receipt.status).toBe("success");
    expect(await adapter.hasCode(offline)).toBe(true);
  });

  it("every input changes the derived address", () => {
    const base = {
      factory: chain.deployment.invoiceFactory,
      implementation: chain.deployment.invoiceImplementation,
      token: chain.usdc,
      vault,
      merchantId,
      invoiceId: toBytes32Id("pi_x"),
      chainId: chain.chainId,
      version: 1,
    };
    const a = computeInvoiceAddress(base);
    expect(computeInvoiceAddress({ ...base, invoiceId: toBytes32Id("pi_y") })).not.toBe(a);
    expect(computeInvoiceAddress({ ...base, merchantId: toBytes32Id("mer_other") })).not.toBe(a);
    expect(computeInvoiceAddress({ ...base, vault: chain.accounts[4]!.address })).not.toBe(a);
    expect(computeInvoiceAddress({ ...base, token: chain.accounts[4]!.address })).not.toBe(a);
    expect(computeInvoiceAddress({ ...base, chainId: base.chainId + 1 })).not.toBe(a);
    expect(computeInvoiceAddress({ ...base, version: 2 })).not.toBe(a);
    expect(computeInvoiceAddress(base)).toBe(a);
  });

  it("CRITICAL: USDC sent to an undeployed address is swept by the relayer with no gas at the invoice address", async () => {
    const invoiceId = toBytes32Id("pi_critical");
    const invoiceAddr = adapter.predictInvoiceAddress(vault, merchantId, invoiceId);

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
    const relayerBefore = await chain.publicClient.getBalance({ address: chain.accounts[1]!.address });
    const receipt = await send(1, adapter.encodeDeployAndSweep(merchantId, invoiceId, vault));
    expect(receipt.status).toBe("success");
    expect(receipt.to?.toLowerCase()).toBe(chain.deployment.invoiceFactory.toLowerCase());

    // Real balances after.
    expect(await adapter.hasCode(invoiceAddr)).toBe(true);
    expect(await adapter.usdcBalanceOf(invoiceAddr)).toBe(0n);
    expect(await adapter.usdcBalanceOf(vault)).toBe(amount);
    expect(await chain.publicClient.getBalance({ address: invoiceAddr })).toBe(0n); // never held gas
    expect(await chain.publicClient.getBalance({ address: chain.accounts[1]!.address })).toBeLessThan(relayerBefore);

    // Swept event decodes to the right invoice/merchant/vault/amount.
    const swept = receipt.logs
      .filter((l) => l.address.toLowerCase() === invoiceAddr.toLowerCase())
      .map((l) => decodeEventLog({ abi: InvoiceDepositAbi, data: l.data, topics: l.topics }))
      .find((e) => e.eventName === "Swept");
    expect(swept?.args).toMatchObject({ invoiceId, merchantId, vault: getAddress(vault), amount });
  });

  it("later transfers to an already-deployed invoice are swept by a plain permissionless sweep()", async () => {
    const invoiceId = toBytes32Id("pi_repeat");
    const invoiceAddr = adapter.predictInvoiceAddress(vault, merchantId, invoiceId);
    await chain.mintUsdc(invoiceAddr, parseUnits("10", 6));
    await send(1, adapter.encodeDeployAndSweep(merchantId, invoiceId, vault));
    const vaultBefore = await adapter.usdcBalanceOf(vault);
    await chain.mintUsdc(invoiceAddr, parseUnits("4", 6)); // second payment arrives later
    // A stranger (account 5) may trigger the sweep; funds can only reach the vault.
    const receipt = await send(5, {
      to: invoiceAddr,
      data: encodeFunctionData({ abi: InvoiceDepositAbi, functionName: "sweep" }),
    });
    expect(receipt.status).toBe("success");
    expect(await adapter.usdcBalanceOf(vault)).toBe(vaultBefore + parseUnits("4", 6));
    expect(await adapter.usdcBalanceOf(chain.accounts[5]!.address)).toBe(0n);
  });

  it("flags non-official tokens instead of treating them as USDC", async () => {
    const invoiceId = toBytes32Id("pi_fake");
    const invoiceAddr = adapter.predictInvoiceAddress(vault, merchantId, invoiceId);
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
  it("customer with ZERO native balance pays; relayer submits; vault is credited", async () => {
    const customer = privateKeyToAccount(generatePrivateKey());
    expect(await chain.publicClient.getBalance({ address: customer.address })).toBe(0n);
    const value = parseUnits("42.5", 6);
    await chain.mintUsdc(customer.address, value);

    const invoiceId = toBytes32Id("pi_wallet");
    const now = Number((await chain.publicClient.getBlock()).timestamp);
    const payment = {
      from: customer.address,
      vault,
      merchantId,
      invoiceId,
      value,
      validAfter: BigInt(now - 60),
      validBefore: BigInt(now + 3600),
      salt: toBytes32Id("customer-salt-1"),
    };
    const auth = buildReceiveAuthorization(chain.network, chain.deployment.paymentRouter, payment);

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
    const vaultBefore = await adapter.usdcBalanceOf(vault);
    const receipt = await send(1, adapter.encodePay(payment, v, r, s));
    expect(receipt.status).toBe("success");

    expect(await adapter.usdcBalanceOf(vault)).toBe(vaultBefore + value);
    expect(await adapter.usdcBalanceOf(chain.deployment.paymentRouter)).toBe(0n);
    expect(await adapter.usdcBalanceOf(customer.address)).toBe(0n);
    expect(await chain.publicClient.getBalance({ address: customer.address })).toBe(0n);
    expect(await adapter.isAuthorizationUsed(customer.address, auth.nonce)).toBe(true);

    const paid = receipt.logs
      .filter((l) => l.address.toLowerCase() === chain.deployment.paymentRouter.toLowerCase())
      .map((l) => decodeEventLog({ abi: PaymentRouterAbi, data: l.data, topics: l.topics }))
      .find((e) => e.eventName === "InvoicePaid");
    expect(paid?.args).toMatchObject({ invoiceId, merchantId, payer: customer.address, amount: value, nonce: auth.nonce });

    // Replay is rejected by the token.
    await expect(send(1, adapter.encodePay(payment, v, r, s))).rejects.toThrow();
  });

  it("a signature tampered to point at another invoice does not execute", async () => {
    const customer = privateKeyToAccount(generatePrivateKey());
    await chain.mintUsdc(customer.address, 5_000_000n);
    const now = Number((await chain.publicClient.getBlock()).timestamp);
    const p = {
      from: customer.address, vault, merchantId, invoiceId: toBytes32Id("pi_orig"), value: 5_000_000n,
      validAfter: BigInt(now - 60), validBefore: BigInt(now + 3600), salt: toBytes32Id("s2"),
    };
    const auth = buildReceiveAuthorization(chain.network, chain.deployment.paymentRouter, p);
    const sig = await customer.signTypedData({ domain: auth.domain, types: auth.types, primaryType: auth.primaryType, message: auth.message });
    const { v, r, s } = splitSignature(sig);
    await expect(send(1, adapter.encodePay({ ...p, invoiceId: toBytes32Id("pi_other") }, v, r, s))).rejects.toThrow();
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
});
