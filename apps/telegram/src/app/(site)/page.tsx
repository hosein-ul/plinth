import { Suspense } from "react";
import { ChatHero } from "@/components/chat/chat-hero";
import { ChatAudience, ChatClosing, ChatGap, ChatStage } from "@/components/chat/chat-market";
import { ChatHow, ChatWho } from "@/components/chat/chat-sections";
import { ChatPaths } from "@/components/chat/chat-paths";
import { AssetsNetworks } from "@/components/marketing/assets-networks";
import { LiveNetwork, LiveNetworkSkeleton } from "@/components/marketing/live-network";
import { Faq } from "@/components/marketing/faq";

export default function Home() {
  return (
    <div className="overflow-x-clip">
      <ChatHero />
      <ChatAudience />
      <ChatGap />
      <ChatWho />
      <ChatHow />
      <ChatPaths />
      <Suspense fallback={<LiveNetworkSkeleton />}><LiveNetwork /></Suspense>
      <AssetsNetworks />
      <ChatStage />
      <Faq />
      <ChatClosing />
    </div>
  );
}
