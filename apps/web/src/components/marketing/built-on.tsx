/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { ArrowRight, Mail } from "lucide-react";
import { siGoogle } from "simple-icons";
import { TokenIcon, WalletIcon } from "@/components/brand";
import { Band } from "@/components/marketing/band";
import { Reveal, RevealHeading } from "@/components/marketing/motion/reveal";
import { wrap } from "@/components/marketing/parts";

/** The Google mark, taken from the simple-icons package (not drawn here). Google is a trademark of its owner. */
function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <svg role="img" aria-label="Google" viewBox="0 0 24 24" width={size} height={size} fill={`#${siGoogle.hex}`}>
      <path d={siGoogle.path} />
    </svg>
  );
}

const chip = "grid size-9 place-items-center rounded-lg border border-line bg-raised shadow-low";

/**
 * The parts of Plinth that come from other people's infrastructure, shown with their own logos: Circle issues the two assets that
 * count, Arc is the chain it runs on first, Web3Auth is how a merchant signs in. The files are the owners' official logos, used
 * unmodified (see /public/brand/partners). Nothing here says Circle, Arc or Web3Auth endorse or partner with Plinth.
 */
export function BuiltOn() {
  return (
    <Band tone="light" labelledBy="built-h">
      <div className={wrap}>
        <RevealHeading id="built-h" as="h2" mode="line" className="t-1 max-w-3xl text-ink" parts={[["Built on Circle and Arc.", ""], ["Signed in with Web3Auth.", "text-ink-4"]]} />

        <Reveal className="mt-9">
          <div className="card grid divide-y divide-line md:grid-cols-3 md:divide-x md:divide-y-0">
            {/* Circle: the only two assets that count */}
            <div className="flex flex-col p-6 sm:p-7">
              <div className="flex h-11 items-center"><img src="/brand/partners/circle-logo.svg" alt="Circle" width={467} height={120} className="h-9 w-auto" /></div>
              <p className="mt-5 text-[0.9375rem] text-ink-2">Issues USDC and EURC, the only two assets Plinth counts. Each address comes from Circle&apos;s published list.</p>
              <div className="mt-auto flex items-center justify-between gap-3 pt-5">
                <span className="flex"><TokenIcon symbol="USDC" size={30} /><span className="-ml-2 rounded-full ring-2 ring-raised"><TokenIcon symbol="EURC" size={30} /></span></span>
                <Link href="/networks" className="group inline-flex items-center gap-1.5 text-sm font-medium text-ink">Network registry<ArrowRight className="size-3.5 transition-transform duration-[var(--duration-base)] group-hover:translate-x-1" aria-hidden /></Link>
              </div>
            </div>

            {/* Arc: where it runs first */}
            <div className="flex flex-col p-6 sm:p-7">
              <div className="flex h-11 items-center"><img src="/brand/partners/arc-logo.svg" alt="Arc" width={500} height={171} className="h-11 w-auto" /></div>
              <p className="mt-5 text-[0.9375rem] text-ink-2">Circle&apos;s own blockchain, and where Plinth runs first. USDC pays the network fee, and a payment is final after one confirmation.</p>
            </div>

            {/* Web3Auth: the way in */}
            <div className="flex flex-col p-6 sm:p-7">
              <div className="flex h-11 items-center"><span className="inline-flex h-11 items-center rounded-xl bg-ink px-4"><img src="/brand/partners/web3auth-logo-white.svg" alt="Web3Auth" width={1040} height={288} className="h-6 w-auto" /></span></div>
              <p className="mt-5 text-[0.9375rem] text-ink-2">Sign in with Google, email or a wallet. No password to keep.</p>
              <div className="mt-auto flex items-center gap-2 pt-5">
                <span className={chip}><GoogleMark /></span>
                <span className={chip}><Mail className="size-[18px] text-ink" aria-hidden /></span>
                <span className={chip}><WalletIcon id="metamask" size={20} /></span>
                <span className={chip}><WalletIcon id="coinbase" size={20} /></span>
              </div>
            </div>
          </div>
        </Reveal>
        <p className="mt-4 max-w-3xl text-sm text-ink-3">Logos belong to their owners and show what Plinth is built on, not a partnership or an endorsement.</p>
      </div>
    </Band>
  );
}
