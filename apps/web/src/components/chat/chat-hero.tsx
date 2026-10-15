import Link from "next/link";
import { ArrowRight, Lock, Network, Zap } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { HeroVideo } from "@/components/marketing/hero-video";
import { wrap } from "@/components/marketing/parts";
import { DEMO_HREF } from "@/lib/routes";
import { ChatPhone } from "@/components/chat/chat-phone";
import { HeroScene } from "@/components/chat/hero-scene";
import { TelegramMark } from "@/components/chat/telegram-mark";

const POINTS = [
  [Network, "USDC on the network your buyer uses"],
  [Zap, "No gas for your customer"],
  [Lock, "Money goes to your own vault"],
] as const;

/**
 * The landing hero. The copy is plain server-rendered text, visible from the first paint. Behind it the looping glass wave
 * (the poster paints at once and stays where autoplay is blocked). On a wide screen the visual is two channels side by side, a
 * browser checkout and a chat; below that it is the chat phone on its own. Telegram is where the product starts, not where it stops.
 */
export function ChatHero() {
  const second = "wherever you already sell.".split(" ");
  return (
    <section className="relative isolate overflow-clip bg-white">
      <HeroVideo />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-28 bg-gradient-to-b from-transparent to-ground" />
      <div className={`${wrap} relative z-[1] grid items-center gap-x-8 gap-y-14 pb-20 pt-12 xl:grid-cols-[minmax(0,33rem)_minmax(0,1fr)] xl:pb-28 xl:pt-20`}>
        <div className="relative z-10">
          <p className="inline-flex items-center gap-2.5 rounded-full border border-line bg-raised py-1.5 pl-2 pr-4 text-sm font-medium text-ink-2 shadow-low">
            <TelegramMark size={22} />Telegram bots, Mini Apps, web shops and links
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
            In a chat, a Mini App, a web shop or a plain link, Plinth charges every order automatically, in USDC, on the network your customer already uses. The money lands in a vault only you can open.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/signup" className={`${buttonStyles({ variant: "primary", size: "lg" })} h-12 px-5`}>Get started<ArrowRight className="size-4" aria-hidden /></Link>
            <Link href={DEMO_HREF} className="inline-flex h-10 items-center rounded-ctl border border-line-strong bg-raised px-4 text-sm font-medium text-ink-2 shadow-ctl transition-colors hover:bg-wash hover:text-ink">Live demo</Link>
          </div>
          <ul className="mt-10 grid max-w-[31rem] gap-3 text-sm text-ink-2 sm:grid-cols-3 sm:gap-4">
            {POINTS.map(([I, t]) => <li key={t} className="flex items-start gap-2"><I className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />{t}</li>)}
          </ul>
        </div>

        <div className="relative z-10 select-none">
          <div className="hidden xl:block"><HeroScene /></div>
          <div className="relative xl:hidden">
            <ChatPhone />
          </div>
        </div>
      </div>
    </section>
  );
}
