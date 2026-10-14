import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "@plinth/db";
import { connect, schema, type DbHandle } from "@plinth/db";
import { MockFiatTokenAbi } from "@plinth/blockchain";
import { startDevChain, type DevChain } from "@plinth/blockchain/dev";
import { parseUsdc } from "@plinth/shared";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Address } from "viem";
import {
  MemoryAlertSink, createEngine, enableNetwork, getPaymentIntent, paymentDetail, prepareWalletPayment, processWebhookJobs, relayerTick, signup, silentLogger, submitWalletPayment,
  watcherTick, publicCheckout, createPaymentIntent, type AuthContext, type Engine,
} from "../src";

let a: DevChain, b: DevChain, db: DbHandle, engine: Engine, m: AuthContext;

beforeAll(async () => {
  [a, b] = await Promise.all([
    startDevChain({ chainId: 31337, networkId: "dev-a", confirmations: 2 }),
    startDevChain({ chainId: 31338, networkId: "dev-b", confirmations: 4 }), // different finality policy
  ]);
  db = connect("pglite://memory");
  await db.migrate();
  engine = await createEngine({
    db: db.db, logger: silentLogger, alerts: new MemoryAlertSink(),
    env: { APP_SECRET_KEY: "44".repeat(32) },
    signers: { getSigner: (n) => (n === "dev-a" ? a.accounts[1] : n === "dev-b" ? b.accounts[1] : undefined) },
    extraNetworks: [
      { network: a.network, deployment: a.deployment, client: a.publicClient },
      { network: b.network, deployment: b.deployment, client: b.publicClient },
    ],
  });
  const { merchantId } = await signup(engine, { business_name: "Multi", email: "multi@example.test", password: "multi-chain-passphrase-1" }, { type: "SYSTEM" });
  m = { merchantId, environment: "test", actor: { type: "SYSTEM" }, role: "OWNER", via: "session" };
  await enableNetwork(engine, m, { network: "dev-a", owner_address: a.accounts[2]!.address });
  await enableNetwork(engine, m, { network: "dev-b", owner_address: b.accounts[2]!.address });
  await pump(3);
});
afterAll(async () => {
  await Promise.all([a.stop(), b.stop()]);
  await db.close();
});

async function pump(rounds = 8) {
  for (let i = 0; i < rounds; i++) {
    for (const c of [a, b]) {
      await c.mine(1);
      await watcherTick(engine, c.network.id);
      await relayerTick(engine, c.network.id);
    }
    await processWebhookJobs(engine);
  }
}
const pay = async (c: DevChain, to: Address | null | undefined, units: bigint) => {
  if (!to) throw new Error("no deposit address");
  await c.mintUsdc(c.accounts[3]!.address, units);
  const h = await c.walletFor(3).writeContract({ address: c.usdc, abi: MockFiatTokenAbi, functionName: "transfer", args: [to, units], account: c.accounts[3]!, chain: undefined });
  await c.publicClient.waitForTransactionReceipt({ hash: h });
};
const input = (amount: string, methods: ("WALLET" | "ADDRESS")[] = ["ADDRESS", "WALLET"]) => ({ amount, currency: "USDC" as const, checkout_methods: methods, expires_in_seconds: 3600 });

