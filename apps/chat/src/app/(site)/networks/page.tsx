import { NETWORKS, type NetworkConfig } from "@plinth/shared";
import { ChainIcon, TokenIcon } from "@/components/brand";
import { PageIntro } from "@/components/marketing/chrome";
import { C } from "@/components/marketing/code";
import { H2, wrap } from "@/components/marketing/parts";
import { CtaBand, JsonLd, Section } from "@/components/marketing/pages/pages-kit";
import { NetworkExplorer, type NetDTO } from "@/components/marketing/pages/network-explorer";
import { DEMO_HREF } from "@/lib/routes";
import { pageMeta } from "@/lib/site";
import { cn } from "@/lib/cn";

export const metadata = pageMeta({
  title: "Networks",
  description: "Every network in the Plinth registry: official USDC contract, finality policy, gas model, verified capabilities and enablement status.",
  path: "/networks",
});

function toDTO(n: NetworkConfig): NetDTO {
  return {
    id: n.id,
    name: n.name,
    chainId: n.chainId,
    environment: n.environment,
    nativeSymbol: n.nativeCurrency.symbol,
    usdc: n.usdc.address,
    explorer: n.explorerUrl,
    finality: n.finality.strategy === "finalized-tag" ? "Finalized block" : n.finality.confirmations === 1 ? "1 confirmation" : `${n.finality.confirmations} confirmations`,
    finalityNote: n.finality.note,
    gas: n.gas.model === "usdc-native" ? "Paid in USDC (native)" : `Paid in ${n.nativeCurrency.symbol}`,
    verified: n.authorization.verified,
    verifiedAt: n.authorization.verifiedAt,
    cctp: n.circle.cctpDomain,
    rpcConfigured: n.rpcUrls.length > 0,
  };
}

export default function NetworksPage() {
  const all = Object.values(NETWORKS);
  const nets = all.map(toDTO);
  const tests = all.filter((n) => n.environment === "testnet");
  const mains = all.filter((n) => n.environment === "mainnet");
  const verified = all.filter((n) => n.authorization.verified).length;

  const stats: [string, string][] = [
    [String(all.length), "networks in the registry"],
    [String(tests.length), "testnets, where Plinth runs"],
    [String(mains.length), "mainnets, disabled by default"],
    [`${verified} of ${all.length}`, "tokens probed on-chain"],
  ];

  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "WebPage", name: "Plinth supported networks", description: "Networks in the Plinth registry with official USDC contracts." }} />
      <PageIntro eyebrow="Network registry" title="One token. Official addresses only.">
        Plinth accepts USDC and nothing else. Each address comes from Circle&apos;s published list, and before a network can be enabled its token is probed on-chain and the Plinth contracts are deployed and byte-verified.
      </PageIntro>
      <div className={cn(wrap, "space-y-20 py-14")}>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3" aria-label="Chains in the registry">
          <ul className="flex -space-x-2" aria-hidden>
            {all.map((n) => <li key={n.id} className="rounded-full ring-2 ring-ground"><ChainIcon id={n.id} size={32} testnet={n.environment === "testnet"} /></li>)}
          </ul>
          <span className="inline-flex items-center gap-2 text-sm font-medium text-ink"><TokenIcon symbol="USDC" size={32} />USDC</span>
          <p className="text-sm text-ink-3">USDC only. No other token is counted as a payment; a different token sent to a deposit address is recorded as the wrong asset and never swept.</p>
        </div>

        <dl className="grid grid-cols-2 gap-y-8 border-y border-line py-8 lg:grid-cols-4">
          {stats.map(([v, l]) => (
            <div key={l} className="px-1 lg:px-6 lg:first:pl-0">
              <dt className="sr-only">{l}</dt>
              <dd className="tnum text-3xl font-medium tracking-[-0.03em] text-ink">{v}</dd>
              <dd className="mt-1 text-sm text-ink-3" aria-hidden>{l}</dd>
            </div>
          ))}
        </dl>

        <NetworkExplorer nets={nets} />

        <div className="rounded-panel bg-warn-quiet p-6 text-sm text-warn-ink sm:p-8">
          <h2 className="t-3 text-warn-ink">What this page does not claim</h2>
          <ul className="mt-3 grid gap-x-10 gap-y-2 md:grid-cols-2">
            <li>No Plinth contract address is listed because no verified deployment record is committed to this repository yet. Addresses will appear here once a network is deployed and byte-verified.</li>
            <li>Mainnets are configured and probed read-only. Nothing has been deployed to any mainnet, and the contracts are not independently audited.</li>
            <li>Polygon PoS has an official address recorded but its token has not been probed, so it cannot be enabled.</li>
            <li>The Base Sepolia contracts are not deployed yet. The live acceptance run on a public testnet is still pending.</li>
          </ul>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section id="enable" title="How a network is enabled">
            <ol className="space-y-4 text-[0.9375rem] text-ink-2">
              {[
                <>Add it to the registry with the official USDC address and chain ID.</>,
                <>Probe the token: <C>receiveWithAuthorization</C>, the EIP-712 domain and decimals.</>,
                <>Deploy the factories and router, then compare on-chain bytecode with the build artifacts.</>,
                <>Pass the standard integration suite against that network.</>,
                <>An operator lists it in <C>ENABLED_NETWORKS</C>. Mainnets also need <C>ALLOW_MAINNET</C> and a recorded, explicit deployment approval.</>,
              ].map((s, i) => (
                <li key={i} className="grid grid-cols-[1.75rem_1fr] gap-3"><span className="tnum grid size-6 place-items-center rounded-full bg-sunk text-xs font-medium text-ink-2">{i + 1}</span><span>{s}</span></li>
              ))}
            </ol>
          </Section>
          <section aria-labelledby="circle-h">
            <H2 id="circle-h">Circle services</H2>
            <dl className="mt-8 divide-y divide-line text-sm">
              <div className="grid gap-1 py-4 first:pt-0 sm:grid-cols-[10rem_1fr] sm:gap-4"><dt className="font-medium text-ink">USDC and EIP-3009</dt><dd className="text-ink-3">Used. Wallet checkout signs one <C>receiveWithAuthorization</C>; the relayer pays gas.</dd></div>
              <div className="grid gap-1 py-4 sm:grid-cols-[10rem_1fr] sm:gap-4"><dt className="font-medium text-ink">CCTP</dt><dd className="text-ink-3">Domains are recorded per network. Optional cross-chain consolidation is designed as a separate lifecycle and is not implemented.</dd></div>
              <div className="grid gap-1 py-4 sm:grid-cols-[10rem_1fr] sm:gap-4"><dt className="font-medium text-ink">Gateway / Nanopayments</dt><dd className="text-ink-3">A different, signed-payment and batched-settlement model. Not used by invoice checkout and not integrated.</dd></div>
              <div className="grid gap-1 py-4 last:pb-0 sm:grid-cols-[10rem_1fr] sm:gap-4"><dt className="font-medium text-ink">Gas Station</dt><dd className="text-ink-3">Applies to smart-contract-account Circle Wallets only. Not used: payers are ordinary accounts and the Plinth relayer pays gas directly.</dd></div>
            </dl>
          </section>
        </div>

        <CtaBand
          title="See a payment cross a network"
          actions={[{ href: DEMO_HREF, label: "Try the demo", primary: true }, { href: "/status", label: "Live network status" }]}
        >
          The demo runs a sandbox payment end to end. Live RPC, watcher and relayer state for each network is on the status page.
        </CtaBand>
      </div>
    </>
  );
}
