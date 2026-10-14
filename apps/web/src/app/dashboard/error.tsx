"use client";
import { useEffect } from "react";
import { ErrorState } from "@/components/page";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="max-w-xl pt-4">
      <h1 className="t-2 text-ink">This page did not load.</h1>
      <p className="mt-1.5 text-[0.9375rem] text-ink-3">The rest of your dashboard is unaffected. Your funds are never moved by loading a page.</p>
      <div className="mt-6"><ErrorState error={error} retry={reset} /></div>
      {error.digest && <p className="mt-3 font-mono text-xs text-ink-3">Reference {error.digest}</p>}
    </div>
  );
}
