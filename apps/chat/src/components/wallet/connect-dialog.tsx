"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useChains, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import type { Connector } from "wagmi";
import { QRCodeSVG } from "qrcode.react";
import { AlertCircle, ArrowUpRight, ChevronRight, Loader2, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { ChainBadge, ChainIcon, chainMeta, networkIdForChainId } from "@/components/brand/chain-icon";
import { WalletIcon, walletKey } from "@/components/brand/wallet-icon";
import { CopyButton } from "@/components/copy-button";
import { WALLETCONNECT_ENABLED } from "@/components/checkout/wallet-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { shortHash } from "@/lib/format";
import { cn } from "@/lib/cn";

// ─────────────────────────────────────────────────────────────────────── model

type Address = `0x${string}`;

export interface ConnectedInfo { address: Address; connector: Connector | undefined; chainId: number | undefined }

/** One row in the wallet list. */
export interface WalletEntry {
  id: string;
  name: string;
  /** key into the curated icon set, or undefined for unknown wallets */
  iconKey: string;
  /** icon URL announced by the wallet over EIP-6963 */
  icon?: string;
  group: "detected" | "popular" | "other";
  /** what clicking does */
  action: "connect" | "walletconnect" | "deeplink" | "install";
  hint: string;
  connector?: Connector;
  href?: string;
  recent?: boolean;
}

interface Curated { key: string; name: string; install: string; deeplink?: (u: URL) => string; viaWalletConnect?: boolean; coinbase?: boolean }

/** Deep links open the dapp inside the wallet's own browser. Rainbow and Ledger have no such link, so they use WalletConnect. */
const CURATED: Curated[] = [
  { key: "metamask", name: "MetaMask", install: "https://metamask.io/download/", deeplink: (u) => `https://metamask.app.link/dapp/${u.host}${u.pathname}${u.search}` },
  { key: "coinbase", name: "Coinbase Wallet", install: "https://www.coinbase.com/wallet/downloads", coinbase: true },
  { key: "rainbow", name: "Rainbow", install: "https://rainbow.me/", viaWalletConnect: true },
  { key: "trust", name: "Trust Wallet", install: "https://trustwallet.com/download", deeplink: (u) => `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(u.href)}` },
  { key: "phantom", name: "Phantom", install: "https://phantom.app/download", deeplink: (u) => `https://phantom.app/ul/browse/${encodeURIComponent(u.href)}?ref=${encodeURIComponent(u.origin)}` },
  { key: "ledger", name: "Ledger", install: "https://www.ledger.com/ledger-live", viaWalletConnect: true },
];

const RECENT_KEY = "plinth.wallet.recent";
const readRecent = (): string | null => { try { return localStorage.getItem(RECENT_KEY); } catch { return null; } };
const writeRecent = (id: string) => { try { localStorage.setItem(RECENT_KEY, id); } catch { /* storage unavailable */ } };

export type ConnectIssue = { kind: "rejected" | "no-wallet" | "pending" | "error"; message: string };

function classify(e: unknown): ConnectIssue {
  const err = e as { name?: string; code?: number; message?: string; cause?: { code?: number; message?: string } } | undefined;
  const code = err?.code ?? err?.cause?.code;
  const text = `${err?.name ?? ""} ${err?.message ?? ""}`;
  if (code === 4001 || /UserRejected|rejected|denied|declined|cancel/i.test(text)) return { kind: "rejected", message: "Request cancelled" };
  if (code === -32002 || /already pending|already processing/i.test(text)) return { kind: "pending", message: "Your wallet already has a request open. Open it to continue." };
  if (/ProviderNotFound|provider not found/i.test(text)) return { kind: "no-wallet", message: "No wallet found" };
  return { kind: "error", message: (err?.message ?? "Could not connect").split("\n")[0]! };
}

function isMobile(): boolean {
  return typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// ─────────────────────────────────────────────────────────────────────── hook

export interface UseWalletConnect {
  /** Ordered rows: detected first, then popular, then WalletConnect. */
  wallets: WalletEntry[];
  walletConnectEnabled: boolean;
  /** true when no EIP-6963 wallet and no legacy window.ethereum is present */
  noneDetected: boolean;
  status: "idle" | "connecting" | "error";
  pending: WalletEntry | null;
  issue: ConnectIssue | null;
  /** WalletConnect pairing URI while a QR session is pending */
  wcUri: string | null;
  connectWith: (entry: WalletEntry) => Promise<boolean>;
  reset: () => void;
  address: Address | undefined;
  isConnected: boolean;
  connector: Connector | undefined;
  accountChainId: number | undefined;
  /** the chain the wallet is on is not `chainId` */
  wrongNetwork: boolean;
  /** `chainId` is not one of the chains this page is configured for */
  unsupportedChain: boolean;
  chainName: (id: number | undefined) => string;
  switchNetwork: () => void;
  switching: boolean;
  switchRejected: boolean;
  disconnect: () => void;
}

/**
 * All wallet state in one place. Wallets come from wagmi's connector list, which already contains one
 * connector per EIP-6963 announcement. Must be used under the WalletProvider in components/checkout/wallet-provider.tsx.
 */
export function useWalletConnect({ chainId }: { chainId?: number } = {}): UseWalletConnect {
  const { connectors, connectAsync, reset: resetConnect } = useConnect();
  const { address, isConnected, connector, chainId: accountChainId } = useAccount();
  const { disconnect } = useDisconnect();
  const chains = useChains();
  const { switchChain, isPending: switching, error: switchError, reset: resetSwitch } = useSwitchChain();
  const [status, setStatus] = useState<"idle" | "connecting" | "error">("idle");
  const [pending, setPending] = useState<WalletEntry | null>(null);
  const [issue, setIssue] = useState<ConnectIssue | null>(null);
  const [wcUri, setWcUri] = useState<string | null>(null);
  const [recent, setRecent] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const [legacy, setLegacy] = useState(false);
  const attempt = useRef(0);

  useEffect(() => {
    setRecent(readRecent());
    setMobile(isMobile());
    setLegacy(typeof window !== "undefined" && !!(window as unknown as { ethereum?: unknown }).ethereum);
  }, []);

  const wallets = useMemo<WalletEntry[]>(() => {
    const out: WalletEntry[] = [];
    const eip6963 = connectors.filter((c) => c.type === "injected" && c.id !== "injected");
    const generic = connectors.find((c) => c.id === "injected");
    const cb = connectors.find((c) => c.type === "coinbaseWallet");
    const wc = connectors.find((c) => c.type === "walletConnect");
    const seen = new Set<string>();

    for (const c of eip6963) {
      if (seen.has(c.id)) continue; // de-duplicate by rdns
      seen.add(c.id);
      const key = walletKey(c.id) ?? walletKey(c.name);
      out.push({ id: c.id, name: c.name, iconKey: key ?? c.id, icon: c.icon, group: "detected", action: "connect", hint: "Detected", connector: c, recent: recent === c.id });
    }
    if (!eip6963.length && generic && legacy) {
      out.push({ id: generic.id, name: "Browser wallet", iconKey: "browser", group: "detected", action: "connect", hint: "Detected", connector: generic, recent: recent === generic.id });
    }
    const detectedKeys = new Set(out.map((w) => walletKey(w.id) ?? walletKey(w.name)).filter(Boolean));
    const here = typeof window === "undefined" ? null : new URL(window.location.href);

    for (const cur of CURATED) {
      if (detectedKeys.has(cur.key)) continue;
      const base = { id: cur.key, name: cur.name, iconKey: cur.key, group: "popular" as const, recent: recent === cur.key };
      if (cur.coinbase && cb) out.push({ ...base, action: "connect", hint: "Connect", connector: cb });
      else if (cur.viaWalletConnect && wc) out.push({ ...base, action: "walletconnect", hint: "WalletConnect", connector: wc });
      else if (mobile && cur.deeplink && here) out.push({ ...base, action: "deeplink", hint: "Open app", href: cur.deeplink(here) });
      else out.push({ ...base, action: "install", hint: "Install", href: cur.install });
    }
    if (wc && !detectedKeys.has("walletconnect")) {
      out.push({ id: wc.id, name: "WalletConnect", iconKey: "walletconnect", group: "other", action: "walletconnect", hint: "Scan QR code", connector: wc, recent: recent === wc.id });
    }
    // the last used wallet floats to the top of its group
    return out.sort((a, b) => (a.group === b.group ? Number(!!b.recent) - Number(!!a.recent) : 0));
  }, [connectors, legacy, mobile, recent]);

  const supported = chainId === undefined || chains.some((c) => c.id === chainId);
  const chainName = useCallback((id: number | undefined) => (id === undefined ? "an unknown network" : chains.find((c) => c.id === id)?.name ?? (chainMeta(networkIdForChainId(id)).family === "local" ? `chain ${id}` : chainMeta(networkIdForChainId(id)).name)), [chains]);

  const reset = useCallback(() => {
    attempt.current += 1; // a late result from an abandoned attempt is ignored
    resetConnect();
    setStatus("idle");
    setPending(null);
    setIssue(null);
    setWcUri(null);
  }, [resetConnect]);

  const connectWith = useCallback(
    async (entry: WalletEntry): Promise<boolean> => {
      if (entry.action === "install" || entry.action === "deeplink") {
        if (entry.href) {
          if (entry.action === "deeplink") window.location.assign(entry.href);
          else window.open(entry.href, "_blank", "noopener,noreferrer");
        }
        return false;
      }
      if (!entry.connector) return false;
      const mine = ++attempt.current;
      setPending(entry);
      setIssue(null);
      setWcUri(null);
      setStatus("connecting");
      const connectorRef = entry.connector;
      const onMessage = (m: { type: string; data?: unknown }) => {
        if (m.type === "display_uri" && attempt.current === mine) setWcUri(String(m.data));
      };
      if (entry.action === "walletconnect") connectorRef.emitter.on("message", onMessage);
      try {
        await connectAsync({ connector: connectorRef });
        if (attempt.current !== mine) return false;
        writeRecent(entry.id);
        setRecent(entry.id);
        setStatus("idle");
        setPending(null);
        return true;
      } catch (e) {
        if (attempt.current === mine) {
          setIssue(classify(e));
          setStatus("error");
        }
        return false;
      } finally {
        if (entry.action === "walletconnect") connectorRef.emitter.off("message", onMessage);
      }
    },
    [connectAsync],
  );

  const wrongNetwork = isConnected && chainId !== undefined && supported && accountChainId !== chainId;
  const switchNetwork = useCallback(() => {
    if (chainId === undefined) return;
    resetSwitch();
    switchChain({ chainId });
  }, [chainId, resetSwitch, switchChain]);

  return {
    wallets,
    walletConnectEnabled: WALLETCONNECT_ENABLED,
    noneDetected: !connectors.some((c) => c.type === "injected" && c.id !== "injected") && !legacy,
    status,
    pending,
    issue,
    wcUri,
    connectWith,
    reset,
    address,
    isConnected,
    connector,
    accountChainId,
    wrongNetwork,
    unsupportedChain: !supported,
    chainName,
    switchNetwork,
    switching,
    switchRejected: !!switchError && classify(switchError).kind === "rejected",
    disconnect: () => disconnect(),
  };
}

// ─────────────────────────────────────────────────────────────────────── dialog

type View = "list" | "connecting" | "walletconnect" | "connected";

export interface ConnectWalletDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once the wallet is connected and, when `chainId` is given, on that chain. The dialog then closes. */
  onConnected?: (info: ConnectedInfo) => void;
  /** Required chain. A wallet on any other chain gets a "Switch network" banner. */
  chainId?: number;
}

export function ConnectWalletDialog({ open, onOpenChange, onConnected, chainId }: ConnectWalletDialogProps) {
  const w = useWalletConnect({ chainId });
  const [view, setView] = useState<View>("list");
  const armed = useRef(false);
  const onConnectedRef = useRef(onConnected);
  onConnectedRef.current = onConnected;

  // each opening starts from the right place: the account when already connected, the list otherwise
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      armed.current = false;
      w.reset();
      setView(w.isConnected ? "connected" : "list");
    }
    if (!open && wasOpen.current) w.reset();
    wasOpen.current = open;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // a connection made from this dialog finishes it as soon as the wallet is on the right chain
  useEffect(() => {
    if (!open || !w.isConnected || !w.address) return;
    if (view === "list" || view === "connecting" || view === "walletconnect") setView("connected");
    if (armed.current && !w.wrongNetwork) {
      armed.current = false;
      onConnectedRef.current?.({ address: w.address, connector: w.connector, chainId: w.accountChainId });
      onOpenChange(false);
    }
  }, [open, view, w.isConnected, w.address, w.wrongNetwork, w.connector, w.accountChainId, onOpenChange]);

  const pick = async (entry: WalletEntry) => {
    if (entry.action === "install" || entry.action === "deeplink") return void w.connectWith(entry);
    armed.current = true;
    setView(entry.action === "walletconnect" ? "walletconnect" : "connecting");
    const ok = await w.connectWith(entry);
    if (!ok) armed.current = false;
  };

  const back = () => {
    armed.current = false;
    w.reset();
    setView("list");
  };

  const title = view === "connected" ? "Wallet" : view === "walletconnect" ? "Scan with your wallet" : "Connect a wallet";
  const description =
    view === "list"
      ? chainId !== undefined && !w.unsupportedChain
        ? `Choose a wallet to continue on ${w.chainName(chainId)}.`
        : "Choose a wallet to continue."
      : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description} className="w-[min(92vw,26rem)] max-sm:bottom-0 max-sm:top-auto max-sm:w-screen max-sm:rounded-b-none">
        {view === "list" && <WalletList w={w} onPick={pick} chainId={chainId} />}
        {view === "connecting" && <Connecting w={w} onBack={back} onRetry={() => w.pending && pick(w.pending)} />}
        {view === "walletconnect" && <WalletConnectView w={w} onBack={back} onRetry={() => w.pending && pick(w.pending)} />}
        {view === "connected" && <Account w={w} chainId={chainId} onDone={() => { if (w.address && !w.wrongNetwork) onConnectedRef.current?.({ address: w.address, connector: w.connector, chainId: w.accountChainId }); onOpenChange(false); }} onDisconnect={() => { w.disconnect(); setView("list"); }} />}
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────────────────────────────────────────────── list view

