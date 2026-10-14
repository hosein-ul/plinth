import { ArrowDown, ArrowRight } from "lucide-react";
import { TokenIcon } from "@/components/brand";
import { PageIntro } from "@/components/marketing/chrome";
import { TableCard, td, wrap } from "@/components/marketing/parts";
import { AvailChip, CtaBand, JsonLd, Section, type Availability } from "@/components/marketing/pages/pages-kit";
import { pageMeta } from "@/lib/site";
import { cn } from "@/lib/cn";

export const metadata = pageMeta({
  title: "Pricing",
  description: "How Plinth fees are structured, what is charged today (nothing, on testnets) and how a payment settles. No price list has been published yet.",
  path: "/pricing",
});

const ROWS: { name: string; how: string; state: Availability; today: string }[] = [
  { name: "Processing fee", how: "A percentage of each settled payment, with an optional minimum. The engine has no fee calculation yet, so the design is open.", state: "planned", today: "Not charged, not implemented" },
  { name: "Network fee", how: "The relayer pays the real network fee for deployments and sweeps. Its cost is recorded per operation in the ledger (in USDC on Arc), so it can later be passed through or absorbed.", state: "in-progress", today: "Recorded, not billed" },
  { name: "Dust protection", how: "Deposits below a per-network minimum are not swept automatically unless the invoice is satisfied, so tiny transfers cannot burn gas.", state: "available", today: "Active" },
  { name: "Cross-chain consolidation", how: "Optional CCTP transfers would carry their own protocol fees and a separate lifecycle.", state: "planned", today: "Not built" },
];

const WHO: [string, string][] = [
  ["Your customer", "Pays the amount on the invoice. With wallet checkout they pay no gas; the relayer submits the signed authorization. With the address flow they pay their own transfer gas."],
  ["You, the merchant", "Receive the full swept amount in your vault today. You pay gas yourself only when you move funds out of the vault or change its policy."],
  ["The gateway", "Pays gas for deployments and sweeps and records the cost. No gateway fee is deducted from payments in this build."],
];

const FLOW: { title: string; body: string; note: string }[] = [
  { title: "Customer pays", body: "USDC leaves the customer's wallet for the unique invoice address.", note: "Customer: transfer gas, or none with wallet checkout" },
  { title: "Gateway verifies", body: "The watcher re-reads the receipt, checks the official token and waits for finality.", note: "No fee, no custody" },
  { title: "Relayer sweeps", body: "One transaction deploys the invoice contract if needed and moves the balance to the vault.", note: "Network fee: paid by the relayer, recorded" },
  { title: "Vault receives", body: "The balance is in the vault you own. The settled amount appears in the dashboard.", note: "Processing fee: not applied today" },
];

export default function PricingPage() {
  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "WebPage", name: "Plinth pricing", description: "Fee structure of the Plinth gateway. No price list has been published." }} />
      <PageIntro eyebrow="Pricing" title="A fee model, not a price list yet">
        Nothing is charged in the sandbox, and no production pricing has been published. This page explains what will be priced, what already costs something and who pays it.
      </PageIntro>
      <div className={cn(wrap, "space-y-24 py-14")}>
        <Section id="who-pays" title="Who pays what today" lead="Plinth is testnet-only, so no real money changes hands. The split below describes how costs are structured and recorded.">
          <dl className="grid divide-y divide-line border-y border-line lg:grid-cols-3 lg:divide-x lg:divide-y-0">
            {WHO.map(([k, v]) => (
              <div key={k} className="py-6 lg:px-8 lg:py-8 lg:first:pl-0 lg:last:pr-0">
                <dt className="t-3">{k}</dt>
                <dd className="mt-2 text-[0.9375rem] text-ink-2">{v}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section id="components" title="The fee components">
          <TableCard caption="Pricing components" minWidth="48rem" head={["Component", "How it is applied", "Status", "Today"]}>
            {ROWS.map((r) => (
              <tr key={r.name} className="transition-colors hover:bg-wash">
                <th scope="row" className={cn(td, "w-52 text-left font-medium text-ink")}>{r.name}</th>
                <td className={cn(td, "text-ink-2")}>{r.how}</td>
                <td className={cn(td, "whitespace-nowrap")}><AvailChip state={r.state} /></td>
                <td className={cn(td, "whitespace-nowrap text-ink-2")}>{r.today}</td>
              </tr>
            ))}
          </TableCard>
        </Section>

        <Section id="settle" title="How a payment settles" lead="Where each cost arises along one payment. Nothing here is a number, because there are no published rates to show.">
          <ol className="grid gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] lg:items-stretch">
            {FLOW.flatMap((s, i) => {
              const step = (
                <li key={s.title} className="flex flex-col rounded-card border border-line bg-raised p-5 shadow-low">
                  <span className="tnum grid size-6 place-items-center rounded-full bg-ink text-xs font-medium text-on-ink">{i + 1}</span>
                  <h3 className="t-3 mt-4">{s.title}</h3>
                  <p className="mt-1.5 text-sm text-ink-2">{s.body}</p>
                  <div className="mt-auto pt-5"><p className="border-t border-line pt-3 text-xs font-medium text-ink-3">{s.note}</p></div>
                </li>
              );
              if (i === FLOW.length - 1) return [step];
              return [
                step,
                <li key={`a${i}`} aria-hidden className="grid place-items-center text-ink-4">
                  <ArrowDown className="size-4 lg:hidden" />
                  <ArrowRight className="hidden size-4 lg:block" />
                </li>,
              ];
            })}
          </ol>
          <p className="mt-6 flex items-center gap-2 text-sm text-ink-3"><TokenIcon symbol="USDC" size={18} />Every amount in the diagram is USDC. The vault receives the full swept balance in this build.</p>
        </Section>

        <CtaBand
          title="Want pricing before it is published?"
          actions={[{ href: "/contact", label: "Contact us for early access", primary: true }, { href: "/signup", label: "Create a sandbox account" }]}
        >
          Tell us your volume and chains and we will share the fee model as it develops. Pricing will be published with mainnet availability.
        </CtaBand>
      </div>
    </>
  );
}
