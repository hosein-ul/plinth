"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Hash } from "@/components/hash";
import { CopyButton } from "@/components/copy-button";
import { Chip } from "@/components/badge";
import { Notice } from "@/components/page";
import { useAction, useApi } from "@/lib/hooks";
import { apiFetch } from "@/lib/client-api";
import { Switch } from "@/components/ui/switch";
import { useHref } from "@/lib/data-source";

export function CreatePaymentDialog({ label = "Create payment" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [amount, setAmount] = useState("");
  const [ref, setRef] = useState("");
  const [desc, setDesc] = useState("");
  const [wallet, setWallet] = useState(true);
  const [addr, setAddr] = useState(true);
  const nets = useApi<any>("/v1/networks");
  const create = useAction(
    () =>
      apiFetch<any>("/v1/payment-intents", {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID() },
        body: { amount, order_reference: ref || undefined, description: desc || undefined, checkout_methods: [wallet && "WALLET", addr && "ADDRESS"].filter(Boolean) },
      }),
    { invalidate: ["/v1/payments", "/v1/overview"], onSuccess: setResult },
  );
  const activeNets = (nets.data?.data ?? []).filter((n: any) => n.vault?.status === "ACTIVE");
  const valid = /^\d{1,12}(\.\d{1,6})?$/.test(amount) && Number(amount) > 0 && (wallet || addr);

  const amountError =
    amount === "" ? null
    : !/^\d{1,12}(\.\d{1,6})?$/.test(amount) ? "Use digits with up to 6 decimals, for example 25.00."
    : Number(amount) <= 0 ? "The amount must be greater than zero."
    : null;
  const methodError = !wallet && !addr ? "Turn on at least one checkout method." : null;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setResult(null); setAmount(""); setRef(""); setDesc(""); } }}>
      <DialogTrigger asChild><Button variant="primary"><Plus className="size-4" aria-hidden />{label}</Button></DialogTrigger>
      <DialogContent title={result ? "Payment created" : "Create a payment"} description={result ? "Share the checkout link, or fetch it via the API." : "A hosted checkout with a unique deposit address per network."}>
        {result ? (
          <div className="space-y-5">
            <div>
              <p className="label">Checkout link</p>
              <div className="mt-1.5 flex items-start gap-2 rounded-ctl bg-sunk px-3 py-2.5">
                <a href={result.checkout_url} target="_blank" rel="noreferrer noopener" className="min-w-0 flex-1 break-all font-mono text-[0.8125rem] text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-ink">{result.checkout_url}</a>
                <CopyButton value={result.checkout_url} compact label="Copy link" />
              </div>
            </div>
            <dl className="divide-y divide-line text-sm">
              <div className="flex items-center justify-between gap-4 py-2.5 first:pt-0">
                <dt className="text-ink-3">Payment ID</dt>
                <dd className="flex min-w-0 items-center gap-0.5"><span className="truncate font-mono text-[0.8125rem] text-ink-2">{result.id}</span><CopyButton value={result.id} compact label="Copy ID" /></dd>
              </div>
              {result.networks.map((n: any) => (
                <div key={n.network} className="flex items-center justify-between gap-4 py-2.5 last:pb-0">
                  <dt className="text-ink-3">{n.name}</dt>
                  <dd>{n.deposit_address ? <Hash value={n.deposit_address} lead={8} tail={6} href={n.deposit_address_explorer_url} /> : <span className="text-ink-3">wallet only</span>}</dd>
                </div>
              ))}
            </dl>
            <div className="flex items-center justify-end gap-2">
              <DialogClose asChild><Button type="button" variant="ghost">Done</Button></DialogClose>
              <Button variant="primary" asChild><a href={result.checkout_url} target="_blank" rel="noreferrer noopener">Open checkout <ArrowUpRight className="size-4" aria-hidden /></a></Button>
            </div>
          </div>
        ) : (
          <form
            className="space-y-5"
            onSubmit={(e) => { e.preventDefault(); if (valid) create.mutate(undefined); }}
            noValidate
          >
            <Field label="Amount" htmlFor="cp-amount" hint="Exact, up to 6 decimals." error={amountError}>
              <div className="relative">
                <Input id="cp-amount" inputMode="decimal" placeholder="25.00" value={amount} onChange={(e) => setAmount(e.target.value)} className="pr-16 font-mono tnum" aria-invalid={amountError ? true : undefined} autoFocus />
                <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-ink-3">USDC</span>
              </div>
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Order reference" htmlFor="cp-ref" hint="Optional. Your own ID."><Input id="cp-ref" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="ORDER-1042" /></Field>
              <Field label="Description" htmlFor="cp-desc" hint="Optional. Shown at checkout."><Input id="cp-desc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Coffee subscription — October" /></Field>
            </div>
            <fieldset>
              <legend className="mb-1 text-sm font-medium text-ink">Checkout methods</legend>
              <div className="divide-y divide-line rounded-ctl border border-line">
                <label className="flex cursor-pointer items-center justify-between gap-4 px-3.5 py-3 text-sm">
                  <span><span className="block font-medium text-ink">Pay with wallet</span><span className="block text-ink-3">Gasless where supported</span></span>
                  <Switch checked={wallet} onCheckedChange={setWallet} aria-label="Pay with wallet" />
                </label>
                <label className="flex cursor-pointer items-center justify-between gap-4 px-3.5 py-3 text-sm">
                  <span><span className="block font-medium text-ink">Pay with address / QR</span><span className="block text-ink-3">A unique deposit address per network</span></span>
                  <Switch checked={addr} onCheckedChange={setAddr} aria-label="Pay with address" />
                </label>
              </div>
              {methodError && <p role="alert" className="mt-1.5 text-sm text-bad-ink">{methodError}</p>}
            </fieldset>
            <div>
              <p className="label">Networks</p>
              {nets.isLoading ? (
                <p className="mt-1.5 text-sm text-ink-3">Loading networks…</p>
              ) : activeNets.length ? (
                <div className="mt-1.5 flex flex-wrap gap-1.5">{activeNets.map((n: any) => <Chip key={n.network ?? n.name} tone="neutral" dot={false}>{n.name}</Chip>)}</div>
              ) : (
                <Notice tone="warn" className="mt-1.5">No network has an active vault yet. Set one up under Networks before creating a payment.</Notice>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <DialogClose asChild><Button type="button" variant="ghost">Cancel</Button></DialogClose>
              <Button type="submit" variant="primary" disabled={!valid || activeNets.length === 0} loading={create.isPending}>Create payment</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The primary action for an empty payment list: create a payment when a vault exists, otherwise the
 * one thing that unblocks it (setting up a network). Never offers a dialog that cannot succeed.
 */
export function StartPaymentAction() {
  const nets = useApi<any>("/v1/networks");
  const href = useHref();
  if (!nets.data) return <Button variant="primary" disabled>Create payment</Button>;
  const hasVault = (nets.data.data ?? []).some((n: any) => n.vault);
  if (hasVault) return <CreatePaymentDialog />;
  return <Button variant="primary" asChild><Link href={href("/dashboard/networks")}>Set up a network</Link></Button>;
}
