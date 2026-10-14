import Link from "next/link";
import { ArrowRight, Bot, Check, Code2, Copy, LayoutGrid, Link2, Megaphone, Sparkles, Store } from "lucide-react";
import { ChainIcon, TokenIcon } from "@/components/brand";
import { Band } from "@/components/marketing/band";
import { Reveal, RevealHeading } from "@/components/marketing/motion/reveal";
import { wrap } from "@/components/marketing/parts";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/* ── who it is for ─────────────────────────────────────────────────────────────────────────── */
const WHO = [
  { icon: Bot, title: "Bot builders", text: "Add a pay button to any bot. Deliver the moment the payment is confirmed, not when someone sends a screenshot." },
  { icon: LayoutGrid, title: "Mini App developers", text: "Open a checkout from your Mini App. When it is paid, your server gets a signed message and unlocks the order." },
  { icon: Megaphone, title: "Channel and community owners", text: "Charge for private channels, groups and courses. Access can follow the payment automatically." },
  { icon: Store, title: "Resellers and small shops", text: "Sell goods and services in chat with a payment link, so you are paid before you ship." },
];

export function ChatWho() {
  return (
    <Band tone="light" labelledBy="who-h">
      <div className={wrap}>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <RevealHeading id="who-h" as="h2" mode="line" className="t-1 text-ink" parts={[["Made for people who sell in chats.", ""], ["Where your customers already are.", "text-ink-4"]]} />
            <Reveal delay={0.1}><p className="mt-6 max-w-md text-lg text-ink-2">Your audience already lives in a messenger. Taking their money should not mean sending them somewhere strange.</p></Reveal>
          </div>
          <ul className="border-b border-line">
            {WHO.map((w, i) => (
              <Reveal as="li" key={w.title} delay={i * 0.06}>
                <div className="flex gap-5 border-t border-line py-7">
                  <span className="grid size-12 shrink-0 place-items-center rounded-[14px] bg-sunk text-ink"><w.icon className="size-5" aria-hidden /></span>
                  <div><h3 className="text-[1.25rem] font-medium tracking-[-0.025em] text-ink">{w.title}</h3><p className="mt-1.5 max-w-lg text-[0.9375rem] text-ink-2">{w.text}</p></div>
                </div>
              </Reveal>
            ))}
          </ul>
        </div>
      </div>
    </Band>
  );
}

/* ── how it works ──────────────────────────────────────────────────────────────────────────── */
const NETS: [string, string][] = [["base-mainnet", "Base"], ["arbitrum-mainnet", "Arbitrum"], ["optimism-mainnet", "OP Mainnet"], ["polygon-mainnet", "Polygon"], ["ethereum-mainnet", "Ethereum"], ["arc-mainnet", "Arc"]];

function V1() {
  return (
    <div className="max-w-[24rem] rounded-2xl rounded-bl-md border border-line bg-raised p-4 shadow-low">
      <p className="text-sm font-medium text-ink">Order #1042</p>
      <p className="mt-0.5 text-sm text-ink-3">2 items, delivery included.</p>
      <div className="mt-3 grid h-10 place-items-center rounded-xl bg-ink text-sm font-medium text-on-ink">Pay 25 USDC</div>
    </div>
  );
}
function V2() {
  return (
    <div className="max-w-[26rem] rounded-2xl border border-line bg-raised p-4 shadow-low">
      <p className="flex items-center gap-2 text-sm font-medium text-ink"><TokenIcon symbol="USDC" size={20} />25.00 USDC, on the network they already use</p>
      <div className="mt-3 flex flex-wrap gap-1.5">{NETS.map(([id, n]) => <span key={id} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2 py-1 text-xs font-medium text-ink-2"><ChainIcon id={id} size={14} />{n}</span>)}</div>
    </div>
  );
}
function V3() {
  const rows = ["The transfer is on the chain", "The token is the network's official USDC", "The amount covers the price", "The network says it is final"];
  return (
    <ul className="max-w-[26rem] space-y-2.5 rounded-2xl border border-line bg-raised p-4 shadow-low">
      {rows.map((r) => <li key={r} className="flex items-center gap-3 text-sm text-ink"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-signal text-on-ink"><Check className="size-3" strokeWidth={3.5} aria-hidden /></span>{r}</li>)}
    </ul>
  );
}
function V4() {
  return (
    <div className="max-w-[24rem] space-y-2.5">
      <div className="ml-auto w-fit rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-sm font-medium text-on-ink">Payment received</div>
      <div className="w-fit rounded-2xl rounded-bl-md border border-line bg-raised px-4 py-2.5 text-sm text-ink shadow-low">Order confirmed. We are packing it.</div>
      <p className="text-xs text-ink-3">Sent by your app, triggered by a signed message from Plinth.</p>
    </div>
  );
}

const STEPS = [
  { n: "1", title: "Your app asks for the payment", text: "At checkout, your Mini App, bot or shop asks Plinth for a payment at the order total and shows a Pay button. Nothing is set up per product, and no links are made by hand.", visual: <V1 /> },
  { n: "2", title: "They pay in USDC", text: "The customer chooses a network and pays with their wallet, or sends USDC to a one-time address. No account, no card.", visual: <V2 /> },
  { n: "3", title: "We check it on the chain", text: "Status never comes from a click or a screenshot. Plinth reads the chain and waits until the network says the payment is final.", visual: <V3 /> },
  { n: "4", title: "You are told, and your bot acts", text: "The money is already in your vault. A signed message tells your server to ship the order, unlock access or reply.", visual: <V4 /> },
];

export function ChatHow() {
  return (
    <Band tone="dark" labelledBy="how-h">
      <div className={wrap}>
        <RevealHeading id="how-h" as="h2" mode="line" className="t-1 max-w-3xl text-on-ink" parts={[["Four steps, none of them yours to babysit.", ""], ["From tap to delivered.", "text-white/45"]]} />
        <ol className="mt-14 space-y-14 lg:space-y-20">
          {STEPS.map((s, i) => (
            <li key={s.n} className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
              <Reveal className={cn(i % 2 === 1 && "lg:order-2")}>
                <div className="flex gap-5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-sm font-semibold tabular-nums text-ink">{s.n}</span>
                  <div><h3 className="text-[1.625rem] font-medium leading-tight tracking-[-0.03em] text-on-ink">{s.title}</h3><p className="mt-2 max-w-md text-[0.9375rem] text-white/65">{s.text}</p></div>
                </div>
              </Reveal>
              <Reveal delay={0.1}><div className="rounded-[1.75rem] bg-white/[0.06] p-5 sm:p-8"><div className="grid place-items-center rounded-2xl bg-ground p-5 sm:p-7 text-ink">{s.visual}</div></div></Reveal>
            </li>
          ))}
        </ol>
      </div>
    </Band>
  );
}
