import Link from "next/link";
import { ArrowRight, KeyRound, Mail } from "lucide-react";
import { siGoogle } from "simple-icons";
import { ChainIcon, TokenIcon, WalletIcon } from "@/components/brand";
import { Chip } from "@/components/badge";
import { Band } from "@/components/marketing/band";
import { Reveal, RevealHeading } from "@/components/marketing/motion/reveal";
import { wrap } from "@/components/marketing/parts";

/** The Google mark, taken from the simple-icons package (not drawn here). Google is a trademark of its owner. */
function GoogleMark({ size = 22 }: { size?: number }) {
  return (
    <svg role="img" aria-label="Google" viewBox="0 0 24 24" width={size} height={size} fill={`#${siGoogle.hex}`}>
      <path d={siGoogle.path} />
    </svg>
  );
}

/**
 * The parts of Plinth that come from other people's infrastructure, named and shown large: Circle issues the two assets that
 * count, Arc is the chain it runs on first, Web3Auth is how a merchant signs in. Only what the product really does is claimed:
 * nothing here says Circle, Arc or Web3Auth endorse or partner with Plinth.
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
              <div className="flex items-center gap-3.5">
                <span className="flex">
                  <span className="rounded-full bg-raised p-0.5 shadow-low ring-1 ring-black/5"><TokenIcon symbol="USDC" size={44} /></span>
                  <span className="-ml-3 rounded-full bg-raised p-0.5 shadow-low ring-1 ring-black/5"><TokenIcon symbol="EURC" size={44} /></span>
                </span>
                <div><p className="text-xl font-medium leading-none tracking-[-0.03em] text-ink">Circle</p><p className="mt-1 text-xs text-ink-3">Issuer of USDC and EURC</p></div>
              </div>
              <p className="mt-5 text-[0.9375rem] text-ink-2">Only the official USDC, and EURC where it exists, is counted. Each address comes from Circle&apos;s published list and is probed on-chain first.</p>
              <Link href="/networks" className="group mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-medium text-ink">Network registry<ArrowRight className="size-3.5 transition-transform duration-[var(--duration-base)] group-hover:translate-x-1" aria-hidden /></Link>
            </div>

            {/* Arc: where it runs first */}
            <div className="flex flex-col p-6 sm:p-7">
              <div className="flex items-center gap-3.5">
                <span className="rounded-[0.9rem] bg-raised p-0.5 shadow-low ring-1 ring-black/5"><ChainIcon id="arc-mainnet" size={44} /></span>
                <div><p className="text-xl font-medium leading-none tracking-[-0.03em] text-ink">Arc</p><p className="mt-1 text-xs text-ink-3">Circle&apos;s own blockchain</p></div>
              </div>
              <p className="mt-5 text-[0.9375rem] text-ink-2">Where Plinth runs first. USDC pays the network fee, so a customer needs one asset, and a payment is final after one confirmation.</p>
              <div className="mt-auto flex flex-wrap gap-2 pt-5"><Chip tone="ok">USDC pays the fee</Chip><Chip tone="info">1 confirmation</Chip></div>
            </div>

            {/* Web3Auth: the way in */}
            <div className="flex flex-col p-6 sm:p-7">
              <div className="flex items-center gap-3.5">
                <span className="grid size-[3rem] place-items-center rounded-[0.9rem] bg-sunk"><KeyRound className="size-5 text-ink" aria-hidden /></span>
                <div><p className="text-xl font-medium leading-none tracking-[-0.03em] text-ink">Web3Auth</p><p className="mt-1 text-xs text-ink-3">How you sign in</p></div>
              </div>
              <p className="mt-5 text-[0.9375rem] text-ink-2">Google, email or a wallet, with no password to keep. Changing a payout destination still needs a fresh sign-in and an email you confirm.</p>
              <div className="mt-auto flex items-center gap-2 pt-5">
                <span className="grid size-9 place-items-center rounded-lg border border-line bg-raised shadow-low"><GoogleMark size={18} /></span>
                <span className="grid size-9 place-items-center rounded-lg border border-line bg-raised shadow-low"><Mail className="size-[18px] text-ink" aria-hidden /></span>
                <span className="grid size-9 place-items-center rounded-lg border border-line bg-raised shadow-low"><WalletIcon id="metamask" size={20} /></span>
                <span className="grid size-9 place-items-center rounded-lg border border-line bg-raised shadow-low"><WalletIcon id="coinbase" size={20} /></span>
              </div>
            </div>
          </div>
        </Reveal>
        <p className="mt-4 max-w-3xl text-sm text-ink-3">Marks belong to their owners and show what Plinth is built on, not a partnership or an endorsement.</p>
      </div>
    </Band>
  );
}
