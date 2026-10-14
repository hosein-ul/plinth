import Link from "next/link";
import { Logo } from "@/components/logo";
import { buttonStyles } from "@/components/ui/button";

export default function LinkNotFound() {
  return (
    <main id="main" className="bg-daylight dotgrid flex min-h-dvh flex-col px-6 py-8 [--dot-x:50%] [--dot-y:45%]">
      <Logo />
      <div className="m-auto w-full max-w-lg py-16">
        <p className="label">Payment link</p>
        <h1 className="t-1 mt-3 text-ink">This link is not active. <span className="text-ink-4">It may be mistyped, or the merchant turned it off.</span></h1>
        <p className="mt-5 max-w-md text-lg text-ink-2">Nothing has been charged. Check the address you were sent, or ask the merchant for a fresh link.</p>
        <Link href="/" className={buttonStyles({ variant: "secondary", size: "lg" }) + " mt-8"}>About Plinth</Link>
      </div>
    </main>
  );
}
