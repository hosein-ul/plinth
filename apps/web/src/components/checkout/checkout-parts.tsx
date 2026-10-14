"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, ChevronDown, CircleHelp, Search, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { shortHash } from "@/lib/format";
import { CopyButton } from "@/components/copy-button";
import { AssetOnChain, ChainIcon } from "@/components/brand";
import { Chip } from "@/components/badge";
import { stationsFromPayment } from "@/components/rail";

export interface Net {
  network: string;
  chain_id: number;
  name: string;
  environment: string;
  usdc_address: string;
  /** The token this payment is made in (older responses may omit it: USDC). */
  token?: { symbol: string; address: string; decimals: number };
  deposit_address: string | null;
  deposit_address_explorer_url: string | null;
  wallet_checkout_supported: boolean;
  wallet_unavailable_reason: string | null;
  explorer_url: string;
  finality_confirmations: number;
  native_currency: { symbol: string; decimals: number };
  public_rpc_urls: string[];
}

export interface PaymentRow {
  network: string;
  tx_hash: string;
  amount: string;
  status: string;
  confirmations: number;
  official_asset: boolean;
  method: "WALLET" | "ADDRESS";
  explorer_url: string;
}

/** Deterministic (timezone independent) so server and client render the same text. */
export function utcStamp(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} UTC`;
}

export function utcClock(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.toISOString().slice(11, 16)} UTC`;
}

/** EIP-681 ERC-20 transfer request: wallets that understand it prefill token, network, recipient and amount. */
export function paymentUri(net: Net, units: string): string {
  return `ethereum:${net.usdc_address}@${net.chain_id}/transfer?address=${net.deposit_address}&uint256=${units}`;
}

export function MerchantMark({ name, className }: { name: string; className?: string }) {
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <span aria-hidden className={cn("grid size-10 shrink-0 place-items-center rounded-ctl border border-line bg-raised text-[1.0625rem] font-semibold text-ink shadow-ctl", className)}>
      {initial}
    </span>
  );
}

/** Draws the check stroke in once on mount. The path comes from lucide; only its dash offset is animated. */
export function DrawCheck({ className, strokeWidth = 3 }: { className?: string; strokeWidth?: number }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <Check
      aria-hidden
      strokeWidth={strokeWidth}
      className={cn(
        "[&_path]:[stroke-dasharray:30] [&_path]:transition-[stroke-dashoffset] [&_path]:duration-[var(--duration-slow)] [&_path]:ease-[var(--ease-out)]",
        on ? "[&_path]:[stroke-dashoffset:0]" : "[&_path]:[stroke-dashoffset:30]",
        className,
      )}
    />
  );
}

export function TestBadge() {
  return (
    <Chip tone="warn" className="h-6">
      Test mode <span className="font-normal opacity-80">no real funds</span>
    </Chip>
  );
}

