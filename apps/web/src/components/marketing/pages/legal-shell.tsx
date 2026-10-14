import Link from "next/link";
import { PageIntro } from "@/components/marketing/chrome";
import { wrap } from "@/components/marketing/parts";
import { DraftBanner, Prose } from "@/components/marketing/pages/pages-kit";
import { LEGAL_UPDATED } from "@/lib/site";
import { cn } from "@/lib/cn";

const LEGAL_NAV = [
  { href: "/legal/terms", label: "Terms of service" },
  { href: "/legal/privacy", label: "Privacy policy" },
  { href: "/legal/risk-disclosure", label: "Risk disclosure" },
];

/** Shared frame for the draft legal pages: intro, mandatory draft banner, sibling navigation and prose. */
export function LegalShell({ title, intro, current, openItems, children }: { title: string; intro: string; current: string; openItems: string[]; children: React.ReactNode }) {
  return (
    <>
      <PageIntro eyebrow="Legal" title={title}>{intro}</PageIntro>
      <div className={cn(wrap, "grid gap-10 py-14 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-16")}>
        <nav aria-label="Legal pages" className="lg:sticky lg:top-24 lg:self-start">
          <ul className="flex flex-wrap gap-1.5 lg:flex-col">
            {LEGAL_NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href} aria-current={n.href === current ? "page" : undefined} className={cn("block rounded-ctl border px-3 py-1.5 text-sm font-medium transition-colors", n.href === current ? "border-line bg-raised text-ink shadow-ctl" : "border-transparent text-ink-3 hover:bg-sunk hover:text-ink")}>{n.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <article className="min-w-0 space-y-8">
          <DraftBanner updated={LEGAL_UPDATED}>
            Written in plain English from what the product does today. It must be reviewed by qualified counsel and completed by the operator before it is relied on.
          </DraftBanner>
          <aside aria-label="Open items" className="max-w-2xl rounded-card border border-line bg-raised p-5 text-sm text-ink-2">
            <p className="font-semibold text-ink">Open items for the operator</p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">{openItems.map((o) => <li key={o}>{o}</li>)}</ul>
          </aside>
          <Prose>{children}</Prose>
        </article>
      </div>
    </>
  );
}
