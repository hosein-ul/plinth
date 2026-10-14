import Link from "next/link";
import { Logo } from "@/components/logo";
import { buttonStyles } from "@/components/ui/button";

export default function PaymentNotFound() {
  return (
    <main id="main" className="bg-daylight dotgrid flex min-h-dvh flex-col px-6 py-8 [--dot-x:50%] [--dot-y:45%]">
      <Logo />
      <div className="m-auto w-full max-w-lg py-16">
        <p className="label">Checkout</p>
        <h1 className="t-1 mt-3 text-ink">We cannot find this payment. <span className="text-ink-4">The address may be incomplete.</span></h1>
        <p className="mt-5 max-w-md text-lg text-ink-2">If you already sent funds, keep the transaction hash and contact the merchant. Otherwise ask them for the payment link they issued.</p>
        <Link href="/" className={buttonStyles({ variant: "secondary", size: "lg" }) + " mt-8"}>About Plinth</Link>
      </div>
    </main>
  );
}
