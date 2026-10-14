import { Plus } from "lucide-react";
import { PageIntro } from "@/components/marketing/chrome";
import { wrap } from "@/components/marketing/parts";
import { CtaBand, JsonLd } from "@/components/marketing/pages/pages-kit";
import { ALL_FAQ, FAQ_GROUPS } from "@/components/marketing/pages/faq-data";
import { pageMeta } from "@/lib/site";
import { cn } from "@/lib/cn";

export const metadata = pageMeta({
  title: "FAQ",
  description: "Straight answers about Plinth: custody, supported tokens and networks, settlement, fees, webhooks, audit status and compliance.",
  path: "/faq",
});

export default function FaqPage() {
  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: ALL_FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }} />
      <PageIntro eyebrow="FAQ" title="Questions, answered without spin">
        {ALL_FAQ.length} answers drawn from what the product does today. Where the honest answer is no, the answer says no.
      </PageIntro>
      <div className={cn(wrap, "grid gap-10 py-14 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-16")}>
        <nav aria-label="Question groups" className="-mx-5 overflow-x-auto px-5 sm:-mx-8 sm:px-8 lg:mx-0 lg:overflow-visible lg:px-0">
          <ul className="flex w-max gap-1.5 lg:sticky lg:top-24 lg:w-auto lg:flex-col">
            {FAQ_GROUPS.map((g) => (
              <li key={g.id}>
                <a href={`#${g.id}`} className="block whitespace-nowrap rounded-ctl px-3 py-1.5 text-sm font-medium text-ink-3 transition-colors hover:bg-sunk hover:text-ink">{g.title}</a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-16">
          {FAQ_GROUPS.map((g) => (
            <section key={g.id} id={g.id} aria-labelledby={`${g.id}-h`} className="scroll-mt-28">
              <h2 id={`${g.id}-h`} className="t-2">{g.title}</h2>
              <div className="mt-6 divide-y divide-line border-y border-line">
                {g.items.map((f) => (
                  <details key={f.q} className="group py-1">
                    <summary className="flex cursor-pointer list-none items-start justify-between gap-6 rounded-ctl py-4 text-left text-[1.0625rem] font-medium tracking-[-0.01em] text-ink marker:content-none [&::-webkit-details-marker]:hidden">
                      <span>{f.q}</span>
                      <Plus className="mt-1 size-4 shrink-0 text-ink-3 transition-transform duration-[var(--duration-fast)] ease-[var(--ease-snap)] group-open:rotate-45" aria-hidden />
                    </summary>
                    <p className="max-w-2xl pb-5 pr-10 text-[0.9375rem] text-ink-2">{f.a}</p>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
      <div className={cn(wrap, "pb-4")}>
        <CtaBand title="Still not answered?" actions={[{ href: "/contact", label: "Ask us directly", primary: true }, { href: "/security", label: "Read the security model" }]}>
          Include the payment ID, network and transaction hash if your question is about a specific payment.
        </CtaBand>
      </div>
    </>
  );
}
