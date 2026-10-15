import Link from "next/link";
import { ArrowRight, ArrowUpRight, LayoutGrid, Megaphone, Package, Store, Vault } from "lucide-react";
import { ChainIcon, LogoMark, TokenIcon } from "@/components/brand";
import { Band } from "@/components/marketing/band";
import { Reveal, RevealHeading } from "@/components/marketing/motion/reveal";
import { wrap } from "@/components/marketing/parts";
import { Chip } from "@/components/badge";
import { buttonStyles } from "@/components/ui/button";
import { TelegramMark } from "@/components/chat/telegram-mark";
import { cn } from "@/lib/cn";

/* ── the audience, with sources ────────────────────────────────────────────────────────────── */
const ext = "font-medium text-white underline decoration-white/30 underline-offset-4 hover:decoration-white";

export function ChatAudience() {
  return (
    <Band tone="dark" labelledBy="aud-h">
      <div className={wrap}>
        <div className="flex items-center gap-3 text-sm font-medium text-white/60"><TelegramMark size={20} tone="current" className="text-white/80" />Where we start: the audience is already there</div>
        <RevealHeading id="aud-h" as="h2" mode="line" className="t-1 mt-4 max-w-3xl text-on-ink" parts={[["A billion people. One missing layer.", ""], ["They chat, shop and play in the same app.", "text-white/45"]]} />

        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          <Reveal className="min-w-0">
            <div className="flex h-full flex-col rounded-[1.75rem] border border-white/10 bg-white/[0.05] p-7">
              <p className="tnum text-[4.5rem] font-medium leading-none tracking-[-0.06em] text-on-ink">1B<span className="text-white/45">+</span></p>
              <p className="mt-3 text-lg font-medium text-on-ink">monthly active users</p>
              <p className="mt-auto pt-8 text-sm text-white/55">Announced by Pavel Durov in March 2025. <a className={ext} href="https://x.com/durov/status/1902454590747902091" target="_blank" rel="noreferrer noopener">Source<ArrowUpRight className="ml-0.5 inline size-3.5" aria-hidden /></a></p>
            </div>
          </Reveal>
          <Reveal delay={0.08} className="min-w-0">
            <div className="flex h-full flex-col rounded-[1.75rem] border border-white/10 bg-white/[0.05] p-7">
              <p className="tnum text-[4.5rem] font-medium leading-none tracking-[-0.06em] text-on-ink">0.20<span className="text-white/45">%</span></p>
              <p className="mt-3 text-lg font-medium text-on-ink">per payment, taken by the contract</p>
              <p className="mt-auto pt-8 text-sm text-white/55">Taken inside the settlement transaction; the contract refuses any fee above 1%. Today the relayer pays the network fee and records it. <Link className={ext} href="/pricing">Pricing<ArrowRight className="ml-0.5 inline size-3.5" aria-hidden /></Link></p>
            </div>
          </Reveal>
          <Reveal delay={0.16} className="min-w-0">
            <div className="flex h-full flex-col rounded-[1.75rem] border border-dashed border-white/20 p-7">
              <p className="text-[4.5rem] font-medium leading-none tracking-[-0.06em] text-white/35">?</p>
              <p className="mt-3 text-lg font-medium text-on-ink">Mini App users</p>
              <p className="mt-auto pt-8 text-sm text-white/55">No audited figure is public. Numbers quoted online range from about 150 million to 500 million, and none comes from a primary source, so we do not quote one.</p>
            </div>
          </Reveal>
        </div>
        <p className="mt-6 max-w-3xl text-sm text-white/45">Figures are as of the dates given. Telegram is a trademark of its owner. Plinth is independent and is not affiliated with or endorsed by Telegram.</p>
      </div>
    </Band>
  );
}

/* ── the gap, and where Plinth sits ────────────────────────────────────────────────────────── */
const SELLERS = [
  { icon: LayoutGrid, label: "Mini Apps" },
  { icon: Store, label: "Shops" },
  { icon: Package, label: "Resellers" },
  { icon: Megaphone, label: "Creators" },
];
const NETS: [string, string][] = [["base-mainnet", "Base"], ["arbitrum-mainnet", "Arbitrum"], ["optimism-mainnet", "OP"], ["polygon-mainnet", "Polygon"], ["ethereum-mainnet", "Ethereum"], ["arc-mainnet", "Arc"]];

function Arrow() { return <ArrowRight className="mx-auto size-5 shrink-0 rotate-90 text-ink-4 lg:rotate-0" aria-hidden />; }

