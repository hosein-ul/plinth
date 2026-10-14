import { History } from "lucide-react";
import { api } from "@/lib/server-api";
import { ChainIcon } from "@/components/brand";
import { PageIntro } from "@/components/marketing/chrome";
import { TableCard, td, wrap } from "@/components/marketing/parts";
import { CtaBand, Section } from "@/components/marketing/pages/pages-kit";
import { Chip } from "@/components/badge";
import { pageMeta } from "@/lib/site";
import { cn } from "@/lib/cn";

export const metadata = pageMeta({
  title: "Status",
  description: "Live network-by-network status of the Plinth gateway: RPC reachability, watcher progress and relayer state.",
  path: "/status",
});
export const dynamic = "force-dynamic";

interface NetStatus {
  id: string; name: string; environment: string; operational: boolean; rpc: string; head_block: string | null; scanned_block: string | null; relayer: string; wallet_checkout: boolean; address_checkout: boolean;
}

export default async function StatusPage() {
  let data: { checked_at: string; networks: NetStatus[] } | null = null;
  try {
    data = await api("/public/status", { auth: false });
  } catch {
    data = null;
  }
  const up = data ? data.networks.filter((n) => n.operational && n.rpc === "ok").length : 0;
  const total = data?.networks.length ?? 0;
  const allOk = !!data && total > 0 && up === total;

  return (
    <>
      <PageIntro eyebrow="Live status" title={data ? "Network by network" : "Status is unavailable right now"}>
        {data
          ? <>Checked {new Date(data.checked_at).toUTCString()}. This page reads the same signals the workers use: RPC reachability, watcher progress and relayer state.</>
          : "The status API could not be reached. If you are integrating, retry shortly."}
      </PageIntro>
      <div className={cn(wrap, "space-y-20 py-14")}>
        {data && (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2" role="status">
              <Chip tone={allOk ? "ok" : "warn"} pulse={allOk}>{allOk ? "All enabled networks operational" : `${up} of ${total} networks fully operational`}</Chip>
              <span className="text-sm text-ink-3">Networks that are disabled are listed and counted as not operational.</span>
            </div>
            <TableCard caption="Per-network status" minWidth="52rem" head={["Network", "State", "RPC", "Head", "Watcher", "Relayer", "Checkout"]}>
              {data.networks.map((n) => {
                const lag = n.head_block && n.scanned_block ? Number(BigInt(n.head_block) - BigInt(n.scanned_block)) : null;
                return (
                  <tr key={n.id} className="transition-colors hover:bg-wash">
                    <th scope="row" className={cn(td, "text-left font-medium text-ink")}>
                      <span className="flex items-center gap-2.5 whitespace-nowrap"><ChainIcon id={n.id} size={24} testnet={n.environment === "testnet"} />{n.name}</span>
                      <span className="mt-0.5 block pl-[34px] text-xs font-normal text-ink-3">{n.environment}</span>
                    </th>
                    <td className={td}><Chip tone={n.operational ? "ok" : "neutral"}>{n.operational ? "operational" : "disabled"}</Chip></td>
                    <td className={td}><Chip tone={n.rpc === "ok" ? "ok" : "bad"}>{n.rpc}</Chip></td>
                    <td className={cn(td, "tnum font-mono text-xs text-ink-2")}>{n.head_block ?? "—"}</td>
                    <td className={cn(td, "whitespace-nowrap text-ink-2")}>{lag === null ? "—" : lag <= 2 ? "caught up" : `${lag} blocks behind`}</td>
                    <td className={td}><Chip tone={n.relayer === "active" ? "ok" : n.relayer === "paused" ? "warn" : "neutral"}>{n.relayer}</Chip></td>
                    <td className={cn(td, "whitespace-nowrap text-ink-2")}>{[n.address_checkout && "address", n.wallet_checkout && "wallet"].filter(Boolean).join(" and ") || "—"}</td>
                  </tr>
                );
              })}
            </TableCard>
          </>
        )}

        <Section id="history" title="Incident history">
          <div className="dotgrid flex max-w-2xl items-start gap-4 rounded-panel border border-line bg-raised p-6 sm:p-8">
            <History className="mt-0.5 size-5 shrink-0 text-ink-3" aria-hidden />
            <div>
              <p className="font-medium text-ink">History not published yet</p>
              <p className="mt-1.5 text-[0.9375rem] text-ink-2">
                Plinth has no incident log or uptime measurement to publish. This page shows current state only, and it will list incidents here once there is a record to show. An empty list would imply a clean history we cannot demonstrate.
              </p>
            </div>
          </div>
        </Section>

        <CtaBand title="Seeing something wrong?" actions={[{ href: "/contact", label: "Contact support", primary: true }, { href: "/networks", label: "Network registry" }]}>
          Send the payment ID, the network and the transaction hash and we can trace the payment end to end.
        </CtaBand>
      </div>
    </>
  );
}