function WalletRow({ entry, onPick }: { entry: WalletEntry; onPick: (e: WalletEntry) => void }) {
  const external = entry.action === "install";
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(entry)}
        className="group/row flex h-12 w-full items-center gap-3 rounded-ctl px-2 text-left transition-colors duration-[var(--duration-fast)] hover:bg-sunk active:bg-sunk"
      >
        <WalletIcon id={entry.iconKey} icon={entry.icon} size={32} />
        <span className="min-w-0 flex-1 truncate font-medium text-ink">{entry.name}</span>
        {entry.recent && <span className="rounded-full bg-sunk px-2 py-0.5 text-2xs font-medium text-ink-2 group-hover/row:bg-raised">Recent</span>}
        {entry.group !== "detected" && <span className="text-xs text-ink-3">{entry.hint}</span>}
        {external ? <ArrowUpRight className="size-4 text-ink-4" aria-hidden /> : <ChevronRight className="size-4 text-ink-4" aria-hidden />}
      </button>
    </li>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1">
      <h3 className="label px-2">{label}</h3>
      <ul className="-mx-0">{children}</ul>
    </section>
  );
}

function WalletList({ w, onPick, chainId }: { w: UseWalletConnect; onPick: (e: WalletEntry) => void; chainId?: number }) {
  const detected = w.wallets.filter((x) => x.group === "detected");
  const popular = w.wallets.filter((x) => x.group === "popular");
  const other = w.wallets.filter((x) => x.group === "other");
  return (
    <div className="space-y-4">
      {chainId !== undefined && !w.unsupportedChain && (
        <div className="flex items-center justify-between rounded-ctl bg-wash px-3 py-2 text-sm text-ink-2">
          <span>Network</span>
          <ChainBadge id={networkIdForChainId(chainId)} size={18} showTestnet={false} className="text-sm" />
        </div>
      )}
      {w.unsupportedChain && (
        <p className="flex items-start gap-2 rounded-ctl bg-warn-quiet px-3 py-2 text-sm text-warn-ink" role="alert">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          This network is not enabled on this page.
        </p>
      )}
      {detected.length > 0 && <Section label="Detected">{detected.map((e) => <WalletRow key={e.id} entry={e} onPick={onPick} />)}</Section>}
      {detected.length === 0 && (
        <p className="rounded-ctl bg-wash px-3 py-2.5 text-sm text-ink-2">
          No browser wallet detected on this device. Install one below{w.walletConnectEnabled ? " or scan a QR code with your phone" : ""}.
        </p>
      )}
      {popular.length > 0 && <Section label={detected.length ? "More wallets" : "Popular wallets"}>{popular.map((e) => <WalletRow key={e.id} entry={e} onPick={onPick} />)}</Section>}
      {other.length > 0 && <Section label="Other">{other.map((e) => <WalletRow key={e.id} entry={e} onPick={onPick} />)}</Section>}
      <p className="flex items-center gap-2 border-t border-line pt-3 text-xs text-ink-3">
        <ShieldCheck className="size-4 shrink-0" aria-hidden />
        Plinth never asks for your seed phrase or a signature that is not a payment.
      </p>
    </div>
  );
}

