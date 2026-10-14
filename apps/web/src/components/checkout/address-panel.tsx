"use client";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { AlertTriangle, ArrowUpRight, ChevronDown, Smartphone } from "lucide-react";
import { cn } from "@/lib/cn";
import { CopyButton } from "@/components/copy-button";
import { Amount } from "@/components/amount";
import { Notice } from "@/components/page";
import { TokenIcon } from "@/components/brand";
import { buttonStyles } from "@/components/ui/button";
import { Meter, paymentUri, type Net } from "./checkout-parts";

/** Address in mono with the first and last six characters emphasised. textContent is exactly the address. */
function AddressText({ value }: { value: string }) {
  return (
    <p className="break-all font-mono text-[0.9375rem] leading-[1.7] tracking-[-0.01em]" data-testid="deposit-address">
      <span className="font-medium text-ink">{value.slice(0, 6)}</span>
      <span className="text-ink-3">{value.slice(6, -6)}</span>
      <span className="font-medium text-ink">{value.slice(-6)}</span>
    </p>
  );
}

export function AddressPanel({
  net,
  amount,
  remaining,
  remainingUnits,
  receivedSoFar,
  partial,
  disabled,
}: {
  net: Net | undefined;
  amount: string;
  remaining: string;
  remainingUnits: string;
  receivedSoFar: string;
  partial: boolean;
  disabled: boolean;
}) {
  const [qrKind, setQrKind] = useState<"address" | "uri">("address");
  const sym: string = net?.token?.symbol ?? "USDC";

  if (!net || !net.deposit_address) return <Notice tone="warn">No deposit address is available on this network for this payment. Choose another network or pay with a wallet.</Notice>;
  const addr = net.deposit_address;
  const uri = paymentUri(net, remainingUnits);
  const qrValue = qrKind === "address" ? addr : uri;

  return (
    <div className={cn("space-y-4", disabled && "opacity-50")}>
      <div className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-start">
        {/* framed QR: quiet zone, error correction H, the USDC mark laid over the centre (about 17% of the area) */}
        <div className="mx-auto sm:mx-0">
          <div className="relative rounded-card border border-line bg-white p-4 shadow-ctl">
            {["left-1.5 top-1.5 border-l-2 border-t-2 rounded-tl-md", "right-1.5 top-1.5 border-r-2 border-t-2 rounded-tr-md", "bottom-1.5 left-1.5 border-b-2 border-l-2 rounded-bl-md", "bottom-1.5 right-1.5 border-b-2 border-r-2 rounded-br-md"].map((c) => (
              <span key={c} aria-hidden className={cn("absolute size-3.5 border-ink", c)} />
            ))}
            <div className="relative">
              <QRCodeSVG value={qrValue} size={168} level="H" marginSize={0} fgColor="var(--color-ink)" bgColor="var(--color-raised)" title={`${net.name} ${qrKind === "address" ? "deposit address" : `${sym} payment request`}: ${qrValue}`} />
              <span aria-hidden className="absolute left-1/2 top-1/2 grid size-[34px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white shadow-[0_0_0_3px_#fff]">
                <TokenIcon symbol={sym as never} size={28} />
              </span>
            </div>
          </div>
          <div role="group" aria-label="QR content" className="mx-auto mt-2.5 grid w-full grid-cols-2 gap-0.5 rounded-[10px] bg-sunk p-0.5 text-xs font-medium">
            {(["address", "uri"] as const).map((k) => (
              <button key={k} type="button" aria-pressed={qrKind === k} onClick={() => setQrKind(k)} className={cn("h-7 rounded-[8px] px-2 transition-[background-color,color,box-shadow] duration-[var(--duration-fast)]", qrKind === k ? "bg-raised text-ink shadow-[0_1px_2px_rgb(15_23_42/0.12)]" : "text-ink-3 hover:text-ink")}>
                {k === "address" ? "Address" : "Payment link"}
              </button>
            ))}
          </div>
          <p className="mx-auto mt-1.5 max-w-[11.5rem] text-center text-2xs text-ink-3 sm:mx-0 sm:text-left">
            {qrKind === "address" ? "Works in every wallet. Type the amount yourself." : "Prefills the amount in wallets that support EIP-681."}
          </p>
        </div>

        <div className="min-w-0 space-y-4">
          <div>
            <p className="label">{partial ? "Still to send" : "Send exactly"}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
              <Amount value={remaining} size="xl" symbol={sym} />
              <CopyButton value={remaining} label="Copy amount" className="h-9 px-3" />
            </div>
            {partial && (
              <div className="mt-2.5">
                <Meter label={`${receivedSoFar} of ${amount} ${sym} received`} parts={[{ pct: (Number(receivedSoFar) / Number(amount)) * 100, tone: "signal" }]} />
                <p className="mt-1.5 text-xs text-ink-3" aria-live="polite">Received so far {receivedSoFar} of {amount} {sym}. This updates by itself.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-ctl border border-line px-3.5 py-3">
        <p className="label">Deposit address on {net.name}</p>
        <div className="mt-1.5"><AddressText value={addr} /></div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <CopyButton value={addr} label="Copy address" className="h-10 px-4" />
          <a href={uri} className={cn(buttonStyles({ variant: "secondary", size: "md" }), "h-10 gap-1.5")}>
            <Smartphone className="size-4" aria-hidden />Open in wallet
          </a>
          {net.deposit_address_explorer_url && (
            <a href={net.deposit_address_explorer_url} target="_blank" rel="noreferrer noopener" className="inline-flex h-10 items-center gap-1 rounded-ctl px-2 text-sm font-medium text-ink-2 transition-colors hover:bg-sunk hover:text-ink">
              Explorer <ArrowUpRight className="size-3.5" aria-hidden />
            </a>
          )}
        </div>
        <p className="mt-2 text-xs text-ink-3">No memo or tag is needed on {net.name}.</p>
      </div>

      {/* the rule, attached to the address it protects */}
      <div className="flex gap-3 rounded-ctl border border-warn/30 bg-warn-quiet px-3.5 py-3 text-sm text-warn-ink">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div>
          <p className="font-medium">Send exactly {remaining} {sym} on {net.name} only.</p>
          <p className="mt-0.5">Send only official {sym}. Other tokens, and {sym} on other networks, will not be credited to this payment. Your wallet or exchange may take its network fee out of the amount, so send the fee on top.</p>
        </div>
      </div>

      <details className="group text-sm text-ink-2">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium text-ink [&::-webkit-details-marker]:hidden">
          What if something goes wrong
          <ChevronDown className="size-4 text-ink-3 transition-transform duration-[var(--duration-fast)] group-open:rotate-180" aria-hidden />
        </summary>
        <ul className="mt-2.5 space-y-2 text-ink-3">
          <li><strong className="font-medium text-ink-2">Sent less.</strong> Send the rest to the same address before the timer ends. Transfers add up and this page shows what is still missing.</li>
          <li><strong className="font-medium text-ink-2">Sent more.</strong> The payment completes and the extra amount is shown on your receipt. Plinth does not hold it. The merchant decides about returning it.</li>
          <li><strong className="font-medium text-ink-2">Sent a different token.</strong> A token that is not the official {sym} above cannot be matched to this payment. It will show here as ignored. Keep the transaction hash and contact the merchant.</li>
          <li><strong className="font-medium text-ink-2">Sent on another network.</strong> Plinth only watches {net.name} for this address. Keep the transaction hash and contact the merchant.</li>
          <li>Your payment is confirmed after {net.finality_confirmations} confirmation{net.finality_confirmations === 1 ? "" : "s"} on {net.name}. You do not need to keep this page open.</li>
        </ul>
      </details>
    </div>
  );
}
