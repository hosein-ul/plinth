"use client";
import { useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { Notice } from "@/components/page";
import { WalletButton } from "@/components/wallet/connect-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/client-api";
import { useAction } from "@/lib/hooks";
import { cn } from "@/lib/cn";

function Step({ n, title, done, locked, children }: { n: number; title: string; done?: boolean; locked?: boolean; children?: React.ReactNode }) {
  return (
    <li className={cn("flex gap-3", locked && "pointer-events-none select-none opacity-55")} aria-disabled={locked || undefined}>
      <span aria-hidden className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold", done ? "bg-signal text-on-ink" : "bg-sunk text-ink-2")}>{done ? <CheckCircle2 className="size-4" /> : n}</span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink">{title}</p>
        {children && <div className="mt-2 space-y-2 text-sm text-ink-3">{children}</div>}
      </div>
    </li>
  );
}

/**
 * Create a vault. The owner is the only address that can ever withdraw, so the person creating it signs a message
 * with that wallet first: a mistyped address can never end up owning a vault.
 */
export function VaultCreateForm({ network, token = "USDC", onDone }: { network: { id: string; name: string }; token?: string; onDone: () => void }) {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [manual, setManual] = useState(false);
  const [typed, setTyped] = useState("");
  const [proof, setProof] = useState<{ nonce: string; signature: string; address: string } | null>(null);
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  useEffect(() => { if (proof && address?.toLowerCase() !== proof.address.toLowerCase()) setProof(null); }, [address, proof]);

  const owner = manual ? typed : address ?? "";
  const validOwner = /^0x[0-9a-fA-F]{40}$/.test(owner);
  async function sign() {
    if (!address) return;
    setSigning(true);
    setSignError(null);
    try {
      const ch = await apiFetch<{ nonce: string; message: string }>("/v1/payout-methods/challenge", { method: "POST", body: { network: network.id, address, purpose: "VAULT_OWNER" } });
      const signature = await signMessageAsync({ message: ch.message });
      setProof({ nonce: ch.nonce, signature, address });
    } catch (e) {
      setSignError(/reject|denied|cancel/i.test(String(e instanceof Error ? e.message : e)) ? "You declined the signature. Nothing was sent." : e instanceof Error ? e.message.split("\n")[0]! : "Signing failed");
    } finally {
      setSigning(false);
    }
  }
  const create = useAction(
    () => apiFetch("/v1/vaults", { method: "POST", headers: { "idempotency-key": crypto.randomUUID() }, body: { network: network.id, token, owner_address: owner, ...(!manual && proof ? { proof: { nonce: proof.nonce, signature: proof.signature } } : {}) } }),
    { invalidate: ["/v1/networks", "/v1/vaults", "/v1/payout-methods"], success: "Vault requested — deploying", onSuccess: onDone },
  );
  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); create.mutate(undefined); }}>
      {!manual ? (
        <ol className="space-y-5">
          <Step n={1} title="Connect the wallet that should own the vault" done={isConnected && !!address}>
            <div className="flex flex-wrap items-center gap-3"><WalletButton size="sm" label="Connect wallet" /></div>{isConnected && address && <p className="break-all font-mono text-xs text-ink-2">{address}</p>}
            <p>This wallet alone can withdraw and change payout rules. Plinth never holds this role.</p>
          </Step>
          <Step n={2} title="Sign a message to prove it is yours" done={!!proof} locked={!isConnected}>
            {!proof && <Button type="button" size="sm" onClick={sign} loading={signing} disabled={!isConnected}>Sign message</Button>}
            <p>Signing sends no transaction and moves no money.</p>
            {signError && <p className="text-bad-ink" role="alert">{signError}</p>}
          </Step>
        </ol>
      ) : (
        <div className="space-y-2">
          <label htmlFor="v-owner" className="label">Vault owner address</label>
          <Input id="v-owner" className="font-mono" value={typed} onChange={(e) => setTyped(e.target.value.trim())} placeholder="0x…" autoFocus />
          <Notice tone="warn">An address typed by hand cannot be checked. A mistake here means nobody can ever withdraw. Some deployments require the signature and will refuse this.</Notice>
        </div>
      )}
      <button type="button" className="text-sm text-ink-3 underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink" onClick={() => setManual((v) => !v)}>
        {manual ? "Connect a wallet instead" : "Enter the owner address by hand instead"}
      </button>
      <p className="flex gap-2 text-sm text-ink-3"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-ink-2" aria-hidden />The vault address is derived from your merchant ID and this owner on {network.name}. The gateway relayer pays the deployment fee.</p>
      <div className="flex justify-end"><Button type="submit" variant="primary" loading={create.isPending} disabled={!validOwner || (!manual && !proof)}>Create vault</Button></div>
    </form>
  );
}