// ──────────────────────────────────────────────────────────── connecting view

function Connecting({ w, onBack, onRetry }: { w: UseWalletConnect; onBack: () => void; onRetry: () => void }) {
  const entry = w.pending;
  const issue = w.issue;
  const name = entry?.name ?? "your wallet";
  if (issue) {
    const neutral = issue.kind === "rejected";
    return (
      <div className="space-y-5" role="alert">
        <div className="flex items-start gap-3">
          {entry && <WalletIcon id={entry.iconKey} icon={entry.icon} size={40} />}
          <div className="min-w-0">
            <p className={cn("font-medium", neutral ? "text-ink" : "text-bad-ink")}>
              {issue.kind === "no-wallet" ? `${name} is not installed` : issue.message}
            </p>
            <p className="mt-0.5 text-sm text-ink-3">
              {issue.kind === "rejected" && `You closed the request in ${name}. Nothing was connected.`}
              {issue.kind === "no-wallet" && "Install it, then reload this page."}
              {issue.kind === "pending" && "Look for a pending window or notification."}
              {issue.kind === "error" && "Check your wallet and try again."}
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onBack}>Choose another</Button>
          <Button variant="primary" onClick={onRetry}>Try again</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-5" role="status">
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <span className="relative grid size-16 place-items-center">
          <Loader2 className="absolute size-16 animate-spin text-ink-4" strokeWidth={1} aria-hidden />
          {entry && <WalletIcon id={entry.iconKey} icon={entry.icon} size={36} />}
        </span>
        <div>
          <p className="font-medium text-ink">Confirm in {name}</p>
          <p className="mt-0.5 text-sm text-ink-3">Approve the connection request. No funds move.</p>
        </div>
      </div>
      <div className="flex justify-end"><Button variant="ghost" onClick={onBack}>Cancel</Button></div>
    </div>
  );
}

