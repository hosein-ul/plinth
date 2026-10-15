"use client";
import { Check, Copy, Lock } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { motion, useMotionValue, useSpring } from "motion/react";
import { ChainIcon, TokenIcon } from "@/components/brand";
import { FitBox } from "@/components/marketing/fit-box";
import { IPhone, usePhonePhase } from "@/components/marketing/iphone-checkout";
import { useReduced } from "@/components/marketing/motion/use-reduced";
import { cn } from "@/lib/cn";

import { CHECKOUT_HOST } from "@/lib/config";
const NETS: [string, string][] = [
  ["arc-mainnet", "Arc"],
  ["base-mainnet", "Base"],
  ["ethereum-mainnet", "Ethereum"],
  ["arbitrum-mainnet", "Arbitrum"],
  ["optimism-mainnet", "OP Mainnet"],
  ["polygon-mainnet", "Polygon"],
];
const THREAD = ["Detected", "Verified", "Final", "Swept", "In vault"];

/** The same checkout in a desktop browser: summary on the left, the payment card on the right. Its status thread follows the phone. */
export function CheckoutWindow({ phase }: { phase: number }) {
  const lit = phase >= 3 ? 5 : phase + 1; // steps lit so far
  return (
    <div className="w-[468px] overflow-hidden rounded-[20px] border border-line-strong bg-ground shadow-float">
      <div className="flex items-center gap-2 border-b border-line bg-raised px-4 py-2.5">
        <span className="flex gap-1.5"><i className="size-2.5 rounded-full bg-line-strong" /><i className="size-2.5 rounded-full bg-line-strong" /><i className="size-2.5 rounded-full bg-line-strong" /></span>
        <span className="mx-auto flex h-6 w-[220px] items-center justify-center gap-1.5 rounded-md bg-sunk font-mono text-[10.5px] text-ink-3"><Lock className="size-2.5" aria-hidden />{CHECKOUT_HOST}/pay/…</span>
        <span className="w-[42px]" />
      </div>
      <div className="grid grid-cols-[158px_1fr] gap-2.5 p-3">
        <div className="space-y-2.5">
          <div className="surface-ink relative overflow-hidden rounded-2xl p-3.5">
            <div aria-hidden className="tint-mint-tr absolute inset-0" />
            <div className="relative">
              <div className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-lg bg-white text-[12px] font-semibold text-ink">N</span><div className="leading-tight"><p className="text-[9.5px] text-white/60">Payment to</p><p className="text-[12px] font-medium text-white">Northwind Coffee</p></div></div>
              <p className="mt-3.5 text-[9.5px] text-white/60">Amount due</p>
              <p className="tnum mt-0.5 flex items-baseline gap-1.5 leading-none text-white"><span className="text-[28px] font-medium tracking-[-0.045em]">25<span className="text-white/50">.00</span></span><span className="text-[10.5px] font-medium text-white/60">USDC</span></p>
            </div>
          </div>
          <div className="rounded-2xl border border-line bg-raised p-3 text-[10.5px]">
            <div className="flex justify-between text-ink-3"><span>Reference</span><span className="font-mono text-ink">order-1047</span></div>
            <div className="mt-1.5 flex justify-between text-ink-3"><span>Expires in</span><span className="font-medium text-ink">17:42</span></div>
          </div>
          <div className="rounded-2xl border border-line bg-raised p-3">
            <ol className="space-y-1.5">
              {THREAD.map((t, i) => (
                <li key={t} className="flex items-center gap-2 text-[10.5px]">
                  <span className={cn("grid size-3.5 place-items-center rounded-full border transition-colors duration-300", i < lit ? "border-signal bg-signal text-on-ink" : i === lit ? "border-signal" : "border-line-strong")}>{i < lit && <Check className="size-2" strokeWidth={4} aria-hidden />}{i === lit && <span className="size-1 rounded-full bg-signal" />}</span>
                  <span className={cn("transition-colors duration-300", i <= lit ? "text-ink" : "text-ink-4")}>{t}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-raised p-3.5 shadow-low">
          <div className="flex items-center justify-between"><p className="text-[13px] font-medium tracking-[-0.02em] text-ink">Pay with USDC</p><span className="flex items-center gap-1 text-[9.5px] text-ink-3"><Lock className="size-2.5" aria-hidden />Non-custodial</span></div>
          <p className="mt-2.5 text-[10.5px] font-medium text-ink">Network</p>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
            {NETS.map(([id, name], i) => (
              <span key={id} className={cn("flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[10px] font-medium", i === 0 ? "border-ink bg-raised text-ink shadow-ctl" : "border-line text-ink-2")}><ChainIcon id={id} size={14} /><span className="truncate">{name}</span></span>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between rounded-lg bg-wash px-2.5 py-1.5 text-[10px]"><span className="flex items-center gap-1.5 font-medium text-ink"><TokenIcon symbol="USDC" size={14} />USDC on Arc</span><span className="font-medium text-signal-ink">Official USDC</span></div>
          <div className="mt-2.5 grid grid-cols-2 rounded-lg bg-sunk p-[2px] text-center text-[10.5px] font-medium text-ink-3"><span className="rounded-md py-1">Pay with wallet</span><span className="rounded-md bg-raised py-1 text-ink shadow-ctl">Send to address</span></div>
          <div className="mt-3 grid grid-cols-[88px_1fr] items-center gap-3">
            <div className="rounded-lg border border-line bg-raised p-1.5"><QRCodeSVG value="plinth-illustration-checkout" size={76} level="M" bgColor="transparent" fgColor="#0c1220" /></div>
            <div className="min-w-0">
              <p className="text-[9.5px] text-ink-3">Address for this payment only</p>
              <p className="mt-0.5 font-mono text-[11px] text-ink"><b className="font-medium">0x8b2c</b>…<b className="font-medium">e07d</b></p>
              <p className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[9.5px] font-medium text-ink-2"><Copy className="size-2.5" aria-hidden />Copy</p>
            </div>
          </div>
          <p className="mt-2.5 text-[9.5px] leading-snug text-ink-3">Send exactly <b className="font-medium text-ink">25.00 USDC</b> on Arc only. Other tokens are not credited.</p>
        </div>
      </div>
    </div>
  );
}

/**
 * The checkout, shown twice: on a desktop browser (QR to send from any wallet) and on an iPhone paying with a wallet.
 * The phone walks through network, wallet, review and done; the desktop status thread fills as it goes.
 */
export function CollageScene() {
  const phase = usePhonePhase();
  const reduce = useReduced();
  const rx = useMotionValue(0), ry = useMotionValue(0);
  const srx = useSpring(rx, { stiffness: 38, damping: 22, mass: 1 });
  const sry = useSpring(ry, { stiffness: 38, damping: 22, mass: 1 });
  return (
    <FitBox w={700} h={650} className="scene-anim select-none">
      <div
        className="absolute inset-0"
        style={{ perspective: 1600 }}
        onPointerMove={(e) => {
          if (reduce || e.pointerType !== "mouse") return;
          const r = e.currentTarget.getBoundingClientRect();
          ry.set(((e.clientX - r.left) / r.width - 0.5) * 4);
          rx.set(-((e.clientY - r.top) / r.height - 0.5) * 2.5);
        }}
        onPointerLeave={() => { rx.set(0); ry.set(0); }}
      >
        <motion.div className="absolute inset-0" style={reduce ? undefined : { rotateX: srx, rotateY: sry, transformStyle: "preserve-3d" }}>
          <div className="absolute left-0 top-[90px]" style={{ animation: "scene-float 8s ease-in-out infinite alternate", transform: "translateZ(0)" }}><CheckoutWindow phase={phase} /></div>
          <div className="absolute left-[400px] top-[14px]" style={{ animation: "scene-float 7s ease-in-out -2s infinite alternate", transform: "translateZ(60px)" }}><IPhone phase={phase} /></div>
        </motion.div>
      </div>
    </FitBox>
  );
}
