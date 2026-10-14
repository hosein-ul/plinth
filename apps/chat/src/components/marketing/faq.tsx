"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Band } from "@/components/marketing/band";
import { ClipReveal } from "@/components/marketing/motion/clip-reveal";
import { Reveal, RevealHeading } from "@/components/marketing/motion/reveal";
import { wrap } from "@/components/marketing/parts";
import { cn } from "@/lib/cn";

const QA: [string, string][] = [
  ["Do I need TON or a Telegram-specific coin?", "No. Customers pay in USDC on whichever network they already use, from any wallet. Plinth does not depend on Telegram's own payment system or on TON."],
  ["Who holds the money?", "Nobody in between. Each payment has its own address, and funds are swept from it into a vault that only your wallet can withdraw from. Plinth runs the relayer that pays the network fee for the sweep, and that relayer cannot choose a destination or withdraw."],
  ["Does my customer need gas?", "Not with Pay with wallet, where the network's USDC supports signed authorisations: they sign once and our relayer pays. With Send to address they pay the normal network fee from their own wallet."],
  ["Can I use it inside a Mini App?", "The checkout is a normal web page, so a Mini App can open it, and your server is told by a signed message when it is paid. It has not been tuned for Mini App themes yet, and there is no dedicated Mini App component today."],
  ["Does Telegram allow this?", "Telegram sets its own rules for what may be sold inside Mini Apps, especially digital goods on phone app stores. Check the current rules for your case. Plinth links also work in plain chat messages and in an ordinary browser."],
  ["When is it safe to deliver?", "When your server receives the signed payment.confirmed message. It fires only after the transfer meets the network's finality rule, never from a tap or a screenshot."],
  ["Are the contracts audited? Is this live on mainnet?", "No and no. The contracts have not been independently audited, and Plinth runs on test networks only. Mainnet is off by default and needs explicit approval."],
  ["Is this a Telegram product?", "No. Plinth is independent and is not affiliated with or endorsed by Telegram. The Telegram name and mark belong to their owner and are used here only to say where it can be used."],
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <Band tone="light" labelledBy="faq-h" className="grid-paper [--grid-x:15%] [--grid-y:20%]">
      <div className={wrap}>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-16">
        <div>
          <RevealHeading id="faq-h" as="h2" mode="line" className="t-1 text-ink" parts={[["Questions", ""], ["we would ask first.", "text-ink-4"]]} />
          <Reveal delay={0.1}>
            <p className="mt-5 max-w-sm text-[0.9375rem] text-ink-3">More in the <Link href="/faq" className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">full FAQ</Link>, or ask us directly through <Link href="/contact" className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">contact</Link>.</p>
          </Reveal>
        </div>
        <ul className="divide-y divide-line border-y border-line">
          {QA.map(([q, a], i) => {
            const on = open === i;
            return (
              <ClipReveal as="li" key={q} variant="inset-x" delay={i * 0.04} duration={0.9}>
                <h3>
                  <button type="button" aria-expanded={on} aria-controls={`faq-${i}`} onClick={() => setOpen(on ? null : i)} className="group/q flex w-full items-center justify-between gap-6 py-5 text-left">
                    <span className="text-[1.0625rem] font-medium tracking-[-0.02em] text-ink">{q}</span>
                    <span className={cn("grid size-7 shrink-0 place-items-center rounded-full border border-line-strong text-ink-2 transition-[rotate,background-color] duration-[var(--duration-base)] ease-[var(--ease-out)] group-hover/q:bg-sunk", on && "rotate-45 bg-sunk")}><Plus className="size-4" aria-hidden /></span>
                  </button>
                </h3>
                <div id={`faq-${i}`} role="region" className={cn("grid transition-[grid-template-rows,opacity] duration-[var(--duration-slow)] ease-[var(--ease-out)]", on ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                  <div className="overflow-hidden"><p className="max-w-2xl pb-6 text-[0.9375rem] text-ink-2">{a}</p></div>
                </div>
              </ClipReveal>
            );
          })}
        </ul>
      </div>
      </div>
    </Band>
  );
}
