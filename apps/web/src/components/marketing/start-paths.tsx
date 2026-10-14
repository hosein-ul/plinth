import Link from "next/link";
import { ArrowRight, Check, Code2, Copy, Link2, Sparkles } from "lucide-react";
import { Band } from "@/components/marketing/band";
import { Reveal, RevealHeading } from "@/components/marketing/motion/reveal";
import { wrap } from "@/components/marketing/parts";

const tile = "group relative flex flex-col overflow-hidden rounded-[1.75rem] border border-line bg-raised p-6 shadow-low transition-[box-shadow,transform] duration-[var(--duration-slow)] ease-[var(--ease-out)] hover:-translate-y-0.5 hover:shadow-float sm:p-8";
const cta = "mt-auto inline-flex items-center gap-1.5 pt-6 text-[0.9375rem] font-medium text-ink";

/** Three ways in, so a shop owner is never shown code first. Asymmetric on purpose: the no-code path is the big one. */
export function StartPaths() {
  return (
    <Band tone="light" labelledBy="start-h">
      <div className={wrap}>
        <RevealHeading id="start-h" as="h2" mode="line" className="t-1 max-w-3xl text-ink" parts={[["Start the way that suits you.", ""], ["Code is optional.", "text-ink-4"]]} />
        <div className="mt-12 grid gap-4 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:grid-rows-2">
          <Reveal className="min-w-0 lg:row-span-2">
            <div className={`${tile} h-full`}>
              <span className="grid size-11 place-items-center rounded-[12px] bg-sunk text-ink"><Link2 className="size-5" aria-hidden /></span>
              <h3 className="mt-6 text-[1.625rem] font-medium leading-tight tracking-[-0.03em] text-ink">Make a payment link. No code.</h3>
              <p className="mt-2 max-w-md text-[0.9375rem] text-ink-2">Enter an amount in the dashboard, copy the link, and send it anywhere: a chat, an email, your own site. The customer picks a network and pays.</p>
              <div className="mt-8 rounded-[1.25rem] bg-sunk p-4 sm:p-5">
                <div className="rounded-2xl border border-line bg-raised p-4 shadow-low">
                  <div className="flex items-baseline justify-between"><p className="text-xs text-ink-3">Payment link</p><p className="tnum text-xl font-medium tracking-[-0.03em]">25<span className="text-ink-4">.00</span> <span className="text-xs font-medium text-ink-3">USDC</span></p></div>
                  <p className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-sunk px-3 py-2 font-mono text-[0.8125rem] text-ink"><span className="truncate">pay.plinth.app/l/studio-hours</span><Copy className="size-3.5 shrink-0 text-ink-3" aria-hidden /></p>
                  <p className="mt-3 flex items-center gap-2 text-xs text-ink-3"><span className="grid size-4 place-items-center rounded-full bg-signal text-on-ink"><Check className="size-2.5" strokeWidth={4} aria-hidden /></span>Pay by wallet or send to the address</p>
                </div>
              </div>
              <Link href="/signup" className={cta}>Create a test link<ArrowRight className="size-4 transition-transform duration-[var(--duration-base)] group-hover:translate-x-1" aria-hidden /></Link>
            </div>
          </Reveal>

          <Reveal delay={0.08} className="min-w-0">
            <div className={`${tile} h-full`}>
              <div className="flex items-center justify-between"><span className="grid size-11 place-items-center rounded-[12px] bg-sunk text-ink"><Sparkles className="size-5" aria-hidden /></span><span className="rounded-full bg-sunk px-2.5 py-1 text-xs font-medium text-ink-2">Pick a project</span></div>
              <h3 className="mt-6 text-[1.375rem] font-medium leading-tight tracking-[-0.03em] text-ink">Let your AI assistant build it.</h3>
              <p className="mt-2 text-[0.9375rem] text-ink-2">Copy a ready-made prompt for a store, a bot, paid access or invoices. It ends with a checklist so you can tell it worked.</p>
              <Link href="/build-with-ai" className={cta}>Open the AI kit<ArrowRight className="size-4 transition-transform duration-[var(--duration-base)] group-hover:translate-x-1" aria-hidden /></Link>
            </div>
          </Reveal>

          <Reveal delay={0.16} className="min-w-0">
            <div className={`${tile} h-full`}>
              <span className="grid size-11 place-items-center rounded-[12px] bg-sunk text-ink"><Code2 className="size-5" aria-hidden /></span>
              <h3 className="mt-6 text-[1.375rem] font-medium leading-tight tracking-[-0.03em] text-ink">Or use the API.</h3>
              <p className="mt-2 text-[0.9375rem] text-ink-2">REST with an OpenAPI document, safe retries and signed webhooks, for when you want full control.</p>
              <Link href="/developers" className={cta}>Read the docs<ArrowRight className="size-4 transition-transform duration-[var(--duration-base)] group-hover:translate-x-1" aria-hidden /></Link>
            </div>
          </Reveal>
        </div>
      </div>
    </Band>
  );
}