/** One timer. Counts down locally and re-syncs whenever the backend reports a new value. */
export function useCountdown(secondsRemaining: number) {
  const [left, setLeft] = useState(secondsRemaining);
  useEffect(() => setLeft(secondsRemaining), [secondsRemaining]);
  useEffect(() => {
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  return left;
}

/** Segmented amount meter. Part widths are percentages of the invoice total. */
export function Meter({ parts, label, className }: { parts: { pct: number; tone: "signal" | "info" }[]; label: string; className?: string }) {
  return (
    <div role="img" aria-label={label} className={cn("flex h-1.5 w-full gap-[2px] overflow-hidden rounded-full bg-sunk", className)}>
      {parts.map((p, i) => (
        <span key={i} style={{ width: `${Math.max(0, Math.min(100, p.pct))}%` }} className={cn("h-full rounded-full transition-[width] duration-[var(--duration-slow)] ease-[var(--ease-out)]", p.tone === "signal" ? "bg-signal" : "bg-info")} />
      ))}
    </div>
  );
}

/* ── network first ───────────────────────────────────────────────────────────── */

export function NetworkSelector({ networks, value, onChange, mode }: { networks: Net[]; value: string; onChange: (n: string) => void; mode: "wallet" | "address" }) {
  const reason = (n: Net): string | null =>
    mode === "wallet" ? (n.wallet_checkout_supported ? null : n.wallet_unavailable_reason ?? "Wallet payment is not available here.") : n.deposit_address ? null : "No deposit address was issued on this network.";
  const current = networks.find((n) => n.network === value) ?? networks[0]!;
  const sym = current.token?.symbol ?? "USDC";
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKey(e: React.KeyboardEvent, i: number) {
    const enabled = networks.map((n, idx) => ({ n, idx })).filter((x) => !reason(x.n));
    const pos = enabled.findIndex((x) => x.idx === i);
    let next = -1;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") next = enabled[(pos + 1) % enabled.length]?.idx ?? -1;
    if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = enabled[(pos - 1 + enabled.length) % enabled.length]?.idx ?? -1;
    if (next >= 0) {
      e.preventDefault();
      onChange(networks[next]!.network);
      refs.current[next]?.focus();
    }
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p id="network-label" className="text-sm font-medium text-ink">Network</p>
        {networks.length > 1 && <p className="text-xs text-ink-3">Pick the network your funds are on</p>}
      </div>
      <div role="radiogroup" aria-labelledby="network-label" className="mt-2 grid gap-2">
        {networks.map((n, i) => {
          const why = reason(n);
          const on = n.network === current.network;
          return (
            <button
              key={n.network}
              ref={(el) => { refs.current[i] = el; }}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={!!why}
              tabIndex={on ? 0 : -1}
              onKeyDown={(e) => onKey(e, i)}
              onClick={() => onChange(n.network)}
              className={cn(
                "flex min-h-14 items-center gap-3 rounded-ctl border px-3 py-2.5 text-left transition-[background-color,border-color,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-snap)]",
                on ? "border-ink bg-raised shadow-[0_0_0_1px_var(--color-ink)]" : "border-line-strong bg-raised hover:border-ink-4 hover:bg-wash",
                why && "cursor-not-allowed bg-wash opacity-70 hover:border-line-strong",
              )}
            >
              <ChainIcon id={n.network} size={28} testnet={n.environment === "testnet"} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-[0.9375rem] font-medium text-ink">{n.name}</span>
                  {n.environment === "testnet" && <span className="rounded-full bg-sunk px-1.5 py-px text-2xs font-medium text-ink-2">Testnet</span>}
                </span>
                <span className="block text-xs leading-snug text-ink-3">{why ?? (mode === "wallet" ? "Gasless: no network fee for you" : `Final after ${n.finality_confirmations} confirmation${n.finality_confirmations === 1 ? "" : "s"}`)}</span>
              </span>
              <span aria-hidden className={cn("grid size-[18px] shrink-0 place-items-center rounded-full border-[1.5px]", on ? "border-ink bg-ink text-on-ink" : "border-line-strong")}>
                {on && <Check className="size-2.5" strokeWidth={3.5} />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 rounded-ctl bg-wash px-3.5 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-3 text-sm font-medium text-ink"><AssetOnChain symbol={sym as never} id={current.network} size={28} className="mr-1" />{sym} on {current.name}</span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-signal-ink"><ShieldCheck className="size-3.5" aria-hidden />Official {sym}</span>
        </div>
        <details className="group mt-1.5">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
            Token contract
            <ChevronDown className="size-3.5 text-ink-3 transition-transform duration-[var(--duration-fast)] group-open:rotate-180" aria-hidden />
          </summary>
          <div className="mt-2 flex flex-wrap items-center gap-1 text-ink-2">
            <code className="break-all font-mono text-xs" title={current.usdc_address}>{current.usdc_address}</code>
            <CopyButton value={current.usdc_address} compact label={`Copy ${sym} contract`} />
            <a href={`${current.explorer_url}/address/${current.usdc_address}`} target="_blank" rel="noreferrer noopener" className="inline-grid size-6 place-items-center rounded-md text-ink-3 hover:bg-sunk hover:text-ink" aria-label={`View ${sym} contract in explorer`}>
              <ArrowUpRight className="size-3.5" aria-hidden />
            </a>
          </div>
          <p className="mt-1.5 text-xs text-ink-3">This is the only token contract Plinth credits on {current.name}. Tokens with the same name from other contracts are ignored.</p>
        </details>
      </div>
    </div>
  );
}

/* ── status thread ───────────────────────────────────────────────────────────── */

export function StatusThread({ data, className, closed }: { data: any; className?: string; closed?: boolean }) {
  const sym: string = data.currency ?? "USDC";
  const base = stationsFromPayment({ status: data.status, payments: data.payments });
  // Not fully funded yet: finality of what arrived is not the finish line, and nothing can be swept.
  const incomplete = !["PAID", "OVERPAID", "SETTLEMENT_PENDING", "SETTLED", "SETTLEMENT_FAILED"].includes(data.status) && BigInt(data.remaining_units) > 0n && BigInt(data.amount_received_units) + BigInt(data.amount_pending_units) > 0n;
  const stations0 = incomplete ? base.map((s) => (s.key === "final" ? { ...s, state: "live" as const } : s.key === "swept" || s.key === "vault" ? { ...s, state: "todo" as const } : s)) : base;
  const stations = closed ? stations0.map((s) => (s.state === "live" ? { ...s, state: "todo" as const } : s)) : stations0;
  const payments: PaymentRow[] = (data.payments as PaymentRow[]).filter((p) => p.official_asset && p.status !== "REORGED");
  const first = payments[0];
  const pending = payments.find((p) => p.status !== "FINAL") ?? payments[0];
  const need = pending ? (data.networks as Net[]).find((n) => n.network === pending.network)?.finality_confirmations ?? 1 : 1;
  const wallet = payments.length > 0 && payments.every((p) => p.method === "WALLET");
  const netName = (data.networks as Net[])[0]?.name ?? "the network";
  const live = stations.find((s) => s.state === "live");
  const failed = stations.find((s) => s.state === "failed");
  const lastDone = stations.filter((s) => s.state === "done").slice(-1)[0];
  const announce = failed ? `Problem: ${failed.label}` : live ? `${live.label} in progress` : lastDone ? `${lastDone.label} complete` : "Waiting for payment";

  const detail = (key: string, state: string): React.ReactNode => {
    switch (key) {
      case "detected":
        return first ? (
          <a href={first.explorer_url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 font-mono text-xs text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink">
            {shortHash(first.tx_hash, 8, 6)} <ArrowUpRight className="size-3" aria-hidden />
          </a>
        ) : (
          `Watching ${netName} for your transfer`
        );
      case "verified":
        return state === "done" ? `Official ${sym}, receipt checked` : "Token contract and receipt are checked";
      case "final":
        return incomplete ? (
          <span className="block">{data.amount_received} {sym} final. Waiting for the remaining {data.remaining} {sym}.</span>
        ) : pending && state !== "todo" ? (
          <span className="block">
            {pending.status === "FINAL" ? "Final on-chain" : `${Math.min(pending.confirmations, need)} of ${need} confirmations`}
            <span className="mt-1.5 block h-1 w-40 max-w-full overflow-hidden rounded-full bg-sunk">
              <span className={cn("block h-full rounded-full transition-[width] duration-[var(--duration-slow)] ease-[var(--ease-out)]", pending.status === "FINAL" ? "bg-signal" : "bg-info")} style={{ width: `${pending.status === "FINAL" ? 100 : Math.max(6, (Math.min(pending.confirmations, need) / need) * 100)}%` }} />
            </span>
          </span>
        ) : (
          "Waits for network finality"
        );
      case "swept":
        return wallet ? "Not needed: wallet payments go straight to the vault" : state === "failed" ? "Failed, retrying. Your payment is not affected." : state === "done" ? "Moved out of the payment address" : "Funds move out of the payment address";
      case "vault":
        return state === "done" ? "Confirmed inside the merchant's vault" : "Controlled only by the merchant";
      default:
        return null;
    }
  };

  return (
    <div className={className}>
      <h2 className="label">Payment progress</h2>
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>
      <ol aria-label="Payment progress" className="mt-3">
        {stations.map((s, i) => {
          const last = i === stations.length - 1;
          const filled = s.state === "done" || s.state === "skipped";
          return (
            <li key={s.key} aria-current={s.state === "live" ? "step" : undefined} className="relative grid grid-cols-[20px_1fr] gap-x-3 pb-4 last:pb-0">
              {!last && (
                <span aria-hidden className="absolute left-[9.25px] top-6 h-[calc(100%-1.5rem)] w-[1.5px] rounded-full bg-line-strong">
                  <span className={cn("block h-full w-full origin-top rounded-full bg-signal transition-transform duration-[var(--duration-slow)] ease-[var(--ease-out)]", filled ? "scale-y-100" : "scale-y-0")} />
                </span>
              )}
              <span
                aria-hidden
                className={cn(
                  "relative z-10 mt-0.5 grid size-5 place-items-center rounded-full border-[1.5px] bg-raised transition-[background-color,border-color] duration-[var(--duration-base)] ease-[var(--ease-out)]",
                  s.state === "done" && "border-signal bg-signal text-on-ink",
                  s.state === "skipped" && "border-line-strong bg-sunk text-ink-4",
                  s.state === "live" && "border-signal",
                  s.state === "failed" && "border-bad bg-bad text-on-ink",
                  s.state === "todo" && "border-line-strong",
                )}
              >
                {s.state === "done" && <DrawCheck className="size-3" strokeWidth={3.5} />}
                {s.state === "failed" && <X className="size-3" strokeWidth={3.5} />}
                {s.state === "live" && <span className="size-2 rounded-full bg-signal animate-[live-pulse_1.4s_ease-in-out_infinite]" />}
              </span>
              <div className="min-w-0">
                <p className={cn("text-sm leading-6", s.state === "todo" || s.state === "skipped" ? "text-ink-3" : "font-medium text-ink")}>{s.state === "skipped" ? "Sweep not needed" : s.label}</p>
                <div className={cn("text-xs leading-[1.45]", s.state === "live" ? "text-signal-ink" : "text-ink-3")}>{detail(s.key, s.state)}</div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ── help ────────────────────────────────────────────────────────────────────── */

export function HowItWorks({ symbol: sym = "USDC" }: { symbol?: string }) {
  return (
    <details className="group border-t border-line py-3.5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2"><ShieldCheck className="size-4 text-ink-3" aria-hidden />How this works</span>
        <ChevronDown className="size-4 text-ink-3 transition-transform duration-[var(--duration-fast)] group-open:rotate-180" aria-hidden />
      </summary>
      <ul className="mt-3 space-y-2 text-sm text-ink-2">
        <li><strong className="font-medium text-ink">Non-custodial.</strong> Funds settle into a vault that only the merchant controls. Plinth cannot move them.</li>
        <li><strong className="font-medium text-ink">One address per payment.</strong> The address shown can only forward {sym} to the merchant&apos;s vault.</li>
        <li><strong className="font-medium text-ink">Confirmed means final.</strong> A payment is marked paid only after the network treats your transfer as final. This page updates by itself and you can close it.</li>
        <li><strong className="font-medium text-ink">{sym} only.</strong> Other tokens are not converted and not credited.</li>
      </ul>
    </details>
  );
}

export function HelpPanel({ data }: { data: any }) {
  const sym: string = data.currency ?? "USDC";
  const [hash, setHash] = useState("");
  const [looked, setLooked] = useState<string | null>(null);
  const h = hash.trim().toLowerCase();
  const found = (data.payments as PaymentRow[]).find((p) => p.tx_hash.toLowerCase() === h);
  const valid = /^0x[0-9a-f]{64}$/.test(h);
  const explorer = (data.networks as Net[])[0]?.explorer_url;
  return (
    <details id="help" className="group border-t border-line py-3.5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2"><CircleHelp className="size-4 text-ink-3" aria-hidden />Need help?</span>
        <ChevronDown className="size-4 text-ink-3 transition-transform duration-[var(--duration-fast)] group-open:rotate-180" aria-hidden />
      </summary>
      <div className="mt-3 space-y-4 text-sm text-ink-2">
        <div>
          <p>Give these values to {data.merchant_name || "the merchant"} if you need to ask about this payment.</p>
          <dl className="mt-2 divide-y divide-line rounded-ctl border border-line">
            {data.order_reference && (
              <div className="flex items-center justify-between gap-3 px-3 py-2"><dt className="text-ink-3">Reference</dt><dd className="flex items-center gap-1 font-mono text-xs text-ink">{data.order_reference}<CopyButton value={data.order_reference} compact label="Copy reference" /></dd></div>
            )}
            <div className="flex items-center justify-between gap-3 px-3 py-2"><dt className="text-ink-3">Payment ID</dt><dd className="flex min-w-0 items-center gap-1 font-mono text-xs text-ink"><span className="truncate">{data.id}</span><CopyButton value={data.id} compact label="Copy payment ID" /></dd></div>
          </dl>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setLooked(h);
          }}
        >
          <label htmlFor="tx-lookup" className="font-medium text-ink">Already sent funds? Look up your transaction hash</label>
          <div className="mt-1.5 flex gap-2">
            <input
              id="tx-lookup"
              value={hash}
              onChange={(e) => { setHash(e.target.value); setLooked(null); }}
              placeholder="0x…"
              spellCheck={false}
              autoComplete="off"
              className="h-10 min-w-0 flex-1 rounded-ctl border border-line-strong bg-raised px-3 font-mono text-xs text-ink placeholder:text-ink-4 focus-visible:border-signal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40"
            />
            <button type="submit" disabled={!valid} className="inline-flex h-10 items-center gap-1.5 rounded-ctl border border-line-strong bg-raised px-3 text-sm font-medium text-ink shadow-ctl hover:bg-wash disabled:opacity-45">
              <Search className="size-4" aria-hidden />Check
            </button>
          </div>
          <div role="status" aria-live="polite" className="mt-2 text-sm">
            {looked !== null && valid && found && (
              <p className="rounded-ctl bg-signal-quiet px-3 py-2 text-signal-ink">This payment has that transfer: {found.amount} {sym}, {found.status === "FINAL" ? "final" : `${found.confirmations} confirmation${found.confirmations === 1 ? "" : "s"} so far`}.</p>
            )}
            {looked !== null && valid && !found && (
              <p className="rounded-ctl bg-sunk px-3 py-2 text-ink-2">
                Plinth has not seen that transfer for this payment. It may still be propagating, or it went to a different address or network.{" "}
                {explorer && <a className="font-medium text-ink underline underline-offset-4" href={`${explorer}/tx/${looked}`} target="_blank" rel="noreferrer noopener">Look it up in the explorer</a>}. Keep the hash and send it to the merchant with the values above.
              </p>
            )}
            {hash.trim() !== "" && !valid && <p className="text-xs text-ink-3">A transaction hash starts with 0x and has 64 hexadecimal characters.</p>}
          </div>
        </form>
        <p className="text-ink-3">
          Plinth never asks for a seed phrase or a password. <a className="font-medium text-ink underline underline-offset-4" href="/security">Security</a> · <a className="font-medium text-ink underline underline-offset-4" href="/status">System status</a>
        </p>
      </div>
    </details>
  );
}

/** Pins the primary action to the bottom of the viewport on small screens. */
export function ActionBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("max-lg:sticky max-lg:bottom-0 max-lg:z-20 max-lg:-mx-5 max-lg:border-t max-lg:border-line max-lg:bg-raised max-lg:px-5 max-lg:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-lg:pt-3 sm:max-lg:-mx-6 sm:max-lg:px-6", className)}>{children}</div>
  );
}
