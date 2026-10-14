"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BatteryFull, Check, Copy, Lock, Signal, Wifi, X } from "lucide-react";
import { ChainIcon, LogoMark, TokenIcon, WalletIcon } from "@/components/brand";
import { useReduced } from "@/components/marketing/motion/use-reduced";
import { cn } from "@/lib/cn";

/** The four moments of a payment, played in a loop: network, wallet, review and sign, done. */
const HOLD = [2900, 2700, 2700, 4300];
export function usePhonePhase(): number {
  const reduce = useReduced();
  const [p, setP] = useState(0);
  useEffect(() => {
    if (reduce) { setP(3); return; }
    let i = 0, t: ReturnType<typeof setTimeout>;
    const next = () => { t = setTimeout(() => { i = (i + 1) % HOLD.length; setP(i); next(); }, HOLD[i]); };
    next();
    return () => clearTimeout(t);
  }, [reduce]);
  return p;
}

const NETS: [string, string][] = [
  ["arc-mainnet", "Arc"],
  ["base-mainnet", "Base"],
  ["ethereum-mainnet", "Ethereum"],
  ["arbitrum-mainnet", "Arbitrum"],
  ["optimism-mainnet", "OP Mainnet"],
  ["polygon-mainnet", "Polygon"],
];
const WALLETS: [string, string, string][] = [["metamask", "MetaMask", "Detected"], ["coinbase", "Coinbase Wallet", ""], ["walletconnect", "WalletConnect", ""]];
const TAP: { x: number; y: number }[] = [{ x: 80, y: 372 }, { x: 150, y: 404 }, { x: 138, y: 548 }, { x: 138, y: 548 }];
const CTA = ["Continue", "Connecting…", "Sign and pay", "Done"];

const slide = { initial: { opacity: 0, x: 18 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -18 }, transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] as const } };

function StatusBar() {
  return (
    <div className="relative flex h-[46px] items-end justify-between px-7 pb-1.5 text-[12px] font-semibold text-ink">
      <span>9:41</span>
      <span className="flex items-center gap-1"><Signal className="size-[13px]" strokeWidth={2.5} aria-hidden /><Wifi className="size-[13px]" strokeWidth={2.5} aria-hidden /><BatteryFull className="size-[17px]" strokeWidth={2} aria-hidden /></span>
    </div>
  );
}

