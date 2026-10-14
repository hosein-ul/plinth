/* eslint-disable @next/next/no-img-element */
import type { ComponentType } from "react";
import { Wallet } from "lucide-react";
import { WalletCoinbase, WalletLedger, WalletMetamask, WalletPhantom, WalletRainbow, WalletTrust, WalletWalletConnect } from "@web3icons/react";
import { cn } from "@/lib/cn";

type Mark = ComponentType<{ variant?: "branded" | "mono" | "background"; size?: number | string; className?: string }>;

const marks: Record<string, Mark> = {
  metamask: WalletMetamask,
  coinbase: WalletCoinbase,
  rainbow: WalletRainbow,
  walletconnect: WalletWalletConnect,
  phantom: WalletPhantom,
  trust: WalletTrust,
  ledger: WalletLedger,
};

/** Map the free-form names and reverse-DNS ids wallets announce (EIP-6963 rdns, connector ids) onto our curated keys. */
export function walletKey(idOrRdns: string): string | undefined {
  const s = idOrRdns.toLowerCase();
  if (s in marks) return s;
  if (s.includes("metamask")) return "metamask";
  if (s.includes("coinbase") || s === "cbwallet") return "coinbase";
  if (s.includes("rainbow")) return "rainbow";
  if (s.includes("walletconnect")) return "walletconnect";
  if (s.includes("phantom")) return "phantom";
  if (s.includes("trust")) return "trust";
  if (s.includes("ledger")) return "ledger";
  return undefined;
}

/**
 * Wallet mark. Curated wallets use @web3icons/react. Anything else falls back to the icon the wallet itself
 * announced over EIP-6963 (rendered through <img> only, never inlined), then to a neutral tile.
 */
export function WalletIcon({ id, size = 28, icon, className }: { id: string; size?: number; icon?: string; className?: string }) {
  const key = walletKey(id);
  const radius = Math.round(size * 0.26);
  if (key) {
    const Icon = marks[key]!;
    return (
      <span aria-hidden className={cn("inline-flex shrink-0 overflow-hidden", className)} style={{ width: size, height: size, borderRadius: radius }}>
        <Icon variant="background" size={size} />
      </span>
    );
  }
  if (icon) {
    return <img src={icon} alt="" width={size} height={size} className={cn("shrink-0 object-cover", className)} style={{ width: size, height: size, borderRadius: radius }} />;
  }
  return (
    <span aria-hidden className={cn("inline-grid shrink-0 place-items-center bg-sunk text-ink-2", className)} style={{ width: size, height: size, borderRadius: radius }}>
      <Wallet style={{ width: size * 0.55, height: size * 0.55 }} strokeWidth={1.75} />
    </span>
  );
}
