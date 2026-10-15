import Link from "next/link";
import { ArrowRight, Mail } from "lucide-react";
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

        <div className="mt-12 grid gap-4 lg:grid-cols-12">
          {/* Circle: the only two assets that count */}
          <Reveal className="min-w-0 lg:col-span-7">
            <div className="card flex h-full flex-col overflow-hidden p-6 sm:p-9">
              <div className="flex items-center gap-5">
                <span className="flex">
                  <span className="rounded-full bg-raised p-1 shadow-float ring-1 ring-black/5"><TokenIcon symbol="USDC" size={88} /></span>
                  <span className="-ml-5 rounded-full bg-raised p-1 shadow-float ring-1 ring-black/5"><TokenIcon symbol="EURC" size={88} /></span>
                </span>
                <div>
                  <p className="text-[2rem] font-medium leading-none tracking-[-0.045em] text-ink">Circle</p>
                  <p className="mt-1.5 text-sm text-ink-3">Issuer of USDC and EURC</p>
                </div>
              </div>
              <h3 className="mt-9 max-w-md text-[1.625rem] font-medium leading-tight tracking-[-0.03em] text-ink">Circle&apos;s dollar and euro. Nothing else is counted.</h3>
              <p className="mt-3 max-w-lg text-[0.9375rem] text-ink-2">
                Plinth credits only the official USDC, and EURC where it exists. Each network&apos;s contract address comes from Circle&apos;s published list and is probed on-chain before the network can be enabled. A look-alike token is recorded and ignored.
              </p>
              <Link href="/networks" className="group mt-auto inline-flex items-center gap-1.5 pt-8 text-[0.9375rem] font-medium text-ink">
                Read the network registry<ArrowRight className="size-4 transition-transform duration-[var(--duration-base)] group-hover:translate-x-1" aria-hidden />
              </Link>
            </div>
          </Reveal>

          {/* Arc: where it runs first */}
          <Reveal delay={0.08} className="min-w-0 lg:col-span-5">
            <div className="surface-ink relative flex h-full flex-col overflow-hidden rounded-[1.75rem] p-6 text-on-ink sm:p-9">
              <div aria-hidden className="tint-mint-tr pointer-events-none absolute inset-x-0 top-0 h-64" />
              <div className="relative flex items-center gap-5">
                <span className="rounded-[1.6rem] bg-white p-1.5 shadow-float"><ChainIcon id="arc-mainnet" size={88} /></span>
                <div>
                  <p className="text-[2rem] font-medium leading-none tracking-[-0.045em]">Arc</p>
                  <p className="mt-1.5 text-sm text-white/60">Circle&apos;s own blockchain</p>
                </div>
              </div>
              <h3 className="relative mt-9 text-[1.625rem] font-medium leading-tight tracking-[-0.03em]">Where Plinth runs first.</h3>
              <p className="relative mt-3 text-[0.9375rem] text-white/65">USDC pays the network fee on Arc, so a customer needs one asset and nothing else. A payment is final after one confirmation.</p>
              <div className="relative mt-auto flex flex-wrap gap-2 pt-8">
                <Chip tone="ok" className="bg-white/10 text-white">USDC pays the fee</Chip>
                <Chip tone="info" className="bg-white/10 text-white">Final after 1 confirmation</Chip>
              </div>
            </div>
          </Reveal>

          {/* Web3Auth: the way in */}
          <Reveal delay={0.12} className="min-w-0 lg:col-span-12">
            <div className="card grid items-center gap-8 p-6 sm:p-9 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
              <div>
                <p className="text-[2rem] font-medium leading-none tracking-[-0.045em] text-ink">Web3Auth</p>
                <h3 className="mt-5 max-w-md text-[1.625rem] font-medium leading-tight tracking-[-0.03em] text-ink">Sign in with Google, email or a wallet.</h3>
                <p className="mt-3 max-w-md text-[0.9375rem] text-ink-2">One tap, no password to keep. Signing in does not decide where money goes: the vault is owned by the address you give it, and changing a payout destination needs a fresh sign-in and an email you confirm.</p>
              </div>
              <ul className="grid gap-3 sm:grid-cols-3">
                <li className="flex items-center gap-3 rounded-2xl border border-line bg-sunk p-4"><span className="grid size-11 place-items-center rounded-xl bg-raised shadow-low"><GoogleMark /></span><span className="text-sm font-medium text-ink">Google</span></li>
                <li className="flex items-center gap-3 rounded-2xl border border-line bg-sunk p-4"><span className="grid size-11 place-items-center rounded-xl bg-raised shadow-low"><Mail className="size-5 text-ink" aria-hidden /></span><span className="text-sm font-medium text-ink">Email</span></li>
                <li className="flex items-center gap-3 rounded-2xl border border-line bg-sunk p-4"><span className="flex -space-x-2"><span className="grid size-11 place-items-center rounded-xl bg-raised shadow-low ring-2 ring-sunk"><WalletIcon id="metamask" size={26} /></span><span className="grid size-11 place-items-center rounded-xl bg-raised shadow-low ring-2 ring-sunk"><WalletIcon id="coinbase" size={26} /></span></span><span className="text-sm font-medium text-ink">Wallet</span></li>
              </ul>
            </div>
          </Reveal>
        </div>
        <p className="mt-6 max-w-3xl text-sm text-ink-3">Marks belong to their owners and show what Plinth is built on, not a partnership or an endorsement.</p>
      </div>
    </Band>
  );
}
