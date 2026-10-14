"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Logo } from "@/components/logo";
import { Notice } from "@/components/page";
import { WEB3AUTH_CLIENT_ID, getWeb3AuthIdToken } from "@/lib/web3auth-client";
import { SettleDemo } from "@/components/marketing/settle-demo";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const signup = mode === "signup";

  async function viaWeb3Auth() {
    setBusy(true);
    setError(null);
    try {
      const id_token = await getWeb3AuthIdToken();
      const res = await fetch("/api/auth/web3auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id_token }) });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        router.push(signup ? "/dashboard/networks?welcome=1" : "/dashboard");
        router.refresh();
        return;
      }
      setError(json?.error?.message ?? "Could not sign in");
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Could not sign in");
    }
    setBusy(false);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const f = new FormData(e.currentTarget);
    const body = signup
      ? { business_name: String(f.get("business_name")), email: String(f.get("email")), password: String(f.get("password")) }
      : { email: String(f.get("email")), password: String(f.get("password")) };
    const res = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      router.push(signup ? "/dashboard/networks?welcome=1" : "/dashboard");
      router.refresh();
      return;
    }
    setBusy(false);
    if (json?.error?.details) {
      setFieldErrors(Object.fromEntries((json.error.details as { path: string; message: string }[]).map((d) => [d.path, d.message])));
    }
    setError(json?.error?.message ?? "Could not sign in");
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <main id="main" className="flex flex-col px-6 py-7 sm:px-10">
        <Logo />
        <div className="m-auto w-full max-w-[23rem] py-12">
          <h1 className="t-2 text-ink">{signup ? "Create your account" : "Welcome back"}</h1>
          <p className="mt-2 text-[0.9375rem] text-ink-3">{signup ? "Start on testnet. Nothing here moves real funds until you enable a mainnet." : "Sign in to your Plinth dashboard."}</p>
          {WEB3AUTH_CLIENT_ID && (
            <div className="mt-8">
              <Button type="button" variant="primary" size="lg" className="w-full" loading={busy} onClick={viaWeb3Auth}>Continue with wallet, Google or email</Button>
              <p className="mt-2.5 text-center text-xs text-ink-3">Wallet, social and email sign-in, powered by Web3Auth.</p>
              <div className="my-6 flex items-center gap-3 text-xs text-ink-4"><span className="h-px flex-1 bg-line" />or use a password<span className="h-px flex-1 bg-line" /></div>
            </div>
          )}
          <form onSubmit={submit} className={WEB3AUTH_CLIENT_ID ? "space-y-5" : "mt-8 space-y-5"} noValidate>
            {signup && (
              <Field label="Business name" htmlFor="business_name" error={fieldErrors.business_name}>
                <Input id="business_name" name="business_name" required autoComplete="organization" aria-invalid={!!fieldErrors.business_name} />
              </Field>
            )}
            <Field label="Email" htmlFor="email" error={fieldErrors.email}>
              <Input id="email" name="email" type="email" required autoComplete="email" aria-invalid={!!fieldErrors.email} />
            </Field>
            <Field label="Password" htmlFor="password" hint={signup ? "At least 12 characters." : undefined} error={fieldErrors.password}>
              <Input id="password" name="password" type="password" required minLength={signup ? 12 : 1} autoComplete={signup ? "new-password" : "current-password"} aria-invalid={!!fieldErrors.password} />
            </Field>
            {error && <Notice tone="bad"><span role="alert">{error}</span></Notice>}
            <Button type="submit" variant={WEB3AUTH_CLIENT_ID ? "secondary" : "primary"} size="lg" className="w-full" loading={busy}>{signup ? "Create account" : "Sign in"}</Button>
          </form>
          <p className="mt-6 text-sm text-ink-3">
            {signup ? "Already have an account? " : "New to Plinth? "}
            <Link href={signup ? "/login" : "/signup"} className="font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">{signup ? "Sign in" : "Create an account"}</Link>
          </p>
        </div>
      </main>
      <aside className="relative hidden p-3 lg:block">
        <div className="bg-daylight dotgrid relative flex h-full flex-col justify-between overflow-hidden rounded-card border border-line p-12 [--dot-x:60%] [--dot-y:55%]">
          <p className="t-1 max-w-md text-ink">Funds settle into a vault <span className="text-ink-4">only you can open.</span></p>
          <div className="grid place-items-center py-6"><SettleDemo compact /></div>
          <p className="max-w-sm text-sm text-ink-3">Plinth watches, verifies and relays. It never holds a key that can move your money.</p>
        </div>
      </aside>
    </div>
  );
}
