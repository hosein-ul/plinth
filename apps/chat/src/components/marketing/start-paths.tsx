import Link from "next/link";
import { ArrowRight, Check, Copy, Link2, ShoppingCart, Sparkles } from "lucide-react";
import { Band } from "@/components/marketing/band";
import { Reveal, RevealHeading } from "@/components/marketing/motion/reveal";
import { wrap } from "@/components/marketing/parts";

const tile = "group relative flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-line bg-raised p-6 shadow-low transition-[box-shadow,transform] duration-[var(--duration-slow)] ease-[var(--ease-out)] hover:-translate-y-0.5 hover:shadow-float sm:p-8";
const cta = "inline-flex items-center gap-1.5 text-[0.9375rem] font-medium text-ink";
const arrow = "size-4 transition-transform duration-[var(--duration-base)] group-hover:translate-x-1";

/**
 * The two ways Plinth takes money. The first is a gateway: the app asks for a payment with each order's real total, so nothing is
 * set up per product. The second is for people with no app: one fixed price, shared as a link or an invoice.
 */
export function StartPaths() {
  return (
    <Band tone="light" labelledBy="start-h">
      <div className={wrap}>
        <RevealHeading id="start-h" as="h2" mode="line" className="t-1 max-w-3xl text-ink" parts={[["Two ways to get paid.", ""], ["Automatic in your app, or a link you send.", "text-ink-4"]]} />
        <div className="mt-12 grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <Reveal className="min-w-0">
            <div className={tile}>
              <span className="grid size-11 place-items-center rounded-[12px] bg-sunk text-ink"><ShoppingCart className="size-5" aria-hidden /></span>
              <h3 className="mt-6 text-[1.625rem] font-medium leading-tight tracking-[-0.03em] text-ink">Take payments inside your app or site.</h3>
              <p className="mt-2 max-w-lg text-[0.9375rem] text-ink-2">Your app tells Plinth what the customer owes, every time. Each order is charged at its real total, with no products to set up and no links to make by hand. Your AI assistant can add it to the project you already have.</p>

              <div className="mt-7 grid items-center gap-3 rounded-[1.25rem] bg-sunk p-4 sm:grid-cols-[1fr_auto_1fr] sm:p-5">
                <div className="min-w-0 rounded-2xl border border-line bg-raised p-3.5 shadow-low">
                  <p className="text-xs text-ink-3">Your cart</p>
                  <p className="mt-1.5 flex justify-between text-sm text-ink"><span>2 × Studio mug</span><span className="tnum">18.00</span></p>
                  <p className="flex justify-between text-sm text-ink"><span>Shipping</span><span className="tnum">7.00</span></p>
                  <div className="mt-2.5 grid h-9 place-items-center rounded-lg bg-ink text-sm font-medium text-on-ink">Pay 25.00 USDC</div>
                </div>
                <ArrowRight className="mx-auto size-4 rotate-90 text-ink-4 sm:rotate-0" aria-hidden />
                <div className="min-w-0 rounded-2xl border border-line bg-raised p-3.5 shadow-low">
                  <p className="text-xs text-ink-3">Plinth checkout</p>
                  <p className="tnum mt-1 text-xl font-medium tracking-[-0.03em]">25<span className="text-ink-4">.00</span> <span className="text-xs font-medium text-ink-3">USDC</span></p>
                  <p className="mt-2 flex items-center gap-2 text-xs text-ink-3"><span className="grid size-4 place-items-center rounded-full bg-signal text-on-ink"><Check className="size-2.5" strokeWidth={4} aria-hidden /></span>Your order is marked paid</p>
                </div>
              </div>

              <div className="mt-auto flex flex-wrap items-center gap-x-6 gap-y-2 pt-7">
                <Link href="/build-with-ai" className={cta}><Sparkles className="size-4 text-ink-3" aria-hidden />Add it with your AI assistant<ArrowRight className={arrow} aria-hidden /></Link>
                <Link href="/developers" className="text-[0.9375rem] font-medium text-ink-3 underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink hover:decoration-ink">Read the API docs</Link>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.1} className="min-w-0">
            <div className={tile}>
              <span className="grid size-11 place-items-center rounded-[12px] bg-sunk text-ink"><Link2 className="size-5" aria-hidden /></span>
              <h3 className="mt-6 text-[1.625rem] font-medium leading-tight tracking-[-0.03em] text-ink">Or send a link. One price, no code.</h3>
              <p className="mt-2 text-[0.9375rem] text-ink-2">For a freelancer, a donation or a single service. Enter an amount, copy the link and send it anywhere. Invoices work the same way.</p>
              <div className="mt-7 rounded-[1.25rem] bg-sunk p-4 sm:p-5">
                <div className="rounded-2xl border border-line bg-raised p-4 shadow-low">
                  <div className="flex items-baseline justify-between"><p className="text-xs text-ink-3">Payment link</p><p className="tnum text-xl font-medium tracking-[-0.03em]">25<span className="text-ink-4">.00</span> <span className="text-xs font-medium text-ink-3">USDC</span></p></div>
                  <p className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-sunk px-3 py-2 font-mono text-[0.8125rem] text-ink"><span className="truncate">pay.plinth.app/l/design-hour</span><Copy className="size-3.5 shrink-0 text-ink-3" aria-hidden /></p>
                </div>
              </div>
              <Link href="/signup" className={`${cta} mt-auto pt-7`}>Create a test link<ArrowRight className={arrow} aria-hidden /></Link>
            </div>
          </Reveal>
        </div>
      </div>
    </Band>
  );
}
