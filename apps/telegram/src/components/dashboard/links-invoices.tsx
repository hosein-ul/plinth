"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Plus, Trash2 } from "lucide-react";
import { Amount } from "@/components/amount";
import { Chip, StatusBadge } from "@/components/badge";
import { CopyButton } from "@/components/copy-button";
import { PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { apiFetch } from "@/lib/client-api";
import { formatDateTime, STATUS_META } from "@/lib/format";
import { useAction, useApi } from "@/lib/hooks";
import { useHref } from "@/lib/data-source";
import { cellLink, CheckoutLink, CopyField, Ledger } from "./parts-account";
import { TokenPicker } from "./token-picker";
import { activeTokens, netsForToken, type TokenSymbol } from "@/lib/tokens";

export function PaymentLinksView() {
  const q = useApi<any>("/v1/payment-links");
  const netsQ = useApi<any>("/v1/networks");
  const tokens = activeTokens(netsQ.data?.data ?? []);
  const [currency, setCurrency] = useState<TokenSymbol>("USDC");
  const cur: TokenSymbol = tokens.includes(currency) ? currency : tokens[0] ?? "USDC";
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [created, setCreated] = useState<any>(null);
  const reset = () => { setName(""); setAmount(""); setDesc(""); };
  const create = useAction(() => apiFetch<any>("/v1/payment-links", { method: "POST", headers: { "idempotency-key": crypto.randomUUID() }, body: { name, amount, currency: cur, description: desc || undefined } }), {
    invalidate: ["/v1/payment-links"], success: "Payment link created",
    onSuccess: (out) => { reset(); if (out?.url) setCreated(out); else setOpen(false); },
  });
  const toggle = useAction(({ id, active }: { id: string; active: boolean }) => apiFetch(`/v1/payment-links/${id}`, { method: "PATCH", body: { active } }), { invalidate: ["/v1/payment-links"] });
  const ok = name.trim().length > 0 && /^\d{1,12}(\.\d{1,6})?$/.test(amount) && Number(amount) > 0;
  return (
    <>
      <PageHeader
        title="Payment links" description="A reusable link. Each visit opens a fresh payment with its own deposit addresses."
        actions={
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setCreated(null); }}>
            <DialogTrigger asChild><Button variant="primary"><Plus className="size-4" aria-hidden />New link</Button></DialogTrigger>
            <DialogContent title={created ? "Your link is live" : "New payment link"} description={created ? "Share this URL anywhere. Customers pay from the checkout page." : `A name your customers see, and a fixed amount in ${cur}.`}>
              {created ? (
                <div className="space-y-5">
                  <div>
                    <p className="mb-1.5 text-sm font-medium text-ink">{created.name}</p>
                    <CopyField value={created.url} />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" asChild><a href={created.url} target="_blank" rel="noreferrer noopener">Open checkout<ArrowUpRight className="size-4" aria-hidden /></a></Button>
                    <DialogClose asChild><Button variant="primary">Done</Button></DialogClose>
                  </div>
                </div>
              ) : (
                <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); if (ok) create.mutate(undefined); }}>
                  <Field label="Name" htmlFor="pl-name"><Input id="pl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Coffee beans — 1 kg" autoFocus /></Field>
                  <TokenPicker tokens={tokens} value={cur} onChange={setCurrency} />
                  <Field label={`Amount (${cur})`} htmlFor="pl-amount" hint="Up to 6 decimal places."><Input id="pl-amount" className="font-mono" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="24.00" inputMode="decimal" /></Field>
                  <Field label="Description" htmlFor="pl-desc" hint="Optional. Shown on the checkout."><Textarea id="pl-desc" value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
                  <div className="flex justify-end"><Button type="submit" variant="primary" disabled={!ok} loading={create.isPending}>Create link</Button></div>
                </form>
              )}
            </DialogContent>
          </Dialog>
        }
      />
      <Ledger<any>
        caption="Payment links" rows={q.data?.data} loading={q.isLoading} error={q.error} retry={() => q.refetch()} rowKey={(l) => l.id}
        filter={{ status: (l) => (l.active ? "active" : "paused"), text: (l) => `${l.name} ${l.url}`, placeholder: "Search name or URL" }}
        empty={{
          title: "No payment links",
          body: "Create one for a product, a donation or a fixed fee, then share the URL anywhere. Each visit opens its own payment.",
          action: <Button variant="primary" onClick={() => setOpen(true)}><Plus className="size-4" aria-hidden />New link</Button>,
        }}
        columns={[
          {
            key: "n", header: "Link",
            cell: (l) => (
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">{l.name}</p>
                <span className="mt-0.5 inline-flex max-w-full items-center gap-0.5 font-mono text-xs text-ink-3">
                  <span className="max-w-[16rem] truncate sm:max-w-[22rem]" title={l.url}>{l.url}</span>
                  <CopyButton value={l.url} compact />
                </span>
              </div>
            ),
          },
          { key: "net", header: "Networks", hideBelow: "lg", cell: (l) => <span className="text-ink-2">{l.networks.join(", ")}</span> },
          {
            key: "active", header: "Status",
            cell: (l) => (
              <span className="inline-flex items-center gap-2.5">
                <Switch checked={l.active} disabled={toggle.isPending && toggle.variables?.id === l.id} onCheckedChange={(v) => toggle.mutate({ id: l.id, active: v })} aria-label={`Link ${l.name} active`} />
                <Chip tone="neutral" dot={false} className={l.active ? "text-ink" : "text-ink-3"}>{l.active ? "Active" : "Paused"}</Chip>
              </span>
            ),
          },
          { key: "amt", header: "Amount", align: "right", cell: (l) => <Amount value={l.amount} size="sm" symbol={l.currency ?? "USDC"} /> },
        ]}
      />
    </>
  );
}

