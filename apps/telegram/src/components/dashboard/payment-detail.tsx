"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { useApi, useAction } from "@/lib/hooks";
import { apiFetch } from "@/lib/client-api";
import { formatDateTime, STATUS_META } from "@/lib/format";
import { Amount } from "@/components/amount";
import { StatusBadge, TxStatusBadge } from "@/components/badge";
import { DataTable } from "@/components/data-table";
import { Hash } from "@/components/hash";
import { ErrorState, KeyValue, Skeleton } from "@/components/page";
import { SettlementRail, stationsFromPayment } from "@/components/rail";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { CopyButton } from "@/components/copy-button";
import { useHref } from "@/lib/data-source";
import { CheckoutLink } from "./parts-account";
import { QuietEmpty, TableHeading } from "./parts-payments";

const EVENT_LABEL: Record<string, string> = {
  created: "Payment created",
  "status.changed": "Status changed",
  "transfer.detected": "USDC transfer detected and verified",
  "transfer.finalized": "Transfer reached finality",
  "transfer.invalid_asset": "Unsupported token received (ignored)",
  "settlement.queued": "Settlement queued",
  "settlement.submitted": "Settlement transaction submitted by relayer",
  "settlement.swept": "Sweep observed on-chain",
  "settlement.finalized": "Sweep final — funds delivered",
  "wallet_payment.submitted": "Signed authorization sent to relayer",
  "wallet_payment.detected": "Wallet payment observed on-chain",
  "chain.reorg": "Block reorganised — observation reversed",
  "refund.requested": "Refund requested",
  "refund.completed": "Refund verified on-chain",
};

const MOVEMENT_LABEL: Record<string, string> = { INCOMING_TRANSFER: "Deposit", WALLET_PAYMENT: "Wallet payment", SWEEP: "Sweep", FORWARD: "Forward", REFUND: "Refund", VAULT_CREATE: "Vault" };
/** Timeline events that mean the chain has confirmed something: the only ones that get a mint dot. */
const CONFIRMED_EVENTS = new Set(["transfer.finalized", "settlement.finalized", "refund.completed"]);

