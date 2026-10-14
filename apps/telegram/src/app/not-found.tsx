import Link from "next/link";
import { Logo } from "@/components/logo";
import { buttonStyles } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main" className="bg-daylight dotgrid flex min-h-dvh flex-col px-6 py-8 [--dot-x:50%] [--dot-y:45%]">
      <Logo />
      <div className="m-auto w-full max-w-md py-16 text-center">
        <p className="font-mono text-sm text-ink-3">404</p>
        <h1 className="t-1 mt-3 text-ink">Nothing at this address.</h1>
        <p className="mt-3 text-lg text-ink-2">The page may have moved, or the payment link is no longer valid.</p>
        <Link href="/" className={buttonStyles({ variant: "primary", size: "lg" }) + " mt-8"}>Back to the start</Link>
      </div>
    </main>
  );
}
