import { Check, Copy, Lock, Minus } from "lucide-react";
import { TokenIcon } from "@/components/brand";
import { StatusBadge } from "@/components/badge";
import { Connector } from "@/components/marketing/motion/connector";
import { RevealHeading } from "@/components/marketing/motion/reveal";
import { StickySteps, type StickyStep } from "@/components/marketing/motion/sticky-steps";
import { AddressFrame } from "@/components/marketing/checkout-frames";
import { Band } from "@/components/marketing/band";
import { wrap } from "@/components/marketing/parts";
import { cn } from "@/lib/cn";

const stagger = (i: number) => ({ animation: `slide-up-in 0.55s var(--ease-out) ${0.12 + i * 0.14}s both` });

function Win({ label, children, dark, className }: { label: string; children: React.ReactNode; dark?: boolean; className?: string }) {
  return (
    <figure className={cn("overflow-hidden rounded-card border shadow-soft", dark ? "border-white/10 bg-ink text-white/85" : "border-line bg-raised", className)}>
      <figcaption className={cn("flex items-center gap-2 border-b px-3.5 py-2.5 text-2xs", dark ? "border-white/10 text-white/50" : "border-line bg-wash text-ink-3")}>
        <span aria-hidden className="flex gap-1"><i className={cn("size-2 rounded-full", dark ? "bg-white/20" : "bg-line-strong")} /><i className={cn("size-2 rounded-full", dark ? "bg-white/20" : "bg-line-strong")} /><i className={cn("size-2 rounded-full", dark ? "bg-white/20" : "bg-line-strong")} /></span>
        <span className="ml-1 font-mono">{label}</span>
      </figcaption>
      {children}
    </figure>
  );
}

function VCreate() {
  return (
    <div className="space-y-3">
      <div className="card-flat p-5">
        <p className="text-xs text-ink-3">New payment</p>
        <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-3">
          <div><p className="text-xs text-ink-3">Amount</p><p className="tnum mt-1 text-[1.75rem] font-medium leading-none tracking-[-0.04em]">25<span className="text-ink-4">.00</span> <span className="text-sm font-medium text-ink-3">USDC</span></p></div>
          <div className="text-right"><p className="text-xs text-ink-3">Reference</p><p className="mt-1 font-mono text-sm text-ink">order-1042</p></div>
        </div>
        <div className="mt-4 grid h-10 place-items-center rounded-ctl bg-ink text-sm font-medium text-on-ink">Create payment link</div>
      </div>
      <div className="card-flat p-4" style={stagger(1)}>
        <div className="flex items-center justify-between"><p className="text-xs text-ink-3">Ready to share</p><StatusBadge status="AWAITING_PAYMENT" /></div>
        <p className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-sunk px-3 py-2.5 font-mono text-[0.8125rem] text-ink"><span className="truncate">pay.plinth.app/pi_9c1e…</span><span className="flex shrink-0 items-center gap-1 text-xs font-medium text-ink-2"><Copy className="size-3.5" aria-hidden />Copy</span></p>
        <p className="mt-3 text-xs text-ink-3">Send it by chat or email, or show the QR code. Each payment gets its own address.</p>
      </div>
    </div>
  );
}

function VVerify() {
  const checks = ["A Transfer log matches this invoice's address", "The token is the network's official USDC", "The amount covers the invoice", "The network's finality rule is met"];
  return (
    <div className="card-flat p-5">
      <p className="text-xs text-ink-3">Verification, read from the chain</p>
      <ul className="mt-3 space-y-2.5">
        {checks.map((c, i) => (
          <li key={c} className="flex items-center gap-3 text-[0.9375rem] text-ink" style={stagger(i)}>
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-signal text-on-ink"><Check className="size-3" strokeWidth={3.5} aria-hidden /></span>{c}
          </li>
        ))}
        <li className="flex items-center gap-3 border-t border-line pt-3 text-[0.9375rem] text-ink-3" style={stagger(4)}>
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-sunk text-ink-3"><Minus className="size-3" strokeWidth={3} aria-hidden /></span>A look-alike token to the same address: recorded, ignored
        </li>
      </ul>
    </div>
  );
}

