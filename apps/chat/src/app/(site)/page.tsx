import { Suspense } from "react";
import { ChatHero } from "@/components/chat/chat-hero";
import { ChatClosing, ChatHow, ChatWho } from "@/components/chat/chat-sections";
import { ChatPaths } from "@/components/chat/chat-paths";
import { AssetsNetworks } from "@/components/marketing/assets-networks";
import { LiveNetwork, LiveNetworkSkeleton } from "@/components/marketing/live-network";
import { WhereWeStand } from "@/components/marketing/where-we-stand";
import { Faq } from "@/components/marketing/faq";

export default function Home() {
  return (
    <div className="overflow-x-clip">
      <ChatHero />
      <ChatWho />
      <ChatHow />
      <ChatPaths />
      <Suspense fallback={<LiveNetworkSkeleton />}><LiveNetwork /></Suspense>
      <AssetsNetworks />
      <WhereWeStand />
      <Faq />
      <ChatClosing />
    </div>
  );
}