export function ChatGap() {
  return (
    <Band tone="light" labelledBy="gap-h">
      <div className={wrap}>
        <p className="text-sm font-medium text-ink-3">Our thesis</p>
        <RevealHeading id="gap-h" as="h2" mode="line" className="t-1 mt-3 max-w-3xl text-ink" parts={[["Selling in a chat still ends with an address and a screenshot.", ""], ["It should end with a paid order.", "text-ink-4"]]} />
        <Reveal delay={0.1}><p className="mt-6 max-w-2xl text-lg text-ink-2">Telegram has its own payment rails. The sellers we are building for want something different: dollars, on the network their customers already use, with the money in their own hands. Plinth is the layer that makes that automatic.</p></Reveal>

        <Reveal delay={0.15}>
          <div className="mt-12 grid items-center gap-5 rounded-[2rem] border border-line bg-raised p-5 shadow-low sm:p-8 lg:grid-cols-[auto_auto_1fr_auto_auto_auto_auto] lg:gap-4">
            <div className="grid place-items-center rounded-2xl bg-sunk p-5"><TelegramMark size={52} /><p className="mt-2 text-sm font-medium text-ink">Telegram audience</p></div>
            <Arrow />
            <ul className="grid grid-cols-2 gap-2">
              {SELLERS.map((s) => <li key={s.label} className="flex items-center gap-2.5 rounded-xl border border-line bg-raised px-3 py-2.5 text-sm font-medium text-ink"><s.icon className="size-4 text-ink-3" aria-hidden />{s.label}</li>)}
            </ul>
            <Arrow />
            <div className="grid place-items-center rounded-2xl bg-ink p-5 text-on-ink shadow-float"><LogoMark size={38} tone="dark" /><p className="mt-2 text-sm font-medium">Plinth gateway</p><p className="text-xs text-white/55">automatic, per order</p></div>
            <Arrow />
            <div className="min-w-[10rem] rounded-2xl border border-line bg-sunk p-4">
              <p className="flex items-center gap-1.5 text-sm font-medium text-ink"><TokenIcon symbol="USDC" size={18} />USDC</p>
              <div className="mt-2 flex flex-wrap gap-1">{NETS.map(([id]) => <ChainIcon key={id} id={id} size={18} />)}</div>
              <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-3"><Vault className="size-3.5" aria-hidden />into the seller&apos;s own vault</p>
            </div>
          </div>
        </Reveal>
      </div>
    </Band>
  );
}

/* ── where we are, honestly ────────────────────────────────────────────────────────────────── */
const COLS: { title: string; tone: "ok" | "info" | "neutral"; label: string; items: string[] }[] = [
  { title: "Built and tested", tone: "ok", label: "Now", items: ["Gateway API with idempotent, per-order payments", "Hosted checkout: wallet or address, gasless where the network allows", "Non-custodial vaults and invoice contracts, tested with fuzzing and real-bytecode forks", "Signed, retried webhooks and a merchant dashboard", "An MCP server and an AI kit for adding it to an existing project"] },
  { title: "Next, in this order", tone: "info", label: "Gates", items: ["A live run on a public testnet, end to end", "The API hosted, so sign-in and the dashboard work on this site", "Design partners among Telegram sellers and Mini App developers, to learn what they actually need", "An independent audit of the contracts", "A checkout made for Mini Apps: theme, back button, haptics"] },
  { title: "Only after the gates", tone: "neutral", label: "Later", items: ["Mainnet, switched on network by network with a recorded approval", "A published package for the MCP server, and SDKs", "More networks, each probed before it is enabled"] },
];

export function ChatStage() {
  return (
    <Band tone="light" labelledBy="stage-h" className="grid-paper [--grid-x:85%] [--grid-y:15%]">
      <div className={wrap}>
        <RevealHeading id="stage-h" as="h2" mode="line" className="t-1 max-w-3xl text-ink" parts={[["Where we are, and what comes next.", ""], ["No customers yet. A product that works, and a plan with gates.", "text-ink-4"]]} />
        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {COLS.map((c, i) => (
            <Reveal key={c.title} delay={i * 0.08} className="min-w-0">
              <div className="flex h-full flex-col rounded-[1.75rem] border border-line bg-raised p-6 shadow-low sm:p-7">
                <div className="flex items-center justify-between"><h3 className="text-[1.25rem] font-medium tracking-[-0.025em] text-ink">{c.title}</h3><Chip tone={c.tone}>{c.label}</Chip></div>
                <ul className="mt-5 space-y-3">
                  {c.items.map((t) => <li key={t} className="flex gap-3 text-[0.9375rem] text-ink-2"><span aria-hidden className={cn("mt-2 size-1.5 shrink-0 rounded-full", c.tone === "ok" ? "bg-signal" : c.tone === "info" ? "bg-info" : "bg-ink-4")} />{t}</li>)}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
        <p className="mt-6 max-w-3xl text-sm text-ink-3">The contracts have not been independently audited and nothing here runs on mainnet. Read the <Link href="/security" className="font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">security model</Link> and the <Link href="/legal/risk-disclosure" className="font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">risks</Link>.</p>
      </div>
    </Band>
  );
}

/* ── closing call ──────────────────────────────────────────────────────────────────────────── */
export function ChatClosing() {
  return (
    <Band tone="dark" shape="leaf-b" grid={false} labelledBy="cta-h">
      <div className={wrap}>
        <div className="max-w-3xl">
          <TelegramMark size={44} tone="current" className="text-white/80" />
          <h2 id="cta-h" className="t-display mt-6 text-[clamp(2.5rem,6vw,5.5rem)] text-on-ink">
            <span className="block">Start in minutes.</span>
            <span className="block text-white/45">Test it for free.</span>
          </h2>
          <p className="mt-6 max-w-lg text-lg text-white/65">Create an account, send a test payment and see an order get paid. It runs on test networks, so nothing real moves.</p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/signup" className={cn(buttonStyles({ variant: "secondary", size: "lg" }), "h-12 border-transparent px-6")}>Create a free test account<ArrowRight className="size-4" aria-hidden /></Link>
            <Link href="/build-with-ai" className="inline-flex h-12 items-center rounded-ctl border border-white/20 px-5 text-[0.9375rem] font-medium text-white transition-colors hover:bg-white/10">Add it with your AI assistant</Link>
          </div>
        </div>
      </div>
    </Band>
  );
}
