"use client";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { getWeb3AuthIdToken, SignInCancelled } from "@/lib/web3auth-client";
import { useApi } from "@/lib/hooks";

export interface Reauth { password?: string; id_token?: string }

export interface AccountEmail {
  /** The real address, or null while the account only has a stand-in (wallet or social sign-in without an email). */
  email: string | null;
  verified: boolean;
  auth_method: "password" | "identity";
  email_available: boolean;
}

export function useAccountEmail() {
  return useApi<AccountEmail>("/v1/auth/email");
}

/** The server accepts a sign-in token for five minutes; ask again a little before that. */
const FRESH_MS = 4 * 60_000;

/**
 * Proof that the person at the keyboard owns the account right now. Password accounts re-enter the password;
 * wallet and social accounts sign in again (a fresh Web3Auth login produces a fresh identity token).
 */
export function useReauth(method: AccountEmail["auth_method"] | undefined) {
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<{ value: string; at: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!token) return;
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [token]);

  const signInAgain = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const value = await getWeb3AuthIdToken();
      setToken({ value, at: Date.now() });
      setNow(Date.now());
    } catch (e) {
      if (!(e instanceof SignInCancelled)) setError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }, []);

  const fresh = !!token && now - token.at < FRESH_MS;
  const ready = method === "password" ? password.length > 0 : method === "identity" ? fresh : false;
  const value = (): Reauth => (method === "password" ? { password } : { id_token: token?.value });
  const reset = () => { setPassword(""); setToken(null); setError(null); };

  const field =
    method === "identity" ? (
      <div className="space-y-2">
        <p className="label">Confirm it is you</p>
        {fresh ? (
          <p className="inline-flex items-center gap-2 text-sm text-signal-ink"><CheckCircle2 className="size-4" aria-hidden />Signed in again. Valid for a few minutes.</p>
        ) : (
          <>
            <p className="text-sm text-ink-3">{token ? "That sign-in is too old. Sign in again." : "Changes that affect where money goes need you to sign in again, the same way you normally do."}</p>
            <Button type="button" size="sm" onClick={signInAgain} loading={busy}>Sign in again</Button>
          </>
        )}
        {error && <p className="text-sm text-bad-ink" role="alert">{error}</p>}
      </div>
    ) : (
      <Field label="Your password" htmlFor="reauth-pw" hint="Needed for changes that affect where money goes.">
        <Input id="reauth-pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
    );

  return { ready, value, reset, field };
}
