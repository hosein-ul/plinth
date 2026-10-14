"use client";
import Link from "next/link";
import { Suspense } from "react";
import { Shell } from "@/components/shell";
import { DashboardDataProvider } from "@/lib/data-source";
import { DEMO_MERCHANT_NAME, DEMO_USER_EMAIL } from "@/lib/demo-data";
import { demoSource } from "@/lib/demo-source";
import { SIGNUP_HREF } from "@/lib/routes";

const ME = { merchant: { name: DEMO_MERCHANT_NAME }, user: { email: DEMO_USER_EMAIL, role: "OWNER" }, role: "OWNER" };

/** The same shell as the real dashboard, on sample data, under a bar that cannot be scrolled away. */
export function DemoFrame({ children }: { children: React.ReactNode }) {
  return (
    <DashboardDataProvider source={demoSource}>
      <div role="region" aria-label="Demo notice" className="fixed inset-x-0 top-0 z-50 flex h-12 items-center justify-between gap-3 bg-ink px-4 text-on-ink sm:h-10 sm:px-6">
        <p className="min-w-0 text-[0.6875rem] leading-tight sm:text-xs">
          <span className="font-semibold">Demo</span> · sample data, nothing here is real
        </p>
        <div className="flex shrink-0 items-center gap-3 sm:gap-4">
          <Link href={SIGNUP_HREF} className="inline-flex h-7 items-center rounded-[9px] bg-raised px-3 text-xs font-medium text-ink transition-colors hover:bg-sunk">
            <span className="max-sm:hidden">Create a free account</span>
            <span className="sm:hidden">Create account</span>
          </Link>
          <Link href="/" className="text-xs text-on-ink/75 underline decoration-on-ink/30 underline-offset-4 transition-colors hover:text-on-ink">
            <span className="max-sm:hidden">Exit demo</span>
            <span className="sm:hidden">Exit</span>
          </Link>
        </div>
      </div>
      <Shell me={ME} env="test" variant="demo">
        <Suspense>{children}</Suspense>
      </Shell>
    </DashboardDataProvider>
  );
}
