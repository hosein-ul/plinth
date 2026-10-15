"use client";
import { useState } from "react";
import { Clock, TriangleAlert } from "lucide-react";
import { Amount } from "@/components/amount";
import { Chip } from "@/components/badge";
import { Hash } from "@/components/hash";
import { TokenIcon } from "@/components/brand/token-icon";
import { EmptyState, ErrorState, KeyValue, Notice, PageHeader, Skeleton } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { apiFetch } from "@/lib/client-api";
import { notifyDemoReadOnly, useDataSource } from "@/lib/data-source";
import { formatDateTime } from "@/lib/format";
import { useAction, useApi } from "@/lib/hooks";
import { Ledger } from "./parts-account";
import { useAccountEmail, useReauth, type AccountEmail } from "./reauth";

interface CustodyToken {
  symbol: string;
  balance: string;
  balance_units: string;
  pending_withdrawals: string;
  pending_withdrawals_units: string;
  schedule: "MANUAL" | "DAILY" | "WEEKLY";
  min_amount: string;
  last_auto_payout_at: string | null;
  halted: string | null;
}
interface CustodyNetwork {
  network: string;
  name: string;
  environment: string;
  available: boolean;
  unavailable_reasons: string[];
  custody_address: string | null;
  withdrawal_wallet: string | null;
  tokens: CustodyToken[];
}

const SCHEDULE_LABEL = { MANUAL: "Only when I withdraw", DAILY: "Every day", WEEKLY: "Every week" } as const;
const STATUS_TONE = { REQUESTED: "info", SUBMITTED: "info", CONFIRMED: "ok", FAILED: "bad" } as const;

/**
 * The balance Plinth holds for a merchant in the custodial payout mode, and how to take it out. Everything here says plainly that
 * the platform holds this money: it is the one place in the product where that is true.
 */
