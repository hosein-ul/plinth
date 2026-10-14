import { describe, expect, it } from "vitest";
import {
  assertTransition,
  canTransition,
  deriveIntentStatus,
  InvalidTransitionError,
  parseUsdc,
  formatUsdc,
  type DeriveInput,
  type TransferFact,
} from "../src";

const T0 = 1_800_000_000;
const base = (over: Partial<DeriveInput> = {}): DeriveInput => ({
  amount: parseUsdc("100"),
  expiresAt: T0 + 3600,
  now: T0,
  policy: { underpaymentToleranceBps: 0 },
  transfers: [],
  settledAmount: 0n,
  settlementInFlight: false,
  settlementFailed: false,
  refundRequested: false,
  refundedAmount: 0n,
  ...over,
});
const tr = (amount: string, status: TransferFact["status"], over: Partial<TransferFact> = {}): TransferFact => ({
  amount: parseUsdc(amount),
  status,
  official: true,
  blockTimestamp: T0 + 10,
  ...over,
});

describe("money", () => {
  it("round-trips exact integer base units", () => {
    expect(parseUsdc("12.5")).toBe(12_500_000n);
    expect(parseUsdc("0.000001")).toBe(1n);
    expect(formatUsdc(12_500_000n)).toBe("12.50");
    expect(formatUsdc(1n)).toBe("0.000001");
    expect(() => parseUsdc("1.0000001")).toThrow();
    expect(() => parseUsdc("-1")).toThrow();
    expect(() => parseUsdc("1e6")).toThrow();
  });
});

describe("deriveIntentStatus", () => {
  it("awaits payment with no transfers", () => {
    expect(deriveIntentStatus(base()).status).toBe("AWAITING_PAYMENT");
  });
  it("DETECTED then CONFIRMING then PAID", () => {
    expect(deriveIntentStatus(base({ transfers: [tr("100", "DETECTED")] })).status).toBe("DETECTED");
    expect(deriveIntentStatus(base({ transfers: [tr("100", "CONFIRMING")] })).status).toBe("CONFIRMING");
    expect(deriveIntentStatus(base({ transfers: [tr("100", "FINAL")] })).status).toBe("PAID");
  });
  it("partial finalised payment is not PAID before expiry", () => {
    const s = deriveIntentStatus(base({ transfers: [tr("40", "FINAL")] }));
    expect(s.status).toBe("CONFIRMING");
    expect(s.shortfallAmount).toBe(parseUsdc("60"));
  });
  it("sums multiple transfers", () => {
    const s = deriveIntentStatus(base({ transfers: [tr("40", "FINAL"), tr("60", "FINAL")] }));
    expect(s.status).toBe("PAID");
    expect(s.eligibleAmount).toBe(parseUsdc("100"));
  });
  it("overpayment is flagged with the excess", () => {
    const s = deriveIntentStatus(base({ transfers: [tr("130", "FINAL")] }));
    expect(s.status).toBe("OVERPAID");
    expect(s.excessAmount).toBe(parseUsdc("30"));
  });
  it("applies the underpayment tolerance policy", () => {
    const strict = deriveIntentStatus(base({ transfers: [tr("99.5", "FINAL")] }));
    const lenient = deriveIntentStatus(base({ transfers: [tr("99.5", "FINAL")], policy: { underpaymentToleranceBps: 100 } }));
    expect(strict.status).toBe("CONFIRMING");
    expect(lenient.status).toBe("PAID");
  });
  it("expired with nothing is EXPIRED", () => {
    expect(deriveIntentStatus(base({ now: T0 + 7200 })).status).toBe("EXPIRED");
  });
  it("expired with a finalised partial is UNDERPAID", () => {
    expect(deriveIntentStatus(base({ now: T0 + 7200, transfers: [tr("40", "FINAL")] })).status).toBe("UNDERPAID");
  });
  it("funds finalised after expiry are LATE_PAYMENT, not PAID", () => {
    const late = tr("100", "FINAL", { blockTimestamp: T0 + 4000 });
    const s = deriveIntentStatus(base({ now: T0 + 5000, transfers: [late] }));
    expect(s.status).toBe("LATE_PAYMENT");
    expect(s.lateAmount).toBe(parseUsdc("100"));
    expect(s.eligibleAmount).toBe(0n);
  });
  it("a non-official token never counts and yields INVALID_ASSET", () => {
    const s = deriveIntentStatus(base({ transfers: [tr("100", "FINAL", { official: false })] }));
    expect(s.status).toBe("INVALID_ASSET");
    expect(s.finalAmount).toBe(0n);
    expect(s.invalidAssetCount).toBe(1);
  });
  it("reorged transfers are ignored", () => {
    expect(deriveIntentStatus(base({ transfers: [tr("100", "REORGED")] })).status).toBe("AWAITING_PAYMENT");
  });
  it("settlement overlay: pending -> settled", () => {
    const paid = [tr("100", "FINAL")];
    expect(deriveIntentStatus(base({ transfers: paid, settlementInFlight: true })).status).toBe("SETTLEMENT_PENDING");
    expect(deriveIntentStatus(base({ transfers: paid, settledAmount: parseUsdc("100") })).status).toBe("SETTLED");
    expect(deriveIntentStatus(base({ transfers: paid, settlementFailed: true })).status).toBe("SETTLEMENT_FAILED");
  });
  it("a later top-up after SETTLED reopens settlement", () => {
    const s = deriveIntentStatus(
      base({ transfers: [tr("100", "FINAL"), tr("5", "FINAL")], settledAmount: parseUsdc("100") }),
    );
    expect(s.status).toBe("SETTLEMENT_PENDING");
  });
  it("the platform fee is not refundable: returning everything the merchant received is a full refund", () => {
    const paid = [tr("100", "FINAL")];
    const net = parseUsdc("99.8"); // 100 minus a 0.20% fee
    expect(deriveIntentStatus(base({ transfers: paid, refundedAmount: net, refundableAmount: net })).status).toBe("REFUNDED");
    expect(deriveIntentStatus(base({ transfers: paid, refundedAmount: parseUsdc("50"), refundableAmount: net })).status).toBe("PARTIALLY_REFUNDED");
    // without a stated refundable amount all final funds count (no fee)
    expect(deriveIntentStatus(base({ transfers: paid, refundedAmount: net })).status).toBe("PARTIALLY_REFUNDED");
  });

  it("refund states dominate", () => {
    const paid = [tr("100", "FINAL")];
    expect(deriveIntentStatus(base({ transfers: paid, refundRequested: true })).status).toBe("REFUND_REQUESTED");
    expect(deriveIntentStatus(base({ transfers: paid, refundedAmount: parseUsdc("30") })).status).toBe("PARTIALLY_REFUNDED");
    expect(deriveIntentStatus(base({ transfers: paid, refundedAmount: parseUsdc("100") })).status).toBe("REFUNDED");
  });
});

describe("transition guard", () => {
  it("allows the happy path", () => {
    const path = ["CREATED", "AWAITING_PAYMENT", "DETECTED", "CONFIRMING", "PAID", "SETTLEMENT_PENDING", "SETTLED"] as const;
    for (let i = 1; i < path.length; i++) expect(canTransition(path[i - 1]!, path[i]!)).toBe(true);
  });
  it("rejects skipping straight to SETTLED from EXPIRED and leaving REFUNDED", () => {
    expect(canTransition("EXPIRED", "SETTLED")).toBe(false);
    expect(() => assertTransition("REFUNDED", "PAID")).toThrow(InvalidTransitionError);
    expect(canTransition("AWAITING_PAYMENT", "REFUNDED")).toBe(false);
  });
});
