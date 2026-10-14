import Link from "next/link";
import { ArrowRight, Check, FileCheck, KeyRound, Minus, Timer } from "lucide-react";
import { Band } from "@/components/marketing/band";
import { Derivation, Phases } from "@/components/marketing/custody-visuals";
import { ClipReveal } from "@/components/marketing/motion/clip-reveal";
import { Parallax } from "@/components/marketing/motion/parallax";
import { Reveal, RevealHeading } from "@/components/marketing/motion/reveal";
import { Spotlight } from "@/components/marketing/motion/spotlight";
import { Tilt } from "@/components/marketing/motion/tilt";
import { wrap } from "@/components/marketing/parts";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const PHASES: { n: string; title: string; text: string; gas: string; on?: boolean }[] = [
  { n: "1", title: "Invoice created", text: "The address is computed. Nothing is deployed.", gas: "No gas spent" },
  { n: "2", title: "Customer pays", text: "USDC lands on an address that has no code yet.", gas: "No gas spent by you or us" },
  { n: "3", title: "Contract appears and sweeps", text: "One transaction creates the contract and moves the funds to your vault.", gas: "Relayer pays the fee", on: true },
];

const ROWS: { what: string; note?: string; you: boolean; us: boolean; payer: boolean }[] = [
  { what: "Withdraw from your vault", you: true, us: false, payer: false },
  { what: "Change where funds are forwarded", note: "Activates after a delay you can watch", you: true, us: false, payer: false },
  { what: "Send a sweep anywhere but your vault", note: "The function takes no arguments", you: false, us: false, payer: false },
  { what: "Create payments and read their status", note: "With your API key", you: true, us: false, payer: false },
  { what: "Pay an invoice", you: false, us: false, payer: true },
];

function Mark({ yes, label }: { yes: boolean; label: string }) {
  return (
    <span className={cn("mx-auto grid size-6 place-items-center rounded-full", yes ? "bg-ink text-on-ink" : "border border-line-strong text-ink-4")}>
      {yes ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : <Minus className="size-3.5" strokeWidth={2.5} aria-hidden />}
      <span className="sr-only">{label}</span>
    </span>
  );
}

const POINTS: [typeof KeyRound, string, string][] = [
  [KeyRound, "The owner is your wallet", "The vault has one authority. There is no operator, admin or upgrade role."],
  [Timer, "Payout rules wait, in the open", "Forwarding changes activate after a delay you can watch. Going back to keep-in-vault is instant."],
  [FileCheck, "Every claim is checkable", "Each one maps to a contract call or an event you can read on a block explorer."],
];

export function NonCustodial() {
  return (
    <>
      <Band tone="dark" labelledBy="custody-h" className="[--grid-x:80%] [--grid-y:20%]">
        <div aria-hidden className="tint-mint-tr pointer-events-none absolute inset-x-0 top-0 h-[32rem]" />
        <div className={wrap}>
          <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
            <div>
              <RevealHeading id="custody-h" as="h2" mode="line" className="t-1 text-on-ink" parts={[["The address exists before its contract does.", "text-on-ink"], ["So there is no key per invoice and no gas for unpaid ones.", "text-white/45"]]} />
              <Reveal delay={0.1}>
                <p className="mt-6 max-w-md text-lg text-white/65">
                  Each invoice address is computed from five inputs. Your customer can be shown it immediately. The contract behind it is created only when money arrives, and it exists to sweep to your vault.
                </p>
              </Reveal>
            </div>
            <ClipReveal variant="inset" duration={1.2}>
              <div className="overflow-hidden rounded-[1rem_clamp(3rem,9vw,8rem)_1rem_1rem] border border-white/12 bg-ink-lift shadow-float">
                <div className="p-5 pb-8 sm:p-8 sm:pb-10">
                  <p className="mb-5 text-xs font-medium text-white/45">How the address is derived</p>
                  <Derivation />
                </div>
                <div className="border-t border-white/10 bg-ink-deep/40">
                  <Phases phases={PHASES} />
                </div>
              </div>
            </ClipReveal>
          </div>
        </div>
      </Band>

      <Band tone="light" labelledBy="vault-h">
        <div className={cn(wrap, "relative")}>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
            <div className="lg:order-2 lg:sticky lg:top-28 lg:self-start">
              <Parallax distance={26}>
                <Tilt max={3} lift={4}>
                  <div className="card overflow-hidden">
                    <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,3.75rem)] items-end gap-x-2 border-b border-line bg-wash px-4 py-3 text-center text-2xs font-medium text-ink-3 sm:grid-cols-[minmax(0,1fr)_repeat(3,5rem)] sm:px-6">
                      <span className="text-left">Who can do what</span><span>You</span><span>Plinth</span><span>Payer</span>
                    </div>
                    <ul className="divide-y divide-line">
                      {ROWS.map((r, i) => (
                        <ClipReveal key={r.what} as="li" variant="inset-x" delay={i * 0.09} duration={0.9}>
                          <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,3.75rem)] items-center gap-x-2 px-4 py-3.5 transition-colors duration-[var(--duration-fast)] hover:bg-wash sm:grid-cols-[minmax(0,1fr)_repeat(3,5rem)] sm:px-6">
                            <span><span className="block text-sm font-medium text-ink">{r.what}</span>{r.note && <span className="block text-xs text-ink-3">{r.note}</span>}</span>
                            <Mark yes={r.you} label={r.you ? "You can" : "You cannot"} />
                            <Mark yes={r.us} label={r.us ? "Plinth can" : "Plinth cannot"} />
                            <Mark yes={r.payer} label={r.payer ? "The payer can" : "The payer cannot"} />
                          </div>
                        </ClipReveal>
                      ))}
                    </ul>
                  </div>
                </Tilt>
              </Parallax>
            </div>
            <div className="lg:order-1">
              <RevealHeading id="vault-h" as="h2" mode="line" className="t-1 text-ink" parts={[["Your vault, your key.", ""], ["Plinth never holds the money, so it cannot lose, freeze or redirect it.", "text-ink-4"]]} />
              <ul className="mt-8 space-y-3">
                {POINTS.map(([Icon, t, d], i) => (
                  <ClipReveal key={t} as="li" variant="polygon" delay={i * 0.1}>
                    <Spotlight className="flex gap-4 rounded-card border border-line bg-raised p-4 shadow-low">
                      <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-sunk text-ink"><Icon className="size-5" aria-hidden /></span>
                      <div><p className="font-semibold text-ink">{t}</p><p className="mt-0.5 text-sm text-ink-3">{d}</p></div>
                    </Spotlight>
                  </ClipReveal>
                ))}
              </ul>
              <Link href="/security" className={cn(buttonStyles({ variant: "secondary", size: "lg" }), "mt-8")}>Read the security model<ArrowRight className="size-4" aria-hidden /></Link>
            </div>
          </div>
        </div>
      </Band>
    </>
  );
}