const blankLine = () => ({ description: "", quantity: "1", unit_amount: "" });

export function InvoicesView() {
  const href = useHref();
  const q = useApi<any>("/v1/invoices", { refetchMs: 10000 });
  const netsQ = useApi<any>("/v1/networks");
  const tokens = activeTokens(netsQ.data?.data ?? []);
  const [currency, setCurrency] = useState<TokenSymbol>("USDC");
  const cur: TokenSymbol = tokens.includes(currency) ? currency : tokens[0] ?? "USDC";
  const [open, setOpen] = useState(false);
  const [cust, setCust] = useState({ name: "", email: "", memo: "" });
  const [items, setItems] = useState([blankLine()]);
  const valid = cust.name && /^\S+@\S+\.\S+$/.test(cust.email) && items.length > 0 && items.every((i) => i.description && /^\d+$/.test(i.quantity) && /^\d{1,12}(\.\d{1,6})?$/.test(i.unit_amount) && Number(i.unit_amount) > 0);
  const total = items.reduce((a, i) => a + (Number(i.quantity) || 0) * (Number(i.unit_amount) || 0), 0);
  const create = useAction(
    () => apiFetch<any>("/v1/invoices", { method: "POST", headers: { "idempotency-key": crypto.randomUUID() }, body: { customer_name: cust.name, customer_email: cust.email, currency: cur, memo: cust.memo || undefined, line_items: items.map((i) => ({ description: i.description, quantity: Number(i.quantity), unit_amount: i.unit_amount })) } }),
    { invalidate: ["/v1/invoices", "/v1/payments"], success: (o) => `Invoice ${o.number} created`, onSuccess: () => { setOpen(false); setCust({ name: "", email: "", memo: "" }); setItems([blankLine()]); } },
  );
  const setItem = (i: number, patch: Partial<ReturnType<typeof blankLine>>) => setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <>
      <PageHeader
        title="Invoices" description="Numbered invoices with exact line-item totals. Each has its own checkout and deposit addresses."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button variant="primary"><Plus className="size-4" aria-hidden />New invoice</Button></DialogTrigger>
            <DialogContent title="New invoice" description="Your customer pays the exact total from the checkout page." className="w-[min(94vw,42rem)]">
              <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); if (valid) create.mutate(undefined); }}>
                <TokenPicker tokens={tokens} value={cur} onChange={setCurrency} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Customer" htmlFor="iv-name"><Input id="iv-name" value={cust.name} onChange={(e) => setCust({ ...cust, name: e.target.value })} autoFocus /></Field>
                  <Field label="Customer email" htmlFor="iv-email"><Input id="iv-email" type="email" value={cust.email} onChange={(e) => setCust({ ...cust, email: e.target.value })} /></Field>
                </div>
                <fieldset>
                  <legend className="mb-2 text-sm font-medium text-ink">Line items</legend>
                  <div className="hidden grid-cols-[1fr_4rem_7rem_2rem] gap-2 px-0.5 pb-1.5 text-xs font-medium text-ink-3 sm:grid"><span>Description</span><span>Qty</span><span>Unit price ({cur})</span><span /></div>
                  <div className="divide-y divide-line sm:divide-y-0 sm:space-y-2">
                    {items.map((it, i) => (
                      <div key={i} className="grid grid-cols-[minmax(0,1fr)_5rem_2rem] items-center gap-2 py-3 first:pt-0 sm:grid-cols-[1fr_4rem_7rem_2rem] sm:py-0">
                        <Input aria-label="Description" placeholder="Description" className="col-span-3 sm:col-span-1" value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} />
                        <Input aria-label="Quantity" inputMode="numeric" className="font-mono sm:col-start-2" value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value })} />
                        <Input aria-label="Unit amount" inputMode="decimal" className="col-start-1 row-start-2 font-mono sm:col-start-3 sm:row-start-1" placeholder="0.00" value={it.unit_amount} onChange={(e) => setItem(i, { unit_amount: e.target.value })} />
                        <button type="button" disabled={items.length === 1} onClick={() => setItems(items.filter((_, j) => j !== i))} className="col-start-3 row-start-2 grid size-8 place-items-center rounded-ctl text-ink-3 transition-colors duration-[var(--duration-fast)] hover:bg-sunk hover:text-ink disabled:pointer-events-none disabled:opacity-30 sm:col-start-4 sm:row-start-1" aria-label="Remove line"><Trash2 className="size-4" aria-hidden /></button>
                      </div>
                    ))}
                  </div>
                  <Button type="button" variant="ghost" size="sm" className="mt-2 -ml-2" onClick={() => setItems([...items, blankLine()])}><Plus className="size-4" aria-hidden />Add line</Button>
                </fieldset>
                <Field label="Memo" htmlFor="iv-memo" hint="Optional. Printed on the invoice."><Textarea id="iv-memo" value={cust.memo} onChange={(e) => setCust({ ...cust, memo: e.target.value })} /></Field>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
                  <div><p className="label">Total</p><Amount value={total.toFixed(2)} size="lg" symbol={cur} /></div>
                  <Button type="submit" variant="primary" disabled={!valid} loading={create.isPending}>Create invoice</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        }
      />
      <Ledger<any>
        caption="Invoices" rows={q.data?.data} loading={q.isLoading} error={q.error} retry={() => q.refetch()} rowKey={(i) => i.id}
        filter={{ status: (i) => i.status, statusLabel: (s) => STATUS_META[s]?.label ?? s, text: (i) => `${i.number} ${i.customer_name}`, placeholder: "Search number or customer" }}
        empty={{
          title: "No invoices yet",
          body: "Create an invoice for a customer. They pay the exact total from the checkout page, by wallet or by address.",
          action: <Button variant="primary" onClick={() => setOpen(true)}><Plus className="size-4" aria-hidden />New invoice</Button>,
        }}
        columns={[
          { key: "no", header: "Invoice", cell: (i) => <div className="min-w-0"><p className="font-mono text-sm font-medium text-ink">{i.number}</p><p className="truncate text-xs text-ink-3">{i.customer_name}</p><p className="mt-0.5 flex gap-3 text-xs sm:hidden"><Link className={cellLink} href={href(`/dashboard/payments/${i.payment_id}`)}>Payment</Link><CheckoutLink className={cellLink} href={i.checkout_url}>Checkout</CheckoutLink></p></div> },
          { key: "st", header: "Status", cell: (i) => <StatusBadge status={i.status} /> },
          { key: "due", header: "Due", hideBelow: "md", cell: (i) => <span className="tnum text-ink-3">{formatDateTime(i.due_at)}</span> },
          {
            key: "link", header: "", hideBelow: "sm",
            cell: (i) => (
              <span className="inline-flex gap-4">
                <Link className={cellLink} href={href(`/dashboard/payments/${i.payment_id}`)}>Payment</Link>
                <CheckoutLink className={`${cellLink} inline-flex items-center gap-0.5`} href={i.checkout_url}>Checkout<ArrowUpRight className="size-3.5" aria-hidden /></CheckoutLink>
              </span>
            ),
          },
          { key: "amt", header: "Total", align: "right", cell: (i) => <Amount value={i.total} size="sm" symbol={i.currency ?? "USDC"} /> },
        ]}
      />
    </>
  );
}