// ───────────────────────────────────────────────────────── WalletConnect view

function WalletConnectView({ w, onBack, onRetry }: { w: UseWalletConnect; onBack: () => void; onRetry: () => void }) {
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    setExpired(false);
    if (!w.wcUri) return;
    const t = setTimeout(() => setExpired(true), 120_000);
    return () => clearTimeout(t);
  }, [w.wcUri]);
  const failed = w.issue && w.issue.kind !== "rejected" ? w.issue : null;
  const rejected = w.issue?.kind === "rejected";
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-3">
        <div className={cn("relative grid size-52 place-items-center rounded-card border border-line bg-raised p-3", (expired || w.issue) && "opacity-40")}>
          {w.wcUri ? <QRCodeSVG value={w.wcUri} size={184} level="M" marginSize={0} role="img" aria-label="WalletConnect pairing code" /> : <Loader2 className="size-6 animate-spin text-ink-4" aria-hidden />}
        </div>
        {(expired || w.issue) ? (
          <div className="flex flex-col items-center gap-2 text-center" role="alert">
            <p className="text-sm text-ink-2">{rejected ? "Request cancelled" : failed ? failed.message : "This code has expired"}</p>
            <Button size="sm" variant="secondary" onClick={onRetry}><RefreshCw className="size-3.5" aria-hidden />Refresh QR</Button>
          </div>
        ) : (
          <p className="text-center text-sm text-ink-3">Open your wallet app, find WalletConnect or Scan, and point it at this code.</p>
        )}
      </div>
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>Back</Button>
        {w.wcUri && !expired && <CopyButton value={w.wcUri} label="Copy link" />}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────── account view

