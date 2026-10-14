import { Check, Mail, X } from "lucide-react";
import { PageIntro } from "@/components/marketing/chrome";
import { C } from "@/components/marketing/code";
import { Dots, TableCard, td, wrap } from "@/components/marketing/parts";
import { CtaBand, JsonLd, Section, inlineLink } from "@/components/marketing/pages/pages-kit";
import { TrustDiagram } from "@/components/marketing/pages/trust-diagram";
import { DEMO_HREF } from "@/lib/routes";
import { pageMeta } from "@/lib/site";
import { cn } from "@/lib/cn";

export const metadata = pageMeta({
  title: "Security",
  description: "Plinth's custody model, trust boundaries, contract authorities, current limitations and how to report a vulnerability.",
  path: "/security",
});

const security = process.env.NEXT_PUBLIC_SECURITY_EMAIL;

const POWERS: { actor: string; can: string[]; cannot: string[] }[] = [
  {
    actor: "Merchant (vault owner)",
    can: ["Withdraw from the vault to any address", "Set or change forwarding rules (delayed)", "Transfer ownership (two-step)", "Recover non-USDC tokens sent to their invoice addresses"],
    cannot: ["Change an existing invoice address's destination"],
  },
  {
    actor: "Gateway relayer",
    can: ["Deploy invoice contracts and call sweep()", "Submit customer-signed payment authorisations", "Call the vault's permissionless forward() and policy-activation functions"],
    cannot: ["Withdraw from a vault", "Choose a recipient for any transfer", "Change a vault's owner or settlement rules", "Spend beyond per-network gas budgets"],
  },
  {
    actor: "Anyone",
    can: ["Trigger sweep() on any invoice. Funds can only reach its vault.", "Submit a valid signed authorisation on the customer's behalf"],
    cannot: ["Replay a used authorisation", "Alter invoice, merchant, vault or amount in a signed payment"],
  },
];

const CONTRACTS: [string, string, string][] = [
  ["MerchantVault", "owner only", "withdraw, rescueToken, scheduleSettlement, cancelPendingSettlement. forward() and applyPendingSettlement() are permissionless but cannot choose a recipient or amount."],
  ["VaultFactory", "none", "Vault address commits to merchant, owner and delay, so nobody can squat a vault with a different owner."],
  ["InvoiceDeposit", "none", "Clone with immutable arguments. sweep() moves the full USDC balance to the baked-in vault and reverts on a different chain id."],
  ["InvoiceFactory", "none", "predict() and deployAndSweep(). Requires a registered vault and the implementation code."],
  ["PaymentRouter", "none", "Pulls the customer's EIP-3009 authorization and forwards to the vault. Stateless, holds nothing between transactions."],
];

