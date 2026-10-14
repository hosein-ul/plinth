import { mulBps } from "./money";

/**
 * Payment intent lifecycle.
 *
 *   CREATED -> AWAITING_PAYMENT -> DETECTED -> CONFIRMING -> PAID | OVERPAID
 *                                                          -> SETTLEMENT_PENDING -> SETTLED
 *                                                          -> SETTLEMENT_FAILED  -> (retry) SETTLEMENT_PENDING
 *   AWAITING_PAYMENT -> EXPIRED
 *   (partial funds, past expiry)  -> UNDERPAID
 *   (funds finalised after expiry) -> LATE_PAYMENT
 *   (only a non-official token received) -> INVALID_ASSET
 *   any funded state -> REFUND_REQUESTED -> PARTIALLY_REFUNDED | REFUNDED
 *
 * The status is DERIVED from verified facts by `deriveIntentStatus`; it is never set from a client
 * claim. `assertTransition` guards the persisted status so a buggy caller cannot skip states.
 */
export const INTENT_STATUSES = [
  "CREATED",
  "AWAITING_PAYMENT",
  "DETECTED",
  "CONFIRMING",
  "PAID",
  "OVERPAID",
  "SETTLEMENT_PENDING",
  "SETTLED",
  "EXPIRED",
  "UNDERPAID",
  "LATE_PAYMENT",
  "INVALID_ASSET",
  "SETTLEMENT_FAILED",
  "REFUND_REQUESTED",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
] as const;
export type IntentStatus = (typeof INTENT_STATUSES)[number];

export const TRANSFER_STATUSES = ["DETECTED", "CONFIRMING", "FINAL", "REORGED"] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];

export interface TransferFact {
  status: TransferStatus;
  amount: bigint;
  /** Transfer of the network's configured official USDC contract. */
  official: boolean;
  /** Block timestamp of the transfer (seconds since epoch). */
  blockTimestamp: number;
}

export interface PaymentPolicy {
  /** Accept payments up to this many bps below the amount as fully paid. 0 = strict. */
  underpaymentToleranceBps: number;
}

export interface DeriveInput {
  amount: bigint;
  expiresAt: number; // seconds since epoch
  now: number; // seconds since epoch
  policy: PaymentPolicy;
  transfers: TransferFact[];
  /** Total of FINAL official transfers confirmed swept into the merchant vault. */
  settledAmount: bigint;
  /** A settlement operation is in flight (submitted, unconfirmed). */
  settlementInFlight: boolean;
  /** Latest settlement attempt failed terminally and nothing is in flight. */
  settlementFailed: boolean;
  refundRequested: boolean;
  refundedAmount: bigint;
}

export interface DerivedState {
  status: IntentStatus;
  /** FINAL official transfers received at or before expiry. */
  eligibleAmount: bigint;
  /** FINAL official transfers whose block time is after expiry. */
  lateAmount: bigint;
  /** DETECTED/CONFIRMING official transfers (not yet final). */
  pendingAmount: bigint;
  /** All FINAL official funds that reached the invoice address (eligible + late). */
  finalAmount: bigint;
  /** eligible - amount when positive. */
  excessAmount: bigint;
  /** amount - eligible when positive. */
  shortfallAmount: bigint;
  /** Non-official token transfers seen (never counted towards payment). */
  invalidAssetCount: number;
}

const sum = (xs: TransferFact[]) => xs.reduce((a, t) => a + t.amount, 0n);

export function deriveIntentStatus(i: DeriveInput): DerivedState {
  const live = i.transfers.filter((t) => t.status !== "REORGED");
  const official = live.filter((t) => t.official);
  const invalidAssetCount = live.filter((t) => !t.official).length;

  const finalOfficial = official.filter((t) => t.status === "FINAL");
  const eligible = sum(finalOfficial.filter((t) => t.blockTimestamp <= i.expiresAt));
  const late = sum(finalOfficial.filter((t) => t.blockTimestamp > i.expiresAt));
  const pending = sum(official.filter((t) => t.status !== "FINAL"));
  const finalAmount = eligible + late;

  const required = i.amount - mulBps(i.amount, i.policy.underpaymentToleranceBps);
  const expired = i.now > i.expiresAt;

  const base = {
    eligibleAmount: eligible,
    lateAmount: late,
    pendingAmount: pending,
    finalAmount,
    excessAmount: eligible > i.amount ? eligible - i.amount : 0n,
    shortfallAmount: eligible < i.amount ? i.amount - eligible : 0n,
    invalidAssetCount,
  };
  const out = (status: IntentStatus): DerivedState => ({ status, ...base });

  // Refunds dominate once any funds were returned or requested.
  if (i.refundedAmount > 0n) return out(i.refundedAmount >= finalAmount ? "REFUNDED" : "PARTIALLY_REFUNDED");
  if (i.refundRequested && finalAmount > 0n) return out("REFUND_REQUESTED");

  // Fully paid (within policy) by FINAL funds received in time.
  if (i.amount > 0n && eligible >= required) {
    if (i.settlementFailed && !i.settlementInFlight) return out("SETTLEMENT_FAILED");
    if (i.settledAmount >= finalAmount && finalAmount > 0n) return out("SETTLED");
    if (i.settlementInFlight || i.settledAmount > 0n) return out("SETTLEMENT_PENDING");
    return out(eligible > i.amount ? "OVERPAID" : "PAID");
  }

  if (!expired) {
    if (official.length > 0) {
      const anyConfirming = official.some((t) => t.status === "CONFIRMING");
      return out(anyConfirming || finalOfficial.length > 0 ? "CONFIRMING" : "DETECTED");
    }
    if (invalidAssetCount > 0) return out("INVALID_ASSET");
    return out("AWAITING_PAYMENT");
  }

  // Expired and not fully paid in time.
  if (eligible > 0n) return out("UNDERPAID");
  if (late > 0n) return out("LATE_PAYMENT");
  if (pending > 0n) return out("CONFIRMING"); // let in-flight funds finalise before classifying
  if (invalidAssetCount > 0) return out("INVALID_ASSET");
  return out("EXPIRED");
}