function Account({ w, chainId, onDone, onDisconnect }: { w: UseWalletConnect; chainId?: number; onDone: () => void; onDisconnect: () => void }) {
  const c = w.connector;
  const idForIcon = c ? (walletKey(c.id) ?? walletKey(c.name) ?? c.id) : "wallet";
  const live = w.accountChainId;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <WalletIcon id={idForIcon} icon={c?.icon} size={40} />
        <div className="min-w-0">
          <p className="font-medium text-ink">{c?.name ?? "Wallet"}</p>
          <p className="flex items-center gap-0.5 font-mono text-[0.8125rem] text-ink-2">
            <span title={w.address}>{w.address ? shortHash(w.address, 6, 4) : ""}</span>
            {w.address && <CopyButton value={w.address} compact />}
          </p>
        </div>
      </div>

      {live !== undefined && (
        <div className="flex items-center justify-between rounded-ctl bg-wash px-3 py-2 text-sm text-ink-2">
          <span>Wallet network</span>
          <span className="inline-flex items-center gap-2 font-medium text-ink"><ChainIcon id={networkIdForChainId(live)} size={18} />{w.chainName(live)}</span>
        </div>
      )}

      {w.wrongNetwork && chainId !== undefined && (
        <div className="space-y-3 rounded-ctl bg-warn-quiet p-3" role="alert">
          <p className="flex items-start gap-2 text-sm text-warn-ink">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>Your wallet is on {w.chainName(live)}. Switch to {w.chainName(chainId)} to continue.</span>
          </p>
          <Button variant="primary" size="sm" onClick={w.switchNetwork} loading={w.switching} className="w-full">
            {w.switching ? "Check your wallet" : `Switch to ${w.chainName(chainId)}`}
          </Button>
          {w.switchRejected && <p className="text-xs text-warn-ink">Switch needed to continue.</p>}
        </div>
      )}

      <div className="flex justify-between gap-2">
        <Button variant="ghost" onClick={onDisconnect}>Disconnect</Button>
        <Button variant={w.wrongNetwork ? "secondary" : "primary"} onClick={onDone} disabled={w.wrongNetwork}>{w.wrongNetwork ? "Switch network first" : "Done"}</Button>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────── header button

/**
 * Connect / connected pill for headers. Opens the dialog in both states: the list when disconnected,
 * the account (address, network, switch, disconnect) when connected. Must be inside WalletProvider.
 */
export function WalletButton({ chainId, onConnected, className, size = "md", label = "Connect wallet" }: { chainId?: number; onConnected?: (info: ConnectedInfo) => void; className?: string; size?: "sm" | "md" | "lg"; label?: string }) {
  const [open, setOpen] = useState(false);
  const w = useWalletConnect({ chainId });
  // wagmi hydrates the account after mount; render the disconnected state until then so server and client agree
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const connected = mounted && w.isConnected && !!w.address;
  const c = w.connector;
  return (
    <>
      {connected ? (
        <Button variant="secondary" size={size} className={cn("gap-2 pl-2", className)} onClick={() => setOpen(true)} aria-label={`Wallet ${w.address}`}>
          <WalletIcon id={c ? (walletKey(c.id) ?? walletKey(c.name) ?? c.id) : "wallet"} icon={c?.icon} size={20} />
          <span className="font-mono text-[0.8125rem]">{shortHash(w.address!, 4, 4)}</span>
          {w.wrongNetwork ? <span className="inline-flex items-center gap-1 rounded-full bg-warn-quiet px-1.5 py-0.5 text-2xs font-medium text-warn-ink"><TriangleAlert className="size-3" aria-hidden />Wrong network</span> : w.accountChainId !== undefined && <ChainIcon id={networkIdForChainId(w.accountChainId)} size={16} />}
        </Button>
      ) : (
        <Button variant="primary" size={size} className={className} onClick={() => setOpen(true)}>{label}</Button>
      )}
      <ConnectWalletDialog open={open} onOpenChange={setOpen} onConnected={onConnected} chainId={chainId} />
    </>
  );
}