export function PaymentDetail({ id }: { id: string }) {
  const q = useApi<any>(`/v1/payments/${id}`, { refetchMs: 4000 });
  const p = q.data;
  if (q.error) return <><BackLink /><ErrorState error={q.error} retry={() => q.refetch()} /></>;
  if (!p) return <DetailSkeleton />;

  const stations = stationsFromPayment({ status: p.status, transactions: p.transactions, settlements: p.settlements });
  const incoming = p.transactions.filter((t: any) => t.kind === "INCOMING_TRANSFER" || t.kind === "WALLET_PAYMENT");
  const title = p.order_reference ?? p.description ?? "Payment";

  return (
    <>
      <BackLink />
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 pb-6">
        <div className="min-w-0">
          <p className="label capitalize">{p.kind.replace("_", " ").toLowerCase()}</p>
          <h1 className="t-2 mt-1 break-words text-ink">{title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusBadge status={p.status} />
            <span className="inline-flex items-center gap-0.5">
              <span className="break-all font-mono text-xs text-ink-3">{p.id}</span>
              <CopyButton value={p.id} compact label="Copy ID" />
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild><CheckoutLink href={p.checkout_url}>Open checkout <ArrowUpRight className="size-4" aria-hidden /></CheckoutLink></Button>
          <RefundDialog payment={p} />
        </div>
      </header>

      <section className="card overflow-hidden" aria-label="Settlement progress">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3 px-6 pt-6 sm:px-8 sm:pt-8">
          <div>
            <p className="label">Amount</p>
            <Amount value={p.amount} size="display" className="mt-2 block max-sm:text-[2.25rem]" />
          </div>
          <p className="max-w-sm pb-1 text-sm text-ink-3">{STATUS_META[p.status]?.hint}</p>
        </div>
        <div className="px-6 py-8 sm:px-8">
          <SettlementRail stations={stations} />
        </div>
        <dl className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-4">
          <Figure label="Received (final)" value={p.amount_received} />
          <Figure label="Settled" value={p.amount_settled} />
          <Figure label="Pending" value={p.amount_pending} />
          <Figure label="Refunded" value={p.amount_refunded} />
        </dl>
      </section>
      {Number(p.fee_amount_units) > 0 && (
        <p className="mt-4 rounded-ctl bg-sunk px-3.5 py-2.5 text-sm text-ink-2">
          Platform fee <span className="tnum font-medium text-ink">{p.fee_amount} USDC</span> was taken in the same transaction, so you received <span className="tnum font-medium text-ink">{p.net_amount} USDC</span>. The fee is not refunded.
        </p>
      )}
      {p.excess_amount !== "0.00" && <p className="mt-4 rounded-ctl bg-warn-quiet px-3.5 py-2.5 text-sm text-warn-ink">Overpaid by {p.excess_amount} USDC — consider a refund.</p>}

      <div className="mt-8 grid gap-x-8 gap-y-8 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-8">
          <section aria-label="Timeline">
            <TableHeading title="Timeline" description="Facts recorded by the backend, in order." />
            <div className="card-flat p-5 sm:p-6">
              {p.timeline.length === 0 ? (
                <p className="text-sm text-ink-3">No events recorded yet. This page refreshes automatically.</p>
              ) : (
                <ol className="relative ml-1 space-y-5 border-l border-line-strong pl-6">
                  {p.timeline.map((t: any) => (
                    <li key={t.id} className="relative">
                      <span aria-hidden className={`absolute -left-[30px] top-1.5 size-2.5 rounded-full border-2 ${CONFIRMED_EVENTS.has(t.type) ? "border-signal bg-signal" : "border-ink-4 bg-raised"}`} />
                      <p className="text-sm text-ink">
                        {t.type === "status.changed" ? <>Status: <span className="text-ink-3">{STATUS_META[t.data.from]?.label ?? t.data.from}</span> → <span className="font-medium">{STATUS_META[t.data.to]?.label ?? t.data.to}</span></> : EVENT_LABEL[t.type] ?? t.type}
                      </p>
                      <p className="mt-0.5 font-mono text-2xs text-ink-3">{formatDateTime(t.at)}{t.data?.tx_hash ? ` · ${String(t.data.tx_hash).slice(0, 10)}…` : ""}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>

          <section aria-label="Transfers and movements">
            <TableHeading title="Transfers & movements" description="Every on-chain movement observed. Each is unique by chain, transaction and log index." />
            <DataTable
              caption="On-chain movements" rows={p.transactions} rowKey={(t: any) => t.id}
              empty={<QuietEmpty>Nothing seen on-chain yet. This page refreshes automatically.</QuietEmpty>}
              columns={[
                { key: "kind", header: "Type", cell: (t: any) => <div><p className="font-medium text-ink">{MOVEMENT_LABEL[t.kind] ?? t.kind}</p>{!t.official_asset && <p className="text-xs text-bad-ink">Not official USDC — ignored</p>}</div> },
                { key: "net", header: "Network", hideBelow: "md", cell: (t: any) => <span className="text-ink-3">{t.network}</span> },
                { key: "st", header: "Status", cell: (t: any) => <TxStatusBadge status={t.status} /> },
                { key: "conf", header: "Conf.", hideBelow: "md", align: "right", cell: (t: any) => <span className="tnum text-ink-3">{t.confirmations}</span> },
                { key: "tx", header: "Tx", cell: (t: any) => <Hash value={t.tx_hash} href={t.explorer_url} lead={8} tail={4} /> },
                { key: "amt", header: "Amount", align: "right", cell: (t: any) => <Amount value={t.amount} size="sm" unit={false} /> },
              ]}
            />
          </section>

          <section aria-label="Settlements">
            <TableHeading title="Settlements" description="The relayer sweeps final funds from the invoice address to your vault or wallet, taking the platform fee in the same transaction. It pays the network fee." />
            <DataTable
              caption="Settlements" rows={p.settlements} rowKey={(s: any) => s.id}
              empty={<QuietEmpty>{incoming.some((t: any) => t.kind === "WALLET_PAYMENT") ? "Wallet payments go straight to your vault or wallet — no sweep needed." : "No settlement yet. One is queued automatically once funds are final."}</QuietEmpty>}
              columns={[
                { key: "n", header: "Attempt", cell: (s: any) => <span className="tnum">#{s.attempt}</span> },
                { key: "st", header: "Status", cell: (s: any) => <div><span className="text-sm font-medium capitalize text-ink">{s.status.toLowerCase()}</span>{s.failure_reason && <p className="max-w-56 text-xs text-bad-ink">{s.failure_reason}</p>}</div> },
                { key: "tx", header: "Tx", cell: (s: any) => (s.tx_hash ? <Hash value={s.tx_hash} href={s.explorer_url} lead={8} tail={4} /> : <span className="text-ink-3">—</span>) },
                { key: "to", header: "Paid to", hideBelow: "md", cell: (s: any) => <span className="text-sm text-ink-2">{s.destination_kind === "DIRECT" ? "Your wallet" : "Your vault"}</span> },
                { key: "fee", header: "Fee", align: "right", hideBelow: "md", cell: (s: any) => (s.fee_units != null ? <Amount value={(Number(s.fee_units) / 1e6).toFixed(2)} size="sm" unit={false} /> : <span className="text-ink-4">—</span>) },
                { key: "amt", header: "Swept", align: "right", cell: (s: any) => <Amount value={(Number(s.swept_units ?? s.expected_units) / 1e6).toFixed(2)} size="sm" unit={false} /> },
              ]}
            />
          </section>

          {p.refunds.length > 0 && (
            <section aria-label="Refunds">
              <TableHeading title="Refunds" />
              <DataTable
                caption="Refunds" rows={p.refunds} rowKey={(r: any) => r.id}
                columns={[
                  { key: "id", header: "Refund", cell: (r: any) => <span className="font-mono text-xs">{r.id}</span> },
                  { key: "st", header: "Status", cell: (r: any) => <span className="capitalize">{r.status.toLowerCase()}</span> },
                  { key: "to", header: "To", cell: (r: any) => <Hash value={r.recipient} /> },
                  { key: "amt", header: "Amount", align: "right", cell: (r: any) => <Amount value={r.amount} size="sm" unit={false} /> },
                ]}
              />
            </section>
          )}
        </div>

        <aside className="min-w-0" aria-label="Payment details">
          <TableHeading title="Details" />
          <div className="card-flat p-5 sm:p-6">
            <KeyValue
              className="[&>div]:grid-cols-[7rem_1fr] sm:[&>div]:grid-cols-[7rem_1fr]"
              items={[
                { k: "Created", v: formatDateTime(p.created_at) },
                { k: "Expires", v: formatDateTime(p.expires_at) },
                ...(p.paid_at ? [{ k: "Paid", v: formatDateTime(p.paid_at) }] : []),
                ...(p.settled_at ? [{ k: "Settled", v: formatDateTime(p.settled_at) }] : []),
                { k: "Customer", v: p.customer_email ?? "—" },
                { k: "Methods", v: p.checkout_methods.map((m: string) => (m === "WALLET" ? "Wallet" : "Address / QR")).join(" · ") },
                ...p.invoice_addresses.map((a: any) => ({
                  k: `Deposit · ${a.network}`,
                  v: (
                    <div>
                      <Hash value={a.address} lead={8} tail={6} />
                      <p className="mt-0.5 text-xs text-ink-3">{a.deployed ? "contract deployed" : "counterfactual — deployed on first sweep"} · v{a.contract_version}</p>
                    </div>
                  ),
                })),
                ...(p.invoice_addresses[0] ? [{ k: p.invoice_addresses[0].destination_kind === "DIRECT" ? "Paid to wallet" : "Vault", v: <Hash value={p.invoice_addresses[0].destination} lead={8} tail={6} /> }, { k: "Platform fee", v: <span className="tnum">{(p.invoice_addresses[0].fee_bps / 100).toString()}%</span> }] : []),
              ]}
            />
          </div>
        </aside>
      </div>
    </>
  );
}

function BackLink() {
  const href = useHref();
  return (
    <Link href={href("/dashboard/payments")} className="mb-4 inline-flex items-center gap-1.5 rounded-md text-sm text-ink-3 transition-colors duration-[var(--duration-fast)] hover:text-ink">
      <ArrowLeft className="size-4" aria-hidden />Payments
    </Link>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-raised px-6 py-4 sm:px-8">
      <dt className="label">{label}</dt>
      <dd className="mt-1"><Amount value={value} size="md" unit={false} /></dd>
    </div>
  );
}

/** Loading state shaped like the final layout. */
function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading payment">
      <Skeleton className="mb-4 h-4 w-20" />
      <div className="pb-6"><Skeleton className="h-3 w-16" /><Skeleton className="mt-3 h-8 w-64 max-w-full" /><Skeleton className="mt-3 h-6 w-72 max-w-full" /></div>
      <div className="card overflow-hidden">
        <div className="px-6 pt-6 sm:px-8 sm:pt-8"><Skeleton className="h-3 w-14" /><Skeleton className="mt-3 h-[3.25rem] w-64 max-w-full" /></div>
        <div className="px-6 py-8 sm:px-8"><Skeleton className="h-12 w-full" /></div>
        <div className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="bg-raised px-6 py-4 sm:px-8"><Skeleton className="h-3 w-20" /><Skeleton className="mt-2 h-4 w-24" /></div>)}
        </div>
      </div>
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="space-y-8"><Skeleton className="h-56 w-full" /><Skeleton className="h-40 w-full" /></div>
        <Skeleton className="h-72 w-full" />
      </div>
    </div>
  );
}

function RefundDialog({ payment }: { payment: any }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(payment.amount_received);
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const m = useAction(
    () => apiFetch("/v1/refund-requests", { method: "POST", headers: { "idempotency-key": crypto.randomUUID() }, body: { payment_intent_id: payment.id, amount, recipient: to, reason: reason || undefined } }),
    { invalidate: ["/v1/payments", "/v1/refund-requests"], success: "Refund requested", onSuccess: () => setOpen(false) },
  );
  const can = BigInt(payment.amount_received_units) > 0n;
  const ok = /^0x[0-9a-fA-F]{40}$/.test(to) && /^\d+(\.\d{1,6})?$/.test(amount) && Number(amount) > 0;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button disabled={!can}>Request refund</Button></DialogTrigger>
      <DialogContent title="Request a refund" description="A refund is a new transfer out of your vault or payout wallet, whichever received the payment. You send it yourself; it is marked complete only after the transfer is verified on-chain. The platform fee is not refunded.">
        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); if (ok) m.mutate(undefined); }}>
          <Field label="Amount (USDC)" htmlFor="rf-amount" hint={`${payment.amount_received} USDC received so far.`} error={amount !== "" && !/^\d+(\.\d{1,6})?$/.test(amount) ? "Use digits with up to 6 decimals." : null}>
            <Input id="rf-amount" value={amount} onChange={(e) => setAmount(e.target.value)} className="font-mono" inputMode="decimal" />
          </Field>
          <Field label="Send to" htmlFor="rf-to" hint="The customer's address on the same network." error={to !== "" && !/^0x[0-9a-fA-F]{40}$/.test(to) ? "Enter a full 0x address (42 characters)." : null}>
            <Input id="rf-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x…" className="font-mono" aria-invalid={to !== "" && !/^0x[0-9a-fA-F]{40}$/.test(to) ? true : undefined} />
          </Field>
          <Field label="Reason (optional)" htmlFor="rf-reason"><Input id="rf-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <div className="flex items-center justify-end gap-2 pt-1">
            <DialogClose asChild><Button type="button" variant="ghost">Cancel</Button></DialogClose>
            <Button type="submit" variant="primary" disabled={!ok} loading={m.isPending}>Create refund request</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
