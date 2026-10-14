import Link from "next/link";
import { Chip } from "@/components/badge";
import { Band } from "@/components/marketing/band";
import { ShaderField } from "@/components/marketing/shader-field";
import { SHADER_COLORS } from "@/components/marketing/shader-colors";
import { ClipReveal } from "@/components/marketing/motion/clip-reveal";
import { TextAnimate } from "@/components/magicui/text-animate";
import { Reveal } from "@/components/marketing/motion/reveal";
import { wrap } from "@/components/marketing/parts";

const FACTS: { chip: [tone: "info" | "warn" | "neutral" | "ok", label: string]; title: string; text: string }[] = [
  { chip: ["info", "Testnet only"], title: "No real money moves", text: "Every network that runs today is a test network. Test USDC has no value." },
  { chip: ["warn", "Unaudited"], title: "Contracts have not been independently audited", text: "They are tested, and the tests run against real chains, but no outside firm has reviewed them." },
  { chip: ["neutral", "Mainnet off"], title: "Mainnet needs explicit approval", text: "It is disabled by default and requires an operator to enable it, network by network." },
  { chip: ["neutral", "No customers"], title: "Nobody uses it in production yet", text: "There are no customer logos, volume figures or testimonials here because there is nothing true to put in them." },
  { chip: ["neutral", "No history"], title: "No uptime record, no price list", text: "Status is live but short-lived. Pricing is a structure, not a published number." },
];

export function WhereWeStand() {
  return (
    <Band tone="dark" labelledBy="stand-h" className="[--grid-x:15%] [--grid-y:35%]" backdrop={<><div className="absolute inset-0 opacity-80 [mask-image:linear-gradient(180deg,transparent,#000_30%,#000)]"><ShaderField preset="mesh" colors={SHADER_COLORS["mesh-dark"]!} spotlight={false} seed={5} /></div></>}>
      <div className={wrap}>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <h2 id="stand-h" className="t-1 text-on-ink">
              <TextAnimate as="span" by="word" animation="slideUp" duration={0.5} once className="block">Where Plinth stands.</TextAnimate>
              <TextAnimate as="span" by="word" animation="slideUp" duration={0.5} delay={0.3} once className="block text-white/45" aria-hidden>Early, working, and honest about it.</TextAnimate>
            </h2>
            <Reveal delay={0.1}>
              <p className="mt-6 max-w-md text-lg text-white/65">A payments product should say plainly what it has not done. This is that list. It will change as the product does.</p>
              <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[0.9375rem] font-medium">
                {([["Security model", "/security"], ["Live status", "/status"], ["Pricing", "/pricing"], ["Risk disclosure", "/legal/risk-disclosure"]] as const).map(([l, h]) => (
                  <Link key={h} href={h} className="text-on-ink underline decoration-white/30 underline-offset-4 hover:decoration-white">{l}</Link>
                ))}
              </div>
            </Reveal>
          </div>
          <ul className="border-b border-white/10">
            {FACTS.map((f, i) => (
              <ClipReveal as="li" key={f.title} variant="inset-x" delay={i * 0.08} duration={1}>
                <div className="grid gap-3 border-t border-white/10 py-6 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-6">
                  <div className="sm:pt-0.5"><Chip tone={f.chip[0]}>{f.chip[1]}</Chip></div>
                  <div><h3 className="text-[1.125rem] font-medium tracking-[-0.02em] text-on-ink">{f.title}</h3><p className="mt-1 text-[0.9375rem] text-white/60">{f.text}</p></div>
                </div>
              </ClipReveal>
            ))}
          </ul>
        </div>
      </div>
    </Band>
  );
}