export default function SecurityPage() {
  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "WebPage", name: "Plinth security model", description: "Custody model, trust boundaries and current limitations of the Plinth gateway." }} />
      <PageIntro eyebrow="Security model" title="Small, immutable contracts. Honest about what is unproven.">
        The design goal is simple: a total compromise of the gateway backend must not let an attacker take merchant funds.
      </PageIntro>
      <div className={cn(wrap, "space-y-24 py-14")}>
        <Section id="boundary" title="Where the trust boundary sits" lead="The gateway is in the middle of every payment and is deliberately given no way to keep or redirect money. The key that controls the vault stays with you.">
          <TrustDiagram />
        </Section>

        <Section id="powers" title="Who can do what">
          <div className="grid gap-4 lg:grid-cols-3">
            {POWERS.map((p) => (
              <article key={p.actor} className="card p-6">
                <h3 className="t-3">{p.actor}</h3>
                <p className="label mt-5">Can</p>
                <ul className="mt-2 space-y-2 text-sm text-ink-2">{p.can.map((c) => <li key={c} className="grid grid-cols-[1.25rem_1fr] gap-1.5"><Check className="mt-0.5 size-4 text-signal" strokeWidth={2.5} aria-hidden />{c}</li>)}</ul>
                <p className="label mt-5">Cannot</p>
                <ul className="mt-2 space-y-2 text-sm text-ink-2">{p.cannot.map((c) => <li key={c} className="grid grid-cols-[1.25rem_1fr] gap-1.5"><X className="mt-0.5 size-4 text-bad" strokeWidth={2.5} aria-hidden />{c}</li>)}</ul>
              </article>
            ))}
          </div>
        </Section>

        <Section id="contracts" title="The contracts" lead="Five contracts, none upgradeable, none with an operator or admin role. Source and tests live in the repository's contracts directory.">
          <TableCard caption="Plinth contracts and their authorities" minWidth="44rem" head={["Contract", "Authority", "What it does"]}>
            {CONTRACTS.map(([n, a, d]) => (
              <tr key={n} className="transition-colors hover:bg-wash">
                <th scope="row" className={cn(td, "whitespace-nowrap text-left font-mono text-[0.8125rem] font-medium text-ink")}>{n}</th>
                <td className={cn(td, "whitespace-nowrap text-ink-2")}>{a}</td>
                <td className={cn(td, "text-ink-2")}>{d}</td>
              </tr>
            ))}
          </TableCard>
          <div className="mt-8 grid gap-x-10 gap-y-8 lg:grid-cols-2">
            <div>
              <h3 className="t-3">Design</h3>
              <Dots className="mt-4" items={[
                <>No proxies you do not control, no upgradeability, no <C>selfdestruct</C>.</>,
                <>Invoice contracts are minimal clones with immutable arguments. Nothing to initialise, so nothing to front-run.</>,
                <>Deposit addresses commit to all of those inputs; changing any changes the address.</>,
                <>Payment authorisations use a nonce derived from every payment field, and the customer&apos;s signature covers it.</>,
                <>Unit, fuzz and invariant suites, plus fork tests against the real USDC bytecode on Arc Testnet and Base Sepolia.</>,
              ]} />
            </div>
            <div>
              <h3 className="t-3">Backend and relayer</h3>
              <Dots className="mt-4" items={[
                <>The relayer key is separate from every merchant authority and sits behind a signer interface designed for KMS or HSM. A KMS adapter is not built yet.</>,
                <>Per-network daily gas budget, per-transaction fee cap, operation cap, minimum balance and an emergency stop for new actions.</>,
                <>A transaction is simulated before it is signed; reverting calls cost nothing.</>,
                <>Every observed transfer is re-verified from its receipt against the configured token and chain before it counts.</>,
                <>Signatures, API secrets and passwords are redacted from logs and audit events.</>,
              ]} />
            </div>
          </div>
          <p className="mt-8 max-w-2xl text-sm text-ink-3">
            Longer write-ups ship in the repository: <C>docs/architecture.md</C>, <C>docs/threat-model.md</C> and <C>docs/verification.md</C> (what was tested and what was not). There is no hosted copy of those documents yet.
          </p>
        </Section>

        <section aria-labelledby="limits-h" className="rounded-panel bg-warn-quiet p-6 sm:p-8">
          <h2 id="limits-h" className="t-2">Current limitations</h2>
          <ul className="mt-5 grid gap-x-10 gap-y-3 text-[0.9375rem] text-warn-ink md:grid-cols-2">
            <li>The contracts have <strong className="font-semibold">not</strong> been independently audited. Commission an audit before enabling any mainnet.</li>
            <li>Mainnet deployment is deliberately not performed by this repository&apos;s tooling without explicit approval per network.</li>
            <li>Wallet checkout supports ordinary accounts; smart-contract wallets need an EIP-1271 path that is not built yet.</li>
            <li>Native-currency transfers to a deposit address on Arc are not event-detected; they surface through balance reconciliation only.</li>
            <li>Stablecoin issuers can block addresses; a blocked vault or invoice cannot receive or sweep funds.</li>
            <li>No live public-testnet acceptance run has been recorded yet, and no SOC 2, ISO or similar certification exists.</li>
          </ul>
        </section>

        <Section id="disclosure" title="Report a vulnerability" lead="If you find a weakness in the contracts, the API or this site, tell us privately first so it can be fixed before it can be used.">
          <div className="grid gap-10 lg:grid-cols-2">
            <div className="space-y-5">
              <p className="flex items-start gap-3 text-[0.9375rem] text-ink-2">
                <Mail className="mt-0.5 size-5 shrink-0 text-ink-2" aria-hidden />
                <span>
                  {security
                    ? <>Email <a className={inlineLink} href={`mailto:${security}`}>{security}</a>.</>
                    : <>The disclosure address is set per deployment (<C>NEXT_PUBLIC_SECURITY_EMAIL</C>) and has not been published yet. The operator must set it before launch.</>}
                </span>
              </p>
              <p className="text-sm text-ink-3">Include what you found, how to reproduce it, the network and any transaction hashes. Do not post it publicly and do not test against funds that are not yours.</p>
            </div>
            <Dots items={[
              <>In scope: the contracts, the API, the hosted checkout and the dashboard.</>,
              <>Out of scope: social engineering, denial-of-service load tests, and issues in third-party services such as RPC providers or the USDC token itself.</>,
              <>There is no bug bounty programme today. A formal safe-harbour statement will be published after legal review.</>,
            ]} />
          </div>
        </Section>

        <CtaBand title="Read it, then break it" actions={[{ href: DEMO_HREF, label: "Try the sandbox", primary: true }, { href: "/developers", label: "Developer docs" }, { href: "/legal/risk-disclosure", label: "Risk disclosure" }]}>
          The sandbox runs on testnets only. Nothing there holds real value.
        </CtaBand>
      </div>
    </>
  );
}