function Node({ title, sub, icon, dark }: { title: string; sub: string; icon: React.ReactNode; dark?: boolean }) {
  return (
    <div className={cn("flex items-center gap-4 rounded-card border p-5", dark ? "border-white/10 bg-ink text-on-ink shadow-float" : "card-flat")}>
      {icon}
      <div className="min-w-0"><p className="text-lg font-medium tracking-[-0.02em]">{title}</p><p className={cn("text-sm", dark ? "text-white/55" : "text-ink-3")}>{sub}</p></div>
    </div>
  );
}

function VSweep() {
  return (
    <div className="mx-auto max-w-[26rem]">
      <div style={stagger(0)}><Node title="Invoice address" sub="derived from merchant, invoice, token, vault" icon={<TokenIcon symbol="USDC" size={36} />} /></div>
      <div className="relative ml-10 h-20" style={stagger(1)}>
        <Connector d="M0,0 L0,80" w={1} h={80} className="absolute left-0 top-0 h-20 w-px" seconds={1.8} />
        <span className="absolute left-5 top-1/2 -translate-y-1/2 rounded-md bg-raised px-2.5 py-1.5 font-mono text-xs text-ink-2 shadow-low">sweep() · no arguments</span>
      </div>
      <div style={stagger(2)}><Node dark title="Your vault" sub="only your wallet can withdraw" icon={<span className="grid size-9 place-items-center rounded-full bg-white/10"><Lock className="size-4" aria-hidden /></span>} /></div>
      <p className="mt-5 text-center text-sm text-ink-3" style={stagger(3)}>Deployed and swept in one transaction.</p>
    </div>
  );
}

function VWebhook() {
  return (
    <div className="space-y-3">
      <div className="card-flat flex items-start gap-3.5 p-4" style={stagger(0)}>
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-signal text-on-ink"><Check className="size-5" strokeWidth={3} aria-hidden /></span>
        <div><p className="text-[0.9375rem] font-medium text-ink">Payment received</p><p className="text-sm text-ink-3">25.00 USDC · order-1042 · settled to your vault</p></div>
      </div>
      <Win label="Your server gets the same news, signed" dark className="" >
        <pre className="overflow-hidden p-4 font-mono text-[0.75rem] leading-6"><code>
          <span className="text-white/45">Plinth-Signature: </span>t=&lt;unix&gt;,v1=&lt;hex&gt;{"\n"}
          {`{ "type": "payment.confirmed" }`}{"\n"}
          <span className="text-[#6ee7b7]">200 OK</span><span className="text-white/45">  → safe to fulfil</span>
        </code></pre>
      </Win>
    </div>
  );
}

const STEPS: StickyStep[] = [
  { id: "create", title: "You create a payment", body: "Make a payment link or an invoice in the dashboard, or ask for one from your code or your AI assistant. You get a link to share and a unique address for this one payment. Nothing is deployed yet, so nothing was spent.", tag: "dashboard · API · AI", visual: <VCreate /> },
  { id: "pay", title: "Your customer pays", body: "They sign one message with their wallet, or send USDC to the address from anywhere, including an exchange. Either way, you build nothing extra.", tag: "wallet or address", visual: <AddressFrame /> },
  { id: "verify", title: "We verify it on-chain", body: "Status never comes from a click or a redirect. Plinth reads the log, checks the token contract and the amount, and waits for the network's finality rule.", tag: "payment.detected", visual: <VVerify /> },
  { id: "sweep", title: "Funds sweep to your vault", body: "A relayer deploys the invoice contract and sweeps in one transaction. The sweep takes no arguments, so the destination is fixed: your vault.", tag: "settlement.completed", visual: <VSweep /> },
  { id: "hook", title: "You are told, and your app is too", body: "You see the payment in your dashboard right away. If you built something around it, a signed message tells your app it is safe to fulfil the order. It is retried and logged, so none are lost.", tag: "Plinth-Signature", visual: <VWebhook /> },
];

export function HowItWorks() {
  return (
    <Band tone="light" labelledBy="how-h">
      <div className={wrap}>
      <RevealHeading id="how-h" as="h2" mode="line" className="t-1 max-w-3xl text-ink" parts={[["Five steps from invoice to vault.", ""], ["Scroll through what actually happens.", "text-ink-4"]]} />
      <StickySteps steps={STEPS} className="mt-12 lg:mt-6" />
      </div>
    </Band>
  );
}
