import { cn } from "@/lib/cn";
import { STATUS_META, TX_STATUS_META } from "@/lib/format";

const tones = {
  ok: "bg-signal-quiet text-signal-ink",
  warn: "bg-warn-quiet text-warn-ink",
  info: "bg-info-quiet text-info-ink",
  bad: "bg-bad-quiet text-bad-ink",
  neutral: "bg-sunk text-ink-2",
} as const;
const dots = { ok: "bg-signal", warn: "bg-warn", info: "bg-info", bad: "bg-bad", neutral: "bg-ink-4" } as const;

export function Chip({ tone = "neutral", children, className, dot = true, pulse }: { tone?: keyof typeof tones; children: React.ReactNode; className?: string; dot?: boolean; pulse?: boolean }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium", tones[tone], className)}>
      {dot && <span aria-hidden className={cn("size-1.5 rounded-full", dots[tone], pulse && "animate-[live-pulse_1.6s_ease-in-out_infinite]")} />}
      {children}
    </span>
  );
}

/** Colour is never the only signal: the label always states the status. */
export function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, tone: "neutral" as const };
  const live = ["DETECTED", "CONFIRMING", "SETTLEMENT_PENDING"].includes(status);
  return <Chip tone={m.tone} pulse={live}>{m.label}</Chip>;
}

export function TxStatusBadge({ status }: { status: string }) {
  const m = TX_STATUS_META[status] ?? { label: status, tone: "neutral" as const };
  return <Chip tone={m.tone} pulse={status === "CONFIRMING"}>{m.label}</Chip>;
}

/** How far a payment has travelled, as five small segments (detected, verified, final, swept, in vault). Decorative next to a labelled status. */
const STEPS: Record<string, number> = {
  CREATED: 0, AWAITING_PAYMENT: 0, EXPIRED: 0, DETECTED: 1, CONFIRMING: 2, UNDERPAID: 2, LATE_PAYMENT: 2, INVALID_ASSET: 1,
  PAID: 3, OVERPAID: 3, SETTLEMENT_PENDING: 4, SETTLEMENT_FAILED: 3, SETTLED: 5, REFUND_REQUESTED: 5, PARTIALLY_REFUNDED: 5, REFUNDED: 5,
};
export function Progress5({ status, className }: { status: string; className?: string }) {
  const n = STEPS[status] ?? 0;
  const bad = status === "SETTLEMENT_FAILED" || status === "INVALID_ASSET";
  return (
    <span aria-hidden className={cn("inline-grid grid-flow-col gap-[3px]", className)}>
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className={cn("h-3 w-[5px] rounded-[2px]", i < n ? (bad ? "bg-bad" : n === 5 ? "bg-signal" : "bg-ink") : "bg-line-strong")} />
      ))}
    </span>
  );
}
