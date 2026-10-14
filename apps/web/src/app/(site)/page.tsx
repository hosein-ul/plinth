import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight, Lock, ShieldAlert, FlaskConical } from "lucide-react";
import { WEBHOOK_EVENT_TYPES } from "@plinth/shared";
import { buttonStyles } from "@/components/ui/button";
import { Hero } from "@/components/marketing/hero-variants";
import { StartPaths } from "@/components/marketing/start-paths";
import { Statement } from "@/components/marketing/statement";
import { LiveNetwork, LiveNetworkSkeleton } from "@/components/marketing/live-network";
import { AssetsNetworks } from "@/components/marketing/assets-networks";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { NonCustodial } from "@/components/marketing/non-custodial";
import { TwoFlows } from "@/components/marketing/two-flows";
import { DashboardPreview } from "@/components/marketing/dashboard-preview";
import { DevSection } from "@/components/marketing/dev-section";
import { Integrations } from "@/components/marketing/integrations";
import { WhereWeStand } from "@/components/marketing/where-we-stand";
import { Faq } from "@/components/marketing/faq";
import { FinalCta } from "@/components/marketing/final-cta";
import { TextAnimate } from "@/components/magicui/text-animate";
import { Magnetic } from "@/components/marketing/motion/magnetic";
import { Reveal } from "@/components/marketing/motion/reveal";
import { DEMO_HREF } from "@/lib/routes";
import { cn } from "@/lib/cn";

const wrap = "mx-auto max-w-[75rem] px-5 sm:px-8";

export default function Home() {
  return (
    <div className="overflow-x-clip">
      <Hero />
      <StartPaths />

      <Suspense fallback={<LiveNetworkSkeleton />}><LiveNetwork /></Suspense>
      <AssetsNetworks />
      <Statement />
      <HowItWorks />
      <NonCustodial />
      <TwoFlows />
      <DashboardPreview />
      <DevSection events={[...WEBHOOK_EVENT_TYPES]} />
      <Integrations />
      <WhereWeStand />
      <Faq />
      <FinalCta />
    </div>
  );
}
