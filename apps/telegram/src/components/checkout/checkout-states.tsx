"use client";
import { useEffect, useRef } from "react";
import { AlertTriangle, ArrowUpRight, Ban, Clock, Printer, RefreshCw, Undo2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { shortHash } from "@/lib/format";
import { Amount } from "@/components/amount";
import { Hash } from "@/components/hash";
import { Button, buttonStyles } from "@/components/ui/button";
import { ChainBadge, LogoMarkAnimated } from "@/components/brand";
import { DrawCheck, Meter, utcStamp, type Net, type PaymentRow } from "./checkout-parts";

type Tone = "ok" | "info" | "warn" | "bad" | "neutral";

/** Terminal and in-flight panels move focus to their heading so keyboard and screen reader users land on the result. */
function Head({ tone, icon, title, children }: { tone: Tone; icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, [title]);
  const ring = { ok: "bg-signal text-on-ink", info: "bg-info-quiet text-info-ink", warn: "bg-warn-quiet text-warn-ink", bad: "bg-bad-quiet text-bad-ink", neutral: "bg-sunk text-ink-2" }[tone];
  return (
    <div role="status" className="animate-[rise-in_var(--duration-base)_var(--ease-out)]">
      {icon && <span className={cn("grid size-12 place-items-center rounded-full", ring)}>{icon}</span>}
      <h2 ref={ref} tabIndex={-1} className={cn("t-2 text-ink focus:outline-none", icon ? "mt-4" : "mt-5")}>{title}</h2>
      {children && <div className="mt-2 text-[0.9375rem] text-ink-2">{children}</div>}
    </div>
  );
}

function Rows({ children }: { children: React.ReactNode }) {
  return <dl className="mt-5 divide-y divide-line rounded-ctl border border-line text-sm">{children}</dl>;
}
function R({ k, v, strong }: { k: string; v: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 px-3.5 py-2.5">
      <dt className="shrink-0 text-ink-3">{k}</dt>
      <dd className={cn("min-w-0 text-right text-ink", strong && "font-medium")}>{v}</dd>
    </div>
  );
}

function netOf(data: any, p?: PaymentRow): Net | undefined {
  const nets = data.networks as Net[];
  return nets.find((n) => n.network === p?.network) ?? nets[0];
}

function Transfers({ data, only }: { data: any; only?: "wrong" }) {
  const sym: string = data.currency ?? "USDC";
  const rows = (data.payments as PaymentRow[]).filter((p) => (only === "wrong" ? !p.official_asset : true));
  if (rows.length === 0) return null;
  return (
    <ul className="mt-5 divide-y divide-line rounded-ctl border border-line text-sm">
      {rows.map((p) => (
        <li key={p.tx_hash + p.amount} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <Amount value={p.amount} size="sm" />
            {!p.official_asset && <span className="rounded-full bg-bad-quiet px-2 py-0.5 text-xs font-medium text-bad-ink">not official {sym}, ignored</span>}
            {p.status === "REORGED" && <span className="rounded-full bg-bad-quiet px-2 py-0.5 text-xs font-medium text-bad-ink">reversed on-chain</span>}
          </span>
          <span className="flex shrink-0 items-center gap-3 text-ink-3">
            <span className="tnum text-xs">{p.status === "FINAL" ? "Final" : p.status === "REORGED" ? "" : `${p.confirmations} conf.`}</span>
            <a href={p.explorer_url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 font-mono text-xs font-medium text-ink-2 hover:text-ink" aria-label={`View transaction ${p.tx_hash} in explorer`}>
              {shortHash(p.tx_hash, 6, 4)} <ArrowUpRight className="size-3" aria-hidden />
            </a>
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ── funds seen, not final: single-payment confirming panel ──────────────────── */

export function ConfirmingPanel({ data }: { data: any }) {
  const sym: string = data.currency ?? "USDC";
  const pay = (data.payments as PaymentRow[]).filter((p) => p.official_asset && p.status !== "REORGED");
  const cur = pay.find((p) => p.status !== "FINAL") ?? pay[0];
  const net = netOf(data, cur);
  const need = net?.finality_confirmations ?? 1;
  const conf = Math.min(cur?.confirmations ?? 0, need);
  return (
    <div>
      <Head tone="info" icon={<RefreshCw className="size-5 animate-spin [animation-duration:2.4s]" aria-hidden />} title="Payment detected">
        <p>Your transfer is on {net?.name ?? "the network"}. It is not final yet; this page updates by itself and you can close it.</p>
      </Head>
      <Rows>
        <R k="Amount" v={<Amount value={cur?.amount ?? data.amount} size="md" />} />
        <R k="Network" v={net ? <ChainBadge id={net.network} size={18} /> : "-"} />
        <R
          k="Confirmations"
          v={
            <span className="block">
              <span className="tnum font-medium">{conf} of {need}</span>
              <Meter className="mt-1.5 w-32" label={`${conf} of ${need} confirmations`} parts={[{ pct: (conf / need) * 100, tone: "info" }]} />
            </span>
          }
        />
        {cur && <R k="Transaction" v={<Hash value={cur.tx_hash} href={cur.explorer_url} lead={8} tail={6} className="text-ink" />} />}
      </Rows>
    </div>
  );
}

/* ── paid / settling / settled / overpaid: the receipt ───────────────────────── */

export function ReceiptPanel({ data }: { data: any }) {
  const sym: string = data.currency ?? "USDC";
  const status = data.status as string;
  const settled = status === "SETTLED";
  const failedSweep = status === "SETTLEMENT_FAILED";
  const pay = (data.payments as PaymentRow[]).filter((p) => p.official_asset && p.status !== "REORGED");
  const net = netOf(data, pay[0]);
  const excess = data.excess_amount && data.excess_amount !== "0.00" && Number(data.excess_amount) > 0;
  const title = settled ? "Payment complete" : failedSweep ? "Payment received" : status === "SETTLEMENT_PENDING" ? "Payment confirmed, settling" : "Payment confirmed";
  const body = settled
    ? "Your payment is final and the funds are in the merchant's vault."
    : failedSweep
      ? "Your payment is final. Moving it into the merchant's vault is being retried and does not affect your payment."
      : status === "SETTLEMENT_PENDING"
        ? "Your payment is final. It is being moved into the merchant's vault."
        : "Your payment is final on-chain. It is about to be moved into the merchant's vault.";

  return (
    <div id="receipt" className="animate-[rise-in_var(--duration-slow)_var(--ease-out)]">
      <div className="relative inline-block">
        <LogoMarkAnimated size={64} />
        <span className="absolute -bottom-1.5 -right-1.5 grid size-7 place-items-center rounded-full bg-signal text-on-ink shadow-[0_0_0_3px_var(--color-raised)]">
          <DrawCheck className="size-4" strokeWidth={3.5} />
        </span>
      </div>
      <Head tone="ok" icon={null} title={title}>
        <p>{body}</p>
      </Head>

      <Rows>
        <R k="Amount received" v={<Amount value={data.amount_received} size="md" />} strong />
        <R k="Network" v={net ? <ChainBadge id={net.network} size={18} /> : "-"} />
        {data.order_reference && <R k="Reference" v={<span className="font-mono text-xs">{data.order_reference}</span>} />}
        <R k="Paid to" v={data.merchant_name} />
        {data.paid_at && <R k="Confirmed" v={<span className="tnum">{utcStamp(data.paid_at)}</span>} />}
        {settled && data.settled_at && <R k="In vault" v={<span className="tnum">{utcStamp(data.settled_at)}</span>} />}
        {pay.map((p) => (
          <R key={p.tx_hash} k="Transaction" v={<Hash value={p.tx_hash} href={p.explorer_url} lead={8} tail={6} className="text-ink" />} />
        ))}
        <R k="Payment ID" v={<Hash value={data.id} lead={10} tail={4} className="text-ink" />} />
      </Rows>

      {excess && (
        <div className="mt-4 flex gap-3 rounded-ctl border border-warn/30 bg-warn-quiet px-3.5 py-3 text-sm text-warn-ink">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>You sent {data.excess_amount} {sym} more than requested. The payment is complete. Plinth does not hold the extra amount; it sits with the merchant, who has been notified and decides about returning it. Keep your transaction hash.</p>
        </div>
      )}

      <div className="mt-5 flex flex-col gap-2 print:hidden sm:flex-row">
        {data.success_url && (
          <a href={data.success_url} className={cn(buttonStyles({ variant: "primary", size: "lg" }), "h-12 flex-1")}>
            Return to {data.merchant_name} <ArrowUpRight className="size-4" aria-hidden />
          </a>
        )}
        <Button variant="secondary" size="lg" className="h-12 flex-1" onClick={() => window.print()}>
          <Printer className="size-4" aria-hidden />Download receipt
        </Button>
      </div>
      <p className="mt-3 text-xs text-ink-3">This is a payment confirmation, not a tax document. The merchant is told about this payment by the Plinth backend, not by this page. Use Print, then Save as PDF.</p>
    </div>
  );
}

/* ── closed: nothing more can be paid ────────────────────────────────────────── */

export function ClosedPanel({ data, kind, onRecheck }: { data: any; kind: string; onRecheck: () => void }) {
  const sym: string = data.currency ?? "USDC";
  const net = netOf(data);
  const sent = (data.payments as PaymentRow[]).length > 0;
  const received = data.amount_received;
  const merchant = data.merchant_name || "the merchant";
  const iAlreadySent = (
    <div className="mt-5 rounded-ctl bg-wash px-3.5 py-3 text-sm text-ink-2">
      <p className="font-medium text-ink">If you already sent funds</p>
      <p className="mt-0.5 text-ink-3">Keep your transaction hash and send it to {merchant} together with the payment ID {" "}
        <Hash value={data.id} lead={10} tail={4} className="align-middle text-ink" />. No new payments are accepted on this address.
      </p>
    </div>
  );
  const recheck = (
    <Button variant="secondary" size="md" className="mt-4" onClick={onRecheck}><RefreshCw className="size-4" aria-hidden />Check status again</Button>
  );

  switch (kind) {
    case "UNDERPAID":
      return (
        <div>
          <Head tone="warn" icon={<Clock className="size-5" aria-hidden />} title="Only part of the amount arrived">
            <p>This payment expired before the full amount was received. No more payments are accepted.</p>
          </Head>
          <Rows>
            <R k="Requested" v={<Amount value={data.amount} size="sm" />} />
            <R k="Received" v={<Amount value={received} size="sm" />} strong />
            <R k="Still missing" v={<Amount value={data.remaining} size="sm" />} />
          </Rows>
          <Transfers data={data} />
          <p className="mt-4 text-sm text-ink-3">{merchant} has been notified. Plinth does not hold these funds, so whether to refund them or ask you to pay again is the merchant&apos;s decision. Contact them with the payment ID.</p>
        </div>
      );
    case "LATE_PAYMENT":
      return (
        <div>
          <Head tone="warn" icon={<Clock className="size-5" aria-hidden />} title="Funds arrived after expiry">
            <p>Your transfer was detected after this payment expired, so it was not counted as a completed payment.</p>
          </Head>
          <Transfers data={data} />
          <p className="mt-4 text-sm text-ink-3">{merchant} has been notified and decides what happens next. Plinth does not hold the funds. Contact the merchant with the payment ID and your transaction hash.</p>
          {recheck}
        </div>
      );
    case "INVALID_ASSET":
      return (
        <div>
          <Head tone="bad" icon={<Ban className="size-5" aria-hidden />} title="Wrong token received">
            <p>A token other than the official {sym} for {net?.name ?? "this network"} was sent to this payment. It cannot be credited and nothing was converted.</p>
          </Head>
          <Transfers data={data} only="wrong" />
          <p className="mt-4 text-sm text-ink-3">Keep the transaction hash and contact {merchant}. This payment is no longer accepting funds.</p>
        </div>
      );
    case "REFUND_REQUESTED":
    case "PARTIALLY_REFUNDED":
    case "REFUNDED":
      return (
        <div>
          <Head tone="neutral" icon={<Undo2 className="size-5" aria-hidden />} title={kind === "REFUNDED" ? "Payment refunded" : kind === "PARTIALLY_REFUNDED" ? "Payment partly refunded" : "Refund requested"}>
            <p>{kind === "REFUNDED" ? "The merchant returned this payment." : kind === "PARTIALLY_REFUNDED" ? "The merchant returned part of this payment." : "A refund has been requested. It is waiting for the merchant to send it."}</p>
          </Head>
          <Rows>
            <R k="Paid" v={<Amount value={data.amount_received} size="sm" />} />
            <R k="Refunded" v={<Amount value={data.amount_refunded} size="sm" />} strong />
          </Rows>
          <Transfers data={data} />
        </div>
      );
    case "CANCELLED":
      return (
        <div>
          <Head tone="neutral" icon={<X className="size-5" aria-hidden />} title="Payment cancelled">
            <p>{merchant} cancelled this payment. Nothing is being accepted and nothing was charged.</p>
          </Head>
          {sent ? iAlreadySent : null}
        </div>
      );
    default:
      return (
        <div>
          <Head tone="neutral" icon={<Clock className="size-5" aria-hidden />} title="This payment expired">
            <p>The time to pay ran out before any funds arrived. Nothing was charged and this address no longer accepts payments.</p>
          </Head>
          <p className="mt-4 text-sm text-ink-3">Ask {merchant} for a new payment link to try again.</p>
          {iAlreadySent}
          {recheck}
        </div>
      );
  }
}