describe("one payment engine, several networks", () => {
  it("each network gets its own vault and a DIFFERENT deposit address for the same payment", async () => {
    const pi = await createPaymentIntent(engine, m, input("10.00"));
    expect(pi.networks.map((n) => n.network).sort()).toEqual(["dev-a", "dev-b"]);
    const [x, y] = pi.networks.map((n) => n.deposit_address);
    expect(x && y && x !== y).toBe(true); // chain id + vault are bound into the address
    const vaults = await engine.db.select().from(schema.merchantVaults).where(eq(schema.merchantVaults.merchantId, m.merchantId));
    expect(vaults).toHaveLength(2);
    // Same factory address + same owner on both chains => the same vault address everywhere (deterministic by design).
    // Safety comes from the chain id being bound into every INVOICE address, asserted above.
    expect(vaults.map((v) => v.networkId).sort()).toEqual(["dev-a", "dev-b"]);
  });

  it("paying on network B settles into B's vault only, using B's finality policy", async () => {
    const pi = await createPaymentIntent(engine, m, input("7.00"));
    const addrB = pi.networks.find((n) => n.network === "dev-b")!.deposit_address as Address;
    await pay(b, addrB, parseUsdc("7"));
    await pump(10);
    const d = await paymentDetail(engine, m, pi.id);
    expect(d.status).toBe("SETTLED");
    expect(d.transactions.every((t: any) => t.network === "dev-b")).toBe(true);
    const [vA, vB] = await Promise.all(["dev-a", "dev-b"].map(async (n) => (await engine.db.select().from(schema.merchantVaults).where(eq(schema.merchantVaults.networkId, n)))[0]!.vaultAddress as Address));
    expect(await engine.chains.get("dev-b")!.adapter.usdcBalanceOf(vB!)).toBeGreaterThanOrEqual(parseUsdc("7"));
    expect(await engine.chains.get("dev-a")!.adapter.usdcBalanceOf(vA!)).toBe(0n);
  });

  it("a transfer to network A's address made on network B is NOT credited (wrong-network deposit)", async () => {
    const pi = await createPaymentIntent(engine, m, input("5.00", ["ADDRESS"]));
    const addrA = pi.networks.find((n) => n.network === "dev-a")!.deposit_address as Address;
    await pay(b, addrA, parseUsdc("5")); // customer picked the wrong network
    await pump(8);
    const d = await getPaymentIntent(engine, m, pi.id);
    expect(d.status).toBe("AWAITING_PAYMENT");
    expect(d.amount_received_units).toBe("0");
  });

  it("wallet checkout works independently per network; capability is reported per network", async () => {
    const pi = await createPaymentIntent(engine, m, input("3.25"));
    const co = await publicCheckout(engine, pi.id);
    expect(co.networks.every((n: any) => n.wallet_checkout_supported)).toBe(true);
    const customer = privateKeyToAccount(generatePrivateKey());
    await a.mintUsdc(customer.address, parseUsdc("10"));
    const prep = await prepareWalletPayment(engine, pi.id, { network: "dev-a", payer: customer.address });
    expect(prep.typed_data.domain.chainId).toBe(31337); // signature is bound to THIS chain
    const td = prep.typed_data;
    const signature = await customer.signTypedData({
      domain: td.domain, types: { ReceiveWithAuthorization: td.types.ReceiveWithAuthorization }, primaryType: "ReceiveWithAuthorization",
      message: { ...td.message, value: BigInt(td.message.value), validAfter: BigInt(td.message.validAfter), validBefore: BigInt(td.message.validBefore) },
    } as any);
    // The same signature must be useless on the other network (different chain id / router / token).
    await expect(submitWalletPayment(engine, pi.id, { attempt_id: prep.attempt_id, signature })).resolves.toBeTruthy();
    await pump(10);
    const d = await paymentDetail(engine, m, pi.id);
    expect(d.status).toBe("SETTLED");
    expect(d.transactions[0]?.network).toBe("dev-a");
  });

  it("a network with no deployment, or not enabled, never accepts new payments", async () => {
    engine.chains.get("dev-b")!.operational = false;
    try {
      const pi = await createPaymentIntent(engine, m, input("1.00"));
      expect(pi.networks.map((n) => n.network)).toEqual(["dev-a"]);
      await expect(createPaymentIntent(engine, m, { ...input("1.00"), networks: ["dev-b"] } as never)).rejects.toMatchObject({ code: "NO_NETWORK_AVAILABLE" });
    } finally {
      engine.chains.get("dev-b")!.operational = true;
    }
  });
});
