import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { NETWORKS } from "@plinth/shared";
import { AssetOnChain, ChainIcon, WalletIcon } from "@/components/brand";
import { Chip } from "@/components/badge";
import { Band } from "@/components/marketing/band";
import { ClipReveal } from "@/components/marketing/motion/clip-reveal";
import { Marquee } from "@/components/marketing/motion/marquee";
import { Tilt } from "@/components/marketing/motion/tilt";
import { Reveal, RevealHeading } from "@/components/marketing/motion/reveal";
import { Spotlight } from "@/components/marketing/motion/spotlight";
import { wrap } from "@/components/marketing/parts";
import { cn } from "@/lib/cn";

const WALLETS: [id: string, name: string][] = [
  ["metamask", "MetaMask"],
  ["coinbase", "Coinbase Wallet"],
  ["rainbow", "Rainbow"],
  ["walletconnect", "WalletConnect"],
  ["phantom", "Phantom"],
  ["trust", "Trust Wallet"],
  ["ledger", "Ledger"],
];

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function AssetsNetworks() {
  const all = Object.values(NETWORKS);
  const testnets = all.filter((n) => n.environment === "testnet");
  const mainnets = all.filter((n) => n.environment === "mainnet");
  return (
    <Band tone="light" labelledBy="assets-h">
      
      <div className={cn(wrap, "relative")}>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <div className="flex items-center gap-3">
            <AssetOnChain symbol="USDC" id="arc-testnet" size={44} />
            <p className="text-sm text-ink-3">USDC, the only asset Plinth counts</p>
          </div>
          <RevealHeading as="h2" id="assets-h" className="t-1 mt-6 text-ink" parts={[["One token.", ""], ["Official contracts only.", "text-ink-4"]]} />
          <Reveal delay={0.1}>
            <p className="mt-5 max-w-md text-lg text-ink-2">Built for {mainnets.length} networks with native USDC. Arc mainnet is live. The other {mainnets.length - 1} mainnets open one by one, each after its own on-chain check, and {testnets.length} testnets run alongside.</p>
            <p className="mt-3 max-w-md text-[0.9375rem] text-ink-3">
              Each network&apos;s USDC address comes from Circle&apos;s published list and is probed on-chain before the network can be enabled. A look-alike token is recorded and ignored, never credited.
            </p>
            <Link href="/networks" className="mt-6 inline-flex items-center gap-1.5 text-[0.9375rem] font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
              Read the network registry<ArrowRight className="size-4" aria-hidden />
            </Link>
          </Reveal>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {testnets.map((n, i) => (
            <ClipReveal key={n.id} variant="polygon" delay={i * 0.12} className="h-full">
              <Tilt className="h-full" max={4} lift={5}>
              <Spotlight className="card h-full overflow-hidden p-6">
                <div className="flex items-start justify-between gap-3">
                  <ChainIcon id={n.id} size={44} />
                  <Chip tone="info">Testnet</Chip>
                </div>
                <h3 className="mt-5 text-[1.375rem] font-medium tracking-[-0.03em] text-ink">{n.name}</h3>
                <p className="mt-0.5 font-mono text-xs text-ink-3">chain {n.chainId}</p>
                <dl className="mt-5 space-y-2.5 text-sm">
                  <div className="flex justify-between gap-3"><dt className="text-ink-3">USDC contract</dt><dd className="font-mono text-xs text-ink-2">{short(n.usdc.address)}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-ink-3">Final after</dt><dd className="text-ink-2">{n.finality.strategy === "finalized-tag" ? "finalized block" : `${n.finality.confirmations} confirmation${n.finality.confirmations === 1 ? "" : "s"}`}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-ink-3">Network fees in</dt><dd className="text-ink-2">{n.gas.model === "usdc-native" ? "USDC" : n.nativeCurrency.symbol}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-ink-3">Signed payments</dt><dd className="text-ink-2">{n.authorization.verified ? `probed ${n.authorization.verifiedAt}` : "not verified"}</dd></div>
                </dl>
              </Spotlight>
              </Tilt>
            </ClipReveal>
          ))}
        </div>
      </div>

      <div className="mt-20 sm:mt-24">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <p className="max-w-lg text-lg font-medium tracking-[-0.02em] text-ink">Every network where Circle issues USDC natively <span className="text-ink-4">is on the list.</span></p>
          <Link href="/networks" className="text-sm font-medium text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink">See each network</Link>
        </div>
        <div className="space-y-3">
          {[mainnets.slice(0, Math.ceil(mainnets.length / 2)), mainnets.slice(Math.ceil(mainnets.length / 2))].map((row, r) => (
            <Marquee key={r} seconds={r === 0 ? 70 : 84} reverse={r === 1}>
              {row.map((n) => (
                <span key={n.id} className="inline-flex h-14 items-center gap-3 rounded-card border border-line bg-raised px-4 pr-5 shadow-low">
                  <ChainIcon id={n.id} size={30} />
                  <span className="whitespace-nowrap text-[0.9375rem] font-medium text-ink">{n.name}</span>
                </span>
              ))}
            </Marquee>
          ))}
        </div>
      </div>

      <div className="mt-20 sm:mt-24">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <p className="max-w-md text-lg font-medium tracking-[-0.02em] text-ink">Wallets the checkout can connect to <span className="text-ink-4">for one-signature payments.</span></p>
          <p className="text-xs text-ink-3">Marks belong to their owners and show compatibility, not partnership.</p>
        </div>
        <Marquee seconds={38}>
          {WALLETS.map(([id, name]) => (
            <span key={id} className="inline-flex h-14 items-center gap-3 rounded-card border border-line bg-raised px-4 pr-5 shadow-low">
              <WalletIcon id={id} size={30} />
              <span className="whitespace-nowrap text-[0.9375rem] font-medium text-ink">{name}</span>
            </span>
          ))}
        </Marquee>
      </div>
      </div>
    </Band>
  );
}