/** Allowed persisted transitions. Derived status must pass through this guard before being saved. */
const ALLOWED: Record<IntentStatus, readonly IntentStatus[]> = {
  CREATED: ["AWAITING_PAYMENT", "EXPIRED"],
  AWAITING_PAYMENT: ["DETECTED", "CONFIRMING", "PAID", "OVERPAID", "EXPIRED", "INVALID_ASSET", "SETTLEMENT_PENDING", "SETTLED"],
  DETECTED: ["AWAITING_PAYMENT", "CONFIRMING", "PAID", "OVERPAID", "UNDERPAID", "EXPIRED", "LATE_PAYMENT", "INVALID_ASSET"],
  CONFIRMING: ["AWAITING_PAYMENT", "DETECTED", "PAID", "OVERPAID", "UNDERPAID", "EXPIRED", "LATE_PAYMENT", "INVALID_ASSET"],
  PAID: ["SETTLEMENT_PENDING", "SETTLED", "SETTLEMENT_FAILED", "REFUND_REQUESTED", "PARTIALLY_REFUNDED", "REFUNDED", "OVERPAID", "CONFIRMING", "AWAITING_PAYMENT"],
  OVERPAID: ["SETTLEMENT_PENDING", "SETTLED", "SETTLEMENT_FAILED", "REFUND_REQUESTED", "PARTIALLY_REFUNDED", "REFUNDED", "PAID", "CONFIRMING", "AWAITING_PAYMENT"],
  SETTLEMENT_PENDING: ["SETTLED", "SETTLEMENT_FAILED", "PAID", "OVERPAID", "REFUND_REQUESTED", "PARTIALLY_REFUNDED", "REFUNDED", "CONFIRMING", "AWAITING_PAYMENT"],
  SETTLEMENT_FAILED: ["SETTLEMENT_PENDING", "SETTLED", "PAID", "OVERPAID", "REFUND_REQUESTED"],
  SETTLED: ["REFUND_REQUESTED", "PARTIALLY_REFUNDED", "REFUNDED", "OVERPAID", "SETTLEMENT_PENDING"],
  EXPIRED: ["LATE_PAYMENT", "INVALID_ASSET", "UNDERPAID", "CONFIRMING", "PAID", "OVERPAID"],
  UNDERPAID: ["PAID", "OVERPAID", "REFUND_REQUESTED", "PARTIALLY_REFUNDED", "REFUNDED", "SETTLEMENT_PENDING", "SETTLED"],
  LATE_PAYMENT: ["REFUND_REQUESTED", "PARTIALLY_REFUNDED", "REFUNDED", "UNDERPAID"],
  INVALID_ASSET: ["DETECTED", "CONFIRMING", "PAID", "OVERPAID", "EXPIRED", "AWAITING_PAYMENT", "LATE_PAYMENT", "UNDERPAID"],
  REFUND_REQUESTED: ["PARTIALLY_REFUNDED", "REFUNDED", "SETTLED", "PAID", "OVERPAID", "SETTLEMENT_PENDING", "UNDERPAID", "LATE_PAYMENT"],
  PARTIALLY_REFUNDED: ["REFUNDED", "REFUND_REQUESTED"],
  REFUNDED: [],
};

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: IntentStatus,
    public readonly to: IntentStatus,
  ) {
    super(`Invalid payment status transition ${from} -> ${to}`);
  }
}

export function canTransition(from: IntentStatus, to: IntentStatus): boolean {
  return from === to || ALLOWED[from].includes(to);
}

export function assertTransition(from: IntentStatus, to: IntentStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

/** Statuses in which the invoice is financially satisfied and may be fulfilled. */
export const FULFILLABLE: readonly IntentStatus[] = ["PAID", "OVERPAID", "SETTLEMENT_PENDING", "SETTLED", "SETTLEMENT_FAILED"];
