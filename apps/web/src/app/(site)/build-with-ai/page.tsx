import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { PageIntro } from "@/components/marketing/chrome";
import { AiKitPicker } from "@/components/marketing/pages/ai-kit-picker";
import { Chip } from "@/components/badge";
import { buttonStyles } from "@/components/ui/button";
import { H2, wrap } from "@/components/marketing/parts";
import { DEMO_HREF } from "@/lib/routes";
import { pageMeta } from "@/lib/site";

export const metadata = pageMeta({ title: "Build with AI", description: "Copy a ready-made prompt into your AI coding assistant and build a checkout, a bot or an invoicing tool on Plinth, tested on testnet.", path: "/build-with-ai" });

const STEPS: [string, string][] = [
  ["Create a test account", "It takes a minute. You get a test API key and a webhook secret in the dashboard."],
  ["Pick what you are building", "Choose a project below and copy the prompt. It already contains the rules an assistant would otherwise get wrong."],
  ["Paste it into your assistant", "Any AI coding assistant works. Add your test key and webhook secret as environment variables."],
  ["Check the four results", "The prompt ends with a definition of done: a created payment, a paid order, a rejected bad signature, a README."],
];

const KIT: { name: string; text: string; status: "ok" | "neutral" }[] = [
  { name: "Plain-text docs for assistants", text: "/llms.txt and /llms-full.txt, kept in step with the real API.", status: "ok" },
  { name: "OpenAPI 3.1 document", text: "Every endpoint and schema, served by the API at /v1/openapi.json.", status: "ok" },
  { name: "Test networks and sandbox", text: "Build and break things with test USDC. No real money moves.", status: "ok" },
  { name: "Copy-and-paste prompts", text: "Four projects below, each with a definition of done.", status: "ok" },
  { name: "MCP server", text: "Lets an assistant create and check test payments itself. Not built yet.", status: "neutral" },
  { name: "SDKs and starter projects", text: "Not published yet. The REST API works from any language today.", status: "neutral" },
];

export default function BuildWithAiPage() {
  return (
    <>
      <PageIntro eyebrow="Build with AI" title="Describe it. Your assistant builds the checkout.">
        You do not need to be a developer to ship a payment flow. Copy a prompt, paste it into your AI coding assistant, and test the whole thing on a test network.
      </PageIntro>

      <section className={`${wrap} py-16`} aria-labelledby="ai-how">
        <H2 id="ai-how">Four steps, no guesswork.</H2>
        <ol className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {STEPS.map(([t, b], i) => (
            <li key={t} className="flex gap-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-sm font-medium tabular-nums text-on-ink">{i + 1}</span>
              <div><h3 className="text-lg font-medium tracking-[-0.02em] text-ink">{t}</h3><p className="mt-1 text-[0.9375rem] text-ink-2">{b}</p></div>
            </li>
          ))}
        </ol>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/signup" className={buttonStyles({ variant: "primary", size: "lg" })}>Create a test account<ArrowRight className="size-4" aria-hidden /></Link>
          <Link href={DEMO_HREF} className={buttonStyles({ variant: "secondary", size: "lg" })}>Look around the demo first</Link>
        </div>
      </section>

      <section className="bg-sunk/60 py-16" aria-labelledby="ai-prompts">
        <div className={wrap}>
          <H2 id="ai-prompts">Pick a project. Copy the prompt.</H2>
          <div className="mt-8"><AiKitPicker /></div>
        </div>
      </section>

      <section className={`${wrap} py-16`} aria-labelledby="ai-kit">
        <H2 id="ai-kit">What is in the kit, and what is not yet.</H2>
        <ul className="mt-8 divide-y divide-line rounded-card border border-line bg-raised">
          {KIT.map((k) => (
            <li key={k.name} className="flex items-center gap-4 px-5 py-4">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-sunk text-ink-3">{k.status === "ok" ? <Check className="size-3.5 text-signal-ink" strokeWidth={3} aria-hidden /> : <span aria-hidden className="size-1.5 rounded-full bg-ink-4" />}</span>
              <div className="min-w-0 flex-1"><p className="font-medium text-ink">{k.name}</p><p className="text-sm text-ink-3">{k.text}</p></div>
              <Chip tone={k.status}>{k.status === "ok" ? "Available" : "Planned"}</Chip>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
