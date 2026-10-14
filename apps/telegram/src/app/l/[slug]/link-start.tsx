"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Amount } from "@/components/amount";
import { LogoMark } from "@/components/brand";
import { Notice } from "@/components/page";
import { MerchantMark } from "@/components/checkout/checkout-parts";
import { apiFetch } from "@/lib/client-api";

export function LinkStart({ slug, info }: { slug: string; info: { name: string; description: string | null; amount: string; currency?: string; merchant_name: string } }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setErr(null);
    try {
      const pi = await apiFetch<{ id: string }>(`/public/links/${slug}/checkout`, { method: "POST" });
      router.push(`/pay/${pi.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start checkout");
      setBusy(false);
    }
  }

  return (
    <div className="bg-daylight dotgrid min-h-dvh [--dot-x:50%] [--dot-y:20%]">
      <header className="mx-auto flex h-16 max-w-[70rem] items-center justify-between gap-4 px-5 sm:px-8">
        <span className="inline-flex items-center gap-2 text-sm text-ink-3"><LogoMark size={20} />Secure checkout</span>
        <span className="inline-flex items-center gap-1.5 text-xs text-ink-3"><Lock className="size-3.5 shrink-0" aria-hidden />Settles to the merchant&apos;s own vault</span>
      </header>

      <main id="main" className="mx-auto grid max-w-[70rem] items-start gap-x-14 gap-y-6 px-5 pb-16 pt-2 sm:px-8 lg:grid-cols-[minmax(0,1fr)_30rem] lg:pt-8">
        <section className="min-w-0" aria-labelledby="who">
          <div className="flex items-center gap-3">
            <MerchantMark name={info.merchant_name || "?"} />
            <div className="min-w-0">
              <p className="text-xs text-ink-3">Payment to</p>
              <h1 id="who" className="break-words text-xl font-medium tracking-[-0.02em] text-ink">{info.merchant_name}</h1>
            </div>
          </div>
          <p className="mt-6 break-words text-[0.9375rem] text-ink-2 lg:mt-9">{info.name}</p>
          <div className="mt-3">
            <p className="label">Amount due</p>
            <Amount value={info.amount} size="display" symbol={info.currency ?? "USDC"} className="mt-2 block max-w-full text-[2.75rem] sm:text-[3.5rem]" />
          </div>
          {info.description && <p className="mt-4 max-w-sm break-words text-[0.9375rem] text-ink-3">{info.description}</p>}
          <p className="mt-8 hidden max-w-sm items-start gap-2 text-xs text-ink-3 lg:flex"><Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />Non-custodial. Funds settle into a vault controlled only by the merchant. Plinth cannot move them.</p>
        </section>

        <section className="grid gap-4" aria-label="Review">
          <div className="card p-5 sm:p-6">
            <h2 className="t-3 text-ink">Review, then pay</h2>
            <dl className="mt-4 divide-y divide-line rounded-ctl border border-line text-sm">
              <Row k="Pay to" v={<span className="break-words">{info.merchant_name}</span>} />
              <Row k="For" v={<span className="break-words">{info.name}</span>} />
              <Row k="Currency" v={info.currency ?? "USDC"} />
              <Row k="Total" v={<Amount value={info.amount} size="md" symbol={info.currency ?? "USDC"} />} strong />
            </dl>
            <ul className="mt-4 space-y-2 text-sm text-ink-3">
              <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />Next you choose a network and how to pay: from a wallet, or by sending {info.currency ?? "USDC"} to an address.</li>
              <li className="flex gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />Nothing is sent until you confirm there. Network fees are not part of this total.</li>
            </ul>
            <Button variant="primary" size="lg" className="mt-6 h-12 w-full" loading={busy} onClick={start}>
              Continue to payment <ArrowRight className="size-4" aria-hidden />
            </Button>
            {err && <Notice tone="bad" className="mt-3"><span role="alert">{err}</span></Notice>}
          </div>
          <p className="flex items-start gap-2 px-1 text-xs text-ink-3 lg:hidden"><Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />Non-custodial. Funds settle into a vault controlled only by the merchant. Plinth cannot move them.</p>
        </section>
      </main>

      <footer className="mx-auto flex max-w-[70rem] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 pb-10 text-xs text-ink-3 sm:px-8">
        <span className="inline-flex items-center gap-2"><LogoMark size={16} />Powered by Plinth</span>
        <nav aria-label="Plinth" className="flex gap-5">
          <Link href="/security" className="hover:text-ink">Security</Link>
          <Link href="/status" className="hover:text-ink">Status</Link>
        </nav>
      </footer>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-3.5 py-2.5">
      <dt className="shrink-0 text-ink-3">{k}</dt>
      <dd className={`min-w-0 text-right text-ink ${strong ? "font-medium" : ""}`}>{v}</dd>
    </div>
  );
}
