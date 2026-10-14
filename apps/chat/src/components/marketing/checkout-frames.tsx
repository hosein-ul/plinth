import { Check, ChevronRight, Copy, PenLine } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { ChainBadge, TokenIcon, WalletIcon } from "@/components/brand";
import { cn } from "@/lib/cn";

/** Product frames used on the landing page. Illustrations of the real checkout; amounts and addresses are placeholders. */

function Head() {
  return (
    <>
      <div className="flex items-center justify-between text-xs text-ink-3"><span>Checkout</span><ChainBadge id="arc-testnet" size={16} className="text-xs" /></div>
      <div className="tnum mt-3 flex items-center gap-2.5">
        <TokenIcon symbol="USDC" size={28} />
        <span className="text-[2rem] font-medium leading-none tracking-[-0.045em] text-ink">25<span className="text-ink-4">.00</span></span>
        <span className="mt-1.5 text-sm font-medium text-ink-3">USDC</span>
      </div>
    </>
  );
}

function Seg({ active }: { active: "wallet" | "address" }) {
  const on = "rounded-[8px] bg-raised py-1.5 text-ink shadow-[0_1px_2px_rgb(15_23_42/0.12)]";
  return (
    <div className="my-3.5 grid grid-cols-2 rounded-[11px] bg-sunk p-[3px] text-center text-[0.8125rem] font-medium text-ink-3">
      <span className={active === "wallet" ? on : "rounded-[8px] py-1.5"}>Pay with wallet</span>
      <span className={active === "address" ? on : "rounded-[8px] py-1.5"}>Send to address</span>
    </div>
  );
}

export function WalletFrame({ className }: { className?: string }) {
  return (
    <div className={cn("card w-full p-[18px]", className)}>
      <Head />
      <Seg active="wallet" />
      <ul className="space-y-1.5">
        <li className="flex items-center gap-2.5 rounded-[11px] border border-signal/50 bg-signal-quiet/50 px-2.5 py-2">
          <WalletIcon id="metamask" size={28} />
          <span className="text-sm font-medium text-ink">MetaMask</span>
          <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-signal-ink"><Check className="size-3.5" strokeWidth={3} aria-hidden />Connected</span>
        </li>
        <li className="flex items-center gap-2.5 rounded-[11px] border border-line px-2.5 py-2">
          <WalletIcon id="coinbase" size={28} />
          <span className="text-sm text-ink-2">Coinbase Wallet</span>
          <ChevronRight className="ml-auto size-4 text-ink-4" aria-hidden />
        </li>
        <li className="flex items-center gap-2.5 rounded-[11px] border border-line px-2.5 py-2">
          <WalletIcon id="walletconnect" size={28} />
          <span className="text-sm text-ink-2">WalletConnect</span>
          <ChevronRight className="ml-auto size-4 text-ink-4" aria-hidden />
        </li>
      </ul>
      <div className="mt-3 rounded-[11px] bg-wash px-3 py-2.5 font-mono text-2xs leading-5 text-ink-2">
        <span className="text-ink-3">sign</span> ReceiveWithAuthorization<br />
        <span className="text-ink-3">value</span> 25.00 USDC <span className="text-ink-3">to</span> router
      </div>
      <div className="mt-3 flex h-11 items-center justify-center gap-2 rounded-ctl bg-ink text-[0.9375rem] font-medium text-on-ink shadow-btn"><PenLine className="size-4" aria-hidden />Sign and pay</div>
      <p className="mt-2.5 text-center text-xs text-ink-3">One signature. You pay no network fee.</p>
    </div>
  );
}

export function AddressFrame({ className }: { className?: string }) {
  return (
    <div className={cn("card w-full p-[18px]", className)}>
      <Head />
      <Seg active="address" />
      <div className="grid grid-cols-[104px_1fr] items-center gap-3.5">
        <div className="rounded-[12px] border border-line bg-raised p-2"><QRCodeSVG value="plinth-illustration" size={86} level="M" bgColor="transparent" fgColor="#0c1220" /></div>
        <div className="min-w-0">
          <p className="text-2xs text-ink-3">Address for this invoice only</p>
          <p className="mt-1 font-mono text-[0.75rem] leading-[1.6] text-ink-2"><span className="font-medium text-ink">0x8b2c</span>9f41…e07d</p>
          <span className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-lg border border-line-strong px-2 text-xs font-medium text-ink"><Copy className="size-3.5" aria-hidden />Copy</span>
        </div>
      </div>
      <dl className="mt-4 space-y-2 border-t border-line pt-3 text-sm">
        <div className="flex justify-between gap-3"><dt className="text-ink-3">Send exactly</dt><dd className="tnum font-medium text-ink">25.00 USDC</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-ink-3">On network</dt><dd className="text-ink">Arc Testnet</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-ink-3">Network fee</dt><dd className="text-ink-2">paid by the sender</dd></div>
      </dl>
      <p className="mt-3.5 flex items-center gap-2 text-xs text-ink-3"><span aria-hidden className="size-1.5 animate-[live-pulse_1.4s_ease-in-out_infinite] rounded-full bg-signal" />Watching for your transfer</p>
    </div>
  );
}
