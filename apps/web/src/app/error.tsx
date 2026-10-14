"use client";
import { useEffect } from "react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { ErrorState } from "@/components/page";
import { Button, buttonStyles } from "@/components/ui/button";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main" className="bg-daylight dotgrid flex min-h-dvh flex-col px-6 py-8 [--dot-x:50%] [--dot-y:45%]">
      <Logo />
      <div className="m-auto w-full max-w-lg py-16">
        <h1 className="t-1 text-ink">Something broke on our side. <span className="text-ink-4">Your funds are not affected.</span></h1>
        <p className="mt-5 max-w-md text-lg text-ink-2">Nothing on this page moves money by itself. Try again in a moment.</p>
        <div className="mt-6"><ErrorState error={error} /></div>
        {error.digest && <p className="mt-3 font-mono text-xs text-ink-3">Reference {error.digest}</p>}
        <div className="mt-6 flex flex-wrap gap-3">
          <Button variant="primary" size="lg" onClick={reset}>Try again</Button>
          <Link href="/" className={buttonStyles({ variant: "secondary", size: "lg" })}>Back to the start</Link>
        </div>
      </div>
    </main>
  );
}
