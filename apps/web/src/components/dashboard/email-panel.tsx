"use client";
import { useState } from "react";
import { CheckCircle2, Mail } from "lucide-react";
import { Chip } from "@/components/badge";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/client-api";
import { useAction } from "@/lib/hooks";
import { useAccountEmail, useReauth } from "./reauth";

/** Add or replace the account email. Needs a fresh sign-in; the address only changes when the link sent to it is used. */
export function EmailChangeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const status = useAccountEmail();
  const reauth = useReauth(status.data?.auth_method);
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const send = useAction(() => apiFetch<any>("/v1/auth/email/change", { method: "POST", body: { email: email.trim(), reauth: reauth.value() } }), {
    invalidate: ["/v1/auth/email"], onSuccess: (r) => setSentTo(r.email),
  });
  const close = (v: boolean) => { onOpenChange(v); if (!v) { setSentTo(null); setEmail(""); reauth.reset(); } };
  const valid = /^\S+@\S+\.\S+$/.test(email.trim());
  const has = !!status.data?.email;
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent title={has ? "Change your email" : "Add your email"} description="We use it to confirm changes that affect where your money goes, and to tell you when they happen.">
        {sentTo ? (
          <div className="space-y-4">
            <Notice tone="ok"><span className="inline-flex items-center gap-2"><Mail className="size-4" aria-hidden />We sent a link to <b className="font-medium">{sentTo}</b>.</span></Notice>
            <p className="text-sm text-ink-3">Open it on any device to finish. The link works once and expires in 24 hours. Nothing changes until you use it.</p>
            <div className="flex justify-end"><Button variant="primary" onClick={() => close(false)}>Done</Button></div>
          </div>
        ) : (
          <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); send.mutate(undefined); }}>
            <Field label="Email address" htmlFor="em-new"><Input id="em-new" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></Field>
            {status.data && reauth.field}
            {status.data && !status.data.email_available && <Notice tone="warn">This server cannot send email right now, so an address cannot be confirmed.</Notice>}
            <div className="flex justify-end">
              <Button type="submit" variant="primary" loading={send.isPending} disabled={!valid || !reauth.ready || status.data?.email_available === false}>Send confirmation link</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Settings block: the address, whether it is confirmed, and how to confirm or change it. */
export function EmailPanel() {
  const q = useAccountEmail();
  const [open, setOpen] = useState(false);
  const resend = useAction(() => apiFetch<any>("/v1/auth/email/verify", { method: "POST" }), { success: "Confirmation link sent", invalidate: ["/v1/auth/email"] });
  const d = q.data;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium text-ink">{d?.email ?? (q.isLoading ? "Loading…" : "No email address yet")}</span>
        {d?.email && (d.verified ? <Chip tone="ok"><span className="inline-flex items-center gap-1"><CheckCircle2 className="size-3.5" aria-hidden />Confirmed</span></Chip> : <Chip tone="warn">Not confirmed</Chip>)}
      </div>
      <p className="text-sm text-ink-3">
        {d && !d.email ? "Add an email to set up direct payouts. It is how Plinth confirms changes that affect where your money goes." : d && !d.verified ? "Confirm this address to set up direct payouts and to receive notices about payout changes." : "Used to confirm payout changes and to tell you when they happen."}
      </p>
      <div className="flex flex-wrap gap-2">
        {d?.email && !d.verified && <Button type="button" size="sm" variant="primary" loading={resend.isPending} onClick={() => resend.mutate(undefined)} disabled={d.email_available === false}>Send confirmation link</Button>}
        <Button type="button" size="sm" onClick={() => setOpen(true)}>{d?.email ? "Change email" : "Add email"}</Button>
      </div>
      <EmailChangeDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
