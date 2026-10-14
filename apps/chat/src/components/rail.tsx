import { Check, X } from "lucide-react";
import { cn } from "@/lib/cn";

export type StationState = "done" | "live" | "todo" | "failed" | "skipped";
export interface Station {
  key: string;
  label: string;
  state: StationState;
  /** Mono annotation next to the label: real backend data (block, confirmations, hash). */
  note?: string;
}

/**
 * THE SETTLING SEQUENCE — Plinth's signature device. Five checks that fill mint in order, only from
 * verified backend facts.  is a horizontal track (dashboards, wide cards);
 *  is the compact vertical list used inside the checkout card.
 */
export function SettlementRail({ stations, className, layout = "row" }: { stations: Station[]; className?: string; layout?: "row" | "list" }) {
  const liveIdx = stations.findIndex((s) => s.state === "live");
  const lastDone = stations.reduce((acc, s, i) => (s.state === "done" || s.state === "skipped" ? i : acc), -1);
  const reached = liveIdx >= 0 ? liveIdx : lastDone;

  const dot = (s: Station) => (
    <span
      aria-hidden
      className={cn(
        "relative z-10 grid size-[18px] shrink-0 place-items-center rounded-full border-[1.5px] bg-raised transition-colors duration-[var(--duration-base)]",
        s.state === "done" && "border-signal bg-signal text-on-ink",
        s.state === "skipped" && "border-line-strong bg-sunk text-ink-4",
        s.state === "live" && "border-signal",
        s.state === "failed" && "border-bad bg-bad text-on-ink",
        s.state === "todo" && "border-line-strong",
      )}
    >
      {s.state === "done" && <Check className="size-2.5 animate-[tick-in_var(--duration-base)_var(--ease-out)]" strokeWidth={3.5} />}
      {s.state === "failed" && <X className="size-2.5" strokeWidth={3.5} />}
      {s.state === "live" && <span className="size-1.5 rounded-full bg-signal animate-[live-pulse_1.4s_ease-in-out_infinite]" />}
    </span>
  );

  if (layout === "list") {
    return (
      <ol aria-label="Payment progress" className={cn("grid", className)}>
        {stations.map((s) => (
          <li key={s.key} aria-current={s.state === "live" ? "step" : undefined} className="grid h-8 grid-cols-[18px_1fr_auto] items-center gap-2.5">
            {dot(s)}
            <span className={cn("text-sm", s.state === "todo" || s.state === "skipped" ? "text-ink-3" : "font-medium text-ink")}>{s.label}</span>
            <span className={cn("font-mono text-2xs", s.state === "live" ? "text-signal-ink" : "text-ink-3")}>{s.note ?? (s.state === "skipped" ? "not needed" : "")}</span>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <ol aria-label="Payment progress" className={cn("relative grid gap-0 sm:grid-flow-col sm:auto-cols-fr", className)}>
      {stations.map((s, i) => {
        const filled = i < reached;
        return (
          <li key={s.key} aria-current={s.state === "live" ? "step" : undefined} className="relative flex gap-3 pb-6 last:pb-0 sm:flex-col sm:gap-2.5 sm:pb-0">
            {i < stations.length - 1 && (
              <>
                <span aria-hidden className={cn("absolute left-[8.25px] top-5 h-[calc(100%-1rem)] w-[1.5px] rounded-full sm:hidden", filled ? "bg-signal" : "bg-line-strong")} />
                <span aria-hidden className={cn("absolute left-5 top-[8.25px] hidden h-[1.5px] w-[calc(100%-1.25rem)] rounded-full sm:block", filled ? "bg-signal" : "bg-line-strong")} />
              </>
            )}
            {dot(s)}
            <div className="min-w-0 sm:pr-3">
              <p className={cn("text-sm font-medium leading-5", s.state === "todo" || s.state === "skipped" ? "text-ink-3" : "text-ink")}>{s.label}</p>
              <p className={cn("mt-0.5 min-h-4 break-words font-mono text-2xs leading-4", s.state === "live" ? "text-signal-ink" : "text-ink-3")}>
                {s.note ?? (s.state === "skipped" ? "not needed" : "")}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Build the five stations from a payment-detail/checkout payload (all facts come from the backend). */
export function stationsFromPayment(p: {
  status: string;
  transactions?: { kind: string; status: string; confirmations: number; tx_hash: string; official_asset: boolean }[];
  payments?: { status: string; confirmations: number; tx_hash: string; official_asset: boolean; method: string }[];
  settlements?: { status: string; tx_hash: string | null }[];
  required_confirmations?: number;
}): Station[] {
  const inc = (p.transactions ?? p.payments?.map((x) => ({ kind: x.method === "WALLET" ? "WALLET_PAYMENT" : "INCOMING_TRANSFER", status: x.status, confirmations: x.confirmations, tx_hash: x.tx_hash, official_asset: x.official_asset })) ?? [])
    .filter((t) => (t.kind === "INCOMING_TRANSFER" || t.kind === "WALLET_PAYMENT") && t.official_asset && t.status !== "REORGED");
  const seen = inc.length > 0;
  const anyFinal = inc.some((t) => t.status === "FINAL");
  const allFinal = seen && inc.every((t) => t.status === "FINAL");
  const wallet = inc.length > 0 && inc.every((t) => t.kind === "WALLET_PAYMENT");
  const sw = p.settlements ?? [];
  const sweepSent = sw.some((s) => s.status === "SUBMITTED" || s.status === "CONFIRMED");
  const settled = p.status === "SETTLED" || (sw.length > 0 && sw.every((s) => s.status === "CONFIRMED") && allFinal && p.status !== "SETTLEMENT_PENDING");
  const failed = p.status === "SETTLEMENT_FAILED";
  const best = inc.find((t) => t.status !== "FINAL") ?? inc[0];
  const first = inc[0];
  const st = (done: boolean, live: boolean): StationState => (done ? "done" : live ? "live" : "todo");

  const detected = st(seen, !seen && p.status === "AWAITING_PAYMENT");
  const verified = st(seen, false);
  const final = st(anyFinal && allFinal, seen && !allFinal);
  const swept: StationState = wallet ? "skipped" : failed ? "failed" : st(settled || (sweepSent && sw.some((s) => s.status === "CONFIRMED")), allFinal && !failed);
  const vault = st(settled, wallet && allFinal);

  return [
    { key: "detected", label: "Detected", state: detected, note: first ? `tx ${first.tx_hash.slice(0, 8)}…` : "watching" },
    { key: "verified", label: "Verified", state: verified, note: seen ? "receipt + token checked" : undefined },
    { key: "final", label: "Final", state: final, note: best ? (best.status === "FINAL" ? "final on-chain" : `${best.confirmations} conf.`) : undefined },
    { key: "swept", label: wallet ? "Sweep" : "Swept", state: swept, note: failed ? "retrying" : sweepSent ? "sent" : undefined },
    { key: "vault", label: "In vault", state: vault, note: settled ? "merchant-controlled" : undefined },
  ];
}
