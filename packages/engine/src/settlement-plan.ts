import { and, desc, eq, inArray, schema, sql, type Executor } from "@plinth/db";
import { newId, type DestinationKind } from "@plinth/shared";
import { getAddress, type Hex } from "viem";
import { chainOf, type Engine } from "./context";

/** Exponential cool-down between automatic settlement attempts (seconds). */
const attemptBackoff = (n: number) => Math.min(3600, 30 * 2 ** (n - 1));

/**
 * Decide whether FINAL funds sitting at an invoice address need a sweep, and if so create the
 * settlement + relayer operation in the caller's transaction. Idempotent:
 *  - at most one open settlement per address (partial unique index),
 *  - the relayer op dedupe key encodes (address, final total, attempt), so replays are no-ops.
 */
export async function planSettlement(e: Engine, tx: Executor, paymentIntentId: string, opts: { eligibleSatisfied: boolean }): Promise<void> {
  const addrs = await tx.select().from(schema.invoiceAddresses).where(eq(schema.invoiceAddresses.paymentIntentId, paymentIntentId));
  for (const a of addrs) {
    const chain = e.chains.get(a.networkId);
    if (!chain || !chain.signer || !chain.operational) continue;

    const [agg] = await tx
      .select({
        incomingFinal: sql<string>`coalesce(sum(case when ${schema.transactions.kind} = 'INCOMING_TRANSFER' and ${schema.transactions.status} = 'FINAL' and ${schema.transactions.isOfficialAsset} then ${schema.transactions.amount} else 0 end), 0)`,
        swept: sql<string>`coalesce(sum(case when ${schema.transactions.kind} = 'SWEEP' and ${schema.transactions.status} <> 'REORGED' then ${schema.transactions.amount} else 0 end), 0)`,
      })
      .from(schema.transactions)
      .where(eq(schema.transactions.invoiceAddressId, a.id));
    const incomingFinal = BigInt(agg?.incomingFinal ?? "0");
    const swept = BigInt(agg?.swept ?? "0");
    const unswept = incomingFinal - swept;
    if (unswept <= 0n) continue;

    const open = await tx
      .select({ id: schema.settlements.id })
      .from(schema.settlements)
      .where(and(eq(schema.settlements.invoiceAddressId, a.id), eq(schema.settlements.kind, "SWEEP"), inArray(schema.settlements.status, ["QUEUED", "SUBMITTED"])));
    if (open.length > 0) continue;

    // Dust guard: do not pay gas for amounts below the policy minimum unless the invoice is satisfied.
    if (unswept < chain.policy.minSweepUnits && !opts.eligibleSatisfied) continue;

    const failed = await tx
      .select()
      .from(schema.settlements)
      .where(and(eq(schema.settlements.invoiceAddressId, a.id), eq(schema.settlements.kind, "SWEEP"), eq(schema.settlements.status, "FAILED")))
      .orderBy(desc(schema.settlements.createdAt));
    const attemptNo = failed.length + 1;
    if (attemptNo > chain.policy.maxSettlementAttempts) {
      await e.alerts.raise({
        key: `settlement-exhausted:${a.id}`, severity: "critical", title: "Settlement attempts exhausted — manual retry required",
        detail: { paymentIntentId, invoiceAddress: a.address, network: a.networkId, unswept: unswept.toString() },
      });
      continue;
    }
    const last = failed[0];
    if (last && e.now().getTime() < last.createdAt.getTime() + attemptBackoff(failed.length) * 1000) continue;

    const settlementId = newId("stl");
    const opId = newId("rop");
    const call = chain.adapter.encodeDeployAndSweep(a.merchantId32 as Hex, a.invoiceId32 as Hex, {
      destination: getAddress(a.destinationAddress),
      kind: a.destinationKind as DestinationKind,
      feeBps: a.feeBps,
    });
    const planned = await tx.insert(schema.relayerOperations).values({
      id: opId, networkId: a.networkId, kind: "DEPLOY_AND_SWEEP", dedupeKey: `sweep:${a.id}:${incomingFinal}:${attemptNo}`,
      toAddress: call.to.toLowerCase(), calldata: call.data, relatedType: "settlement", relatedId: settlementId, nextAttemptAt: e.now(),
    }).onConflictDoNothing().returning({ id: schema.relayerOperations.id });
    if (planned.length === 0) continue; // this exact sweep was already planned
    await tx.insert(schema.settlements).values({
      id: settlementId, merchantId: a.merchantId, paymentIntentId, invoiceAddressId: a.id, networkId: a.networkId,
      kind: "SWEEP", status: "QUEUED", attemptNo, vaultAddress: a.vaultAddress, destinationKind: a.destinationKind, destinationAddress: a.destinationAddress, expectedAmount: unswept, relayerOperationId: opId, createdAt: e.now(),
    });
    await tx.insert(schema.paymentEvents).values({
      id: newId("pev"), paymentIntentId, type: "settlement.queued",
      data: { network: a.networkId, expected_units: unswept.toString(), attempt: attemptNo },
    });
  }
}
