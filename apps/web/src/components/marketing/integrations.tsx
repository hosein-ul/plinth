import Link from "next/link";
import { ArrowRight, Code2, FileText, Link2, Package, Store, Webhook } from "lucide-react";
import { Chip } from "@/components/badge";
import { Band } from "@/components/marketing/band";
import { Reveal, RevealHeading } from "@/components/marketing/motion/reveal";
import { Spotlight } from "@/components/marketing/motion/spotlight";
import { wrap } from "@/components/marketing/parts";
import { cn } from "@/lib/cn";

type Icon = typeof Code2;
const AVAILABLE: [Icon, string, string][] = [
  [Store, "Checkout page", "A page per payment with wallet and address flows, ready to link to."],
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
        <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-16">
          <div className="lg:sticky lg:top-28">
            <RevealHeading id="int-h" as="h2" mode="line" className="t-1" parts={[["Integrations, with their real status.", "text-ink"], ["If it is not built, it says so.", "text-ink-4"]]} />
            <Reveal delay={0.1}>
              <div className="mt-6 flex flex-wrap gap-2"><Chip tone="ok">Available</Chip><Chip tone="warn">In progress: none</Chip><Chip>Planned</Chip></div>
              <Link href="/integrations" className="mt-6 inline-flex items-center gap-1.5 text-[0.9375rem] font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">All integrations<ArrowRight className="size-4" aria-hidden /></Link>
            </Reveal>
          </div>

          <div className="min-w-0">
            <Reveal delay={0.05}>
              <Spotlight className="card overflow-hidden">
                <ul className="divide-y divide-line">
                  {AVAILABLE.map(([I, name, text]) => (
                    <li key={name} className="flex items-center gap-4 px-4 py-4 transition-colors duration-[var(--duration-base)] hover:bg-wash/60 sm:gap-5 sm:px-6 sm:py-5">
                      <span className="grid size-12 shrink-0 place-items-center rounded-[14px] bg-sunk text-ink"><I className="size-5" aria-hidden /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[1.0625rem] font-medium tracking-[-0.02em] text-ink">{name}</p>
                        <p className="mt-0.5 text-sm text-ink-3">{text}</p>
                      </div>
                      <Chip tone="ok" className="shrink-0 self-center">Available</Chip>
                    </li>
                  ))}
                </ul>
              </Spotlight>
            </Reveal>
            <ul className="mt-3 grid gap-3 sm:grid-cols-3">
              {PLANNED.map(([I, name, text], i) => (
                <li key={name}>
                  <Reveal delay={0.1 + i * 0.06} className="h-full">
                    <div className={cn("flex h-full flex-col rounded-card border border-dashed border-line-strong p-5")}>
                      <div className="flex items-center justify-between"><I className="size-5 text-ink-3" aria-hidden /><Chip>Planned</Chip></div>
                      <p className="mt-6 text-lg font-semibold text-ink-2">{name}</p>
                      <p className="mt-0.5 text-sm text-ink-3">{text}</p>
                    </div>
                  </Reveal>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Band>
  );
}
