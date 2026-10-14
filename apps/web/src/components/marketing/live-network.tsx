import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { ChainIcon } from "@/components/brand";
import { API_URL } from "@/lib/server-api";
import { Band } from "@/components/marketing/band";
import { ShaderField } from "@/components/marketing/shader-field";
import { SHADER_COLORS } from "@/components/marketing/shader-colors";
import { wrap } from "@/components/marketing/parts";
import { Reveal, RevealHeading } from "@/components/marketing/motion/reveal";
import { Spotlight } from "@/components/marketing/motion/spotlight";
import { Ticker } from "@/components/marketing/motion/ticker";
import { cn } from "@/lib/cn";

interface NetStatus {
  id: string;
  name: string;
  chain_id: number;
  environment: "testnet" | "mainnet";
  operational: boolean;
  rpc: string;
  head_block: string | null;
  scanned_block: string | null;
  relayer: string;
  wallet_checkout: boolean;
  address_checkout: boolean;
}
interface PublicStatus { checked_at: string; networks: NetStatus[] }

/** Server-side read of the public status endpoint, cached briefly. Returns null on any failure. */
async function readStatus(): Promise<PublicStatus | null> {
  try {
    const res = await fetch(`${API_URL}/public/status`, { next: { revalidate: 15 }, signal: AbortSignal.timeout(2500) });
    if (!res.ok) return null;
    const j = (await res.json()) as PublicStatus;
    return Array.isArray(j.networks) ? j : null;
  } catch {
    return null;
  }
}

const utc = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} UTC`;
};

function Metric({ label, children, tone }: { label: string; children: React.ReactNode; tone?: "ok" | "bad" | "idle" }) {
  return (
    <div className="min-w-0">
      <p className="text-2xs text-white/45">{label}</p>
      <p className="mt-1 flex items-center gap-1.5 truncate text-sm font-medium text-white">
        {tone && <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", tone === "ok" ? "animate-[live-pulse_2s_ease-in-out_infinite] bg-signal" : tone === "bad" ? "bg-[#f87171]" : "bg-white/35")} />}
        {children}
      </p>
    </div>
  );
}

export async function LiveNetwork() {
  const status = await readStatus();
  /* No reading, no block: an empty "unavailable" panel on a marketing page says nothing useful. */
  if (!status || status.networks.length === 0) return null;
  return (
    <Band tone="dark" shape="leaf-a" labelledBy="live-h" className="[--grid-x:20%] [--grid-y:10%]" backdrop={<><div className="absolute inset-0 opacity-[0.55] [mask-image:radial-gradient(70%_90%_at_88%_20%,#000,transparent_75%)]"><ShaderField preset="dither" colors={SHADER_COLORS["dither-dark"]!} spotlight={false} seed={3} pixel={5} /></div></>}>
      
      <div className={wrap}>
        <div>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:items-end">
            <div>
              <p className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-white/60">
                <span aria-hidden className="size-2 animate-[live-pulse_2s_ease-in-out_infinite] rounded-full bg-signal" />Live from the network
              </p>
              <RevealHeading id="live-h" as="h2" mode="line" className="t-1 text-on-ink" parts={[["Running right now.", "text-on-ink"], ["Read from the live stack.", "text-white/45"]]} />
            </div>
            <Reveal delay={0.1}>
              <p className="max-w-md text-[0.9375rem] text-white/65">
                Whether each network is operational, the latest block, how far the scanner has read and whether the relayer is awake, straight from the public status endpoint.
              </p>
            </Reveal>
          </div>

          <div className="mt-12 space-y-3">
            {status && status.networks.length > 0 ? (
              status.networks.map((n, i) => {
                const head = n.head_block ? Number(n.head_block) : null;
                const scanned = n.scanned_block ? Number(n.scanned_block) : null;
                const lag = head !== null && scanned !== null ? Math.max(0, head - scanned) : null;
                return (
                  <Reveal key={n.id} delay={i * 0.06}>
                    <Spotlight dark className="rounded-card border border-white/10 bg-white/[0.04] p-5 sm:p-6">
                      <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(0,1fr))] lg:items-center">
                        <div className="flex min-w-0 items-center gap-3">
                          <ChainIcon id={n.id} size={34} testnet={n.environment === "testnet"} />
                          <div className="min-w-0">
                            <p className="truncate text-[1.0625rem] font-medium tracking-[-0.02em]">{n.name}</p>
                            <p className="font-mono text-2xs text-white/45">chain {n.chain_id} · {n.environment}</p>
                          </div>
                        </div>
                        <Metric label="State" tone={n.operational ? "ok" : "bad"}>{n.operational ? "Operational" : "Not operational"}</Metric>
                        <Metric label="Latest block">{head !== null ? <Ticker value={head} className="tnum font-mono" /> : "unknown"}</Metric>
                        <Metric label="Scanner">{lag === null ? "unknown" : lag === 0 ? "Caught up" : `${lag.toLocaleString("en-US")} behind`}</Metric>
                        <Metric label="Relayer" tone={n.relayer === "active" ? "ok" : "idle"}>{n.relayer.charAt(0).toUpperCase() + n.relayer.slice(1)}</Metric>
                      </div>
                      <div className="mt-5 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-white/10 pt-4 text-xs text-white/55">
                        <span>RPC: <span className="text-white/85">{n.rpc}</span></span>
                        <span>Pay with wallet: <span className="text-white/85">{n.wallet_checkout ? "available" : "off"}</span></span>
                        <span>Send to address: <span className="text-white/85">{n.address_checkout ? "available" : "off"}</span></span>
                      </div>
                    </Spotlight>
                  </Reveal>
                );
              })
            ) : (
              <div className="rounded-card border border-white/10 bg-white/[0.04] p-6 text-[0.9375rem] text-white/70">
                The status endpoint did not answer just now, so there is nothing to show. We would rather show nothing than a made-up reading.
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-white/50">
            <p>{status ? <>Checked {utc(status.checked_at)} · refreshed on the server every 15 seconds</> : "Reading unavailable"}</p>
            <Link href="/status" className="inline-flex items-center gap-1 font-medium text-white/80 transition-colors hover:text-white">Open the status page<ArrowUpRight className="size-3.5" aria-hidden /></Link>
          </div>
        </div>
      </div>
    </Band>
  );
}

export function LiveNetworkSkeleton() {
  return (
    <section aria-hidden className="px-3 py-3 sm:px-5"><div className="surface-ink island-leaf-a h-[34rem]" /></section>
  );
}