export function CustodyView() {
  const { readOnly } = useDataSource();
  const q = useApi<{ data: CustodyNetwork[] }>("/v1/custody", { refetchMs: 10_000 });
  const w = useApi<{ data: any[] }>("/v1/custody/withdrawals", { refetchMs: 10_000 });
  const email = useAccountEmail();
  const nets = (q.data?.data ?? []).filter((n) => n.available);
  const [dialog, setDialog] = useState<{ kind: "withdraw" | "schedule"; net: CustodyNetwork; token: CustodyToken } | null>(null);
  const open = (kind: "withdraw" | "schedule", net: CustodyNetwork, token: CustodyToken) => (readOnly ? notifyDemoReadOnly() : setDialog({ kind, net, token }));

  return (
    <>
      <PageHeader title="Custody" description="Where your payments settle when Plinth holds the balance for you. You can withdraw it to your own wallet at any time." />
      <Notice tone="warn" className="mb-6">
        <span className="inline-flex items-start gap-2"><TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /><span><b className="font-medium">Plinth holds this money.</b> In every other payout mode only your wallet can move your funds. Here the gateway&apos;s custody wallet holds them until you withdraw, so you rely on Plinth to pay out. The contracts are not independently audited. Withdraw what you do not need to keep here.</span></span>
      </Notice>
      {q.error && !q.data && <ErrorState error={q.error} retry={() => q.refetch()} />}
      {q.isLoading && <div className="card-flat space-y-3 p-6" aria-hidden><Skeleton className="h-6 w-48" /><Skeleton className="h-10 w-64" /><Skeleton className="h-4 w-80" /></div>}
      {q.data && nets.length === 0 && (
        <EmptyState title="Custody is not available" body="Custodial payouts are switched off on every network of this account. Nothing is held for you, and every payment settles to your vault or your own wallet." />
      )}
      <div className="space-y-5">
        {nets.map((n) => (
          <article key={n.network} className="card-flat overflow-hidden">
            <header className="flex flex-wrap items-center gap-2.5 border-b border-line px-5 py-4 sm:px-6">
              <h2 className="t-3 text-ink">{n.name}</h2>
              <Chip tone={n.environment === "mainnet" ? "warn" : "neutral"} dot={false}>{n.environment === "mainnet" ? "Mainnet" : "Testnet"}</Chip>
              {n.withdrawal_wallet ? <Chip tone="ok">Withdrawal wallet set</Chip> : <Chip tone="neutral">No withdrawal wallet</Chip>}
            </header>
            <div className="divide-y divide-line">
              {n.tokens.map((t) => (
                <div key={t.symbol} className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
                  <div>
                    <p className="label inline-flex items-center gap-2"><TokenIcon symbol={t.symbol} size={16} />{t.symbol} balance</p>
                    <Amount value={t.balance} size="xl" symbol={t.symbol} className="mt-2 block" />
                    {Number(t.pending_withdrawals_units) > 0 && <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-ink-3"><Clock className="size-3.5" aria-hidden />{t.pending_withdrawals} {t.symbol} on its way out</p>}
                    {t.halted && <Notice tone="warn" className="mt-3">Withdrawals of {t.symbol} are paused while Plinth checks its custody wallet. Your balance is unchanged.</Notice>}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button variant="primary" onClick={() => open("withdraw", n, t)} disabled={!n.withdrawal_wallet || Number(t.balance_units) <= 0 || !!t.halted}>Withdraw {t.symbol}</Button>
                      <Button onClick={() => open("schedule", n, t)} disabled={!n.withdrawal_wallet}>Automatic payouts</Button>
                    </div>
                  </div>
                  <KeyValue
                    items={[
                      { k: "Withdraws to", v: n.withdrawal_wallet ? <Hash value={n.withdrawal_wallet} lead={10} tail={6} /> : <span className="text-ink-3">Register a withdrawal wallet under Wallets &amp; payouts.</span> },
                      { k: "Automatic payouts", v: <span>{SCHEDULE_LABEL[t.schedule]}{t.schedule !== "MANUAL" && Number(t.min_amount) > 0 ? <span className="text-ink-3"> · from {t.min_amount} {t.symbol}</span> : null}</span> },
                      ...(t.last_auto_payout_at ? [{ k: "Last automatic payout", v: formatDateTime(t.last_auto_payout_at) }] : []),
                      { k: "Held in", v: n.custody_address ? <Hash value={n.custody_address} lead={10} tail={6} /> : "-" },
                    ]}
                  />
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>

      {nets.length > 0 && (
        <section className="mt-10" aria-labelledby="wd-h">
          <h2 id="wd-h" className="t-3 mb-4 text-ink">Withdrawals</h2>
          <Ledger<any>
            caption="Custody withdrawals" rows={w.data?.data} loading={w.isLoading} error={w.error} retry={() => w.refetch()} rowKey={(r) => r.id}
            empty={{ title: "No withdrawals yet", body: "Withdrawals and automatic payouts of your custody balance appear here, with their transaction." }}
            columns={[
              { key: "st", header: "Status", cell: (r) => <span className="inline-flex flex-col items-start gap-1"><Chip tone={STATUS_TONE[r.status as keyof typeof STATUS_TONE] ?? "neutral"}>{r.status[0] + r.status.slice(1).toLowerCase()}</Chip>{r.failure_reason && <span className="max-w-56 text-xs text-bad-ink">{r.failure_reason}</span>}</span> },
              { key: "when", header: "Requested", hideBelow: "md", cell: (r) => <span className="tnum text-ink-3">{formatDateTime(r.created_at)}{r.trigger === "SCHEDULED" ? " · automatic" : ""}</span> },
              { key: "to", header: "To", hideBelow: "lg", cell: (r) => <Hash value={r.to} lead={8} tail={4} /> },
              { key: "tx", header: "Transaction", hideBelow: "sm", cell: (r) => (r.tx_hash ? <Hash value={r.tx_hash} href={r.explorer_url} lead={8} tail={4} /> : <span className="text-ink-3">Not sent yet</span>) },
              { key: "amt", header: "Amount", align: "right", cell: (r) => <Amount value={r.amount} size="sm" symbol={r.token} /> },
            ]}
          />
        </section>
      )}

      {dialog?.kind === "withdraw" && <WithdrawDialog net={dialog.net} token={dialog.token} email={email.data} onClose={() => setDialog(null)} />}
      {dialog?.kind === "schedule" && <ScheduleDialog net={dialog.net} token={dialog.token} email={email.data} onClose={() => setDialog(null)} />}
    </>
  );
}

function WithdrawDialog({ net, token, email, onClose }: { net: CustodyNetwork; token: CustodyToken; email: AccountEmail | undefined; onClose: () => void }) {
  const reauth = useReauth(email?.auth_method);
  const [all, setAll] = useState(true);
  const [amount, setAmount] = useState("");
  const [key] = useState(() => crypto.randomUUID());
  const valid = all || (/^\d{1,12}(\.\d{1,6})?$/.test(amount) && Number(amount) > 0 && Number(amount) <= Number(token.balance));
  const go = useAction(
    () => apiFetch("/v1/custody/withdrawals", { method: "POST", headers: { "idempotency-key": key }, body: { network: net.network, token: token.symbol, ...(all ? {} : { amount }), reauth: reauth.value() } }),
    { invalidate: ["/v1/custody", "/v1/custody/withdrawals"], success: "Withdrawal requested", onSuccess: onClose },
  );
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title={`Withdraw ${token.symbol} on ${net.name}`} description="Sent to your confirmed withdrawal wallet. You cannot choose another address here.">
        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); if (valid && reauth.ready) go.mutate(undefined); }}>
          <div className="rounded-ctl bg-wash px-3.5 py-3 text-sm"><p className="text-ink-3">To</p><div className="mt-1">{net.withdrawal_wallet && <Hash value={net.withdrawal_wallet} lead={12} tail={8} />}</div></div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink">Amount</legend>
            <div className="inline-flex rounded-ctl bg-sunk p-0.5 text-sm" role="group">
              <button type="button" aria-pressed={all} onClick={() => setAll(true)} className={all ? "rounded-[9px] bg-raised px-3 py-1.5 font-medium text-ink shadow-low" : "rounded-[9px] px-3 py-1.5 font-medium text-ink-3 hover:text-ink"}>Everything ({token.balance} {token.symbol})</button>
              <button type="button" aria-pressed={!all} onClick={() => setAll(false)} className={!all ? "rounded-[9px] bg-raised px-3 py-1.5 font-medium text-ink shadow-low" : "rounded-[9px] px-3 py-1.5 font-medium text-ink-3 hover:text-ink"}>Part of it</button>
            </div>
            {!all && <Field label={`Amount (${token.symbol})`} htmlFor="cw-amt" className="mt-3" hint={`Up to ${token.balance}.`}><Input id="cw-amt" className="font-mono" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="25.00" /></Field>}
          </fieldset>
          {email && reauth.field}
          <p className="text-sm text-ink-3">We email you when it is requested and when it is sent. If the transfer fails, the amount returns to your balance.</p>
          <div className="flex justify-end"><Button type="submit" variant="primary" loading={go.isPending} disabled={!valid || !reauth.ready}>Withdraw {all ? token.balance : amount || "…"} {token.symbol}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleDialog({ net, token, email, onClose }: { net: CustodyNetwork; token: CustodyToken; email: AccountEmail | undefined; onClose: () => void }) {
  const reauth = useReauth(email?.auth_method);
  const [schedule, setSchedule] = useState<string>(token.schedule);
  const [min, setMin] = useState(token.min_amount === "0.00" ? "" : token.min_amount);
  const minOk = min === "" || /^\d{1,12}(\.\d{1,6})?$/.test(min);
  const go = useAction(
    () => apiFetch("/v1/custody/schedule", { method: "PATCH", body: { network: net.network, token: token.symbol, schedule, min_amount: min === "" ? "0" : min, reauth: reauth.value() } }),
    { invalidate: ["/v1/custody"], success: "Automatic payouts updated", onSuccess: onClose },
  );
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title={`Automatic payouts of ${token.symbol}`} description={`The whole ${token.symbol} balance on ${net.name} is sent to your withdrawal wallet in one transfer, once per period.`}>
        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); if (minOk && reauth.ready) go.mutate(undefined); }}>
          <Field label="How often" htmlFor="cs-sched">
            <Select id="cs-sched" value={schedule} onValueChange={setSchedule} options={[{ value: "MANUAL", label: SCHEDULE_LABEL.MANUAL }, { value: "DAILY", label: SCHEDULE_LABEL.DAILY }, { value: "WEEKLY", label: SCHEDULE_LABEL.WEEKLY }]} />
          </Field>
          {schedule !== "MANUAL" && <Field label={`Only when the balance is at least (${token.symbol})`} htmlFor="cs-min" hint="Leave empty to send any balance."><Input id="cs-min" className="font-mono" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} placeholder="100" /></Field>}
          {email && reauth.field}
          <div className="flex justify-end"><Button type="submit" variant="primary" loading={go.isPending} disabled={!minOk || !reauth.ready}>Save</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