function Screen({ phase }: { phase: number }) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-ground text-ink">
      <StatusBar />
      <div className="px-[18px]">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-[11px] bg-ink text-[14px] font-semibold text-on-ink">N</span>
          <div className="min-w-0 flex-1 leading-tight"><p className="text-[13px] font-medium">Northwind Coffee</p><p className="flex items-center gap-1 text-[10.5px] text-ink-3"><Lock className="size-2.5" aria-hidden />Secure checkout</p></div>
          <span className="grid size-7 place-items-center rounded-full bg-sunk text-ink-3"><X className="size-3.5" aria-hidden /></span>
        </div>
        <div className="mt-4">
          <p className="text-[11px] text-ink-3">Amount due</p>
          <p className="tnum mt-0.5 flex items-center gap-2 leading-none"><TokenIcon symbol="USDC" size={26} /><span className="text-[40px] font-medium tracking-[-0.045em]">25<span className="text-ink-4">.00</span></span><span className="mt-3 text-[12px] font-medium text-ink-3">USDC</span></p>
        </div>

        <div className="relative mt-4 h-[222px]">
          <AnimatePresence mode="wait" initial={false}>
            {phase === 0 && (
              <motion.div key="net" {...slide}>
                <p className="mb-2 text-[11px] font-medium text-ink-3">Pay on</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {NETS.map(([id, name], i) => (
                    <div key={id} className={cn("flex items-center gap-2 rounded-xl border px-2.5 py-2 text-[12px] font-medium", i === 0 ? "border-ink bg-raised shadow-ctl" : "border-line bg-raised/70 text-ink-2")}>
                      <ChainIcon id={id} size={18} /><span className="truncate">{name}</span>{i === 0 && <Check className="ml-auto size-3.5 text-ink" strokeWidth={3} aria-hidden />}
                    </div>
                  ))}
                </div>
                <p className="mt-2.5 flex items-center gap-1.5 text-[10.5px] text-ink-3"><span className="size-1.5 rounded-full bg-signal" />No network fee for you on this network</p>
              </motion.div>
            )}
            {phase === 1 && (
              <motion.div key="wal" {...slide}>
                <p className="mb-2 text-[11px] font-medium text-ink-3">Connect a wallet</p>
                <div className="space-y-1.5">
                  {WALLETS.map(([id, name, tag], i) => (
                    <div key={id} className={cn("flex items-center gap-2.5 rounded-xl border px-2.5 py-2 text-[12.5px] font-medium", i === 0 ? "border-ink bg-raised shadow-ctl" : "border-line bg-raised/70 text-ink-2")}>
                      <WalletIcon id={id} size={24} /><span>{name}</span>
                      {tag && <span className="rounded-full bg-signal-quiet px-1.5 py-0.5 text-[9.5px] font-medium text-signal-ink">{tag}</span>}
                      {i === 0 && <span className="ml-auto size-3.5 animate-spin rounded-full border-2 border-ink/20 border-t-ink" />}
                    </div>
                  ))}
                </div>
                <p className="mt-2.5 text-[10.5px] text-ink-3">Plinth never asks for your seed phrase.</p>
              </motion.div>
            )}
            {phase === 2 && (
              <motion.div key="rev" {...slide}>
                <p className="mb-2 text-[11px] font-medium text-ink-3">Review</p>
                <div className="divide-y divide-line rounded-xl border border-line bg-raised text-[12px]">
                  {[["You pay", "25.00 USDC"], ["To", "Northwind Coffee"], ["Network", "Arc"], ["Network fee", "None for you"]].map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between px-3 py-2.5"><span className="text-ink-3">{k}</span><span className="font-medium">{v}</span></div>
                  ))}
                </div>
                <p className="mt-2.5 flex items-center gap-1.5 text-[10.5px] text-ink-3"><Lock className="size-3" aria-hidden />One signature. Official USDC only.</p>
              </motion.div>
            )}
            {phase === 3 && (
              <motion.div key="done" {...slide} className="grid h-full place-items-center text-center">
                <div>
                  <span className="relative mx-auto grid size-[62px] place-items-center rounded-full bg-signal text-on-ink shadow-[0_0_0_9px_rgb(14_166_107/0.14)]">
                    <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden><motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, delay: 0.25, ease: "easeOut" }} /></svg>
                  </span>
                  <p className="mt-3 text-[16px] font-medium tracking-[-0.02em]">Payment complete</p>
                  <p className="text-[11px] text-ink-3">Funds are in the merchant&apos;s vault</p>
                  <p className="mx-auto mt-3 flex w-fit items-center gap-1.5 rounded-full bg-sunk px-2.5 py-1 font-mono text-[10.5px] text-ink-2">0x8b2c…e07d<Copy className="size-3 text-ink-3" aria-hidden /></p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className={cn("mt-1 grid h-[48px] place-items-center rounded-2xl text-[14px] font-medium transition-colors duration-300", phase === 3 ? "bg-sunk text-ink" : "bg-ink text-on-ink")}>{CTA[phase]}</div>
        <div className="mx-auto mt-3 h-[4px] w-[96px] rounded-full bg-ink/80" />
      </div>

      {/* tap indicator */}
      {phase < 3 && <motion.span aria-hidden key={phase} className="pointer-events-none absolute z-20 size-9 rounded-full border border-ink/25 bg-ink/10" initial={{ left: TAP[phase]!.x - 18, top: TAP[phase]!.y - 18 + 14, scale: 1.5, opacity: 0 }} animate={{ scale: [1.5, 1, 1.5], opacity: [0, 1, 0] }} transition={{ duration: 1.2, delay: 1.1, ease: "easeInOut" }} />}

      {/* the merchant's phone buzzes: an iOS-style notification */}
      <AnimatePresence>
        {phase === 3 && (
          <motion.div key="note" initial={{ y: -90, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -90, opacity: 0 }} transition={{ type: "spring", stiffness: 260, damping: 26, delay: 0.9 }} className="absolute inset-x-2.5 top-[50px] z-30 flex items-start gap-2.5 rounded-[22px] bg-white/95 p-3 shadow-[0_10px_30px_rgb(12_18_32/0.22)] ring-1 ring-black/5">
            <span className="mt-0.5 shrink-0"><LogoMark size={30} /></span>
            <span className="min-w-0 text-[11.5px] leading-snug"><span className="flex justify-between text-ink-3"><b className="font-semibold text-ink">Plinth</b><span>now</span></span><span className="block font-medium text-ink">Payment received</span><span className="block text-ink-2">25.00 USDC settled to your vault</span></span>
          </motion.div>
        )}
      </AnimatePresence>
      {/* glass glare */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-40 bg-[linear-gradient(112deg,rgb(255_255_255/0.28)_0%,rgb(255_255_255/0.05)_26%,transparent_44%)]" />
    </div>
  );
}

/** A titanium iPhone: brushed-metal frame, black bezel, dynamic island, side buttons, glass glare. */
export function IPhone({ phase }: { phase: number }) {
  return (
    <div className="relative h-[620px] w-[300px]">
      {/* side buttons */}
      {[[96, 30], [150, 56], [214, 56]].map(([top, h], i) => <span key={i} aria-hidden className="absolute -left-[3px] w-[4px] rounded-l-sm bg-[linear-gradient(90deg,#6b717b,#c8ccd3)]" style={{ top, height: h }} />)}
      <span aria-hidden className="absolute -right-[3px] top-[170px] h-[88px] w-[4px] rounded-r-sm bg-[linear-gradient(270deg,#6b717b,#c8ccd3)]" />
      <div className="absolute inset-0 rounded-[56px] bg-[linear-gradient(145deg,#e3e6ea_0%,#9097a2_28%,#d3d6dc_52%,#7a808b_78%,#c4c8ce_100%)] p-[4px] shadow-[0_50px_90px_-20px_rgb(12_18_32/0.55),0_18px_36px_-12px_rgb(12_18_32/0.35)]">
        <div className="h-full w-full rounded-[52px] bg-[#0a0c11] p-[8px]">
          <div className="relative h-full w-full overflow-hidden rounded-[44px]">
            <Screen phase={phase} />
            <div aria-hidden className="absolute left-1/2 top-[11px] z-50 flex h-[30px] w-[96px] -translate-x-1/2 items-center justify-end rounded-full bg-[#05060a] pr-3"><span className="size-[9px] rounded-full bg-[radial-gradient(circle_at_35%_35%,#2c3350,#0b0e18)] ring-1 ring-white/10" /></div>
          </div>
        </div>
      </div>
    </div>
  );
}
