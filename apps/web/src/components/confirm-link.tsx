"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { Logo } from "@/components/logo";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/client-api";

type Kind = "email" | "payout";

const KINDS: Record<Kind, { endpoint: string; title: string; explain: string; button: string; done: (r: any) => { title: string; body: string } }> = {
  email: {
    endpoint: "/public/auth/email/confirm",
    title: "Confirm your email",
    explain: "One tap confirms this address for your Plinth account. The link works once.",
    button: "Confirm email",
    done: (r) => ({ title: "Email confirmed", body: r?.purpose === "CHANGE" ? `${r.email} is now the email on your account.` : "You can now set up direct payouts and receive notices about payout changes." }),
  },
  payout: {
    endpoint: "/public/payout/confirm",
    title: "Confirm your payout change",
    explain: "Only confirm if you asked to be paid to a new wallet. Invoices that already have an address keep their destination. If this was not you, close this page: nothing changes.",
    button: "Confirm payout change",
    done: (r) => ({
      title: r?.status === "COOLING_DOWN" ? "Confirmed. Starting soon." : "Payout change confirmed",
      body: r?.status === "COOLING_DOWN" ? `Your wallet starts applying to new invoices on ${r.active_from ? new Date(r.active_from).toLocaleString() : "the date shown in your dashboard"}. You can cancel until then.` : "New invoices now pay straight to your wallet.",
    }),
  },
};

function Inner({ kind }: { kind: Kind }) {
  const { endpoint, title, explain, button, done } = KINDS[kind];
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<{ title: string; body: string } | null>(null);

  async function confirm() {
    setState("busy");
    try {
      const r = await apiFetch(endpoint, { method: "POST", body: { token } });
      setResult(done(r));
      setState("done");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "This link could not be used.");
      setState("error");
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-ground px-5 py-10">
      <main id="main" className="w-full max-w-[25rem]">
        <div className="flex justify-center"><Logo /></div>
        <div className="mt-7 rounded-[1.75rem] border border-line bg-raised p-7 shadow-float sm:p-9">
          {state === "done" && result ? (
            <div className="text-center" role="status">
              <span className="mx-auto grid size-12 place-items-center rounded-full bg-signal-quiet text-signal-ink"><CheckCircle2 className="size-6" aria-hidden /></span>
              <h1 className="t-2 mt-5 text-ink">{result.title}</h1>
              <p className="mt-2 text-[0.9375rem] text-ink-3">{result.body}</p>
              <Button asChild variant="primary" className="mt-7 w-full"><Link href="/dashboard">Open the dashboard</Link></Button>
            </div>
          ) : (
            <>
              <h1 className="t-2 text-center text-ink">{title}</h1>
              <p className="mt-2 text-center text-[0.9375rem] text-ink-3">{explain}</p>
              {!token && <Notice tone="bad" className="mt-6">This link is incomplete. Open it again from the email.</Notice>}
              {state === "error" && (
                <Notice tone="bad" className="mt-6"><span className="flex items-start gap-2"><TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /><span>{message}</span></span></Notice>
              )}
              <Button type="button" variant="primary" size="lg" className="mt-7 h-12 w-full" loading={state === "busy"} disabled={!token || state === "error"} onClick={confirm}>{button}</Button>
              <p className="mt-5 text-center text-sm text-ink-3"><Link href="/dashboard" className="underline decoration-line-strong underline-offset-4 hover:decoration-ink">Go to the dashboard</Link></p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export function ConfirmLink({ kind }: { kind: Kind }) {
  return <Suspense><Inner kind={kind} /></Suspense>;
}
