"use client";
import { useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { CheckCircle2, Clock, Mail, ShieldCheck, TriangleAlert } from "lucide-react";
import { Chip } from "@/components/badge";
import { Hash } from "@/components/hash";
import { ErrorState, KeyValue, Notice, Skeleton } from "@/components/page";
import { WalletButton } from "@/components/wallet/connect-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { apiFetch } from "@/lib/client-api";
import { notifyDemoReadOnly, useDataSource } from "@/lib/data-source";
import { formatDateTime } from "@/lib/format";
import { useAction, useApi } from "@/lib/hooks";
import { cn } from "@/lib/cn";
import { EmailChangeDialog } from "./email-panel";
import { useAccountEmail, useReauth, type AccountEmail } from "./reauth";

export interface PayoutRow {
  network: string;
  name: string;
  environment: string;
  operational: boolean;
  mode: "VAULT" | "DIRECT" | "CUSTODIAL";
  destination: string | null;
  /** Custodial mode: where the held balance can be withdrawn to. */
  withdrawal_wallet?: string | null;
  /** Custodial payouts are switched on for this network. */
  custody_available?: boolean;
  status: "ACTIVE" | "SETTING_UP" | "NOT_SET_UP";
  fee: { bps: number; percent: string; treasury: string };
  vault: { status: string; address: string; owner: string } | null;
  pending: { id: string; mode: string; address: string | null; status: string; confirmation_expires_at: string | null; active_from: string | null } | null;
  cooldown_hours: number;
  /** A new wallet must be confirmed by an emailed link (off by default). */
  email_confirmation_required?: boolean;
}

const FEE_NOTE = "In the same transaction as the payment. Each payment shows its fee.";

/** Where new payments go on each network, and how to change it. Rendered inside the wallet provider unless `walletReady` is false (demo). */
export function PayoutSection({ walletReady, chainIds }: { walletReady: boolean; chainIds: Record<string, number> }) {
  const q = useApi<{ data: PayoutRow[] }>("/v1/payout-methods", { refetchMs: 15_000 });
  const email = useAccountEmail();
  const rows = (q.data?.data ?? []).filter((r) => r.operational || r.vault || r.pending);
  if (q.error && !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (q.isLoading) return <div className="card-flat space-y-3 p-6" aria-hidden><Skeleton className="h-6 w-48" /><Skeleton className="h-4 w-80" /><Skeleton className="h-9 w-56" /></div>;
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="payout-h" className="mb-9">
      <div className="mb-4">
        <h2 id="payout-h" className="t-3 text-ink">How you get paid</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-3">Choose where new payments land on each network. Invoices that already have an address keep the destination they were issued with.</p>
      </div>
      <div className="space-y-5">{rows.map((r) => <PayoutCard key={r.network} row={r} email={email.data} walletReady={walletReady} chainId={chainIds[r.network]} />)}</div>
    </section>
  );
}

function statusChip(r: PayoutRow) {
  if (r.status === "NOT_SET_UP") return <Chip tone="neutral">Not set up</Chip>;
  if (r.status === "SETTING_UP") return <Chip tone="info">Setting up</Chip>;
  return <Chip tone="ok">Active</Chip>;
}

function PayoutCard({ row, email, walletReady, chainId }: { row: PayoutRow; email: AccountEmail | undefined; walletReady: boolean; chainId: number | undefined }) {
  const { readOnly } = useDataSource();
  const [dialog, setDialog] = useState<"wallet" | "custody" | "vault" | null>(null);
  const cancel = useAction(() => apiFetch(`/v1/payout-methods/${row.pending!.id}/cancel`, { method: "POST" }), { invalidate: ["/v1/payout-methods"], success: "Change cancelled" });
  const custodial = row.mode === "CUSTODIAL";
  const direct = row.mode === "DIRECT";
  const p = row.pending;
  const open = (d: "wallet" | "custody" | "vault") => (readOnly || !walletReady ? notifyDemoReadOnly() : setDialog(d));
  return (
    <article className="card-flat overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-2.5">
          <h3 className="t-3 text-ink">{row.name}</h3>
          <Chip tone={row.environment === "mainnet" ? "warn" : "neutral"} dot={false}>{row.environment === "mainnet" ? "Mainnet" : "Testnet"}</Chip>
          {statusChip(row)}
        </div>
        <div role="group" aria-label={`Paid into, on ${row.name}`} className="inline-flex rounded-ctl bg-sunk p-0.5 text-sm">
          <button type="button" aria-pressed={!direct && !custodial} disabled={(direct || custodial) ? !row.vault : true} onClick={() => (direct || custodial) && open("vault")} className={cn("rounded-[9px] px-3 py-1.5 font-medium transition-colors duration-[var(--duration-fast)]", !direct && !custodial ? "bg-raised text-ink shadow-low" : "text-ink-3 hover:text-ink")}>Vault</button>
          <button type="button" aria-pressed={direct} onClick={() => !direct && open("wallet")} disabled={!row.operational} className={cn("rounded-[9px] px-3 py-1.5 font-medium transition-colors duration-[var(--duration-fast)]", direct ? "bg-raised text-ink shadow-low" : "text-ink-3 hover:text-ink")}>My wallet</button>
          {(row.custody_available || custodial) && <button type="button" aria-pressed={custodial} onClick={() => !custodial && open("custody")} disabled={!row.operational || !row.custody_available} className={cn("rounded-[9px] px-3 py-1.5 font-medium transition-colors duration-[var(--duration-fast)]", custodial ? "bg-raised text-ink shadow-low" : "text-ink-3 hover:text-ink")}>Held by Plinth</button>}
        </div>
      </header>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="p-5 sm:p-6 lg:border-r lg:border-line">
          <p className="label">{direct ? "New payments go straight to" : custodial ? "New payments are held by" : "New payments settle into"}</p>
          <p className="mt-2 text-lg font-medium tracking-[-0.015em] text-ink">{direct ? "Your own wallet" : custodial ? "Plinth, until you withdraw" : row.vault ? "Your Plinth vault" : "Nothing yet"}</p>
          <div className="mt-2">{row.destination ? <Hash value={row.destination} lead={10} tail={6} /> : <span className="text-sm text-ink-3">Create a vault or register a wallet to start accepting payments here.</span>}</div>
          <p className="mt-4 text-sm text-ink-3">
            {custodial
              ? "Managed payouts: each payment is credited to your balance when it is final, and you withdraw to the wallet you confirmed, any time or on a schedule."
              : direct
              ? "The money lands in your wallet when the payment is final. There is no vault delay: anyone who gets into this wallet's keys can move it at once."
              : "The money waits in a vault only your owner wallet can withdraw from, and forwarding rules take effect after a delay."}
          </p>
        </div>
        <div className="p-5 sm:p-6">
          <KeyValue
            items={[
              { k: "Platform fee", v: <span><span className="font-medium text-ink">{row.fee.percent}</span> <span className="text-ink-3">of each payment</span></span> },
              { k: "How it is taken", v: <span className="text-ink-3">{FEE_NOTE}</span> },
              { k: "Fee goes to", v: <Hash value={row.fee.treasury} lead={10} tail={6} /> },
              { k: "Changes take effect", v: <span className="text-ink-3">{row.email_confirmation_required ? (row.cooldown_hours > 0 ? `${row.cooldown_hours} hours after you confirm by email` : "right after you confirm by email") : row.cooldown_hours > 0 ? `${row.cooldown_hours} hours after you save them` : "right away"}</span> },
            ]}
          />
        </div>
      </div>

      {p && (
        <div className="border-t border-line px-5 py-4 sm:px-6">
          <Notice tone={p.status === "COOLING_DOWN" ? "info" : "warn"}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-start gap-2">
                {p.status === "COOLING_DOWN" ? <Clock className="mt-0.5 size-4 shrink-0" aria-hidden /> : <Mail className="mt-0.5 size-4 shrink-0" aria-hidden />}
                <span>
                  {p.status === "COOLING_DOWN"
                    ? <>Your wallet <span className="font-mono text-xs">{p.address?.slice(0, 10)}…</span> is confirmed and starts applying to new invoices on <b className="font-medium">{p.active_from ? formatDateTime(p.active_from) : "soon"}</b>. Until then payments still go to your vault.</>
                    : <>Waiting for you to open the confirmation link we emailed. Nothing changes until you do{p.confirmation_expires_at ? <>; it expires {formatDateTime(p.confirmation_expires_at)}</> : null}.</>}
                </span>
              </p>
              <Button size="sm" variant="secondary" loading={cancel.isPending} onClick={() => cancel.mutate(undefined)}>Cancel this change</Button>
            </div>
          </Notice>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line bg-wash px-5 py-4 sm:px-6">
        <p className="min-w-0 text-sm text-ink-3">{custodial ? "Withdraw, and set automatic payouts, on the Custody page. You can go back to your vault at any time." : direct ? "You can go back to your vault at any time." : "Prefer the money in your own wallet? Register a wallet you control."}</p>
        <div className="flex gap-2">
          {custodial ? (
            <>
              <Button size="sm" onClick={() => open("custody")}>Use another withdrawal wallet</Button>
              <Button size="sm" variant="primary" onClick={() => open("vault")} disabled={!row.vault || row.vault.status !== "ACTIVE"}>Switch back to my vault</Button>
            </>
          ) : direct ? (
            <>
              <Button size="sm" onClick={() => open("wallet")}>Use another wallet</Button>
              <Button size="sm" variant="primary" onClick={() => open("vault")} disabled={!row.vault || row.vault.status !== "ACTIVE"}>Switch back to my vault</Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="primary" onClick={() => open("wallet")} disabled={!row.operational}>Pay to my own wallet…</Button>
              {row.custody_available && <Button size="sm" onClick={() => open("custody")} disabled={!row.operational}>Let Plinth hold my balance…</Button>}
            </>
          )}
        </div>
      </div>

      {dialog === "wallet" && <DirectWalletDialog row={row} email={email} chainId={chainId} mode="DIRECT" onClose={() => setDialog(null)} />}
      {dialog === "custody" && <DirectWalletDialog row={row} email={email} chainId={chainId} mode="CUSTODIAL" onClose={() => setDialog(null)} />}
      {dialog === "vault" && <SwitchToVaultDialog row={row} email={email} onClose={() => setDialog(null)} />}
    </article>
  );
}

/** A numbered step that shows what is done and what is waiting. */
function Step({ n, title, done, locked, children }: { n: number; title: string; done?: boolean; locked?: boolean; children?: React.ReactNode }) {
  return (
    <li className={cn("flex gap-3", locked && "pointer-events-none select-none opacity-55")} aria-disabled={locked || undefined}>
      <span aria-hidden className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold", done ? "bg-signal text-on-ink" : "bg-sunk text-ink-2")}>{done ? <CheckCircle2 className="size-4" /> : n}</span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink">{title}</p>
        {children && <div className="mt-2 space-y-2 text-sm text-ink-3">{children}</div>}
      </div>
    </li>
  );
}

/**
 * Register a wallet to be paid directly. The wallet signs a message to prove it controls the address, you confirm it
 * is you, and a link is emailed. Only after the link (and any cooldown) do new invoices use the wallet.
 */
function DirectWalletDialog({ row, email, chainId, mode, onClose }: { row: PayoutRow; email: AccountEmail | undefined; chainId: number | undefined; mode: "DIRECT" | "CUSTODIAL"; onClose: () => void }) {
  const custodial = mode === "CUSTODIAL";
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const reauth = useReauth(email?.auth_method);
  const [proof, setProof] = useState<{ nonce: string; signature: string; address: string } | null>(null);
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const resend = useAction(() => apiFetch<any>("/v1/auth/email/verify", { method: "POST" }), { success: "Confirmation link sent" });

  // A different wallet needs its own signature.
  useEffect(() => { if (proof && address?.toLowerCase() !== proof.address.toLowerCase()) setProof(null); }, [address, proof]);

  async function sign() {
    if (!address) return;
    setSigning(true);
    setSignError(null);
    try {
      const ch = await apiFetch<{ nonce: string; message: string }>("/v1/payout-methods/challenge", { method: "POST", body: { network: row.network, address, purpose: custodial ? "CUSTODY_WITHDRAWAL" : "PAYOUT_WALLET" } });
      const signature = await signMessageAsync({ message: ch.message });
      setProof({ nonce: ch.nonce, signature, address });
    } catch (e) {
      setSignError(/reject|denied|cancel/i.test(String(e instanceof Error ? e.message : e)) ? "You declined the signature. Nothing was sent." : e instanceof Error ? e.message.split("\n")[0]! : "Signing failed");
    } finally {
      setSigning(false);
    }
  }

  const needEmail = row.email_confirmation_required ?? false;
  const submit = useAction(
    () => apiFetch<any>("/v1/payout-methods/wallet", { method: "POST", body: { network: row.network, mode, address: proof!.address, nonce: proof!.nonce, signature: proof!.signature, reauth: reauth.value() } }),
    { invalidate: ["/v1/payout-methods"], ...(needEmail ? { onSuccess: () => setSentTo(email?.email ?? "your email") } : { success: custodial ? "Withdrawal wallet saved" : "Payout wallet saved", onSuccess: onClose }) },
  );

  const emailOk = !needEmail || (!!email?.email && email.verified);
  const walletOk = isConnected && !!address;
  const signedOk = !!proof;
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title={custodial ? `Let Plinth hold your balance on ${row.name}` : `Pay straight to your wallet on ${row.name}`} description={custodial ? "Name the wallet you can withdraw to. Four quick steps; nothing moves and no transaction is sent." : "Four quick steps. Nothing moves and no transaction is sent."}>
        {sentTo ? (
          <div className="space-y-4">
            <Notice tone="ok"><span className="inline-flex items-start gap-2"><Mail className="mt-0.5 size-4 shrink-0" aria-hidden /><span>We sent a confirmation link to <b className="font-medium">{sentTo}</b>. Open it to finish.</span></span></Notice>
            <p className="text-sm text-ink-3">Until you do, new payments keep going where they go now. {row.cooldown_hours > 0 ? `After you confirm, the wallet starts applying ${row.cooldown_hours} hours later, so there is time to stop it if it was not you.` : "After you confirm, it applies to new invoices right away."}</p>
            <div className="flex justify-end"><Button variant="primary" onClick={onClose}>Done</Button></div>
          </div>
        ) : (
          <div className="space-y-6">
            <ol className="space-y-5">
              {needEmail && (
              <Step n={1} title={emailOk ? "Your email is confirmed" : "Confirm your email"} done={emailOk}>
                {!email?.email && <><p>Direct payouts are confirmed by email. Add one first.</p><Button size="sm" onClick={() => setEmailOpen(true)}>Add email</Button></>}
                {email?.email && !email.verified && (
                  <><p><span className="font-mono text-xs">{email.email}</span> is not confirmed yet.</p><div className="flex gap-2"><Button size="sm" loading={resend.isPending} onClick={() => resend.mutate(undefined)}>Send confirmation link</Button><Button size="sm" variant="ghost" onClick={() => setEmailOpen(true)}>Use another address</Button></div><p>Open the link, then come back to this window.</p></>
                )}
              </Step>
              )}
              <Step n={needEmail ? 2 : 1} title={custodial ? "Connect the wallet you will withdraw to" : "Connect the wallet that should be paid"} done={walletOk} locked={!emailOk}>
                <div className="flex flex-wrap items-center gap-3"><WalletButton chainId={chainId} size="sm" label="Connect wallet" /></div>{walletOk && <p className="break-all font-mono text-xs text-ink-2">{address}</p>}
                <p>Plain wallets such as MetaMask or Rabby work. Smart-contract wallets such as Safe are not supported yet.</p>
              </Step>
              <Step n={needEmail ? 3 : 2} title="Sign a message to prove it is yours" done={signedOk} locked={!emailOk || !walletOk}>
                <p>The message names your business, this network and this address, and expires in ten minutes. Signing it sends no transaction.</p>
                {!signedOk && <Button size="sm" onClick={sign} loading={signing} disabled={!emailOk || !walletOk}>Sign message</Button>}
                {signError && <p className="text-bad-ink" role="alert">{signError}</p>}
              </Step>
              <Step n={needEmail ? 4 : 3} title="Confirm it is you" locked={!signedOk}>
                {signedOk && email && reauth.field}
              </Step>
            </ol>
            <div className="flex items-start gap-2 rounded-ctl bg-wash px-3.5 py-3 text-sm text-ink-3"><TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn-ink" aria-hidden /><span>{custodial ? "This wallet receives your withdrawals. A hardware wallet is the safest choice." : "Paying straight to a wallet has no vault delay. If this wallet's keys are ever stolen, the money in it can be moved at once. A hardware wallet is the safest choice."}</span></div>
            <div className="flex justify-end">
              <Button variant="primary" loading={submit.isPending} disabled={!emailOk || !signedOk || !reauth.ready} onClick={() => submit.mutate(undefined)}>{needEmail ? "Email me the confirmation link" : custodial ? "Save withdrawal wallet" : "Save payout wallet"}</Button>
            </div>
          </div>
        )}
        <EmailChangeDialog open={emailOpen} onOpenChange={setEmailOpen} />
      </DialogContent>
    </Dialog>
  );
}

function SwitchToVaultDialog({ row, email, onClose }: { row: PayoutRow; email: AccountEmail | undefined; onClose: () => void }) {
  const reauth = useReauth(email?.auth_method);
  const go = useAction(() => apiFetch("/v1/payout-methods/vault", { method: "POST", body: { network: row.network, reauth: reauth.value() } }), {
    invalidate: ["/v1/payout-methods"], success: "New payments will go to your vault", onSuccess: onClose,
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent title={`Pay into your vault on ${row.name}`} description="Applies to new invoices right away. Invoices that already have an address keep their destination.">
        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); go.mutate(undefined); }}>
          <p className="flex items-start gap-2 text-sm text-ink-3"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-ink-2" aria-hidden />Your vault is controlled only by its owner wallet, and forwarding rules take effect after a delay.</p>
          {email && reauth.field}
          <div className="flex justify-end"><Button type="submit" variant="primary" loading={go.isPending} disabled={!reauth.ready}>Switch to my vault</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
