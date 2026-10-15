import Link from "next/link";
import { ArrowRight, Lock, Network, Zap } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { ShaderField } from "@/components/marketing/shader-field";
import { SHADER_COLORS } from "@/components/marketing/shader-colors";
import { wrap } from "@/components/marketing/parts";
import { ChatPhone } from "@/components/chat/chat-phone";
import { TelegramMark } from "@/components/chat/telegram-mark";

const POINTS = [
  [Network, "Every network that has USDC"],
  [Zap, "No gas for your customer"],
  [Lock, "Money goes to your own vault"],
] as const;

/** Copy is plain server-rendered text. The Telegram mark is large on purpose: this page is about that audience. */
export function ChatHero() {
  const second = "where a billion people already chat.".split(" ");
  return (
    <section className="relative isolate overflow-clip bg-ground">
      <div aria-hidden className="absolute inset-y-0 right-0 z-0 w-[min(72rem,86vw)] [mask-image:radial-gradient(80%_80%_at_62%_46%,#000,transparent_82%)]">
        <ShaderField preset="dither" colors={SHADER_COLORS["dither-light"]!} pixel={5} speed={1} className="opacity-[0.3]" />
      </div>
      <div className={`${wrap} relative z-[1] grid items-center gap-x-10 gap-y-14 pb-20 pt-12 lg:grid-cols-[minmax(0,33rem)_minmax(0,1fr)] xl:pb-28 xl:pt-20`}>
        <div className="relative z-10">
          <p className="inline-flex items-center gap-2.5 rounded-full border border-line bg-raised py-1.5 pl-2 pr-4 text-sm font-medium text-ink-2 shadow-low">
            <TelegramMark size={22} />The payment layer for businesses selling in Telegram
          </p>
          <h1 className="t-display mt-6 text-[clamp(2.75rem,4.6vw,4.4rem)] text-ink">
            <span className="block">Get paid in USDC,</span>
            <span className="block text-ink-4">
              {second.map((w, i) => (
                <span key={w + i} className="hero-line-in inline-block whitespace-pre" style={{ animation: `hero-line-in 0.9s cubic-bezier(0.16,1,0.3,1) ${0.15 + i * 0.1}s both` }}>{w}{i < second.length - 1 ? " " : ""}</span>
              ))}
            </span>
          </h1>
          <p className="mt-6 max-w-[31rem] text-lg text-ink-2">
            Mini Apps, shops and resellers in Telegram still collect money by hand. Plinth is a non-custodial gateway that charges every order automatically, in USDC, on every network that has it. The money lands in a vault only the seller can open.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/signup" className={`${buttonStyles({ variant: "primary", size: "lg" })} h-12 px-5`}>Try the sandbox<ArrowRight className="size-4" aria-hidden /></Link>
            <Link href="/build-with-ai" className="inline-flex h-12 items-center rounded-ctl border border-line-strong bg-raised px-5 text-[0.9375rem] font-medium text-ink shadow-ctl transition-colors hover:bg-wash">Add it with your AI assistant</Link>
          </div>
          <ul className="mt-10 grid max-w-[31rem] gap-3 text-sm text-ink-2 sm:grid-cols-3 sm:gap-4">
            {POINTS.map(([I, t]) => <li key={t} className="flex items-start gap-2"><I className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />{t}</li>)}
          </ul>
        </div>

        <div className="relative z-10 select-none">
          <div aria-hidden className="pointer-events-none absolute left-1/2 top-[42%] -z-10 size-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#26a5e4]/25" style={{ boxShadow: "0 0 0 4.5rem rgb(38 165 228 / 0.05), 0 0 0 9rem rgb(38 165 228 / 0.03)" }} />
          <ChatPhone />
        </div>
      </div>
    </section>
  );
}
