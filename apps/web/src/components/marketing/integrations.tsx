import Link from "next/link";
import { ArrowRight, Code2, FileText, Link2, Package, Store, Webhook } from "lucide-react";
import { Chip } from "@/components/badge";
import { Band } from "@/components/marketing/band";
import { HorizontalScroll } from "@/components/marketing/motion/hscroll";
import { Reveal, RevealHeading } from "@/components/marketing/motion/reveal";
import { Spotlight } from "@/components/marketing/motion/spotlight";
import { Tilt } from "@/components/marketing/motion/tilt";
import { wrap } from "@/components/marketing/parts";
import { cn } from "@/lib/cn";

type Icon = typeof Code2;
const AVAILABLE: [Icon, string, string][] = [
  [Store, "Hosted checkout", "A page per payment with wallet and address flows, ready to link to."],
  [Link2, "Payment links", "Reusable links for a fixed amount, no code needed."],
  [FileText, "Invoices", "Numbered invoices, each with its own address."],
  [Code2, "REST API", "Versioned under /v1 with an OpenAPI 3.1 document."],
  [Webhook, "Webhooks", "Signed, retried, logged, with manual replay."],
];
const PLANNED: [Icon, string, string][] = [
  [Store, "Shopify", "Not built."],
  [Store, "WooCommerce", "Not built."],
  [Package, "SDKs", "Not published. The REST API works from any language today."],
];

export function Integrations() {
  return (
    <Band tone="light" labelledBy="int-h">
      <div className={wrap}>
        <HorizontalScroll
          head={
            <div>
              <RevealHeading id="int-h" as="h2" mode="line" className="t-1" parts={[["Integrations, with their real status.", "text-ink"], ["If it is not built, it says so.", "text-ink-4"]]} />
              <Reveal delay={0.1}>
                <div className="mt-6 flex flex-wrap gap-2"><Chip tone="ok">Available</Chip><Chip tone="warn">In progress: none</Chip><Chip>Planned</Chip></div>
                <Link href="/integrations" className="mt-6 inline-flex items-center gap-1.5 text-[0.9375rem] font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">All integrations<ArrowRight className="size-4" aria-hidden /></Link>
              </Reveal>
            </div>
          }
          trackClassName="lg:py-6 lg:pr-6"
        >
          {AVAILABLE.map(([I, name, text], i) => (
            <Tilt key={name} className="lg:w-[19rem] lg:shrink-0" max={3} lift={5}>
              <Spotlight className="card flex h-full flex-col p-6 lg:min-h-[19rem]">
                <div className="flex items-start justify-between">
                  <span className="grid size-11 place-items-center rounded-[12px] bg-sunk text-ink"><I className="size-5" aria-hidden /></span>
                  <span className="tnum font-mono text-2xs text-ink-4">0{i + 1} / 0{AVAILABLE.length}</span>
                </div>
                <p className="mt-auto pt-10 text-[1.375rem] font-medium tracking-[-0.03em] text-ink">{name}</p>
                <p className="mt-1.5 text-sm text-ink-3">{text}</p>
                <Chip tone="ok" className="mt-5 self-start">Available</Chip>
              </Spotlight>
            </Tilt>
          ))}
          {PLANNED.map(([I, name, text]) => (
            <div key={name} className={cn("flex flex-col rounded-card border border-dashed border-line-strong p-6 lg:min-h-[19rem] lg:w-[15rem] lg:shrink-0")}>
              <div className="flex items-center justify-between"><I className="size-5 text-ink-3" aria-hidden /><Chip>Planned</Chip></div>
              <p className="mt-auto pt-10 text-lg font-semibold text-ink-2">{name}</p>
              <p className="mt-0.5 text-sm text-ink-3">{text}</p>
            </div>
          ))}
        </HorizontalScroll>
      </div>
    </Band>
  );
}
